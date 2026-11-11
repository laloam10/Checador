-- =============================================================================
-- Checador: conformidad semanal por WhatsApp
--
-- La persona revisa por WhatsApp una semana terminada y manifiesta su conformidad o su
-- objeción (art. 132 fr. XXXIV LFT; acuerdo de registro, cláusula séptima). Reglas:
--   * Solo semanas pendientes (_semanas_por_confirmar), igual que en el kiosco.
--   * El resumen lo calcula el servidor de la app con el mismo motor; se guarda lo que se mostró.
--   * No hay conformidad tácita: sin respuesta, la semana sigue pendiente.
--   * La objeción exige explicar qué no es correcto. Como WhatsApp no tiene formularios, el
--     bot anota que espera ese texto (whatsapp_esperas, 15 minutos).
--   * WhatsApp solo permite responder dentro de las 24 h siguientes al último mensaje de la
--     persona: el bot no puede iniciar la conversación para recordar; ofrece la revisión
--     cuando la persona checa. Los recordatorios siguen saliendo por correo.
-- =============================================================================

-- Datos para calcular una semana de un trabajador: una sola definición para kiosco y WhatsApp.
create function public._semana_de(p_trabajador uuid, p_lunes date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_t record;
begin
  select t.dia_descanso, t.dias_descanso_adicionales, t.jornada_pactada_min, c.zona_horaria, c.nombre as centro, e.razon_social as empresa
    into v_t
    from public.trabajadores t
    join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
    join public.empresas e on e.id = t.empresa_id
   where t.id = p_trabajador;

  return jsonb_build_object(
    'dia_descanso', v_t.dia_descanso,
    'dias_descanso_adicionales', v_t.dias_descanso_adicionales,
    'jornada_pactada_min', v_t.jornada_pactada_min,
    'zona_horaria', v_t.zona_horaria,
    'centro', v_t.centro,
    'empresa', v_t.empresa,
    'eventos', coalesce((
      with recursive cargados as (
        select e.id, e.corrige_evento_id
          from public.eventos e
         where e.trabajador_id = p_trabajador
           and e.hora_efectiva >= ((p_lunes - 2)::timestamp at time zone 'UTC')
           and e.hora_efectiva <  ((p_lunes + 9)::timestamp at time zone 'UTC')
        union
        select e.id, e.corrige_evento_id
          from public.eventos e
          join cargados k on e.corrige_evento_id = k.id or e.id = k.corrige_evento_id
         where e.trabajador_id = p_trabajador
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

create or replace function public.kiosco_semana(p_numero text, p_pin text, p_lunes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_trab uuid;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  v_trab := (v ->> 'trabajador_id')::uuid;
  if not exists (select 1 from public._semanas_por_confirmar(v_trab) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA', 'error', 'Esa semana no está pendiente de revisar.');
  end if;
  return v || public._semana_de(v_trab, p_lunes);
end;
$$;

-- Una conformidad por WhatsApp no tiene cuenta de usuario: quien responde se identifica por
-- su teléfono activado (queda en la evidencia). Solo whatsapp_conformidad() puede insertar sin
-- sesión: la API no tiene privilegios sobre la tabla para el rol sin sesión.
alter table public.conformidades alter column user_id drop not null;
alter table public.conformidades add constraint conformidades_identidad
  check (user_id is not null or (evidencia ->> 'modalidad' = 'whatsapp' and evidencia ->> 'telefono' is not null));

create or replace function public.conformidades_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id       := auth.uid();
  new.respondido_en := clock_timestamp();
  new.resumen_hash  := public.sha256_texto(new.resumen::text);
  select ultima_secuencia, ultimo_hash into new.cadena_secuencia, new.cadena_hash
    from public.cadena_estado where empresa_id = new.empresa_id;
  if new.user_id is null and new.evidencia ->> 'modalidad' is distinct from 'whatsapp' then
    raise exception 'Una conformidad requiere un usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- El bot espera el texto de una objeción (WhatsApp no tiene formularios).
create table public.whatsapp_esperas (
  trabajador_id uuid primary key references public.trabajadores (id) on delete cascade,
  lunes         date not null,
  expira_en     timestamptz not null
);
alter table public.whatsapp_esperas enable row level security;
revoke all on public.whatsapp_esperas from public, anon, authenticated;

-- Trabajador activo y con WhatsApp activado para ese teléfono (o null).
create function public._whatsapp_trabajador(p_telefono text) returns public.trabajadores
language sql stable security definer set search_path = '' as $$
  select t from public.trabajadores t
   where t.telefono = public._telefono_normalizado(p_telefono) and t.fecha_baja is null and t.telefono_verificado_en is not null
$$;

create or replace function public.whatsapp_estado(p_secreto text, p_telefono text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._telefono_normalizado(p_telefono);
  t     record;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  select tr.id, tr.empresa_id, tr.nombre, tr.telefono_verificado_en, e.razon_social, c.zona_horaria,
         exists (select 1 from public.codigos_whatsapp k
                  where k.trabajador_id = tr.id and k.telefono = tr.telefono and k.expira_en > now()) as tiene_codigo
    into t
    from public.trabajadores tr
    join public.empresas e on e.id = tr.empresa_id
    join public.centros_trabajo c on c.empresa_id = tr.empresa_id and c.id = tr.centro_trabajo_id
   where tr.telefono = v_tel and tr.fecha_baja is null;
  if not found then
    return jsonb_build_object('ok', true, 'registrado', false);
  end if;
  if t.telefono_verificado_en is null then
    return jsonb_build_object('ok', true, 'registrado', true, 'vinculado', false, 'tiene_codigo', t.tiene_codigo);
  end if;
  return jsonb_build_object(
    'ok', true, 'registrado', true, 'vinculado', true,
    'nombre', t.nombre, 'empresa', t.razon_social, 'zona_horaria', t.zona_horaria,
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'hora_efectiva', e.hora_efectiva,
               'puede_salir', e.puede_salir, 'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido)
             order by e.id)
        from public.eventos e
       where e.trabajador_id = t.id
         and (e.hora_efectiva > now() - interval '36 hours' or e.hora_servidor > now() - interval '36 hours')
    ), '[]'::jsonb),
    'objecion_pendiente', (select w.lunes from public.whatsapp_esperas w where w.trabajador_id = t.id and w.expira_en > now()),
    'semanas_por_revisar', coalesce((
      select jsonb_agg(jsonb_build_object('lunes', s.lunes, 'clase', s.clase) order by s.lunes)
        from public._semanas_por_confirmar(t.id) s
    ), '[]'::jsonb)
  );
end;
$$;

create function public.whatsapp_semana(p_secreto text, p_telefono text, p_lunes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.trabajadores;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  v_t := public._whatsapp_trabajador(p_telefono);
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'codigo', 'NO_VINCULADO');
  end if;
  if not exists (select 1 from public._semanas_por_confirmar(v_t.id) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA');
  end if;
  return jsonb_build_object('ok', true, 'nombre', v_t.nombre) || public._semana_de(v_t.id, p_lunes);
end;
$$;

-- Anota (o, con p_lunes nulo, borra) que se espera el texto de una objeción.
create function public.whatsapp_esperar_objecion(p_secreto text, p_telefono text, p_lunes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.trabajadores;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  v_t := public._whatsapp_trabajador(p_telefono);
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'codigo', 'NO_VINCULADO');
  end if;
  if p_lunes is null then
    delete from public.whatsapp_esperas where trabajador_id = v_t.id;
    return jsonb_build_object('ok', true);
  end if;
  if not exists (select 1 from public._semanas_por_confirmar(v_t.id) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA');
  end if;
  insert into public.whatsapp_esperas (trabajador_id, lunes, expira_en)
  values (v_t.id, p_lunes, now() + interval '15 minutes')
  on conflict (trabajador_id) do update set lunes = excluded.lunes, expira_en = excluded.expira_en;
  return jsonb_build_object('ok', true);
end;
$$;

-- Conformidad u objeción de una semana. Si Meta reintenta la entrega no se duplica: tras
-- responder, la semana deja de estar pendiente y el segundo intento recibe SEMANA.
create function public.whatsapp_conformidad(
  p_secreto text, p_telefono text, p_lunes date, p_respuesta public.respuesta_conformidad,
  p_comentario text, p_resumen jsonb, p_evidencia jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t    public.trabajadores;
  v_fila public.conformidades;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  v_t := public._whatsapp_trabajador(p_telefono);
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'codigo', 'NO_VINCULADO');
  end if;
  if not exists (select 1 from public._semanas_por_confirmar(v_t.id) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA');
  end if;
  if p_respuesta = 'objeta' and length(btrim(coalesce(p_comentario, ''))) = 0 then
    return jsonb_build_object('ok', false, 'codigo', 'COMENTARIO');
  end if;
  if p_resumen ->> 'semana' is distinct from p_lunes::text or jsonb_typeof(p_resumen -> 'eventoIds') <> 'array' then
    return jsonb_build_object('ok', false, 'codigo', 'RESUMEN');
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_resumen -> 'eventoIds') x(id)
     where not exists (select 1 from public.eventos e where e.id = x.id::bigint and e.trabajador_id = v_t.id)
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'RESUMEN');
  end if;

  insert into public.conformidades
    (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta, comentario, evidencia)
  values
    (v_t.empresa_id, v_t.id, p_lunes, p_lunes + 6, p_resumen, p_respuesta, nullif(left(btrim(p_comentario), 2000), ''),
     coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('modalidad', 'whatsapp', 'telefono', v_t.telefono))
  returning * into v_fila;
  delete from public.whatsapp_esperas where trabajador_id = v_t.id;

  return jsonb_build_object('ok', true, 'nombre', v_t.nombre, 'cadena_secuencia', v_fila.cadena_secuencia);
end;
$$;

revoke execute on function
  public._semana_de(uuid, date),
  public._whatsapp_trabajador(text),
  public.whatsapp_semana(text, text, date),
  public.whatsapp_esperar_objecion(text, text, date),
  public.whatsapp_conformidad(text, text, date, public.respuesta_conformidad, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function
  public.whatsapp_semana(text, text, date),
  public.whatsapp_esperar_objecion(text, text, date),
  public.whatsapp_conformidad(text, text, date, public.respuesta_conformidad, text, jsonb, jsonb)
to anon, authenticated;
