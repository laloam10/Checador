-- =============================================================================
-- Pruebas del kiosco con PIN. Continúa sobre los datos de 10_pruebas.sql.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_sup    '00000000-0000-0000-0000-00000000000b'
\set u_kiosco '00000000-0000-0000-0000-00000000000c'
\set u_trab   '00000000-0000-0000-0000-00000000000d'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as trab_a, centro_trabajo_id as centro_a from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '001' \gset

set role authenticated;

-- =============================================================================
\echo '--- Asignación de PIN'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$select public.asignar_pin(%L, '0000')$$, :'trab_a'), 'PIN repetido (0000)');
select tests.debe_fallar(format($$select public.asignar_pin(%L, '1234')$$, :'trab_a'), 'PIN secuencial (1234)');
select tests.debe_fallar(format($$select public.asignar_pin(%L, '12a4')$$, :'trab_a'), 'PIN con letras');
select tests.debe_fallar(format($$select public.asignar_pin(%L, '123')$$, :'trab_a'), 'PIN de 3 dígitos');
select public.asignar_pin(:'trab_a', '7391');
select tests.debe_fallar($$select count(*) from public.pines_trabajador$$, 'leer los PINs por la API (ni el propietario tiene el privilegio)');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format($$select public.asignar_pin(%L, '5823')$$, :'trab_a'), 'el supervisor asigna PIN');

select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select public.establecer_mi_pin(:'trab_a', '8642');
select tests.debe_fallar(
  format($$select public.establecer_mi_pin(%L, '5823')$$, (select id from public.trabajadores where numero_empleado = '002' limit 1)),
  'el trabajador cambia el PIN de otro');

-- =============================================================================
\echo '--- Identificación en kiosco'
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(public.kiosco_identificar('001', '7391') ->> 'codigo' = 'CREDENCIALES', 'el PIN anterior ya no sirve');
select tests.afirmar(
  (select r ->> 'ok' = 'true' and r ->> 'nombre' = 'Ana Pérez' and jsonb_typeof(r -> 'eventos') = 'array'
     from public.kiosco_identificar('001', '8642') r),
  'número + PIN correctos identifican y devuelven eventos recientes');
select tests.afirmar(
  public.kiosco_identificar('999', '8642') ->> 'error' = public.kiosco_identificar('001', '1111') ->> 'error',
  'número inexistente y PIN incorrecto dan el mismo mensaje');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.afirmar(public.kiosco_identificar('001', '8642') ->> 'codigo' = 'NO_ES_KIOSCO', 'un supervisor no puede usar funciones de kiosco');

-- =============================================================================
\echo '--- Bloqueos'
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
do $$ begin perform public.kiosco_identificar('001', '0001') from generate_series(1, 4); end $$;
select tests.afirmar(public.kiosco_identificar('001', '8642') ->> 'codigo' = 'TRABAJADOR_BLOQUEADO',
  'tras 5 fallos el PIN se bloquea aunque después se escriba bien');
reset role;
select tests.afirmar((select intentos_fallidos = 5 and bloqueado_hasta > now() from public.pines_trabajador where trabajador_id = :'trab_a'),
  'los fallos se guardan aunque la función responda con error');
set role authenticated;

do $$ begin perform public.kiosco_identificar(lpad(g::text, 3, '9'), '0001') from generate_series(1, 12) g; end $$;
select tests.afirmar(public.kiosco_identificar('500', '0001') ->> 'codigo' = 'KIOSCO_BLOQUEADO', 'tras 20 fallos en 10 min se bloquea el kiosco');

-- Limpieza para las siguientes pruebas.
reset role;
delete from public.intentos_kiosco;
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.asignar_pin(:'trab_a', '8642');
select tests.afirmar(
  (select count(*) = 0 from public.intentos_kiosco) is not null, 'el propietario puede consultar la bitácora de intentos');

