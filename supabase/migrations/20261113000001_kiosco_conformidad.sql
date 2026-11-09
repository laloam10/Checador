-- =============================================================================
-- Checador: conformidad semanal desde el kiosco (con número de empleado y PIN)
--
-- Quien no tiene correo solo checa en el kiosco y, hasta ahora, no podía revisar
-- ni confirmar sus semanas: esas semanas nunca tenían conformidad (prueba plena,
-- LFT art. 132 fr. XXXIV, 3.er párr.). Ahora, al identificarse con su PIN, el
-- kiosco le muestra sus semanas pendientes y puede confirmarlas u objetarlas.
--
--   * _semanas_por_confirmar(): una sola definición de "semana pendiente", que usan
--     el kiosco y los recordatorios por correo.
--   * kiosco_identificar(): además devuelve las semanas pendientes.
--   * kiosco_semana(): checadas de una semana pendiente (para calcularla con el motor).
--   * kiosco_conformidad(): registra la respuesta, firmada con el PIN.
-- En un dispositivo compartido solo se muestra una semana pendiente, después de verificar
-- el PIN, y la pantalla vuelve sola al inicio.
-- =============================================================================

-- Semanas terminadas (de las últimas 8), con checadas, sin respuesta del trabajador o
-- que objetó y en las que el empleador registró cambios después de la objeción.
create function public._semanas_por_confirmar(p_trabajador uuid, p_ahora timestamptz default now())
returns table (lunes date, clase text)
language sql stable set search_path = '' as $$
  with t as (
    select tr.id, tr.empresa_id, c.zona_horaria,
           date_trunc('week', p_ahora at time zone c.zona_horaria)::date as lunes_actual
      from public.trabajadores tr
      join public.centros_trabajo c on c.empresa_id = tr.empresa_id and c.id = tr.centro_trabajo_id
     where tr.id = p_trabajador
  ),
  semanas as (
    select distinct date_trunc('week', ev.hora_efectiva at time zone t.zona_horaria)::date as lunes
      from t
      join public.eventos ev on ev.empresa_id = t.empresa_id and ev.trabajador_id = t.id
     where ev.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and ev.hora_efectiva >= ((t.lunes_actual - 56)::timestamp at time zone t.zona_horaria)
       and ev.hora_efectiva <  (t.lunes_actual::timestamp at time zone t.zona_horaria)
  ),
  ultima as (
    select distinct on (cf.periodo_inicio) cf.periodo_inicio, cf.respuesta, cf.respondido_en
      from public.conformidades cf, t
     where cf.trabajador_id = t.id and cf.empresa_id = t.empresa_id
     order by cf.periodo_inicio, cf.respondido_en desc
  ),
  clasificadas as (
    select s.lunes,
           case
             when u.respuesta is null then 'sin_respuesta'
             when u.respuesta = 'objeta' and exists (
               select 1
                 from t
                 join public.eventos p on p.empresa_id = t.empresa_id and p.trabajador_id = t.id
                 left join public.eventos o on o.id = p.corrige_evento_id
                where p.origen = 'panel'
                  and p.hora_servidor > u.respondido_en
                  and (date_trunc('week', p.hora_efectiva at time zone t.zona_horaria)::date = s.lunes
                       or date_trunc('week', o.hora_efectiva at time zone t.zona_horaria)::date = s.lunes)
             ) then 'corregida'
           end as clase
      from semanas s
      left join ultima u on u.periodo_inicio = s.lunes
  )
  select lunes, clase from clasificadas where clase is not null order by lunes
$$;
revoke execute on function public._semanas_por_confirmar(uuid, timestamptz) from public, anon, authenticated;

-- Los recordatorios por correo usan la misma definición (mismo resultado que antes).
create or replace function public.conformidades_por_recordar(p_ahora timestamptz default now())
returns table (
  empresa_id uuid, trabajador_id uuid, nombre text, correo text, razon_social text,
  semanas_sin_respuesta date[], semanas_corregidas date[]
)
language sql stable set search_path = '' as $$
  select t.empresa_id, t.id, t.nombre, t.email, e.razon_social,
         coalesce(array_agg(s.lunes order by s.lunes) filter (where s.clase = 'sin_respuesta'), '{}'),
         coalesce(array_agg(s.lunes order by s.lunes) filter (where s.clase = 'corregida'), '{}')
    from public.trabajadores t
    join public.empresas e on e.id = t.empresa_id
    cross join lateral public._semanas_por_confirmar(t.id, p_ahora) s
   where t.email is not null
     and t.fecha_baja is null
     and e.recordatorios_conformidad
     and not exists (
       select 1 from public.recordatorios_conformidad r
        where r.trabajador_id = t.id
          and r.enviado_en > p_ahora - interval '6 days'
          and r.estado is distinct from 'fallido')
   group by t.empresa_id, t.id, t.nombre, t.email, e.razon_social
