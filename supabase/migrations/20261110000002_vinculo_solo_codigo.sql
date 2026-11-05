-- =============================================================================
-- Checador: vincular cuentas solo si probaron ser dueñas del correo con un código
--
-- Riesgo corregido: Supabase permite registrarse con correo y contraseña llamando
-- directamente a su API con la llave pública. Si "Confirm email" está apagado, esa
-- cuenta queda confirmada SIN haber demostrado que el correo es suyo, y podría
-- vincularse al registro de un trabajador o aceptar una invitación de administrador.
--
-- Checador no usa contraseñas: se entra con un código enviado al correo. Por eso solo
-- se vincula si la SESIÓN ACTUAL se inició con ese código (claim `amr` del JWT con
-- método `otp`), que es la prueba de que la persona controla el correo, sin importar
-- la configuración de Auth. (No sirve revisar si la cuenta tiene contraseña: Supabase
-- asigna una contraseña interna aleatoria también a las cuentas creadas por código.)
-- =============================================================================

create or replace function public.vincular_mi_cuenta() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_n     integer;
  v_m     integer;
begin
  -- La sesión debe haberse iniciado con un código enviado al correo (no con contraseña).
  if not exists (
       select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
        where m ->> 'method' in ('otp', 'magiclink', 'email/signup')) then
    return 0;
  end if;

  select email into v_email
    from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
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
