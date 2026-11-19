-- =============================================================================
-- Pruebas de los avisos por notificación. Usa sus propias empresas (P y Q).
-- Semana de ejemplo: lunes 2 de noviembre de 2026 (ya terminada el miércoles 11).
--   ahora     = miércoles 11 nov, 10:00 en la Ciudad de México (dentro del horario)
--   noche     = martes 10 nov, 23:00 (fuera del horario)
--   domingo   = domingo 15 nov, 11:00 (día de descanso)
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_pprop   '00000000-0000-0000-0000-0000000000e1'
\set u_pana    '00000000-0000-0000-0000-0000000000e2'
\set u_qprop   '00000000-0000-0000-0000-0000000000e3'
\set u_qluis   '00000000-0000-0000-0000-0000000000e4'
\set ahora     '2026-11-11 16:00+00'
\set noche     '2026-11-11 05:00+00'
\set domingo   '2026-11-15 17:00+00'
\set secreto   'secreto-de-avisos-0123456789abcdef0123456789abcdef'
\set malo      'otro-secreto-0123456789abcdef0123456789abcdef00000'
\set ep1       'https://fcm.googleapis.com/fcm/send/dispositivo-uno'
\set ep2       'https://web.push.apple.com/dispositivo-dos'
\set p256      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
\set authk     'tBHItJI5svbpez7KI4CCXg'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id) values (:'u_pprop'), (:'u_pana'), (:'u_qprop'), (:'u_qluis');
select public.configurar_secreto_servicio('avisos', :'secreto');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pprop', false) \gset
select public.crear_empresa('Empresa P SA de CV') as empresa_p \gset
insert into public.centros_trabajo (empresa_id, nombre, zona_horaria) values (:'empresa_p', 'Matriz', 'America/Mexico_City')
  returning id as centro_p \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_p', :'centro_p', 'Ana Avisos', 'p1', 'ana@p.mx', '2026-01-01') returning id as ana \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_p', :'centro_p', 'Beto Sin Cuenta', 'p2', '2026-01-01') returning id as beto \gset
reset role;
update public.trabajadores set user_id = :'u_pana' where id = :'ana';

-- Empresa Q con los recordatorios apagados.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_qprop', false) \gset
select public.crear_empresa('Empresa Q SA de CV') as empresa_q \gset
insert into public.centros_trabajo (empresa_id, nombre, zona_horaria) values (:'empresa_q', 'Matriz', 'America/Mexico_City')
  returning id as centro_q \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_q', :'centro_q', 'Luis Apagado', 'q1', 'luis@q.mx', '2026-01-01') returning id as luis \gset
update public.empresas set recordatorios_conformidad = false where id = :'empresa_q';
reset role;
update public.trabajadores set user_id = :'u_qluis' where id = :'luis';

