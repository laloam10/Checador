-- =============================================================================
-- Checador: WhatsApp se activa con un código de un solo uso (ya no con el PIN)
--
-- Por qué: el PIN es una credencial reutilizable (sirve en el kiosco) y quedaba escrito
-- en el historial del chat. El código de activación:
--   * lo genera el empleador (propietario o administrador) en la ficha y lo entrega en persona;
--   * está atado al celular capturado: si el celular cambia, el código deja de servir;
--   * sirve UNA vez, vence a las 24 horas y se anula al quinto intento fallido;
--   * solo se guarda su huella (bcrypt); el texto se muestra una única vez al generarlo.
-- Límite que no cambia: el código prueba que quien tiene ese celular lo recibió del
-- empleador, no que el celular sea de la persona. Lo mitiga la conformidad semanal.
-- =============================================================================

create table public.codigos_whatsapp (
  trabajador_id     uuid primary key references public.trabajadores (id) on delete cascade,
  telefono          text not null,
  codigo_hash       text not null,
  expira_en         timestamptz not null,
  intentos_fallidos smallint not null default 0,
  creado_por        uuid,
  creado_en         timestamptz not null default now()
);
alter table public.codigos_whatsapp enable row level security;
revoke all on public.codigos_whatsapp from public, anon, authenticated;
-- Sin políticas ni privilegios: inaccesible por la API (como pines_trabajador).

-- Genera (o reemplaza) el código de activación y lo devuelve una sola vez.
create function public.generar_codigo_whatsapp(p_trabajador uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_t      public.trabajadores;
  v_codigo text;
begin
  select * into v_t from public.trabajadores where id = p_trabajador;
  if not found then
    raise exception 'Trabajador inexistente' using errcode = 'no_data_found';
  end if;
  if not public.es_gestor(v_t.empresa_id) then
    raise exception 'Sin permiso para generar el código' using errcode = 'insufficient_privilege';
  end if;
  if v_t.fecha_baja is not null then
    raise exception 'La persona está dada de baja' using errcode = 'check_violation';
  end if;
  if v_t.telefono is null then
    raise exception 'Primero captura el celular de la persona' using errcode = 'check_violation';
  end if;
  v_codigo := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.codigos_whatsapp (trabajador_id, telefono, codigo_hash, expira_en, creado_por)
  values (p_trabajador, v_t.telefono, extensions.crypt(v_codigo, extensions.gen_salt('bf', 8)),
          now() + interval '24 hours', auth.uid())
  on conflict (trabajador_id) do update
    set telefono = excluded.telefono, codigo_hash = excluded.codigo_hash, expira_en = excluded.expira_en,
        intentos_fallidos = 0, creado_por = excluded.creado_por, creado_en = now();
  return v_codigo;
end;
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
    'semanas_por_revisar', coalesce((
      select jsonb_agg(jsonb_build_object('lunes', s.lunes, 'clase', s.clase) order by s.lunes)
        from public._semanas_por_confirmar(t.id) s
    ), '[]'::jsonb)
  );
end;
$$;

-- Activa el teléfono con el código de un solo uso.
drop function public.whatsapp_vincular(text, text, text);
create function public.whatsapp_vincular(p_secreto text, p_telefono text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._telefono_normalizado(p_telefono);
  v_t   public.trabajadores;
  v_k   public.codigos_whatsapp;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  select * into v_t from public.trabajadores where telefono = v_tel and fecha_baja is null;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'NO_REGISTRADO');
  end if;
  select * into v_k from public.codigos_whatsapp where trabajador_id = v_t.id for update;
  if not found or v_k.telefono <> v_tel or v_k.expira_en <= now() then
    return jsonb_build_object('ok', false, 'codigo', 'SIN_CODIGO');
  end if;
  if coalesce(extensions.crypt(coalesce(p_codigo, ''), v_k.codigo_hash) = v_k.codigo_hash, false) then
    delete from public.codigos_whatsapp where trabajador_id = v_t.id;
    update public.trabajadores set telefono_verificado_en = now() where id = v_t.id;
    return jsonb_build_object('ok', true, 'nombre', v_t.nombre);
  end if;
  if v_k.intentos_fallidos + 1 >= 5 then
    delete from public.codigos_whatsapp where trabajador_id = v_t.id;
    return jsonb_build_object('ok', false, 'codigo', 'ANULADO');
  end if;
  update public.codigos_whatsapp set intentos_fallidos = intentos_fallidos + 1 where trabajador_id = v_t.id;
  return jsonb_build_object('ok', false, 'codigo', 'INCORRECTO', 'restantes', 4 - v_k.intentos_fallidos);
end;
$$;

revoke execute on function
  public.generar_codigo_whatsapp(uuid),
  public.whatsapp_vincular(text, text, text)
from public, anon, authenticated;
grant execute on function public.generar_codigo_whatsapp(uuid) to authenticated;
grant execute on function public.whatsapp_vincular(text, text, text) to anon, authenticated;
