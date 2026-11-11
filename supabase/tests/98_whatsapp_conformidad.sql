-- =============================================================================
-- Pruebas de la conformidad semanal por WhatsApp. Continúa sobre 10–97.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set secreto  'secreto-de-prueba-0123456789abcdef0123456789abcdef'
\set malo     'otro-secreto-0123456789abcdef0123456789abcdef0000'
\set tel      '5215511112222'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a, (select id from public.centros_trabajo where empresa_id = e.id order by creado_en limit 1) as centro_a
  from public.empresas e where razon_social = 'Empresa A SA de CV' \gset
select (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 7)::text as pasada,
       (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 14)::text as antepasada \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, telefono)
  values (:'empresa_a', :'centro_a', 'Ximena Semana', '0980', '2026-01-01', '5511112222') returning id as x \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Ajeno', '0981', '2026-01-01') returning id as ajeno \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_a', :'x', 'entrada', 'panel', 'Prueba', ((:'pasada'::date + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev1 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_a', :'x', 'salida', 'panel', 'Prueba', ((:'pasada'::date + 1)::timestamp + time '17:00') at time zone 'America/Mexico_City')
  returning id as ev2 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_a', :'x', 'entrada', 'panel', 'Prueba', ((:'antepasada'::date + 2)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev3 \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_a', :'ajeno', 'entrada', 'panel', 'Prueba', ((:'pasada'::date + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City')
  returning id as ev_ajeno \gset
select tests.debe_fallar($$select count(*) from public.whatsapp_esperas$$, 'leer las esperas del bot por la API');

\echo '--- Sin secreto o sin activar no hay nada'
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(public.whatsapp_semana(:'malo', :'tel', :'pasada') ->> 'codigo' = 'NO_AUTORIZADO', 'semana con secreto incorrecto');
select tests.afirmar(public.whatsapp_esperar_objecion(:'malo', :'tel', :'pasada') ->> 'codigo' = 'NO_AUTORIZADO', 'espera con secreto incorrecto');
select tests.afirmar(
  public.whatsapp_conformidad(:'malo', :'tel', :'pasada', 'conforme', null, '{}') ->> 'codigo' = 'NO_AUTORIZADO', 'conformidad con secreto incorrecto');
select tests.afirmar(public.whatsapp_semana(:'secreto', :'tel', :'pasada') ->> 'codigo' = 'NO_VINCULADO', 'sin activar no se ve la semana');
select tests.afirmar(
  public.whatsapp_conformidad(:'secreto', :'tel', :'pasada', 'conforme', null, jsonb_build_object('semana', :'pasada', 'eventoIds', '[]'::jsonb)) ->> 'codigo' = 'NO_VINCULADO',
  'sin activar no se da conformidad');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'x') as codigo \gset
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar((public.whatsapp_vincular(:'secreto', :'tel', :'codigo') ->> 'ok')::boolean, 'activa su WhatsApp');

\echo '--- Semanas pendientes y datos de la semana'
select tests.afirmar(
  (select e -> 'semanas_por_revisar' = jsonb_build_array(
            jsonb_build_object('lunes', :'antepasada', 'clase', 'sin_respuesta'),
            jsonb_build_object('lunes', :'pasada', 'clase', 'sin_respuesta'))
          and e -> 'objecion_pendiente' = 'null'::jsonb
     from public.whatsapp_estado(:'secreto', :'tel') e),
  'el estado lista las dos semanas pendientes y ninguna objeción en espera');
select tests.afirmar(
  (select (s ->> 'ok')::boolean and jsonb_array_length(s -> 'eventos') = 2 and s ->> 'zona_horaria' = 'America/Mexico_City'
          and s ? 'dia_descanso' and s ? 'dias_descanso_adicionales'
     from public.whatsapp_semana(:'secreto', :'tel', :'pasada') s),
  'la semana trae sus checadas y la configuración para calcularla');
select tests.afirmar(
  public.whatsapp_semana(:'secreto', :'tel', (:'pasada'::date + 7)) ->> 'codigo' = 'SEMANA', 'la semana en curso no se revisa');

\echo '--- Conformidad'
select tests.afirmar(
  public.whatsapp_conformidad(:'secreto', :'tel', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'antepasada', 'eventoIds', '[]'::jsonb)) ->> 'codigo' = 'RESUMEN', 'resumen de otra semana');
select tests.afirmar(
  public.whatsapp_conformidad(:'secreto', :'tel', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev_ajeno))) ->> 'codigo' = 'RESUMEN', 'resumen con checadas de otra persona');
