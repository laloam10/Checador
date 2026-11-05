-- =============================================================================
-- Checador: Row Level Security
--
-- Roles:
--   propietario/admin  → gestionan la empresa, trabajadores, acuerdos y ajustes.
--   supervisor         → consulta y captura o ajusta eventos desde el panel.
--   kiosco             → cuenta de dispositivo compartido: solo captura eventos.
--   trabajador         → (no es miembro) ve sus datos, checa desde la PWA, firma
--                        su acuerdo y da su conformidad.
--
-- Ninguna tabla de solo inserción tiene políticas UPDATE o DELETE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión en RLS)
-- -----------------------------------------------------------------------------
create function public.mi_rol(p_empresa uuid) returns public.rol_miembro
language sql stable security definer set search_path = '' as $$
  select rol from public.miembros where empresa_id = p_empresa and user_id = auth.uid()
$$;

create function public.es_gestor(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mi_rol(p_empresa) in ('propietario', 'admin'), false)
$$;

create function public.puede_consultar(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mi_rol(p_empresa) in ('propietario', 'admin', 'supervisor'), false)
$$;

create function public.soy_trabajador(p_trabajador uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trabajadores
     where id = p_trabajador and user_id = auth.uid() and fecha_baja is null
  )
$$;

create function public.trabajo_en(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trabajadores where empresa_id = p_empresa and user_id = auth.uid())
$$;

