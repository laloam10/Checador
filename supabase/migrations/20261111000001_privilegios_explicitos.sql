-- =============================================================================
-- Checador: privilegios explícitos por tabla (mínimo necesario)
--
-- No depende de la opción "Automatically expose new tables" de Supabase: funciona
-- igual con ella activada o desactivada (Supabase recomienda desactivarla).
--
--   * anon: nada (ya lo retira 20261110000001_endurecimiento.sql).
--   * authenticated: solo lo que la app usa; RLS decide además qué filas.
--     Las tablas de evidencia (eventos, acuerdos, firmas, conformidades,
--     exportaciones) solo tienen SELECT e INSERT: el privilegio de modificarlas
--     o borrarlas ni siquiera existe para los usuarios de la API.
--   * pines_trabajador: ningún privilegio (solo la leen funciones SECURITY DEFINER).
--   * Las tablas que se creen después NO quedan expuestas: requieren su propio GRANT.
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, update                 on public.empresas        to authenticated;  -- alta con crear_empresa()
grant select, insert, update, delete on public.miembros        to authenticated;
grant select, insert, update         on public.centros_trabajo to authenticated;
grant select, insert, update         on public.trabajadores    to authenticated;  -- sin DELETE (art. 804)
grant select                         on public.cadena_estado   to authenticated;
grant select, insert                 on public.eventos         to authenticated;
grant select, insert                 on public.acuerdos        to authenticated;
grant select, insert                 on public.firmas_acuerdo  to authenticated;
grant select, insert                 on public.conformidades   to authenticated;
grant select                         on public.intentos_kiosco to authenticated;
grant select, insert, delete         on public.invitaciones    to authenticated;
grant select, insert                 on public.exportaciones   to authenticated;
-- public.pines_trabajador: sin privilegios a propósito.

-- service_role (herramientas administrativas, nunca la app) conserva acceso completo.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Lo que se cree en adelante no queda expuesto automáticamente.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
