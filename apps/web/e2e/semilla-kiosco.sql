-- Datos de prueba del kiosco (Supabase local). Requiere semilla.sql. Ejecutar como postgres.
\set ON_ERROR_STOP 1
-- Trabajador sin correo: solo checa en el kiosco.
insert into public.trabajadores (id, empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, dia_descanso)
  values ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000002', 'Beto López', '002', '2026-02-01', 0)
  on conflict do nothing;
select public.asignar_pin('aaaaaaaa-0000-0000-0000-000000000004', '2580');
select public.asignar_pin('aaaaaaaa-0000-0000-0000-000000000003', '8642');
