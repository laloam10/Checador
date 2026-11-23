-- =============================================================================
-- Checador: volver a entrar con huella o rostro (passkeys, WebAuthn)
--
-- Complementa la migración 26 (Salir con bloqueo). La persona registra una passkey en su
-- teléfono y, al salir, desbloquea con la huella o el rostro que el teléfono ya usa.
--
--   * La huella o el rostro nunca salen del teléfono: Checador guarda solo una llave pública
--     y el identificador de la passkey. No se recaban datos biométricos (acuerdo, cláusula
--     NOVENA; interpretación 11 de packages/jornada/README.md).
--   * La firma de la passkey la verifica el servidor de la app. La base solo acepta el
--     desbloqueo si llega con el secreto del servicio "acceso" (la app no usa la llave
--     service_role):  select public.configurar_secreto_servicio('acceso', '<secreto>');
--   * Cada desbloqueo usa un reto de un solo uso, ligado a la sesión, que vence en 5 minutos.
-- =============================================================================

alter table public.preferencias_acceso drop constraint preferencias_acceso_al_salir_check;
alter table public.preferencias_acceso add constraint preferencias_acceso_al_salir_check
  check (al_salir in ('codigo', 'pin', 'passkey'));

create table public.passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  credencial_id text not null unique check (credencial_id ~ '^[A-Za-z0-9_-]+$' and length(credencial_id) between 16 and 1400),
  llave_publica text not null check (llave_publica ~ '^[A-Za-z0-9_-]+$' and length(llave_publica) between 16 and 2000),
  contador      bigint not null default 0 check (contador >= 0),
  transportes   text[] not null default '{}',
  nombre        text not null check (length(btrim(nombre)) between 1 and 60),
  creada_en     timestamptz not null default now(),
  usada_en      timestamptz
);
create index passkeys_user_idx on public.passkeys (user_id);
alter table public.passkeys enable row level security;
create policy passkeys_select on public.passkeys for select to authenticated using (user_id = auth.uid());
revoke all on public.passkeys from public, anon, authenticated;
grant select on public.passkeys to authenticated;

create table public.retos_acceso (
  reto       text primary key,
  session_id uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  tipo       text not null check (tipo in ('registro', 'desbloqueo')),
  vence      timestamptz not null
);
alter table public.retos_acceso enable row level security;
revoke all on public.retos_acceso from public, anon, authenticated;

create function public._tengo_passkey(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.passkeys where user_id = p_user)
$$;

