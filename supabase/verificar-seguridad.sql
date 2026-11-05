-- =============================================================================
-- Verificación de seguridad de la base de datos de Checador.
--
-- Úsala antes de publicar y después de cada migración:
--   * En Supabase: SQL Editor → pega este archivo → Run.
--   * Por terminal: psql "$DB_URL" -f supabase/verificar-seguridad.sql
--
-- Resultado esperado: CERO filas. Cada fila es un hallazgo que debe corregirse.
-- =============================================================================
with
tablas as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
),
funciones as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
)
-- 1. Toda tabla expuesta por la API debe tener Row Level Security.
select 'CRITICO' as nivel, 'Tabla sin RLS' as hallazgo, relname::text as objeto
  from tablas where not relrowsecurity
union all
-- 2. El rol anónimo (sin sesión) no debe tener ningún privilegio sobre las tablas.
select 'ALTO', 'Privilegio de anon sobre tabla: ' || privilege_type, table_name::text
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
union all
-- 3. El rol anónimo no debe poder ejecutar funciones (las SECURITY DEFINER saltan RLS).
select 'ALTO', 'anon puede ejecutar la función', proname || '(' || args || ')'
  from funciones
 where has_function_privilege('anon', oid, 'EXECUTE')
union all
-- 4. Las funciones SECURITY DEFINER deben fijar search_path (evita secuestro por objetos homónimos).
select 'ALTO', 'SECURITY DEFINER sin search_path fijo', proname || '(' || args || ')'
  from funciones
 where prosecdef and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')
union all
-- 5. Ninguna política debe aplicar a anon o a PUBLIC.
select 'ALTO', 'Política aplicable a anon/PUBLIC: ' || policyname, tablename::text
  from pg_policies
 where schemaname = 'public' and (roles && array['anon', 'public']::name[])
union all
-- 6. Las tablas de evidencia deben ser de solo inserción (trigger que bloquee UPDATE/DELETE).
select 'CRITICO', 'Tabla de evidencia sin bloqueo de UPDATE/DELETE', t.relname::text
  from tablas t
 where t.relname in ('eventos', 'acuerdos', 'firmas_acuerdo', 'conformidades', 'exportaciones')
   and not exists (
     select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = t.oid and p.proname = 'prohibir_modificacion' and not g.tgisinternal)
union all
-- 7. Los PINs no deben ser legibles por ningún rol de la API.
select 'CRITICO', 'PINs legibles por ' || grantee, 'pines_trabajador'
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'pines_trabajador' and privilege_type = 'SELECT'
   and grantee in ('anon', 'authenticated')
   and exists (select 1 from pg_policies where tablename = 'pines_trabajador')
union all
-- 8. TRUNCATE no está sujeto a RLS: ningún rol de la API debe tenerlo.
select 'CRITICO', 'TRUNCATE (no lo cubre RLS) para ' || grantee, table_name::text
  from information_schema.role_table_grants
 where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated', 'PUBLIC')
union all
-- 9. Las tablas de evidencia no deben otorgar UPDATE ni DELETE a los roles de la API.
select 'ALTO', 'Privilegio ' || privilege_type || ' para ' || grantee || ' en tabla de evidencia', table_name::text
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
   and privilege_type in ('UPDATE', 'DELETE')
   and table_name in ('eventos', 'acuerdos', 'firmas_acuerdo', 'conformidades', 'exportaciones', 'cadena_estado')
order by 1, 2, 3;
