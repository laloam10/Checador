-- =============================================================================
-- Checador: protección del vínculo entre la ficha del trabajador y su cuenta
--
-- Problema: el empleador (propietario o administrador) podía, por la API, poner en
-- trabajadores.user_id cualquier cuenta, incluida la suya. Con eso podría firmar el
-- acuerdo o dar conformidades "como trabajador", lo que destruye su valor como prueba
-- (art. 132 fr. XXXIV: el registro hace prueba plena si fue acordado con el trabajador).
-- Además, al cambiar el correo de alguien, la cuenta del correo anterior seguía ligada.
--
-- Reglas (en la base, no en la app):
--   1. Solo vincular_mi_cuenta() liga una ficha a una cuenta: la persona entra con el
--      código enviado al correo de su ficha. Nadie de la API puede poner user_id.
--   2. Desvincular (user_id = null) sí está permitido al empleador.
--   3. Cambiar el correo desvincula la cuenta anterior; la persona vuelve a quedar ligada
--      cuando entra con el correo nuevo. Cambiar solo mayúsculas no desvincula.
-- =============================================================================

create function public.trabajadores_proteger_vinculo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    new.user_id := null;
  end if;
  -- Las funciones SECURITY DEFINER (vincular_mi_cuenta) corren como su dueño, no como
  -- un rol de la API.
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
     and current_user in ('authenticated', 'anon') then
    raise exception 'La cuenta de un trabajador solo se vincula cuando entra con el código enviado a su correo'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.trabajadores_proteger_vinculo() from public, anon, authenticated;

create trigger trabajadores_proteger_vinculo before insert or update on public.trabajadores
  for each row execute function public.trabajadores_proteger_vinculo();
