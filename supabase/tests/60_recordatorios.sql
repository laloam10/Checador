-- =============================================================================
-- Pruebas de los recordatorios de conformidad. Usa sus propias empresas (R y S).
-- "Ahora" = miércoles 4 de noviembre de 2026, 12:00 en la Ciudad de México:
-- la semana en curso empieza el lunes 2 de noviembre; la última terminada, el 26 de octubre.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_rprop  '00000000-0000-0000-0000-0000000000a1'
\set u_rana   '00000000-0000-0000-0000-0000000000a2'
\set u_sprop  '00000000-0000-0000-0000-0000000000a3'
\set ahora    '2026-11-04 18:00+00'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id) values (:'u_rprop'), (:'u_rana'), (:'u_sprop');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_rprop', false) \gset
select public.crear_empresa('Empresa R SA de CV') as empresa_r \gset
insert into public.centros_trabajo (empresa_id, nombre, zona_horaria) values (:'empresa_r', 'Matriz', 'America/Mexico_City')
  returning id as centro_r \gset

insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Ana <b>Ruiz</b>', 'r1', 'ana@r.mx', '2026-01-01') returning id as ana \gset
reset role;
update public.trabajadores set user_id = :'u_rana' where id = :'ana';
set role authenticated;
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Beto Sin Correo', 'r2', '2026-01-01') returning id as beto \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Carla De Baja', 'r3', 'carla@r.mx', '2026-01-01') returning id as carla \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Dora Recordada', 'r4', 'dora@r.mx', '2026-01-01') returning id as dora \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Eva Envio Fallido', 'r5', 'eva@r.mx', '2026-01-01') returning id as eva \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_r', :'centro_r', 'Fede Domingo Noche', 'r6', 'fede@r.mx', '2026-01-01') returning id as fede \gset

-- Checadas capturadas desde el panel (permiten fechas pasadas).
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
select :'empresa_r', t, 'entrada', 'panel', 'Prueba', h::timestamptz
  from (values
    (:'ana'::uuid,   '2026-08-31 09:00-06'),  -- fuera de las últimas 8 semanas
    (:'ana'::uuid,   '2026-10-12 09:00-06'),  -- se objetará sin cambios posteriores
    (:'ana'::uuid,   '2026-10-19 09:00-06'),  -- se confirmará
    (:'ana'::uuid,   '2026-10-27 09:00-06'),  -- sin respuesta
    (:'beto'::uuid,  '2026-10-27 09:00-06'),
    (:'carla'::uuid, '2026-10-27 09:00-06'),
    (:'dora'::uuid,  '2026-10-27 09:00-06'),
    (:'eva'::uuid,   '2026-10-27 09:00-06'),
    (:'fede'::uuid,  '2026-11-02 05:30+00'),  -- domingo 1 nov 23:30 local: semana del 26 oct
    (:'fede'::uuid,  '2026-11-02 07:00+00')   -- lunes 2 nov 01:00 local: semana en curso
  ) as v(t, h);
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_r', :'ana', 'entrada', 'panel', 'Prueba', '2026-10-06 09:00-06') returning id as ev_ana_oct5 \gset
update public.trabajadores set fecha_baja = '2026-10-31' where id = :'carla';

-- Respuestas de Ana.
select set_config('request.jwt.claim.sub', :'u_rana', false) \gset
insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta, comentario) values
  (:'empresa_r', :'ana', '2026-10-19', '2026-10-25', '{}', 'conforme', null),
  (:'empresa_r', :'ana', '2026-10-12', '2026-10-18', '{}', 'objeta', 'Falta el martes'),
  (:'empresa_r', :'ana', '2026-10-05', '2026-10-11', '{}', 'objeta', 'Entré antes');

-- Después de las objeciones, el empleador corrige la semana del 5 de octubre.
select set_config('request.jwt.claim.sub', :'u_rprop', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva, corrige_evento_id)
  values (:'empresa_r', :'ana', 'correccion', 'panel', 'Llegó a las 8:30', '2026-10-06 08:30-06', :'ev_ana_oct5');

