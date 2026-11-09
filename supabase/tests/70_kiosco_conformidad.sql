-- =============================================================================
-- Pruebas de la conformidad desde el kiosco. Usa su propia empresa (K).
-- Las semanas se calculan respecto a hoy: "pasada" = la última terminada.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_kprop  '00000000-0000-0000-0000-0000000000b1'
\set u_kk     '00000000-0000-0000-0000-0000000000b2'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id) values (:'u_kprop'), (:'u_kk');
select (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 7)::text as pasada,
       (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 14)::text as antepasada,
       date_trunc('week', now() at time zone 'America/Mexico_City')::date::text as actual \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_kprop', false) \gset
select public.crear_empresa('Empresa K SA de CV') as empresa_k \gset
insert into public.centros_trabajo (empresa_id, nombre) values (:'empresa_k', 'Planta') returning id as centro_k \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_k', :'centro_k', 'Kiki Sin Correo', '501', '2026-01-01') returning id as kiki \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_k', :'centro_k', 'Otro', '502', '2026-01-01') returning id as otro \gset
select public.asignar_pin(:'kiki', '4826');
insert into public.miembros (empresa_id, user_id, rol) values (:'empresa_k', :'u_kk', 'kiosco');

-- Checadas (capturadas desde el panel para poder fecharlas en el pasado).
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_k', :'kiki', 'entrada', 'panel', 'Prueba',
          ((:'pasada'::date + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev_pasada \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_k', :'kiki', 'salida', 'panel', 'Prueba',
          ((:'pasada'::date + 1)::timestamp + time '17:00') at time zone 'America/Mexico_City');
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_k', :'kiki', 'entrada', 'panel', 'Prueba',
          ((:'antepasada'::date + 2)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev_ante \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_k', :'otro', 'entrada', 'panel', 'Prueba',
          ((:'pasada'::date + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev_otro \gset

\echo '--- Semanas pendientes en el kiosco'
select set_config('request.jwt.claim.sub', :'u_kk', false) \gset
select tests.afirmar(
  (select r -> 'semanas_por_revisar' = jsonb_build_array(
            jsonb_build_object('lunes', :'antepasada', 'clase', 'sin_respuesta'),
            jsonb_build_object('lunes', :'pasada', 'clase', 'sin_respuesta'))
     from public.kiosco_identificar('501', '4826') r),
  'al identificarse, el kiosco recibe las semanas terminadas sin respuesta');
select tests.afirmar(public.kiosco_identificar('501', '0000') ->> 'codigo' = 'CREDENCIALES', 'sin el PIN correcto no hay semanas');

\echo '--- Ver una semana'
select public.kiosco_semana('501', '4826', :'pasada') as semana \gset
select tests.afirmar(
  (select s ->> 'ok' = 'true' and jsonb_array_length(s -> 'eventos') >= 2 and s ->> 'zona_horaria' = 'America/Mexico_City'
          and (s ->> 'dia_descanso')::int = 0
     from (select :'semana'::jsonb as s) x),
  'devuelve las checadas de la semana y los datos para calcularla');
select tests.afirmar(public.kiosco_semana('501', '4826', :'actual') ->> 'codigo' = 'SEMANA', 'la semana en curso no se puede revisar');
select tests.afirmar(public.kiosco_semana('502', '4826', :'pasada') ->> 'codigo' = 'CREDENCIALES', 'el PIN de otra persona no sirve');

\echo '--- Responder'
select tests.afirmar(
  public.kiosco_conformidad('501', '4826', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'antepasada', 'eventoIds', jsonb_build_array(:ev_pasada))) ->> 'codigo' = 'RESUMEN',
  'resumen de otra semana');
select tests.afirmar(
  public.kiosco_conformidad('501', '4826', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev_otro))) ->> 'codigo' = 'RESUMEN',
  'resumen con checadas de otra persona');
select tests.afirmar(
  public.kiosco_conformidad('501', '4826', :'pasada', 'objeta', '  ',
    jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev_pasada))) ->> 'codigo' = 'COMENTARIO',
  'objetar sin explicar');
select public.kiosco_conformidad('501', '4826', :'pasada', 'conforme', null,
  jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev_pasada)), '{"user_agent":"prueba"}') as resp \gset
select tests.afirmar((:'resp'::jsonb ->> 'ok') = 'true' and (:'resp'::jsonb ->> 'cadena_secuencia') is not null,
  'la conformidad se registra y devuelve el comprobante');
select tests.afirmar(public.kiosco_conformidad('501', '4826', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev_pasada))) ->> 'codigo' = 'SEMANA',
  'no se responde dos veces la misma semana');
select tests.afirmar(public.kiosco_conformidad('501', '4826', :'antepasada', 'objeta', 'El martes salí a las 18:00',
    jsonb_build_object('semana', :'antepasada', 'eventoIds', jsonb_build_array(:ev_ante))) ->> 'ok' = 'true',
  'objetar con explicación');
select tests.afirmar((select public.kiosco_identificar('501', '4826') -> 'semanas_por_revisar' = '[]'::jsonb),
  'ya no quedan semanas pendientes');

reset role;
select tests.afirmar(
  (select user_id = :'u_kk'::uuid and evidencia ->> 'modalidad' = 'pin_kiosco' and evidencia ->> 'numero_empleado' = '501'
          and evidencia ->> 'user_agent' = 'prueba' and respuesta = 'conforme'
     from public.conformidades where trabajador_id = :'kiki' and periodo_inicio = :'pasada'),
  'queda registrado que se firmó con PIN en el kiosco, por qué dispositivo y con qué número');

\echo '--- Objeción corregida por el empleador'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_kprop', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva, corrige_evento_id)
  values (:'empresa_k', :'kiki', 'correccion', 'panel', 'Salida corregida según la objeción',
          ((:'antepasada'::date + 2)::timestamp + time '08:30') at time zone 'America/Mexico_City', :'ev_ante');
select set_config('request.jwt.claim.sub', :'u_kk', false) \gset
select tests.afirmar(
  (select public.kiosco_identificar('501', '4826') -> 'semanas_por_revisar'
     = jsonb_build_array(jsonb_build_object('lunes', :'antepasada', 'clase', 'corregida'))),
  'la semana objetada vuelve a aparecer cuando el empleador la corrige');
select tests.afirmar(
  (select exists (select 1 from jsonb_array_elements(public.kiosco_semana('501', '4826', :'antepasada') -> 'eventos') e
                   where e ->> 'tipo' = 'correccion' and (e ->> 'corrige_evento_id')::bigint = :ev_ante)),
  'la semana incluye la corrección del empleador');

\echo '--- Permisos'
select set_config('request.jwt.claim.sub', :'u_kprop', false) \gset
select tests.afirmar(public.kiosco_semana('501', '4826', :'pasada') ->> 'codigo' = 'NO_ES_KIOSCO', 'el propietario no usa las funciones del kiosco');
select tests.debe_fallar($$select * from public._semanas_por_confirmar(gen_random_uuid())$$, 'consultar semanas pendientes directamente');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset

\echo '--- Fin conformidad en kiosco'