-- Reto para registrar una passkey (sesión desbloqueada) o para desbloquear con ella.
create function public.crear_reto_acceso(p_tipo text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_sesion uuid := public._sesion_actual();
  v_reto   text;
begin
  if v_user is null or v_sesion is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo is null or p_tipo not in ('registro', 'desbloqueo') then
    raise exception 'Tipo de reto inválido' using errcode = 'check_violation';
  end if;
  if p_tipo = 'registro' and public._sesion_bloqueada() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  delete from public.retos_acceso where vence < now() or (session_id = v_sesion and tipo = p_tipo);
  v_reto := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.retos_acceso (reto, session_id, user_id, tipo, vence)
  values (v_reto, v_sesion, v_user, p_tipo, now() + interval '5 minutes');
  return v_reto;
end;
$$;

-- Consume un reto (un solo uso). Interna.
create function public._consumir_reto(p_reto text, p_sesion uuid, p_user uuid, p_tipo text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_vence timestamptz;
begin
  delete from public.retos_acceso
   where reto = p_reto and session_id = p_sesion and user_id = p_user and tipo = p_tipo
  returning vence into v_vence;
  return v_vence is not null and v_vence > now();
end;
$$;

-- Guarda la passkey que el servidor de la app ya verificó. Solo con la sesión desbloqueada
-- y con un reto de registro emitido para esta sesión.
create function public.registrar_passkey(p_reto text, p_credencial text, p_llave text, p_contador bigint,
                                         p_transportes text[], p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_sesion uuid := public._sesion_actual();
  v_id     uuid;
begin
  if v_user is null or v_sesion is null or public._sesion_bloqueada() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if not public._consumir_reto(p_reto, v_sesion, v_user, 'registro') then
    raise exception 'El registro venció. Intenta de nuevo.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.passkeys where user_id = v_user) >= 10 then
    raise exception 'Ya tienes 10 teléfonos registrados. Quita alguno antes de agregar otro.' using errcode = 'check_violation';
  end if;
  insert into public.passkeys (user_id, credencial_id, llave_publica, contador, transportes, nombre)
  values (v_user, p_credencial, p_llave, greatest(coalesce(p_contador, 0), 0),
          coalesce(p_transportes, '{}'), left(btrim(coalesce(p_nombre, '')), 60))
  returning id into v_id;
  return v_id;
end;
$$;

-- Quita una passkey. Si era la forma elegida para volver a entrar, se pasa al PIN (si hay)
-- o al código por correo.
create function public.borrar_passkey(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or public._sesion_bloqueada() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  delete from public.passkeys where id = p_id and user_id = v_user;
  if not public._tengo_passkey(v_user) then
    update public.preferencias_acceso
       set al_salir = case when public._tengo_pin(v_user) then 'pin' else 'codigo' end, actualizado_en = now()
     where user_id = v_user and al_salir = 'passkey';
  end if;
end;
$$;

-- Desbloqueo con passkey. Lo llama el servidor de la app (sin sesión, con el secreto del
-- servicio) después de verificar la firma de la passkey con su llave pública.
create function public.acceso_desbloquear_passkey(p_secreto text, p_sesion uuid, p_user uuid, p_credencial text,
                                                  p_reto text, p_contador bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_passkey public.passkeys;
begin
  if not public._servicio_autorizado('acceso', p_secreto) then
    raise exception 'Servicio no autorizado' using errcode = 'insufficient_privilege';
  end if;
  if not public._consumir_reto(p_reto, p_sesion, p_user, 'desbloqueo') then
    return jsonb_build_object('ok', false, 'error', 'El desbloqueo venció. Intenta de nuevo.');
  end if;
  select * into v_passkey from public.passkeys where credencial_id = p_credencial and user_id = p_user;
  if v_passkey.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa huella o rostro no está registrado para tu cuenta.');
  end if;
  -- Contador de firmas: si el autenticador lo lleva, debe crecer (detecta passkeys clonadas).
  if (coalesce(p_contador, 0) > 0 or v_passkey.contador > 0) and coalesce(p_contador, 0) <= v_passkey.contador then
    return jsonb_build_object('ok', false, 'error', 'No se pudo verificar la passkey. Entra con tu PIN o con el código de tu correo.');
  end if;
  update public.passkeys set contador = greatest(coalesce(p_contador, 0), contador), usada_en = now() where id = v_passkey.id;
  delete from public.sesiones_bloqueadas where session_id = p_sesion and user_id = p_user;
  return jsonb_build_object('ok', true);
end;
$$;

-- Migración 26, ahora con la passkey como opción.
create or replace function public.elegir_acceso_al_salir(p_modo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or public._sesion_bloqueada() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_modo is null or p_modo not in ('codigo', 'pin', 'passkey') then
    raise exception 'Opción de acceso inválida' using errcode = 'check_violation';
  end if;
  if p_modo = 'pin' and not public._tengo_pin(v_user) then
    raise exception 'Primero crea tu PIN' using errcode = 'check_violation';
  end if;
  if p_modo = 'passkey' and not public._tengo_passkey(v_user) then
    raise exception 'Primero registra tu huella o rostro' using errcode = 'check_violation';
  end if;
  insert into public.preferencias_acceso (user_id, al_salir) values (v_user, p_modo)
  on conflict (user_id) do update set al_salir = excluded.al_salir, actualizado_en = now();
end;
$$;

create or replace function public.bloquear_mi_sesion() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_sesion uuid := public._sesion_actual();
  v_modo   text;
begin
  if v_user is null or v_sesion is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;
  select al_salir into v_modo from public.preferencias_acceso where user_id = v_user;
  v_modo := coalesce(v_modo, 'codigo'); -- sin preferencia guardada: código por correo
  if not ((v_modo = 'pin' and public._tengo_pin(v_user)) or (v_modo = 'passkey' and public._tengo_passkey(v_user))) then
    return false;
  end if;
  insert into public.sesiones_bloqueadas (session_id, user_id) values (v_sesion, v_user)
  on conflict (session_id) do nothing;
  return true;
end;
$$;

create or replace function public.mi_acceso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'al_salir', coalesce((select al_salir from public.preferencias_acceso where user_id = auth.uid()), 'codigo'),
    'tiene_pin', public._tengo_pin(auth.uid()),
    'tiene_passkey', public._tengo_passkey(auth.uid()),
    'bloqueada', public._sesion_bloqueada())
$$;

revoke execute on function
  public._tengo_passkey(uuid), public.crear_reto_acceso(text), public._consumir_reto(text, uuid, uuid, text),
  public.registrar_passkey(text, text, text, bigint, text[], text), public.borrar_passkey(uuid),
  public.acceso_desbloquear_passkey(text, uuid, uuid, text, text, bigint)
from public, anon, authenticated;
grant execute on function
  public.crear_reto_acceso(text), public.registrar_passkey(text, text, text, bigint, text[], text), public.borrar_passkey(uuid)
to authenticated;
grant execute on function public.acceso_desbloquear_passkey(text, uuid, uuid, text, text, bigint) to anon;
