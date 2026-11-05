-- =============================================================================
-- Checador: endurecimiento de privilegios (defensa en profundidad)
--
-- Supabase otorga por omisión todos los privilegios sobre las tablas y funciones
-- de `public` a los roles `anon` y `authenticated`; RLS es lo que protege los datos.
-- Aquí se retira lo que la app no necesita, para que un error futuro en una política
-- no baste para exponer o destruir información:
--   * anon (sin sesión): ningún acceso a tablas, secuencias ni funciones.
--   * authenticated: sin TRUNCATE (no lo cubre RLS), REFERENCES ni TRIGGER.
-- Los privilegios por omisión se ajustan igual para los objetos que se creen después.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke truncate, references, trigger on all tables in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
