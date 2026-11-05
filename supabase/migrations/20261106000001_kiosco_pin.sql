-- =============================================================================
-- Checador: kiosco con número de empleado + PIN
--
--   * El PIN se guarda con bcrypt en una tabla sin políticas RLS: solo las
--     funciones SECURITY DEFINER de este archivo lo leen.
--   * La verificación ocurre en el servidor; el kiosco nunca recibe hashes.
--   * Bloqueo: 5 fallos por trabajador → 15 min; 20 fallos por kiosco en 10 min.
--   * Las cuentas de kiosco ya no pueden insertar eventos directamente.
--   * "¿Puede salir durante la pausa?" (art. 64) lo define el centro de trabajo.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Configuración por centro y alcance del kiosco
-- -----------------------------------------------------------------------------
alter table public.centros_trabajo
  add column pausa_puede_salir boolean not null default true;
comment on column public.centros_trabajo.pausa_puede_salir is
  'Si el personal puede salir del lugar durante la pausa. Si es false, la pausa cuenta como jornada (LFT art. 64).';

-- Un kiosco puede limitarse a un centro de trabajo (null = todos los de la empresa).
alter table public.miembros
  add column centro_trabajo_id uuid,
  add constraint miembros_centro_fk foreign key (empresa_id, centro_trabajo_id)
    references public.centros_trabajo (empresa_id, id),
  add constraint miembros_centro_solo_kiosco check (centro_trabajo_id is null or rol = 'kiosco');

-- -----------------------------------------------------------------------------
-- La pausa la define el centro, no quien checa (PWA y kiosco)
-- -----------------------------------------------------------------------------
create function public.eventos_pausa_segun_centro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'inicio_pausa' and new.origen in ('pwa', 'kiosco') then
    select c.pausa_puede_salir into new.puede_salir
      from public.trabajadores t
      join public.centros_trabajo c on c.id = t.centro_trabajo_id
     where t.id = new.trabajador_id;
  end if;
  return new;
end;
$$;
-- Se ejecuta antes que eventos_antes_de_insertar (orden alfabético) para que el hash incluya el valor final.
create trigger eventos_a_pausa_segun_centro before insert on public.eventos
  for each row execute function public.eventos_pausa_segun_centro();

-- -----------------------------------------------------------------------------
-- PINs e intentos
-- -----------------------------------------------------------------------------
create table public.pines_trabajador (
  trabajador_id      uuid primary key references public.trabajadores (id) on delete restrict,
  pin_hash           text not null,
  intentos_fallidos  integer not null default 0,
  bloqueado_hasta    timestamptz,
  actualizado_en     timestamptz not null default now()
);
alter table public.pines_trabajador enable row level security;
-- Sin políticas: inaccesible por la API. Solo las funciones de abajo la usan.

create table public.intentos_kiosco (
  id                bigint generated always as identity primary key,
  empresa_id        uuid not null references public.empresas (id),
  kiosco_user_id    uuid not null,
  numero_empleado   text not null,
  trabajador_id     uuid references public.trabajadores (id),
  exito             boolean not null,
  creado_en         timestamptz not null default now()
);
create index intentos_kiosco_reciente_idx on public.intentos_kiosco (kiosco_user_id, creado_en);
alter table public.intentos_kiosco enable row level security;
create policy intentos_kiosco_select on public.intentos_kiosco for select to authenticated
  using (public.puede_consultar(empresa_id));

-- -----------------------------------------------------------------------------
-- Asignación de PIN
-- -----------------------------------------------------------------------------
create function public.pin_valido(p_pin text) returns boolean
language sql immutable set search_path = '' as $$
  select p_pin ~ '^[0-9]{4,6}$'
     and p_pin !~ '^(.)\1+$'                                       -- 0000, 1111…
     and p_pin not in ('1234', '12345', '123456', '4321', '54321', '654321', '0123', '01234', '012345')
$$;

