-- =============================================================================
-- Pruebas de "Salir" con bloqueo de la sesión y desbloqueo con PIN. Continúa sobre 10–102.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set s1       '00000000-0000-4000-8000-0000000005e1'
\set s2       '00000000-0000-4000-8000-0000000005e2'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select set_config('request.jwt.claims', '', false) \gset
select id as trab_a, empresa_id as empresa_a
  from public.trabajadores where user_id = :'u_trab' and fecha_baja is null limit 1 \gset

set role authenticated;
-- Sesión 1 de la persona trabajadora.
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_trab', 'session_id', :'s1')::text, false) \gset

\echo '--- Elegir qué pasa al salir'
select tests.debe_fallar($$select public.elegir_acceso_al_salir('huella')$$, 'una opción desconocida');
select public.establecer_mi_pin(:'trab_a', '2468');
select public.elegir_acceso_al_salir('pin');
select tests.afirmar((select al_salir = 'pin' from public.preferencias_acceso where user_id = :'u_trab'),
  'la persona eligió volver a entrar con su PIN');

\echo '--- Bloquear'
select tests.afirmar(public.mi_acceso() @> '{"al_salir": "pin", "tiene_pin": true, "bloqueada": false}'::jsonb, 'la pantalla Acceso sabe qué eligió y que tiene PIN');
select tests.afirmar(public.bloquear_mi_sesion(), 'Salir bloquea la sesión');
select tests.afirmar((public.mi_acceso() ->> 'bloqueada')::boolean, 'la sesión aparece bloqueada');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (%L, %L, 'entrada', 'pwa', '00000000-0000-4000-8000-0000000005a1')$$, :'empresa_a', :'trab_a'),
  'con la sesión bloqueada no se puede checar');
select tests.afirmar((select count(*) = 0 from public.eventos where trabajador_id = :'trab_a'),
  'con la sesión bloqueada no se ven los registros');
select tests.debe_fallar(format($$select public.establecer_mi_pin(%L, '1357')$$, :'trab_a'),
  'con la sesión bloqueada no se cambia el PIN');
select tests.debe_fallar($$select public.elegir_acceso_al_salir('codigo')$$,
  'con la sesión bloqueada no se cambia la forma de entrar');

\echo '--- Otra sesión de la misma persona no queda bloqueada'
select set_config('request.jwt.claims', json_build_object('sub', :'u_trab', 'session_id', :'s2')::text, false) \gset
select tests.afirmar((select count(*) > 0 from public.eventos where trabajador_id = :'trab_a'),
  'el bloqueo es solo de ese teléfono (sesión)');
select set_config('request.jwt.claims', json_build_object('sub', :'u_trab', 'session_id', :'s1')::text, false) \gset

\echo '--- Desbloquear con PIN'
select tests.afirmar((public.desbloquear_con_pin('1111') ->> 'error') = 'PIN incorrecto.', 'un PIN incorrecto no desbloquea');
select tests.afirmar(not (public.desbloquear_con_pin('9999') ->> 'ok')::boolean, 'otro PIN incorrecto');
select count(*) as _n from (select public.desbloquear_con_pin('9999') from generate_series(1, 3)) x \gset
select tests.afirmar((public.desbloquear_con_pin('2468') ->> 'error') like 'PIN bloqueado por intentos fallidos%',
  'tras 5 fallos el PIN se bloquea, aunque después se escriba bien (mismo límite que el kiosco)');
reset role;
select tests.afirmar((select intentos_fallidos >= 5 and bloqueado_hasta > now() from public.pines_trabajador where trabajador_id = :'trab_a'),
  'los intentos fallidos quedan guardados');
update public.pines_trabajador set intentos_fallidos = 0, bloqueado_hasta = null where trabajador_id = :'trab_a';
set role authenticated;
select tests.afirmar((public.desbloquear_con_pin('2468') ->> 'ok')::boolean, 'el PIN correcto desbloquea');
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'entrada', 'pwa', '00000000-0000-4000-8000-0000000005a2');
select tests.afirmar(true, 'ya desbloqueada, vuelve a checar');

\echo '--- Con código por correo, Salir no bloquea'
select public.elegir_acceso_al_salir('codigo');
select tests.afirmar(not public.bloquear_mi_sesion(), 'si eligió el código, Salir cierra la sesión como antes');

\echo '--- Sin PIN no se elige el PIN; sin sesión no se usa nada'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_prop', 'session_id', :'s2')::text, false) \gset
select tests.debe_fallar($$select public.elegir_acceso_al_salir('pin')$$, 'quien no tiene PIN no puede elegirlo');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select set_config('request.jwt.claims', '', false) \gset
select tests.debe_fallar($$select public.bloquear_mi_sesion()$$, 'sin sesión no se bloquea nada');
select tests.debe_fallar($$select public.desbloquear_con_pin('2468')$$, 'sin sesión no se prueba un PIN');

reset role;
\echo 'Acceso con bloqueo: pruebas correctas.'
