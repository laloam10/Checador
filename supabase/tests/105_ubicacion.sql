-- =============================================================================
-- Pruebas de la ubicación al checar (por centro de trabajo). Continúa sobre 10–104.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_kiosco '00000000-0000-0000-0000-00000000000c'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_otro   '00000000-0000-0000-0000-00000000000f'

reset role;
select set_config('request.jwt.claims', '', false) \gset
select id as trab_a, empresa_id as empresa_a, centro_trabajo_id as centro_a
  from public.trabajadores where user_id = :'u_trab' and fecha_baja is null limit 1 \gset

\echo '--- Configuración del centro'
select tests.debe_fallar(format($$update public.centros_trabajo set ubicacion_celular = true where id = %L$$, :'centro_a'),
  'no se activa la ubicación sin las coordenadas del centro');
select tests.debe_fallar(format($$update public.centros_trabajo set latitud = 19.4326 where id = %L$$, :'centro_a'),
  'latitud sin longitud no se acepta');

-- Checadas de la persona trabajadora (celular).
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'entrada', 'pwa', '00000000-0000-4000-8000-0000000006a1') returning id as e1 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'salida', 'pwa', '00000000-0000-4000-8000-0000000006a2') returning id as e2 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'entrada', 'pwa', '00000000-0000-4000-8000-0000000006a3') returning id as e3 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_a', 'salida', 'pwa', '00000000-0000-4000-8000-0000000006a4') returning id as e4 \gset

\echo '--- Desactivada no se guarda'
select tests.afirmar(not public.registrar_ubicacion(:'e1', 'ok', 19.4327, -99.1333, 15, now()),
  'con la ubicación desactivada no se guarda aunque el teléfono la mande');
select tests.afirmar(not exists (select 1 from public.ubicaciones_evento where evento_id = :'e1'), 'no quedó nada guardado');

reset role;
update public.centros_trabajo set latitud = 19.4326, longitud = -99.1332, radio_m = 150, ubicacion_celular = true where id = :'centro_a';
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset

\echo '--- Activada'
select tests.afirmar(public.registrar_ubicacion(:'e1', 'ok', 19.432649, -99.133251, 18, now()), 'se registra la ubicación de la checada');
select tests.afirmar((select dentro and distancia_m < 30 and latitud = 19.4326 and longitud = -99.1333 and dispositivo = 'celular'
                        from public.ubicaciones_evento where evento_id = :'e1'),
  'en el centro: dentro del radio y coordenadas redondeadas a 4 decimales (~11 m)');
select tests.afirmar(public.registrar_ubicacion(:'e1', 'ok', 19.6, -99.1, 5, now())
  and (select count(*) = 1 and bool_and(dentro) from public.ubicaciones_evento where evento_id = :'e1'),
  'una checada tiene una sola ubicación: la primera');
select public.registrar_ubicacion(:'e2', 'ok', 19.5, -99.1332, 30, now()) as _ \gset
select tests.afirmar((select not dentro and distancia_m between 7400 and 7700 from public.ubicaciones_evento where evento_id = :'e2'),
  'lejos del centro: fuera del radio, con la distancia en metros');
select public.registrar_ubicacion(:'e3', 'denegada', null, null, null, now()) as _ \gset
select tests.afirmar((select estado = 'denegada' and latitud is null and dentro is null from public.ubicaciones_evento where evento_id = :'e3'),
  'sin permiso queda registrado como "denegada" (la checada se registró igual)');
select tests.debe_fallar(format($$select public.registrar_ubicacion(%s, 'inventado', null, null, null, now())$$, :'e4'), 'un estado desconocido');
select tests.debe_fallar(format($$select public.registrar_ubicacion(%s, 'ok', null, null, 10, now())$$, :'e4'), '"ok" sin coordenadas');
select tests.debe_fallar(format($$select public.registrar_ubicacion(%s, 'ok', 95, 10, 10, now())$$, :'e4'), 'coordenadas fuera de rango');

\echo '--- Nadie más pone la ubicación de una checada ajena'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$select public.registrar_ubicacion(%s, 'ok', 19.4326, -99.1332, 10, now())$$, :'e4'),
  'el empleador no puede poner la ubicación de la checada del celular de alguien');
select tests.afirmar((select count(*) = 3 from public.ubicaciones_evento where trabajador_id = :'trab_a'), 'el empleador sí la ve');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.afirmar((select count(*) = 0 from public.ubicaciones_evento), 'otra persona no ve ubicaciones ajenas');
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select count(*) = 3 from public.ubicaciones_evento), 'la persona ve sus propias ubicaciones');
select tests.debe_fallar(format($$update public.ubicaciones_evento set dentro = true where evento_id = %s$$, :'e2'),
  'nadie corrige una ubicación por la API');

\echo '--- Kiosco'
reset role;
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, registrado_por)
  values (:'empresa_a', :'trab_a', 'entrada', 'kiosco', '00000000-0000-4000-8000-0000000006b1', :'u_kiosco') returning id as k1 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(not public.registrar_ubicacion(:'k1', 'ok', 19.4326, -99.1332, 10, now()), 'en el kiosco está desactivada aparte');
reset role;
update public.centros_trabajo set ubicacion_kiosco = true where id = :'centro_a';
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.debe_fallar(format($$select public.registrar_ubicacion(%s, 'ok', 19.4326, -99.1332, 10, now())$$, :'k1'),
  'la persona no pone la ubicación de una checada del kiosco');
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(public.registrar_ubicacion(:'k1', 'ok', 19.4326, -99.1332, 10, now()), 'activada, el kiosco registra su ubicación');
select tests.afirmar((select count(*) = 0 from public.ubicaciones_evento), 'la cuenta del kiosco no puede consultar ubicaciones');
reset role;
select tests.afirmar((select dispositivo = 'kiosco' and dentro from public.ubicaciones_evento where evento_id = :'k1'),
  'queda como ubicación del kiosco, comparada con su centro');

\echo '--- Borrado a los 90 días'
update public.ubicaciones_evento set creada_en = now() - interval '91 days' where evento_id = :'e2';
select tests.afirmar(public.borrar_ubicaciones_vencidas() = 1, 'se borra la ubicación de más de 90 días');
select tests.afirmar(not exists (select 1 from public.ubicaciones_evento where evento_id = :'e2')
  and exists (select 1 from public.eventos where id = :'e2'), 'la checada sigue en la bitácora; solo se borró su ubicación');
set role authenticated;
select tests.debe_fallar($$select public.borrar_ubicaciones_vencidas()$$, 'nadie más puede borrar ubicaciones');

reset role;
update public.centros_trabajo set ubicacion_celular = false, ubicacion_kiosco = false where id = :'centro_a';
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Ubicación: pruebas correctas.'