-- El empleador asigna o reinicia el PIN de un trabajador.
create function public.asignar_pin(p_trabajador uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.trabajadores where id = p_trabajador;
  if v_empresa is null then
    raise exception 'Trabajador inexistente' using errcode = 'no_data_found';
  end if;
  -- Sin JWT solo puede llamarla el servidor (postgres/service_role): anon no tiene EXECUTE.
  if auth.uid() is not null and not public.es_gestor(v_empresa) then
    raise exception 'Sin permiso para asignar PIN' using errcode = 'insufficient_privilege';
  end if;
  if not public.pin_valido(p_pin) then
    raise exception 'El PIN debe tener de 4 a 6 dígitos y no ser obvio (como 0000 o 1234)' using errcode = 'check_violation';
  end if;
  insert into public.pines_trabajador (trabajador_id, pin_hash)
  values (p_trabajador, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (trabajador_id) do update
    set pin_hash = excluded.pin_hash, intentos_fallidos = 0, bloqueado_hasta = null, actualizado_en = now();
end;
$$;

-- El trabajador cambia su propio PIN desde la PWA (ya está autenticado con su correo).
create function public.establecer_mi_pin(p_trabajador uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.soy_trabajador(p_trabajador) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if not public.pin_valido(p_pin) then
    raise exception 'El PIN debe tener de 4 a 6 dígitos y no ser obvio (como 0000 o 1234)' using errcode = 'check_violation';
  end if;
  insert into public.pines_trabajador (trabajador_id, pin_hash)
  values (p_trabajador, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (trabajador_id) do update
    set pin_hash = excluded.pin_hash, intentos_fallidos = 0, bloqueado_hasta = null, actualizado_en = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Verificación (interna). Devuelve jsonb en lugar de lanzar excepciones para que
-- los contadores de intentos fallidos SÍ se guarden (una excepción los revertiría).
-- -----------------------------------------------------------------------------
create function public._kiosco_verificar(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kiosco   public.miembros;
  v_trab     public.trabajadores;
  v_pin      public.pines_trabajador;
  v_fallos   integer;
  v_ok       boolean;
  c_generico constant text := 'Número de empleado o PIN incorrecto.';
begin
  select * into v_kiosco from public.miembros where user_id = auth.uid() and rol = 'kiosco';
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'NO_ES_KIOSCO', 'error', 'Este dispositivo no está configurado como kiosco.');
  end if;

  -- Límite por kiosco (frena barridos de números de empleado).
  select count(*) into v_fallos from public.intentos_kiosco
   where kiosco_user_id = auth.uid() and not exito and creado_en > now() - interval '10 minutes';
  if v_fallos >= 20 then
    return jsonb_build_object('ok', false, 'codigo', 'KIOSCO_BLOQUEADO',
      'error', 'Demasiados intentos fallidos en este kiosco. Espera unos minutos o avisa a tu supervisor.');
  end if;

  select t.* into v_trab from public.trabajadores t
   where t.empresa_id = v_kiosco.empresa_id
     and t.numero_empleado = btrim(p_numero)
     and t.fecha_baja is null
     and (v_kiosco.centro_trabajo_id is null or t.centro_trabajo_id = v_kiosco.centro_trabajo_id);
  if found then
    select * into v_pin from public.pines_trabajador where trabajador_id = v_trab.id for update;
  end if;

  if v_pin.trabajador_id is not null and v_pin.bloqueado_hasta > now() then
    insert into public.intentos_kiosco (empresa_id, kiosco_user_id, numero_empleado, trabajador_id, exito)
    values (v_kiosco.empresa_id, auth.uid(), left(p_numero, 20), v_trab.id, false);
    return jsonb_build_object('ok', false, 'codigo', 'TRABAJADOR_BLOQUEADO',
      'error', format('PIN bloqueado por intentos fallidos. Intenta en %s min o avisa a tu supervisor.',
                      ceil(extract(epoch from v_pin.bloqueado_hasta - now()) / 60)));
  end if;

  -- Siempre se calcula un bcrypt (aunque el número no exista) para no revelar por tiempo de respuesta qué números existen.
  v_ok := extensions.crypt(coalesce(p_pin, ''),
            coalesce(v_pin.pin_hash, extensions.gen_salt('bf', 8))) = v_pin.pin_hash;
  v_ok := coalesce(v_ok, false);

  insert into public.intentos_kiosco (empresa_id, kiosco_user_id, numero_empleado, trabajador_id, exito)
  values (v_kiosco.empresa_id, auth.uid(), left(p_numero, 20), v_trab.id, v_ok);

  if not v_ok then
    if v_pin.trabajador_id is not null then
      update public.pines_trabajador
         set intentos_fallidos = intentos_fallidos + 1,
             bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
       where trabajador_id = v_pin.trabajador_id;
    end if;
    return jsonb_build_object('ok', false, 'codigo', 'CREDENCIALES', 'error', c_generico);
  end if;

  update public.pines_trabajador set intentos_fallidos = 0, bloqueado_hasta = null where trabajador_id = v_trab.id;
  return jsonb_build_object('ok', true, 'trabajador_id', v_trab.id, 'empresa_id', v_trab.empresa_id, 'nombre', v_trab.nombre);
end;
$$;
revoke execute on function public._kiosco_verificar(text, text) from public, anon, authenticated;

-- Identifica al trabajador y devuelve sus eventos recientes (para saber si está dentro o fuera).
create function public.kiosco_identificar(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  return v || jsonb_build_object('eventos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'tipo', e.tipo, 'hora_efectiva', e.hora_efectiva,
             'puede_salir', e.puede_salir, 'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido)
           order by e.id)
      from public.eventos e
     where e.trabajador_id = (v ->> 'trabajador_id')::uuid
       and (e.hora_efectiva > now() - interval '36 hours' or e.hora_servidor > now() - interval '36 hours')
  ), '[]'::jsonb));
end;
$$;

-- Registra una checada desde el kiosco, previa verificación del PIN.
create function public.kiosco_checar(
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
    returning hora_efectiva into v_hora;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'codigo', 'RECHAZADO', 'error', sqlerrm);
  end;

  return jsonb_build_object('ok', true, 'nombre', v ->> 'nombre', 'hora_efectiva', v_hora);
end;
$$;

revoke execute on function public.asignar_pin(uuid, text) from public, anon;
revoke execute on function public.establecer_mi_pin(uuid, text) from public, anon;
revoke execute on function public.kiosco_identificar(text, text) from public, anon;
revoke execute on function public.kiosco_checar(text, text, public.tipo_evento, uuid, boolean, timestamptz, jsonb) from public, anon;
grant execute on function public.asignar_pin(uuid, text) to authenticated;
grant execute on function public.establecer_mi_pin(uuid, text) to authenticated;
grant execute on function public.kiosco_identificar(text, text) to authenticated;
grant execute on function public.kiosco_checar(text, text, public.tipo_evento, uuid, boolean, timestamptz, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- El kiosco ya no inserta eventos directamente: solo mediante kiosco_checar().
-- -----------------------------------------------------------------------------
drop policy eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (
    (origen = 'pwa'
       and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and public.soy_trabajador(trabajador_id))
    or (origen = 'panel' and public.puede_consultar(empresa_id))
  );