select tests.afirmar(
  (select (r ->> 'ok')::boolean and r ->> 'cadena_secuencia' is not null
     from public.whatsapp_conformidad(:'secreto', :'tel', :'pasada', 'conforme', null,
       jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev1, :ev2)), '{"wamid": "wamid.C"}') r),
  'registra la conformidad');
select tests.afirmar(
  public.whatsapp_conformidad(:'secreto', :'tel', :'pasada', 'conforme', null,
    jsonb_build_object('semana', :'pasada', 'eventoIds', jsonb_build_array(:ev1, :ev2))) ->> 'codigo' = 'SEMANA',
  'una semana ya respondida no se responde dos veces (reintento de Meta)');

\echo '--- Objeción con espera del texto'
select tests.afirmar(
  public.whatsapp_conformidad(:'secreto', :'tel', :'antepasada', 'objeta', '  ',
    jsonb_build_object('semana', :'antepasada', 'eventoIds', jsonb_build_array(:ev3))) ->> 'codigo' = 'COMENTARIO', 'objeción sin explicación');
select tests.afirmar(public.whatsapp_esperar_objecion(:'secreto', :'tel', :'pasada') ->> 'codigo' = 'SEMANA', 'no se espera objeción de una semana ya respondida');
select tests.afirmar((public.whatsapp_esperar_objecion(:'secreto', :'tel', :'antepasada') ->> 'ok')::boolean, 'anota la espera');
select tests.afirmar(public.whatsapp_estado(:'secreto', :'tel') ->> 'objecion_pendiente' = :'antepasada', 'el estado indica la objeción en espera');
select tests.afirmar((public.whatsapp_esperar_objecion(:'secreto', :'tel', null) ->> 'ok')::boolean
  and public.whatsapp_estado(:'secreto', :'tel') -> 'objecion_pendiente' = 'null'::jsonb, 'la espera se puede cancelar');
select public.whatsapp_esperar_objecion(:'secreto', :'tel', :'antepasada') \g /dev/null
reset role;
update public.whatsapp_esperas set expira_en = now() - interval '1 minute' where trabajador_id = :'x';
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(public.whatsapp_estado(:'secreto', :'tel') -> 'objecion_pendiente' = 'null'::jsonb, 'la espera vence a los 15 minutos');
select public.whatsapp_esperar_objecion(:'secreto', :'tel', :'antepasada') \g /dev/null
select tests.afirmar(
  (public.whatsapp_conformidad(:'secreto', :'tel', :'antepasada', 'objeta', 'Ese día salí a las 19:00',
    jsonb_build_object('semana', :'antepasada', 'eventoIds', jsonb_build_array(:ev3))) ->> 'ok')::boolean, 'registra la objeción');
select tests.afirmar(
  (select e -> 'semanas_por_revisar' = '[]'::jsonb and e -> 'objecion_pendiente' = 'null'::jsonb
     from public.whatsapp_estado(:'secreto', :'tel') e),
  'ya no hay semanas pendientes ni espera');

reset role;
select tests.afirmar((select bool_and(user_id is null) from public.conformidades where trabajador_id = :'x'),
  'las conformidades por WhatsApp no tienen cuenta de usuario: las identifica el teléfono');
select tests.debe_fallar(format(
  $$insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta)
    values (%L, %L, '2026-01-05', '2026-01-11', '{}', 'conforme')$$, :'empresa_a', :'x'),
  'una conformidad sin sesión y sin ser de WhatsApp');
select tests.afirmar(
  (select string_agg(respuesta || ':' || (evidencia ->> 'modalidad') || ':' || (evidencia ->> 'telefono') || ':' || coalesce(comentario, '-'), ' | ' order by periodo_inicio desc)
     from public.conformidades where trabajador_id = :'x')
   = 'conforme:whatsapp:525511112222:- | objeta:whatsapp:525511112222:Ese día salí a las 19:00',
  'las respuestas quedan con modalidad whatsapp, teléfono y comentario');
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Conformidad por WhatsApp: pruebas correctas.'
