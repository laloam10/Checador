-- =============================================================================
-- Pruebas del origen 'app' (app instalada desde las tiendas). Continúa sobre 10–100.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_otro   '00000000-0000-0000-0000-00000000000f'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as trab_a, empresa_id as empresa_a, centro_trabajo_id as centro_a
  from public.trabajadores where user_id = :'u_trab' and fecha_baja is null limit 1 \gset
select id as otro_trab from public.trabajadores where empresa_id = :'empresa_a' and id <> :'trab_a' and fecha_baja is null limit 1 \gset

set role authenticated;
\echo '--- La persona trabajadora registra desde la app'
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'entrada', 'app', '00000000-0000-4000-8000-000000000a01');
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, puede_salir)
  values (:'empresa_a', :'trab_a', 'inicio_pausa', 'app', '00000000-0000-4000-8000-000000000a02', not (select pausa_puede_salir from public.centros_trabajo where id = :'centro_a'));
select tests.afirmar(
  (select e.puede_salir = c.pausa_puede_salir from public.eventos e join public.centros_trabajo c on c.id = :'centro_a'
    where e.id_cliente = '00000000-0000-4000-8000-000000000a02'),
  'la pausa desde la app toma la regla del centro (art. 64), no la que mande el teléfono');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'correccion', 'app')$$,
  :'empresa_a', :'trab_a'), 'la app no registra correcciones');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'entrada', 'app')$$,
  :'empresa_a', :'otro_trab'), 'la app no checa por otra persona');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'entrada', 'whatsapp')$$,
  :'empresa_a', :'trab_a'), 'nadie registra con origen whatsapp por la API');

\echo '--- La empresa no puede hacerse pasar por la app'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'entrada', 'app')$$,
  :'empresa_a', :'trab_a'), 'el empleador registra como si fuera la app de la persona');

reset role;
select tests.afirmar(
  (select count(*) = 2 and bool_and(origen = 'app') from public.eventos where id_cliente::text like '00000000-0000-4000-8000-000000000a0%'),
  'quedan en la bitácora con origen app');
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Origen app: pruebas correctas.'