-- Empresa S, con los recordatorios apagados.
select set_config('request.jwt.claim.sub', :'u_sprop', false) \gset
select public.crear_empresa('Empresa S SA de CV') as empresa_s \gset
insert into public.centros_trabajo (empresa_id, nombre) values (:'empresa_s', 'Única') returning id as centro_s \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, email, fecha_ingreso)
  values (:'empresa_s', :'centro_s', 'Sara', 's1', 'sara@s.mx', '2026-01-01') returning id as sara \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_s', :'sara', 'entrada', 'panel', 'Prueba', '2026-10-27 09:00-06');

\echo '--- El empleador apaga los recordatorios de su empresa'
update public.empresas set recordatorios_conformidad = false where id = :'empresa_s';
select tests.afirmar((select not recordatorios_conformidad from public.empresas where id = :'empresa_s'),
  'el propietario puede apagar los recordatorios');
select set_config('request.jwt.claim.sub', :'u_rana', false) \gset
update public.empresas set recordatorios_conformidad = false where id = :'empresa_r';
reset role;
select tests.afirmar((select recordatorios_conformidad from public.empresas where id = :'empresa_r'),
  'un trabajador no puede apagar los recordatorios de su empresa');

-- Envíos anteriores (los registra el sistema, no la API).
insert into public.recordatorios_conformidad (empresa_id, trabajador_id, correo, enviado_en, estado) values
  (:'empresa_r', :'dora', 'dora@r.mx', timestamptz :'ahora' - interval '3 days', 'enviado'),
  (:'empresa_r', :'eva',  'eva@r.mx',  timestamptz :'ahora' - interval '3 days', 'fallido');

\echo '--- Qué semanas se recuerdan'
create temp table rec as select * from public.conformidades_por_recordar(:'ahora');
select tests.afirmar((select count(*) = 3 from rec), 'se recuerda a Ana, Eva y Fede: ' || (select string_agg(nombre, ', ') from rec));
select tests.afirmar(
  (select semanas_sin_respuesta = '{2026-10-26}'::date[] and semanas_corregidas = '{2026-10-05}'::date[]
     from rec where trabajador_id = :'ana'),
  'Ana: semana sin respuesta y semana objetada que el empleador corrigió; no la confirmada, ni la objetada sin cambios, ni la de hace más de 8 semanas');
select tests.afirmar((select correo = 'ana@r.mx' and razon_social = 'Empresa R SA de CV' from rec where trabajador_id = :'ana'),
  'trae el correo y la razón social');
select tests.afirmar(not exists (select 1 from rec where trabajador_id = :'beto'), 'sin correo no se recuerda');
select tests.afirmar(not exists (select 1 from rec where trabajador_id = :'carla'), 'dados de baja no se recuerdan');
select tests.afirmar(not exists (select 1 from rec where trabajador_id = :'dora'), 'máximo un correo cada 6 días');
select tests.afirmar(exists (select 1 from rec where trabajador_id = :'eva'), 'un envío fallido no cuenta para el límite');
select tests.afirmar((select semanas_sin_respuesta = '{2026-10-26}'::date[] from rec where trabajador_id = :'fede'),
  'la semana se calcula en la hora local del centro y la semana en curso no se recuerda');
select tests.afirmar(not exists (select 1 from rec where trabajador_id = :'sara'), 'empresa con recordatorios apagados');
select tests.afirmar(not exists (select 1 from public.conformidades_por_recordar(timestamptz :'ahora' + interval '2 days') where trabajador_id = :'dora'),
  'Dora sigue dentro de los 6 días (van 5)');
select tests.afirmar(exists (select 1 from public.conformidades_por_recordar(timestamptz :'ahora' + interval '4 days') where trabajador_id = :'dora'),
  'Dora vuelve a recibirlo pasados 6 días (van 7)');

