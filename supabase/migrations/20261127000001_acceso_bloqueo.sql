-- =============================================================================
-- Checador: al salir, bloquear la sesión en vez de cerrarla
--
-- Hasta ahora "Salir" cerraba la sesión y volver a entrar pedía un código por correo. La
-- persona puede elegir que "Salir" solo bloquee la sesión de ese teléfono y volver a entrar
-- con su PIN (el mismo del kiosco).
--
--   * El primer acceso en cada teléfono sigue siendo con código por correo: es lo que liga
--     la cuenta a la persona y lo que describe el acuerdo (cláusula SEGUNDA).
--   * El bloqueo protege el teléfono: con la sesión bloqueada no se puede checar, dar
--     conformidad, firmar ni cambiar el PIN (registro fiel y atribuible, art. 132
--     fr. XXXIV LFT). Se aplica aquí en la base, no solo en las pantallas.
--   * El PIN comparte el límite de intentos con el kiosco (5 fallos → 15 minutos).
--
-- Es una protección del dispositivo, no un método de registro nuevo: ver la interpretación
-- 11 de packages/jornada/README.md.
-- =============================================================================

create table public.preferencias_acceso (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  al_salir       text not null default 'codigo' check (al_salir in ('codigo', 'pin')),
  actualizado_en timestamptz not null default now()
);
alter table public.preferencias_acceso enable row level security;
create policy preferencias_acceso_select on public.preferencias_acceso for select to authenticated
  using (user_id = auth.uid());
revoke all on public.preferencias_acceso from public, anon, authenticated;
grant select on public.preferencias_acceso to authenticated;

-- Sesiones (de Supabase Auth) bloqueadas. Sin privilegios para los roles de la API: solo
-- las funciones de abajo la leen y escriben.
create table public.sesiones_bloqueadas (
  session_id   uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  bloqueada_en timestamptz not null default now()
);
alter table public.sesiones_bloqueadas enable row level security;
revoke all on public.sesiones_bloqueadas from public, anon, authenticated;

-- Sesión de la solicitud (claim session_id del JWT de Supabase Auth).
create function public._sesion_actual() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid
$$;

create function public._sesion_bloqueada() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sesiones_bloqueadas where session_id = public._sesion_actual())
$$;

-- Con la sesión bloqueada, la persona deja de "ser" su trabajador para RLS: no ve ni escribe
-- sus registros, conformidades, acuerdos ni PIN (todas esas políticas usan esta función).
create or replace function public.soy_trabajador(p_trabajador uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trabajadores
     where id = p_trabajador and user_id = auth.uid() and fecha_baja is null
  ) and not public._sesion_bloqueada()
$$;

-- ¿Tiene la persona un PIN en alguna de sus fichas activas?
create function public._tengo_pin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pines_trabajador p join public.trabajadores t on t.id = p.trabajador_id
     where t.user_id = p_user and t.fecha_baja is null)
$$;

-- La persona elige qué pasa al salir.
create function public.elegir_acceso_al_salir(p_modo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or public._sesion_bloqueada() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if p_modo is null or p_modo not in ('codigo', 'pin') then
    raise exception 'Opción de acceso inválida' using errcode = 'check_violation';
  end if;
  if p_modo = 'pin' and not public._tengo_pin(v_user) then
    raise exception 'Primero crea tu PIN' using errcode = 'check_violation';
  end if;
  insert into public.preferencias_acceso (user_id, al_salir) values (v_user, p_modo)
  on conflict (user_id) do update set al_salir = excluded.al_salir, actualizado_en = now();
end;
$$;

-- "Salir": bloquea la sesión si la persona eligió entrar con PIN. Devuelve false si eligió
-- el código por correo (o ya no tiene PIN): entonces la app cierra la sesión como siempre.
create function public.bloquear_mi_sesion() returns boolean
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
  if coalesce(v_modo, 'codigo') <> 'pin' or not public._tengo_pin(v_user) then
    return false;
  end if;
  insert into public.sesiones_bloqueadas (session_id, user_id) values (v_sesion, v_user)
  on conflict (session_id) do nothing;
  return true;
end;
$$;

-- Desbloquea la sesión con el PIN. Devuelve jsonb (no lanza excepción) para que los
-- contadores de intentos fallidos sí se guarden.
create function public.desbloquear_con_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_sesion uuid := public._sesion_actual();
  v_hasta  timestamptz;
  v_ok     boolean;
begin
  if v_user is null or v_sesion is null then
    raise exception 'Sin sesión' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.sesiones_bloqueadas where session_id = v_sesion and user_id = v_user) then
    return jsonb_build_object('ok', true);
  end if;
  if not public._tengo_pin(v_user) then
    return jsonb_build_object('ok', false, 'error', 'No tienes PIN. Cierra la sesión y entra con el código de tu correo.');
  end if;

  select max(p.bloqueado_hasta) into v_hasta
    from public.pines_trabajador p join public.trabajadores t on t.id = p.trabajador_id
   where t.user_id = v_user and t.fecha_baja is null and p.bloqueado_hasta > now();
  if v_hasta is not null then
    return jsonb_build_object('ok', false, 'error',
      format('PIN bloqueado por intentos fallidos. Intenta en %s min o cierra la sesión y entra con el código de tu correo.',
             ceil(extract(epoch from v_hasta - now()) / 60)::integer));
  end if;

  select bool_or(extensions.crypt(coalesce(p_pin, ''), p.pin_hash) = p.pin_hash) into v_ok
    from public.pines_trabajador p join public.trabajadores t on t.id = p.trabajador_id
   where t.user_id = v_user and t.fecha_baja is null;

  if not coalesce(v_ok, false) then
    update public.pines_trabajador p
       set intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
      from public.trabajadores t
     where t.id = p.trabajador_id and t.user_id = v_user and t.fecha_baja is null;
    return jsonb_build_object('ok', false, 'error', 'PIN incorrecto.');
  end if;

  update public.pines_trabajador p set intentos_fallidos = 0, bloqueado_hasta = null
    from public.trabajadores t
   where t.id = p.trabajador_id and t.user_id = v_user and t.fecha_baja is null;
  delete from public.sesiones_bloqueadas where session_id = v_sesion;
  return jsonb_build_object('ok', true);
end;
$$;

-- Lo que la pantalla "Acceso" necesita saber (no revela el PIN).
create function public.mi_acceso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'al_salir', coalesce((select al_salir from public.preferencias_acceso where user_id = auth.uid()), 'codigo'),
    'tiene_pin', public._tengo_pin(auth.uid()),
    'bloqueada', public._sesion_bloqueada())
$$;

-- Al cerrar la sesión por completo, se borra su bloqueo (la sesión ya no existirá).
create function public.olvidar_bloqueo_de_mi_sesion() returns void
language sql security definer set search_path = '' as $$
  delete from public.sesiones_bloqueadas where session_id = public._sesion_actual() and user_id = auth.uid()
$$;

revoke execute on function
  public._sesion_actual(), public._sesion_bloqueada(), public._tengo_pin(uuid),
  public.elegir_acceso_al_salir(text), public.bloquear_mi_sesion(), public.desbloquear_con_pin(text),
  public.olvidar_bloqueo_de_mi_sesion(), public.mi_acceso()
from public, anon, authenticated;
grant execute on function
  public.elegir_acceso_al_salir(text), public.bloquear_mi_sesion(), public.desbloquear_con_pin(text),
  public.olvidar_bloqueo_de_mi_sesion(), public.mi_acceso()
to authenticated;