$$;
revoke execute on function public.conformidades_por_recordar(timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Identificación: ahora incluye las semanas pendientes.
-- -----------------------------------------------------------------------------
create or replace function public.kiosco_identificar(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_pend public.acuerdos;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  select * into v_pend from public.acuerdo_pendiente((v ->> 'trabajador_id')::uuid);
  return v || jsonb_build_object(
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'hora_efectiva', e.hora_efectiva,
               'puede_salir', e.puede_salir, 'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido)
             order by e.id)
        from public.eventos e
       where e.trabajador_id = (v ->> 'trabajador_id')::uuid
         and (e.hora_efectiva > now() - interval '36 hours' or e.hora_servidor > now() - interval '36 hours')
    ), '[]'::jsonb),
    'acuerdo_pendiente', case when v_pend.id is null then null else jsonb_build_object(
      'id', v_pend.id, 'version', v_pend.version, 'contenido', v_pend.contenido,
      'folio', left(encode(v_pend.contenido_hash, 'hex'), 12)) end,
    'semanas_por_revisar', coalesce((
      select jsonb_agg(jsonb_build_object('lunes', s.lunes, 'clase', s.clase) order by s.lunes)
        from public._semanas_por_confirmar((v ->> 'trabajador_id')::uuid) s
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Checadas de una semana pendiente, para calcularla con el motor (packages/jornada).
-- Misma ventana que la app (lunes −2 días a lunes +9 días, en UTC) más los ajustes
-- relacionados aunque caigan fuera de ella.
-- -----------------------------------------------------------------------------
create function public.kiosco_semana(p_numero text, p_pin text, p_lunes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_trab uuid;
  v_t record;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  v_trab := (v ->> 'trabajador_id')::uuid;
  if not exists (select 1 from public._semanas_por_confirmar(v_trab) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA', 'error', 'Esa semana no está pendiente de revisar.');
  end if;
  select t.dia_descanso, t.jornada_pactada_min, c.zona_horaria, c.nombre as centro, e.razon_social as empresa
    into v_t
    from public.trabajadores t
    join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
    join public.empresas e on e.id = t.empresa_id
   where t.id = v_trab;

  return v || jsonb_build_object(
    'dia_descanso', v_t.dia_descanso,
    'jornada_pactada_min', v_t.jornada_pactada_min,
    'zona_horaria', v_t.zona_horaria,
    'centro', v_t.centro,
    'empresa', v_t.empresa,
    'eventos', coalesce((
      with recursive cargados as (
        select e.id, e.corrige_evento_id
          from public.eventos e
         where e.trabajador_id = v_trab
           and e.hora_efectiva >= ((p_lunes - 2)::timestamp at time zone 'UTC')
           and e.hora_efectiva <  ((p_lunes + 9)::timestamp at time zone 'UTC')
        union
        select e.id, e.corrige_evento_id
          from public.eventos e
          join cargados k on e.corrige_evento_id = k.id or e.id = k.corrige_evento_id
         where e.trabajador_id = v_trab
      )
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'origen', e.origen, 'hora_efectiva', e.hora_efectiva,
               'hora_servidor', e.hora_servidor, 'puede_salir', e.puede_salir,
               'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido, 'motivo', e.motivo)
             order by e.id)
        from public.eventos e
       where e.id in (select id from cargados)
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Respuesta del trabajador, firmada con su PIN. El resumen lo calcula el servidor de
-- la app con el motor (igual que en la app del celular); aquí se comprueba que esté
-- ligado a esa semana y a esos eventos.
-- -----------------------------------------------------------------------------
create function public.kiosco_conformidad(
  p_numero text, p_pin text, p_lunes date, p_respuesta public.respuesta_conformidad,
  p_comentario text, p_resumen jsonb, p_evidencia jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_trab uuid;
  v_empresa uuid;
  v_fila public.conformidades;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  v_trab := (v ->> 'trabajador_id')::uuid;
  v_empresa := (v ->> 'empresa_id')::uuid;
  if not exists (select 1 from public._semanas_por_confirmar(v_trab) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA', 'error', 'Esa semana no está pendiente de revisar.');
  end if;
  if p_respuesta = 'objeta' and length(btrim(coalesce(p_comentario, ''))) = 0 then
    return jsonb_build_object('ok', false, 'codigo', 'COMENTARIO', 'error', 'Explica qué registro no es correcto.');
  end if;
  if p_resumen ->> 'semana' is distinct from p_lunes::text or jsonb_typeof(p_resumen -> 'eventoIds') <> 'array' then
    return jsonb_build_object('ok', false, 'codigo', 'RESUMEN', 'error', 'El resumen no corresponde a esa semana.');
  end if;
  -- Todos los eventos del resumen deben ser de este trabajador.
  if exists (
    select 1 from jsonb_array_elements_text(p_resumen -> 'eventoIds') x(id)
     where not exists (select 1 from public.eventos e where e.id = x.id::bigint and e.trabajador_id = v_trab)
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'RESUMEN', 'error', 'El resumen no corresponde a tus checadas.');
  end if;

  insert into public.conformidades
    (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta, comentario, evidencia)
  values
    (v_empresa, v_trab, p_lunes, p_lunes + 6, p_resumen, p_respuesta, nullif(left(btrim(p_comentario), 2000), ''),
     coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('modalidad', 'pin_kiosco', 'numero_empleado', p_numero))
  returning * into v_fila;

  return jsonb_build_object('ok', true, 'nombre', v ->> 'nombre',
    'cadena_secuencia', v_fila.cadena_secuencia, 'cadena_hash', '\x' || encode(v_fila.cadena_hash, 'hex'));
end;
$$;

revoke execute on function public.kiosco_semana(text, text, date) from public, anon;
revoke execute on function public.kiosco_conformidad(text, text, date, public.respuesta_conformidad, text, jsonb, jsonb) from public, anon;
grant execute on function public.kiosco_semana(text, text, date) to authenticated;
grant execute on function public.kiosco_conformidad(text, text, date, public.respuesta_conformidad, text, jsonb, jsonb) to authenticated;
