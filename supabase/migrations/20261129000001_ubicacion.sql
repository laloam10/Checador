-- =============================================================================
-- Checador: ubicación al checar (opcional, por centro de trabajo)
--
-- El empleador puede activar, por centro de trabajo, que se registre la ubicación del
-- dispositivo al momento de checar: en celulares (PWA y app) y en el kiosco. Sirve para ver
-- si la checada se hizo en el centro de trabajo.
--
-- Reglas (interpretación 12 de packages/jornada/README.md):
--   * La LFT no exige la ubicación (art. 132 fr. XXXIV pide registrar la jornada). Es un dato
--     personal: requiere aviso de privacidad y estar en el acuerdo de registro (cláusula
--     NOVENA), por eso activarla deja desactualizados los acuerdos de ese centro.
--   * Nunca impide checar: sin permiso o sin señal, la checada se registra igual y queda
--     "sin ubicación" (registro fiel). Tampoco la ubicación hace inválida una checada.
--   * Solo en el momento de checar; nada de rastreo.
--   * Fuera de la bitácora (no entra en la cadena de integridad) para poder borrarla: se
--     elimina a los 90 días. Las coordenadas se guardan redondeadas a 4 decimales (~11 m).
--   * Señal informativa (dentro o fuera del radio del centro). No va en las exportaciones
--     para la autoridad. El GPS de un teléfono se puede falsear y en interiores puede fallar
--     cientos de metros: es un indicio, no una prueba.
-- =============================================================================

alter table public.centros_trabajo
  add column ubicacion_celular boolean not null default false,
  add column ubicacion_kiosco  boolean not null default false,
  add column latitud           numeric(8, 5) check (latitud between -90 and 90),
  add column longitud          numeric(8, 5) check (longitud between -180 and 180),
  add column radio_m           integer not null default 150 check (radio_m between 25 and 5000),
  add constraint centros_ubicacion_con_coordenadas
    check ((not ubicacion_celular and not ubicacion_kiosco) or (latitud is not null and longitud is not null)),
  add constraint centros_coordenadas_completas check ((latitud is null) = (longitud is null));

create table public.ubicaciones_evento (
  evento_id         bigint primary key references public.eventos (id),
  empresa_id        uuid not null references public.empresas (id),
  trabajador_id     uuid not null,
  centro_trabajo_id uuid not null,
  dispositivo       text not null check (dispositivo in ('celular', 'kiosco')),
  -- ok: hay coordenadas; denegada: la persona no dio permiso; no_disponible: sin señal o error.
  estado            text not null check (estado in ('ok', 'denegada', 'no_disponible')),
  latitud           numeric(7, 4),
  longitud          numeric(7, 4),
  precision_m       integer check (precision_m between 0 and 100000),
  distancia_m       integer check (distancia_m >= 0),
  dentro            boolean,
  capturada_en      timestamptz,
  creada_en         timestamptz not null default now(),
  check ((estado = 'ok') = (latitud is not null and longitud is not null))
);
create index ubicaciones_evento_creada_idx on public.ubicaciones_evento (creada_en);
create index ubicaciones_evento_trabajador_idx on public.ubicaciones_evento (trabajador_id);
alter table public.ubicaciones_evento enable row level security;
create policy ubicaciones_evento_select on public.ubicaciones_evento for select to authenticated
  using (public.puede_consultar(empresa_id) or public.soy_trabajador(trabajador_id));
revoke all on public.ubicaciones_evento from public, anon, authenticated;
grant select on public.ubicaciones_evento to authenticated;

