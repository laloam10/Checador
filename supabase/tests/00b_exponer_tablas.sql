-- Simula la opción "Automatically expose new tables" ACTIVADA (valor por omisión de Supabase).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