-- =============================================================================
\echo '--- Checadas desde kiosco'
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
\set id_rep '22222222-2222-2222-2222-222222222222'
select tests.afirmar((public.kiosco_checar('001', '8642', 'entrada', :'id_rep') ->> 'ok')::boolean, 'entrada desde kiosco');
select tests.afirmar(public.kiosco_checar('001', '8642', 'entrada', :'id_rep') ->> 'duplicado' = 'true', 'reintento con el mismo id_cliente no duplica');
select tests.afirmar(public.kiosco_checar('001', '0002', 'salida', gen_random_uuid()) ->> 'codigo' = 'CREDENCIALES', 'checada con PIN incorrecto se rechaza');
select tests.afirmar(public.kiosco_checar('001', '8642', 'correccion', gen_random_uuid()) ->> 'codigo' = 'TIPO', 'el kiosco no puede hacer correcciones');
select tests.afirmar(
  public.kiosco_checar('001', '8642', 'salida', gen_random_uuid(), true, now() - interval '10 days') ->> 'codigo' = 'RECHAZADO',
  'checada diferida de hace 10 días se rechaza sin romper la función');
select tests.afirmar(
  (public.kiosco_checar('001', '8642', 'salida', gen_random_uuid(), true, now() - interval '1 hour') ->> 'ok')::boolean,
  'checada diferida reciente se acepta');

reset role;
select tests.afirmar(
  (select origen = 'kiosco' and registrado_por = :'u_kiosco'::uuid and diferido
     from public.eventos where trabajador_id = :'trab_a' order by id desc limit 1),
  'el evento queda con origen kiosco, registrado por la cuenta del kiosco y marcado diferido');
set role authenticated;

-- =============================================================================
\echo '--- Pausa según el centro de trabajo (art. 64)'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
update public.centros_trabajo set pausa_puede_salir = false where id = :'centro_a';
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
do $$ begin perform public.kiosco_checar('001', '8642', 'inicio_pausa', gen_random_uuid()); end $$;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, puede_salir)
  values (:'empresa_a', :'trab_a', 'inicio_pausa', 'pwa', true);
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(
  (select bool_and(not puede_salir) and count(*) = 2 from (
     select puede_salir from public.eventos where trabajador_id = :'trab_a' and tipo = 'inicio_pausa' order by id desc limit 2) x),
  'el valor de la pausa lo impone el centro, aunque la PWA envíe otro');
select tests.afirmar(public.verificar_cadena(:'empresa_a') = 2, 'las checadas de kiosco mantienen la cadena (solo la secuencia 2, alterada a propósito, está rota)');
set role authenticated;

-- =============================================================================
\echo '--- Kiosco limitado a un centro'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.centros_trabajo (empresa_id, nombre) values (:'empresa_a', 'Bodega') returning id as centro_b \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_b', 'Diego Bodega', '050', '2026-04-01') returning id as trab_b \gset
select public.asignar_pin(:'trab_b', '9157');
update public.miembros set centro_trabajo_id = :'centro_a' where user_id = :'u_kiosco';
select tests.debe_fallar(format($$update public.miembros set centro_trabajo_id = %L where user_id = %L$$, :'centro_a', :'u_sup'),
  'asignar centro a un miembro que no es kiosco');

select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(public.kiosco_identificar('050', '9157') ->> 'codigo' = 'CREDENCIALES', 'el kiosco de Matriz no identifica a personal de Bodega');
select tests.afirmar((public.kiosco_identificar('001', '8642') ->> 'ok')::boolean, 'el kiosco de Matriz sí identifica a personal de Matriz');

-- =============================================================================
\echo '--- Acceso anónimo'
reset role;
set role anon;
select tests.debe_fallar($$select public.kiosco_identificar('001', '8642')$$, 'anon usa el kiosco');
select tests.debe_fallar(format($$select public.asignar_pin(%L, '5823')$$, :'trab_a'), 'anon asigna PIN');
reset role;

\echo '--- Fin kiosco'