\echo '--- Correcciones de la empresa'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pprop', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_p', :'ana', 'entrada', 'panel', 'Faltó la entrada', '2026-11-03 15:00+00') returning id as ev1 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_p', :'ana', 'salida', 'panel', 'Faltó la salida', '2026-11-03 23:00+00') returning id as ev2 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_p', :'beto', 'entrada', 'panel', 'Prueba', '2026-11-03 15:00+00');
select set_config('request.jwt.claim.sub', :'u_qprop', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_q', :'luis', 'entrada', 'panel', 'Prueba', '2026-11-03 15:00+00');
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_q', :'luis', 'salida', 'panel', 'Prueba', '2026-11-03 23:00+00');
reset role;
select tests.afirmar(
  (select string_agg(tipo || ' ' || url, ' | ' order by id) from public.avisos where trabajador_id = :'ana')
   = 'correccion /registros?semana=2026-11-02 | correccion /registros?semana=2026-11-02',
  'cada registro que captura la empresa avisa a la persona, con liga a su semana');
select tests.afirmar((select count(*) = 0 from public.avisos where trabajador_id = :'beto'),
  'sin cuenta en la app no hay a quién avisar');

\echo '--- Semanas por revisar'
-- (Otras pruebas dejan personas con semanas pendientes: aquí solo se cuenta a Ana.)
select public.generar_avisos_semana(:'ahora') \g /dev/null
select tests.afirmar((select count(*) = 1 from public.avisos where trabajador_id = :'ana' and tipo = 'semana'),
  'una semana terminada sin respuesta genera un aviso');
select tests.afirmar(public.generar_avisos_semana(:'ahora') = 0, 'no se repite');
select tests.afirmar(
  (select clave = 'semana:2026-11-02:sin_respuesta' and url = '/registros?semana=2026-11-02'
     from public.avisos where trabajador_id = :'ana' and tipo = 'semana'),
  'el aviso apunta a la semana pendiente');
select tests.afirmar((select count(*) = 0 from public.avisos where trabajador_id = :'luis' and tipo = 'semana'),
  'si la empresa apagó los recordatorios, no se avisa de semanas');

\echo '--- Acuerdo por firmar'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pprop', false) \gset
insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
  values (:'empresa_p', :'ana', 1, 'Acuerdo de prueba', 0) returning id as acuerdo \gset
reset role;
select tests.afirmar((select count(*) = 0 from public.avisos where tipo = 'acuerdo' and trabajador_id = :'ana'), 'un acuerdo sin la firma de la empresa no se avisa');
set role authenticated;
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_p', :'acuerdo', 'empleador');
reset role;
select tests.afirmar((select url = '/acuerdo' from public.avisos where tipo = 'acuerdo' and trabajador_id = :'ana'),
  'cuando la empresa firma, se avisa a la persona');

\echo '--- La API no ve ni escribe la cola'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
select tests.debe_fallar($$select count(*) from public.avisos$$, 'leer la cola de avisos');
select tests.debe_fallar(format($$insert into public.avisos (user_id, empresa_id, trabajador_id, tipo, clave, url) values (%L, %L, %L, 'semana', 'x', '/')$$,
  :'u_pana', :'empresa_p', :'ana'), 'meter avisos a la cola');
select tests.debe_fallar($$select public.generar_avisos_semana()$$, 'generar avisos desde la API');
select tests.debe_fallar($$select public.disparar_envio_avisos()$$, 'disparar el envío desde la API');

\echo '--- Dispositivos'
select tests.debe_fallar(format($$insert into public.suscripciones_push (user_id, endpoint, p256dh, auth) values (%L, %L, %L, %L)$$,
  :'u_pana', :'ep1', :'p256', :'authk'), 'insertar el dispositivo directo en la tabla');
select public.registrar_suscripcion_push(:'ep1', :'p256', :'authk', 'Android Chrome');
select public.registrar_suscripcion_push(:'ep1', :'p256', :'authk', 'Android Chrome');
select tests.afirmar((select count(*) = 1 from public.suscripciones_push), 'la persona ve su dispositivo, una sola vez');
select tests.debe_fallar(format($$select public.registrar_suscripcion_push('ftp://x/y', %L, %L)$$, :'p256', :'authk'), 'dirección de entrega inválida');
select tests.debe_fallar(format($$select public.registrar_suscripcion_push(%L, 'corta', %L)$$, :'ep2', :'authk'), 'llave del dispositivo inválida');
select set_config('request.jwt.claim.sub', :'u_pprop', false) \gset
select tests.debe_fallar(format($$select public.registrar_suscripcion_push(%L, %L, %L)$$, :'ep2', :'p256', :'authk'),
  'quien no es persona trabajadora no activa avisos');
select tests.afirmar((select count(*) = 0 from public.suscripciones_push), 'nadie ve los dispositivos de otra persona');
select public.quitar_suscripcion_push(:'ep1');
reset role;
select tests.afirmar((select count(*) = 1 from public.suscripciones_push where endpoint = :'ep1'), 'nadie quita el dispositivo de otra persona');

\echo '--- Preferencias'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
insert into public.preferencias_avisos (user_id) values (:'u_pana');
select tests.debe_fallar(format($$insert into public.preferencias_avisos (user_id) values (%L)$$, :'u_qluis'), 'crear preferencias de otra persona');
select set_config('request.jwt.claim.sub', :'u_qluis', false) \gset
update public.preferencias_avisos set semana = false where user_id = :'u_pana';
reset role;
select tests.afirmar((select semana from public.preferencias_avisos where user_id = :'u_pana'), 'nadie cambia las preferencias de otra persona');

\echo '--- Qué se envía y cuándo'
set role anon;
select tests.afirmar(public.avisos_por_enviar(:'malo', :'ahora') ->> 'codigo' = 'NO_AUTORIZADO', 'sin el secreto no se lee la cola');
select tests.afirmar(public.avisos_registrar_envio(:'malo', '{}') ->> 'codigo' = 'NO_AUTORIZADO', 'sin el secreto no se anota nada');
select tests.afirmar(public.avisos_por_enviar(:'secreto', :'noche') -> 'grupos' = '[]'::jsonb, 'de noche no se envía');
select tests.afirmar(public.avisos_por_enviar(:'secreto', :'domingo') -> 'grupos' = '[]'::jsonb, 'en el día de descanso no se envía');
select public.avisos_por_enviar(:'secreto', :'ahora') -> 'grupos' as grupos \gset
select tests.afirmar(
  (select string_agg(g ->> 'tipo' || ':' || (g ->> 'cantidad') || ':' || (g ->> 'url'), ' | ' order by g ->> 'tipo')
     from jsonb_array_elements(:'grupos'::jsonb) g)
   = 'acuerdo:1:/acuerdo | correccion:2:/registros?semana=2026-11-02 | semana:1:/registros?semana=2026-11-02',
  'en horario: un aviso por tipo (las dos correcciones van juntas)');
select tests.afirmar(
  (select bool_and(jsonb_array_length(g -> 'suscripciones') = 1 and g -> 'suscripciones' -> 0 ->> 'endpoint' = :'ep1')
     from jsonb_array_elements(:'grupos'::jsonb) g),
  'cada grupo trae los dispositivos de la persona');
select tests.afirmar(
  (select count(*) = 0 from jsonb_array_elements(:'grupos'::jsonb) g where g ->> 'user_id' = :'u_qluis'),
  'quien no activó avisos en ningún dispositivo no aparece');

\echo '--- Preferencias y avisos que ya no aplican'
reset role;
update public.preferencias_avisos set correccion = false where user_id = :'u_pana';
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_p', :'acuerdo', 'trabajador');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(
  (select string_agg(g ->> 'tipo', ',') from jsonb_array_elements(public.avisos_por_enviar(:'secreto', :'ahora') -> 'grupos') g) = 'semana',
  'si apagó las correcciones o ya firmó el acuerdo, solo queda el aviso de semana');