-- Alta de empresa: crea la empresa y hace propietario a quien la crea.
create function public.crear_empresa(p_razon_social text, p_rfc text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  insert into public.empresas (razon_social, rfc) values (p_razon_social, p_rfc) returning id into v_id;
  insert into public.miembros (empresa_id, user_id, rol) values (v_id, auth.uid(), 'propietario');
  return v_id;
end;
$$;

-- Vincula la cuenta del usuario con los registros de trabajador que el empleador
-- dio de alta con su correo. Solo correos confirmados (evita suplantación).
-- Devuelve cuántos registros se vincularon.
create function public.vincular_mi_cuenta() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_n     integer;
begin
  select email into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  update public.trabajadores
     set user_id = auth.uid()
   where lower(email) = lower(v_email) and user_id is null and fecha_baja is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Verifica la integridad de la cadena de una empresa.
-- Devuelve la primera secuencia inválida, o NULL si la cadena está íntegra.
create function public.verificar_cadena(p_empresa uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  e            public.eventos;
  v_anterior   bytea := decode(repeat('00', 32), 'hex');
  v_esperada   bigint := 1;
  v_estado     public.cadena_estado;
begin
  if not public.puede_consultar(p_empresa) and auth.uid() is not null then
    raise exception 'Sin permiso para verificar esta empresa' using errcode = 'insufficient_privilege';
  end if;
  for e in select * from public.eventos where empresa_id = p_empresa order by secuencia loop
    if e.secuencia <> v_esperada
       or e.hash_anterior <> v_anterior
       or e.hash <> public.sha256_texto(public.evento_canonico(e)) then
      return v_esperada;
    end if;
    v_anterior := e.hash;
    v_esperada := v_esperada + 1;
  end loop;
  -- El estado debe coincidir con el último evento (detecta eventos borrados al final).
  select * into v_estado from public.cadena_estado where empresa_id = p_empresa;
  if v_estado.ultima_secuencia <> v_esperada - 1 or v_estado.ultimo_hash <> v_anterior then
    return v_esperada;
  end if;
  return null;
end;
$$;

revoke execute on function public.crear_empresa(text, text) from public, anon;
revoke execute on function public.verificar_cadena(uuid) from public, anon;
revoke execute on function public.vincular_mi_cuenta() from public, anon;
grant execute on function public.crear_empresa(text, text) to authenticated;
grant execute on function public.vincular_mi_cuenta() to authenticated;
grant execute on function public.verificar_cadena(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Habilitar RLS
-- -----------------------------------------------------------------------------
alter table public.empresas        enable row level security;
alter table public.miembros        enable row level security;
alter table public.centros_trabajo enable row level security;
alter table public.trabajadores    enable row level security;
alter table public.cadena_estado   enable row level security;
alter table public.eventos         enable row level security;
alter table public.acuerdos        enable row level security;
alter table public.firmas_acuerdo  enable row level security;
alter table public.conformidades   enable row level security;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create policy empresas_select on public.empresas for select to authenticated
  using (public.mi_rol(id) is not null or public.trabajo_en(id));
create policy empresas_update on public.empresas for update to authenticated
  using (public.es_gestor(id)) with check (public.es_gestor(id));
-- INSERT solo mediante crear_empresa().

-- -----------------------------------------------------------------------------
-- Miembros (los gestiona el propietario)
-- -----------------------------------------------------------------------------
create policy miembros_select on public.miembros for select to authenticated
  using (public.mi_rol(empresa_id) is not null);
create policy miembros_insert on public.miembros for insert to authenticated
  with check (public.mi_rol(empresa_id) = 'propietario');
create policy miembros_update on public.miembros for update to authenticated
  using (public.mi_rol(empresa_id) = 'propietario')
  with check (public.mi_rol(empresa_id) = 'propietario');
create policy miembros_delete on public.miembros for delete to authenticated
  using (public.mi_rol(empresa_id) = 'propietario' and user_id <> auth.uid());

-- -----------------------------------------------------------------------------
-- Centros de trabajo
-- -----------------------------------------------------------------------------
create policy centros_select on public.centros_trabajo for select to authenticated
  using (public.mi_rol(empresa_id) is not null or public.trabajo_en(empresa_id));
create policy centros_insert on public.centros_trabajo for insert to authenticated
  with check (public.es_gestor(empresa_id));
create policy centros_update on public.centros_trabajo for update to authenticated
  using (public.es_gestor(empresa_id)) with check (public.es_gestor(empresa_id));

-- -----------------------------------------------------------------------------
-- Trabajadores (sin DELETE: conservación, art. 804)
-- -----------------------------------------------------------------------------
create policy trabajadores_select on public.trabajadores for select to authenticated
  using (public.mi_rol(empresa_id) is not null or user_id = auth.uid());
create policy trabajadores_insert on public.trabajadores for insert to authenticated
  with check (public.es_gestor(empresa_id));
create policy trabajadores_update on public.trabajadores for update to authenticated
  using (public.es_gestor(empresa_id)) with check (public.es_gestor(empresa_id));

-- -----------------------------------------------------------------------------
-- Estado de la cadena (solo lectura)
-- -----------------------------------------------------------------------------
create policy cadena_select on public.cadena_estado for select to authenticated
  using (public.puede_consultar(empresa_id));

-- -----------------------------------------------------------------------------
-- Eventos (solo SELECT e INSERT)
-- -----------------------------------------------------------------------------
create policy eventos_select on public.eventos for select to authenticated
  using (public.puede_consultar(empresa_id) or public.soy_trabajador(trabajador_id));

create policy eventos_insert on public.eventos for insert to authenticated
  with check (
    -- El trabajador checa desde la PWA (solo eventos de captura propios).
    (origen = 'pwa'
       and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and public.soy_trabajador(trabajador_id))
    -- El kiosco captura para cualquier trabajador activo de su empresa.
    -- PENDIENTE: validar el PIN del trabajador en una función de servidor.
    or (origen = 'kiosco'
       and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and public.mi_rol(empresa_id) = 'kiosco')
    -- El empleador captura o ajusta desde el panel (siempre con motivo).
    or (origen = 'panel' and public.puede_consultar(empresa_id))
  );

-- -----------------------------------------------------------------------------
-- Acuerdos y firmas
-- -----------------------------------------------------------------------------
create policy acuerdos_select on public.acuerdos for select to authenticated
  using (public.puede_consultar(empresa_id) or public.soy_trabajador(trabajador_id));
create policy acuerdos_insert on public.acuerdos for insert to authenticated
  with check (public.es_gestor(empresa_id));

create policy firmas_select on public.firmas_acuerdo for select to authenticated
  using (
    public.puede_consultar(empresa_id)
    or exists (select 1 from public.acuerdos a where a.id = acuerdo_id and public.soy_trabajador(a.trabajador_id))
  );
create policy firmas_insert on public.firmas_acuerdo for insert to authenticated
  with check (
    (firmante = 'empleador' and public.es_gestor(empresa_id))
    or (firmante = 'trabajador'
        and exists (select 1 from public.acuerdos a where a.id = acuerdo_id and public.soy_trabajador(a.trabajador_id)))
  );

-- -----------------------------------------------------------------------------
-- Conformidades (solo las emite el propio trabajador)
-- -----------------------------------------------------------------------------
create policy conformidades_select on public.conformidades for select to authenticated
  using (public.puede_consultar(empresa_id) or public.soy_trabajador(trabajador_id));
create policy conformidades_insert on public.conformidades for insert to authenticated
  with check (public.soy_trabajador(trabajador_id));
