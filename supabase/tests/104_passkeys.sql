-- =============================================================================
-- Pruebas de volver a entrar con huella o rostro (passkeys). Continúa sobre 10–103.
-- La firma WebAuthn la verifica el servidor de la app; aquí se prueba lo que impone la base:
-- retos de un solo uso por sesión, secreto del servicio, dueño de la passkey y contador.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set s3       '00000000-0000-4000-8000-0000000005e3'
\set s4       '00000000-0000-4000-8000-0000000005e4'
\set cred     'cred-de-prueba-0123456789'
\set secreto  'secreto-de-acceso-de-prueba-0123456789abcdef'

reset role;
select public.configurar_secreto_servicio('acceso', :'secreto');
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_trab', 'session_id', :'s3')::text, false) \gset
set role authenticated;

\echo '--- Registrar una passkey'
select tests.debe_fallar($$select public.elegir_acceso_al_salir('passkey')$$, 'sin passkey no se elige la huella');
select tests.debe_fallar(format($$select public.registrar_passkey('reto-inventado', %L, 'llave-publica-de-prueba-0123', 0, '{internal}', 'Mi teléfono')$$, :'cred'),
  'no se registra una passkey sin un reto emitido para esta sesión');
select public.crear_reto_acceso('registro') as reto_r \gset
select public.registrar_passkey(:'reto_r', :'cred', 'llave-publica-de-prueba-0123', 0, '{internal}', 'Mi teléfono') is not null as _ok \gset
select tests.afirmar((select count(*) = 1 from public.passkeys where user_id = :'u_trab'), 'la passkey queda registrada y la persona la ve');
select tests.debe_fallar(format($$select public.registrar_passkey(%L, 'otra-credencial-0123456789', 'llave-publica-de-prueba-0123', 0, '{}', 'Otro')$$, :'reto_r'),
  'el reto de registro es de un solo uso');
select public.elegir_acceso_al_salir('passkey');
select tests.afirmar(public.mi_acceso() @> '{"al_salir": "passkey", "tiene_passkey": true}'::jsonb, 'elige volver a entrar con huella o rostro');

\echo '--- Bloquear y desbloquear con la passkey'
select tests.afirmar(public.bloquear_mi_sesion(), 'Salir bloquea la sesión');
select tests.debe_fallar($$select public.crear_reto_acceso('registro')$$, 'con la sesión bloqueada no se registran passkeys');
select tests.debe_fallar(format($$select public.borrar_passkey(id) from public.passkeys where credencial_id = %L$$, :'cred'),
  'con la sesión bloqueada no se quitan passkeys');
select public.crear_reto_acceso('desbloqueo') as reto_d \gset
select tests.debe_fallar(format($$select public.acceso_desbloquear_passkey(%L, %L, %L, %L, %L, 0)$$, :'secreto', :'s3', :'u_trab', :'cred', :'reto_d'),
  'una sesión no se desbloquea a sí misma sin pasar por el servidor de la app');

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select set_config('request.jwt.claims', '', false) \gset
select tests.debe_fallar(format($$select public.acceso_desbloquear_passkey('secreto-equivocado', %L, %L, %L, %L, 0)$$, :'s3', :'u_trab', :'cred', :'reto_d'),
  'sin el secreto del servicio no se desbloquea');
select tests.afirmar(not (public.acceso_desbloquear_passkey(:'secreto', :'s4', :'u_trab', :'cred', :'reto_d', 0) ->> 'ok')::boolean,
  'un reto emitido para otra sesión no sirve');
select tests.afirmar(not (public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_prop', :'cred', :'reto_d', 0) ->> 'ok')::boolean,
  'un reto emitido para otra persona no sirve');
select tests.afirmar((public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_trab', :'cred', :'reto_d', 0) ->> 'ok')::boolean,
  'con la firma verificada por el servidor se desbloquea');
select tests.afirmar(not (public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_trab', :'cred', :'reto_d', 0) ->> 'ok')::boolean,
  'el reto de desbloqueo es de un solo uso');
reset role;
select tests.afirmar(not exists (select 1 from public.sesiones_bloqueadas where session_id = :'s3'), 'la sesión ya no está bloqueada');

\echo '--- Contador de firmas'
update public.passkeys set contador = 5 where credencial_id = :'cred';
insert into public.sesiones_bloqueadas (session_id, user_id) values (:'s3', :'u_trab');
insert into public.retos_acceso (reto, session_id, user_id, tipo, vence) values ('reto-c1', :'s3', :'u_trab', 'desbloqueo', now() + interval '5 minutes'),
  ('reto-c2', :'s3', :'u_trab', 'desbloqueo', now() + interval '5 minutes'), ('reto-v', :'s3', :'u_trab', 'desbloqueo', now() - interval '1 second');
set role anon;
select tests.afirmar(not (public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_trab', :'cred', 'reto-v', 6) ->> 'ok')::boolean, 'un reto vencido no sirve');
select tests.afirmar(not (public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_trab', :'cred', 'reto-c1', 5) ->> 'ok')::boolean,
  'si el contador no crece (passkey clonada), no desbloquea');
select tests.afirmar((public.acceso_desbloquear_passkey(:'secreto', :'s3', :'u_trab', :'cred', 'reto-c2', 6) ->> 'ok')::boolean, 'con el contador mayor, sí');
reset role;
select tests.afirmar((select contador = 6 and usada_en is not null from public.passkeys where credencial_id = :'cred'), 'se guarda el contador y cuándo se usó');

\echo '--- Quitar la passkey'
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_trab', 'session_id', :'s3')::text, false) \gset
set role authenticated;
select public.borrar_passkey(id) from public.passkeys where credencial_id = :'cred';
select tests.afirmar(public.mi_acceso() @> '{"al_salir": "pin", "tiene_passkey": false}'::jsonb,
  'sin passkeys, la forma de volver a entrar pasa al PIN');
select tests.debe_fallar(format($$select public.acceso_desbloquear_passkey(%L, %L, %L, %L, 'x', 0)$$, :'secreto', :'s3', :'u_trab', :'cred'),
  'una sesión normal no puede llamar a la función del servidor');

\echo '--- Quien nunca eligió nada'
reset role;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_prop', 'session_id', :'s4')::text, false) \gset
set role authenticated;
select tests.afirmar(not exists (select 1 from public.preferencias_acceso where user_id = :'u_prop')
  and not public.bloquear_mi_sesion(), 'sin preferencia guardada, Salir cierra la sesión como siempre');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select set_config('request.jwt.claims', '', false) \gset
\echo 'Passkeys: pruebas correctas.'
