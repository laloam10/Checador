-- =============================================================================
-- Pruebas del historial de bajas y de revertir_baja(). Continúa sobre 10–80.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_sup    '00000000-0000-0000-0000-00000000000b'
\set u_otro   '00000000-0000-0000-0000-00000000000f'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a, (select id from public.centros_trabajo where empresa_id = e.id order by creado_en limit 1) as centro_a
  from public.empresas e where razon_social = 'Empresa A SA de CV' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Baja Por Error', '0900', '2026-01-01') returning id as b \gset

\echo '--- Registrar una baja queda en el historial'
update public.trabajadores set fecha_baja = '2026-11-01' where id = :'b';
select tests.afirmar(
  (select accion = 'baja' and fecha_baja = '2026-11-01' and user_id = :'u_prop'::uuid
     from public.historial_bajas where trabajador_id = :'b'),
  'la baja se anota con quién la registró');

\echo '--- La baja no se quita ni se cambia editando la ficha'
select tests.debe_fallar(format($$update public.trabajadores set fecha_baja = null where id = %L$$, :'b'), 'quitar la baja editando la ficha');
select tests.debe_fallar(format($$update public.trabajadores set fecha_baja = '2026-11-05' where id = %L$$, :'b'), 'cambiar la fecha de baja editando la ficha');

\echo '--- revertir_baja()'
select tests.debe_fallar(format($$select public.revertir_baja(%L, '')$$, :'b'), 'deshacer sin motivo');
select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format($$select public.revertir_baja(%L, 'Error de captura')$$, :'b'), 'un supervisor deshace una baja');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.debe_fallar(format($$select public.revertir_baja(%L, 'Error de captura')$$, :'b'), 'otra empresa deshace la baja');
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.revertir_baja(:'b', 'Se capturó la baja de la persona equivocada');
select tests.afirmar((select fecha_baja is null from public.trabajadores where id = :'b'), 'la persona vuelve a estar activa');
select tests.afirmar(
  (select string_agg(accion || ':' || fecha_baja || ':' || coalesce(motivo, '-'), ' | ' order by id)
     from public.historial_bajas where trabajador_id = :'b')
   = 'baja:2026-11-01:- | reversion:2026-11-01:Se capturó la baja de la persona equivocada',
  'el historial conserva la baja y la reversión con su motivo');
select tests.debe_fallar(format($$select public.revertir_baja(%L, 'Otra vez')$$, :'b'), 'deshacer una baja que no existe');

\echo '--- El historial es de solo lectura'
select tests.debe_fallar($$insert into public.historial_bajas (empresa_id, trabajador_id, accion, fecha_baja) select empresa_id, id, 'baja', current_date from public.trabajadores limit 1$$,
  'escribir en el historial desde la API');
select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.afirmar((select count(*) >= 2 from public.historial_bajas where trabajador_id = :'b'), 'el supervisor ve el historial');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.afirmar((select count(*) = 0 from public.historial_bajas where trabajador_id = :'b'), 'otra empresa no ve el historial');
reset role;
select tests.debe_fallar($$delete from public.historial_bajas$$, 'borrar el historial incluso como superusuario');
select set_config('request.jwt.claim.sub', '', false) \gset

\echo '--- Fin bajas'
