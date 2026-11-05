-- =============================================================================
-- Checador: invitaciones de acceso al panel y kioscos
--
--   * El empleador invita por correo a administradores, supervisores y kioscos.
--   * Al entrar con ese correo (confirmado), vincular_mi_cuenta() acepta la
--     invitación y crea la membresía. No hace falta tocar SQL para configurar un kiosco.
--   * Solo el propietario puede invitar administradores.
-- =============================================================================

create table public.invitaciones (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas (id) on delete restrict,
  email              text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  rol                public.rol_miembro not null check (rol <> 'propietario'),
  centro_trabajo_id  uuid,
  creado_por         uuid default auth.uid(),
  creado_en          timestamptz not null default now(),
  aceptada_en        timestamptz,
  aceptada_por       uuid,
  foreign key (empresa_id, centro_trabajo_id) references public.centros_trabajo (empresa_id, id),
  constraint invitaciones_centro_solo_kiosco check (centro_trabajo_id is null or rol = 'kiosco')
);
create unique index invitaciones_pendiente_idx on public.invitaciones (empresa_id, lower(email)) where aceptada_en is null;

alter table public.invitaciones enable row level security;
create policy invitaciones_select on public.invitaciones for select to authenticated
  using (public.es_gestor(empresa_id));
create policy invitaciones_insert on public.invitaciones for insert to authenticated
  with check (
    aceptada_en is null
    and (public.mi_rol(empresa_id) = 'propietario'
         or (public.mi_rol(empresa_id) = 'admin' and rol in ('supervisor', 'kiosco')))
  );
create policy invitaciones_delete on public.invitaciones for delete to authenticated
  using (aceptada_en is null and public.es_gestor(empresa_id));

-- Los administradores también pueden quitar accesos de supervisores y kioscos.
drop policy miembros_delete on public.miembros;
create policy miembros_delete on public.miembros for delete to authenticated
  using (
    user_id <> auth.uid()
    and (public.mi_rol(empresa_id) = 'propietario'
         or (public.mi_rol(empresa_id) = 'admin' and rol in ('supervisor', 'kiosco')))
  );

-- -----------------------------------------------------------------------------
-- vincular_mi_cuenta(): ahora también acepta invitaciones pendientes.
-- -----------------------------------------------------------------------------
create or replace function public.vincular_mi_cuenta() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_n     integer;
  v_m     integer;
begin
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  update public.trabajadores
     set user_id = auth.uid()
   where lower(email) = lower(v_email) and user_id is null and fecha_baja is null;
  get diagnostics v_n = row_count;

  with aceptadas as (
    update public.invitaciones
       set aceptada_en = now(), aceptada_por = auth.uid()
     where lower(email) = lower(v_email) and aceptada_en is null
    returning empresa_id, rol, centro_trabajo_id
  )
  insert into public.miembros (empresa_id, user_id, rol, centro_trabajo_id)
  select empresa_id, auth.uid(), rol, centro_trabajo_id from aceptadas
  on conflict (empresa_id, user_id) do update
    set rol = excluded.rol, centro_trabajo_id = excluded.centro_trabajo_id
    where public.miembros.rol <> 'propietario';
  get diagnostics v_m = row_count;

  return v_n + v_m;
end;
$$;

-- -----------------------------------------------------------------------------
-- Miembros con su correo (auth.users no es legible por la API).
-- -----------------------------------------------------------------------------
create function public.miembros_de_empresa(p_empresa uuid)
returns table (user_id uuid, email text, rol public.rol_miembro, centro_trabajo_id uuid, creado_en timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_gestor(p_empresa) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id, u.email::text, m.rol, m.centro_trabajo_id, m.creado_en
      from public.miembros m
      join auth.users u on u.id = m.user_id
     where m.empresa_id = p_empresa
     order by m.rol, u.email;
end;
$$;
revoke execute on function public.miembros_de_empresa(uuid) from public, anon;
grant execute on function public.miembros_de_empresa(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Qué trabajadores tienen PIN (sin exponer los PINs).
-- -----------------------------------------------------------------------------
create function public.trabajadores_con_pin(p_empresa uuid) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_consultar(p_empresa) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.trabajador_id from public.pines_trabajador p
      join public.trabajadores t on t.id = p.trabajador_id
     where t.empresa_id = p_empresa;
end;
$$;
revoke execute on function public.trabajadores_con_pin(uuid) from public, anon;
grant execute on function public.trabajadores_con_pin(uuid) to authenticated;
