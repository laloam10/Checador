-- Datos de prueba para la PWA (Supabase local). Ejecutar como postgres.
-- Uso: psql "$DB_URL" -v lunes=2026-10-26 -f apps/web/e2e/semilla.sql
--   :lunes = lunes de una semana YA TERMINADA.
\set ON_ERROR_STOP 1

insert into public.empresas (id, razon_social) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Panadería La Espiga SA de CV')
  on conflict do nothing;
insert into public.centros_trabajo (id, empresa_id, nombre)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sucursal Centro')
  on conflict do nothing;
insert into public.trabajadores (id, empresa_id, centro_trabajo_id, nombre, email, numero_empleado, fecha_ingreso, dia_descanso)
  values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 'Ana Pérez', 'ana@ejemplo.mx', '001', '2026-01-15', 0)
  on conflict do nothing;

set semilla.lunes = :'lunes';

-- Semana pasada capturada desde el panel: lunes 8:00–19:00, martes a sábado 8:00–17:00,
-- con comida de 13:00 a 14:00 en la que puede salir (art. 64).
-- Lunes = 10 h; martes a sábado = 8 h → 50 h; en 2026 el máximo es 48 → 2 h extra.
do $$
declare
  d int;
  f date;
  tz text := 'America/Mexico_City';
  t uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  e uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  for d in 0..5 loop
    f := current_setting('semilla.lunes')::date + d;
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values
      (e, t, 'entrada', 'panel', 'Carga de prueba', (f + time '08:00') at time zone tz);
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva, puede_salir) values
      (e, t, 'inicio_pausa', 'panel', 'Carga de prueba', (f + time '13:00') at time zone tz, true);
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values
      (e, t, 'fin_pausa', 'panel', 'Carga de prueba', (f + time '14:00') at time zone tz),
      (e, t, 'salida', 'panel', 'Carga de prueba', (f + (case when d = 0 then time '19:00' else time '17:00' end)) at time zone tz);
  end loop;
end $$;