-- Distancia en metros entre dos puntos (haversine).
create function public._distancia_m(p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select round(2 * 6371000 * asin(sqrt(
           power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
           + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
             * power(sin(radians((p_lon2 - p_lon1)::double precision) / 2), 2))))::integer
$$;

-- Registra la ubicación de una checada recién hecha. La llama la app con la sesión de quien
-- checó (la persona trabajadora, o la cuenta del kiosco). Si el centro no la tiene activada
-- para ese dispositivo, no guarda nada.
create function public.registrar_ubicacion(p_evento bigint, p_estado text, p_latitud double precision,
                                           p_longitud double precision, p_precision_m integer,
                                           p_capturada_en timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ev          public.eventos;
  v_centro      public.centros_trabajo;
  v_centro_id   uuid;
  v_dispositivo text;
  v_activa      boolean;
  v_lat         numeric;
  v_lon         numeric;
  v_dist        integer;
begin
  select * into v_ev from public.eventos where id = p_evento;
  if v_ev.id is null then
    raise exception 'Checada inexistente' using errcode = 'no_data_found';
  end if;

  if v_ev.origen::text in ('pwa', 'app') then
    if not public.soy_trabajador(v_ev.trabajador_id) then
      raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
    end if;
    v_dispositivo := 'celular';
    select centro_trabajo_id into v_centro_id from public.trabajadores where id = v_ev.trabajador_id;
  elsif v_ev.origen = 'kiosco' then
    -- La cuenta del kiosco de esa empresa; su centro es donde está la tableta.
    select coalesce(m.centro_trabajo_id, t.centro_trabajo_id) into v_centro_id
      from public.miembros m join public.trabajadores t on t.id = v_ev.trabajador_id
     where m.user_id = auth.uid() and m.empresa_id = v_ev.empresa_id and m.rol = 'kiosco';
    if v_centro_id is null then
      raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
    end if;
    v_dispositivo := 'kiosco';
  else
    raise exception 'Esta checada no lleva ubicación' using errcode = 'check_violation';
  end if;

  -- Solo justo después de checar (las checadas sin conexión llegan con su ubicación).
  if v_ev.hora_servidor < now() - interval '10 minutes' then
    raise exception 'La checada ya no admite ubicación' using errcode = 'check_violation';
  end if;

  select * into v_centro from public.centros_trabajo where id = v_centro_id;
  v_activa := case v_dispositivo when 'celular' then v_centro.ubicacion_celular else v_centro.ubicacion_kiosco end;
  if not coalesce(v_activa, false) then
    return false; -- desactivada: no se guarda aunque el dispositivo la mande
  end if;
  if exists (select 1 from public.ubicaciones_evento where evento_id = p_evento) then
    return true;
  end if;

  if p_estado is null or p_estado not in ('ok', 'denegada', 'no_disponible') then
    raise exception 'Estado de ubicación inválido' using errcode = 'check_violation';
  end if;
  if p_estado = 'ok' then
    if p_latitud is null or p_longitud is null or p_latitud not between -90 and 90 or p_longitud not between -180 and 180 then
      raise exception 'Coordenadas inválidas' using errcode = 'check_violation';
    end if;
    v_lat := round(p_latitud::numeric, 4);
    v_lon := round(p_longitud::numeric, 4);
    v_dist := public._distancia_m(v_centro.latitud, v_centro.longitud, v_lat, v_lon);
  end if;

  insert into public.ubicaciones_evento (evento_id, empresa_id, trabajador_id, centro_trabajo_id, dispositivo, estado,
                                         latitud, longitud, precision_m, distancia_m, dentro, capturada_en)
  values (p_evento, v_ev.empresa_id, v_ev.trabajador_id, v_centro_id, v_dispositivo, p_estado,
          v_lat, v_lon, case when p_estado = 'ok' then least(greatest(coalesce(p_precision_m, 0), 0), 100000) end,
          v_dist, case when v_dist is not null then v_dist <= v_centro.radio_m end,
          case when p_capturada_en between now() - interval '7 days' and now() + interval '5 minutes' then p_capturada_en end);
  return true;
end;
$$;

-- Borrado a los 90 días (lo corre pg_cron cada día).
create function public.borrar_ubicaciones_vencidas() returns integer
language sql security definer set search_path = '' as $$
  with borradas as (delete from public.ubicaciones_evento where creada_en < now() - interval '90 days' returning 1)
  select count(*)::integer from borradas
$$;

-- El kiosco devuelve también el identificador de la checada (para asociarle la ubicación).
create or replace function public.kiosco_checar(
  p_numero text,
  p_pin text,
  p_tipo public.tipo_evento,
  p_id_cliente uuid,
  p_diferido boolean default false,
  p_hora_dispositivo timestamptz default null,
  p_evidencia jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v       jsonb;
  v_hora  timestamptz;
  v_id    bigint;
begin
  if p_tipo not in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa') then
    return jsonb_build_object('ok', false, 'codigo', 'TIPO', 'error', 'Tipo de checada inválido.');
  end if;
  v := public._kiosco_verificar(p_numero, p_pin);
  if not (v ->> 'ok')::boolean then
    return v;
  end if;

  if exists (select 1 from public.eventos
              where empresa_id = (v ->> 'empresa_id')::uuid and id_cliente = p_id_cliente) then
    return jsonb_build_object('ok', true, 'duplicado', true, 'nombre', v ->> 'nombre');
  end if;

  begin
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, diferido, hora_dispositivo, evidencia)
    values ((v ->> 'empresa_id')::uuid, (v ->> 'trabajador_id')::uuid, p_tipo, 'kiosco', p_id_cliente,
            coalesce(p_diferido, false), case when p_diferido then p_hora_dispositivo end, coalesce(p_evidencia, '{}'::jsonb))
    returning hora_efectiva, id into v_hora, v_id;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'codigo', 'RECHAZADO', 'error', sqlerrm);
  end;

  return jsonb_build_object('ok', true, 'nombre', v ->> 'nombre', 'hora_efectiva', v_hora, 'evento_id', v_id);
end;
$$;

revoke execute on function
  public._distancia_m(numeric, numeric, numeric, numeric),
  public.registrar_ubicacion(bigint, text, double precision, double precision, integer, timestamptz),
  public.borrar_ubicaciones_vencidas()
from public, anon, authenticated;
grant execute on function public.registrar_ubicacion(bigint, text, double precision, double precision, integer, timestamptz)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('checador-ubicaciones-90-dias', '17 9 * * *', 'select public.borrar_ubicaciones_vencidas()');
  end if;
end;
$$;