reset role;
select tests.afirmar(
  (select string_agg(tipo || ':' || coalesce(estado, 'pendiente'), ',' order by tipo, id) from public.avisos where trabajador_id = :'ana')
   = 'semana:pendiente,acuerdo:descartado,correccion:descartado,correccion:descartado',
  'los que ya no aplican quedan descartados');

\echo '--- Resultado del envío'
select id as aviso_semana from public.avisos where trabajador_id = :'ana' and tipo = 'semana' \gset
select id as sub1 from public.suscripciones_push where endpoint = :'ep1' \gset
set role anon;
select public.avisos_registrar_envio(:'secreto', jsonb_build_object('enviados', jsonb_build_array(:aviso_semana), 'exitosas', jsonb_build_array(:'sub1'))) \g /dev/null
select tests.afirmar(public.avisos_por_enviar(:'secreto', :'ahora') -> 'grupos' = '[]'::jsonb, 'lo enviado no se vuelve a enviar');
reset role;
select tests.afirmar((select estado = 'enviado' and enviado_en is not null from public.avisos where id = :aviso_semana), 'queda anotado como enviado');
select tests.afirmar((select ultimo_envio is not null from public.suscripciones_push where id = :'sub1'), 'y el dispositivo, con su último envío');

-- Una semana objetada que la empresa corrige vuelve a avisarse.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta, comentario)
  values (:'empresa_p', :'ana', '2026-11-02', '2026-11-08', jsonb_build_object('semana', '2026-11-02', 'eventoIds', '[]'::jsonb), 'objeta', 'Salí más tarde');
select set_config('request.jwt.claim.sub', :'u_pprop', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva, corrige_evento_id)
  values (:'empresa_p', :'ana', 'correccion', 'panel', 'Salió 19:00', '2026-11-04 01:00+00', :ev2);
reset role;
select public.generar_avisos_semana(now()) \g /dev/null
select tests.afirmar((select count(*) = 1 from public.avisos where trabajador_id = :'ana' and tipo = 'semana' and estado is null),
  'la semana objetada y corregida genera un aviso nuevo');
select tests.afirmar(
  (select clave = 'semana:2026-11-02:corregida' from public.avisos where trabajador_id = :'ana' and tipo = 'semana' and estado is null),
  'con su propia clave');

\echo '--- Dispositivos caducados, con fallas y compartidos'
update public.avisos set creado_en = now() - interval '8 days' where trabajador_id = :'ana' and estado is null;
set role anon;
select public.avisos_por_enviar(:'secreto', now()) \g /dev/null
reset role;
select tests.afirmar((select count(*) = 0 from public.avisos where trabajador_id = :'ana' and estado is null), 'a los 7 días un aviso no enviado vence');
select tests.afirmar((select count(*) >= 1 from public.avisos where trabajador_id = :'ana' and estado = 'vencido'), 'y queda como vencido');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
select public.registrar_suscripcion_push(:'ep2', :'p256', :'authk', 'iPhone');
reset role;
select id as sub2 from public.suscripciones_push where endpoint = :'ep2' \gset
set role anon;
select public.avisos_registrar_envio(:'secreto', jsonb_build_object('fallidas', jsonb_build_array(:'sub2'))) from generate_series(1, 4) \g /dev/null
reset role;
select tests.afirmar((select fallos = 4 from public.suscripciones_push where id = :'sub2'), 'cuenta las fallas seguidas');
set role anon;
select public.avisos_registrar_envio(:'secreto', jsonb_build_object('fallidas', jsonb_build_array(:'sub2'))) \g /dev/null
select public.avisos_registrar_envio(:'secreto', jsonb_build_object('caducadas', jsonb_build_array(:'sub1'))) \g /dev/null
reset role;
select tests.afirmar((select count(*) = 0 from public.suscripciones_push where user_id = :'u_pana'),
  'a la quinta falla, o si el servicio dice que ya no existe, el dispositivo se quita');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_pana', false) \gset
select public.registrar_suscripcion_push(:'ep1', :'p256', :'authk', 'Teléfono compartido');
select set_config('request.jwt.claim.sub', :'u_qluis', false) \gset
select public.registrar_suscripcion_push(:'ep1', :'p256', :'authk', 'Teléfono compartido');
reset role;
select tests.afirmar((select user_id = :'u_qluis'::uuid from public.suscripciones_push where endpoint = :'ep1'),
  'un teléfono compartido avisa solo a la última cuenta que lo activó');

\echo '--- Disparador'
select tests.afirmar(public.disparar_envio_avisos() is null, 'sin pg_net ni secretos, el disparador no hace nada');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Avisos: pruebas correctas.'