\echo '--- Texto del correo'
select tests.afirmar(public._semana_texto('2026-11-02') = 'del 2 al 8 de noviembre de 2026', 'semana dentro de un mes');
select tests.afirmar(public._semana_texto('2026-10-26') = 'del 26 de octubre al 1 de noviembre de 2026', 'semana entre dos meses');
select tests.afirmar(public._semana_texto('2025-12-29') = 'del 29 de diciembre de 2025 al 4 de enero de 2026', 'semana entre dos años');
select public._correo_recordatorio('Ana <b>Ruiz</b>', 'R & Hijos', 'ana@r.mx', '{2026-10-26}', '{2026-10-05}',
  'Reloj Checador <no-responder@checador.jemba.mx>', 'https://checador.jemba.mx') as correo \gset
select tests.afirmar(
  (select c->>'from' = 'Reloj Checador <no-responder@checador.jemba.mx>' and c->'to' = '["ana@r.mx"]'
      and c->>'subject' = 'Tienes semanas por revisar en Checador'
   from (select :'correo'::jsonb as c) x),
  'remitente, destinatario y asunto');
select tests.afirmar(
  (select position('Ana &lt;b&gt;Ruiz&lt;/b&gt;' in c->>'html') > 0 and position('<b>' in c->>'html') = 0
      and position('R &amp; Hijos' in c->>'html') > 0
   from (select :'correo'::jsonb as c) x),
  'el nombre y la razón social se escapan en el HTML');
select tests.afirmar(
  (select position('https://checador.jemba.mx/registros?semana=2026-10-26' in c->>'html') > 0
      and position('https://checador.jemba.mx/registros?semana=2026-10-05' in c->>'text') > 0
      and position('voluntaria' in c->>'text') > 0
   from (select :'correo'::jsonb as c) x),
  'enlaces a cada semana en HTML y texto, y aclara que responder es voluntario');
select tests.afirmar(
  (public._correo_recordatorio('Ana', 'R', 'ana@r.mx', '{}', '{2026-10-05}', 'x', 'https://a')->>'subject')
    = 'Tu empleador revisó la semana que objetaste',
  'asunto cuando solo hay semanas corregidas');

\echo '--- Envío y seguimiento'
select tests.afirmar(public.enviar_recordatorios_conformidad(:'ahora') = 0, 'sin Vault ni pg_net no se envía nada');
insert into public.recordatorios_conformidad (empresa_id, trabajador_id, correo, enviado_en, solicitud_id)
  values (:'empresa_r', :'fede', 'fede@r.mx', now() - interval '2 days', 12345);
select public.revisar_envios_recordatorios() \gset
select tests.afirmar((select estado = 'fallido' and detalle is not null from public.recordatorios_conformidad where solicitud_id = 12345),
  'un envío sin respuesta tras un día queda como fallido');

\echo '--- Permisos'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_rprop', false) \gset
select tests.afirmar((select count(*) = 3 from public.recordatorios_conformidad), 'el empleador ve los envíos de su empresa');
select tests.debe_fallar(format($$insert into public.recordatorios_conformidad (empresa_id, trabajador_id, correo) values (%L, %L, 'x@x.mx')$$, :'empresa_r', :'ana'),
  'registrar un envío desde la API');
select tests.debe_fallar($$update public.recordatorios_conformidad set estado = 'enviado'$$, 'cambiar el estado de un envío desde la API');
select tests.debe_fallar($$select public.enviar_recordatorios_conformidad()$$, 'enviar recordatorios desde la API');
select tests.debe_fallar($$select * from public.conformidades_por_recordar()$$, 'consultar las semanas pendientes de todas las empresas desde la API');
select tests.debe_fallar($$select public.revisar_envios_recordatorios()$$, 'revisar envíos desde la API');
select set_config('request.jwt.claim.sub', :'u_rana', false) \gset
select tests.afirmar((select count(*) = 0 from public.recordatorios_conformidad), 'un trabajador no ve el registro de envíos');
select set_config('request.jwt.claim.sub', :'u_sprop', false) \gset
select tests.afirmar((select count(*) = 0 from public.recordatorios_conformidad), 'otra empresa no ve los envíos');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset

\echo '--- Fin recordatorios'
