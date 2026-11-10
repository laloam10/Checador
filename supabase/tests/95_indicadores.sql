-- =============================================================================
-- Pruebas de conformidad_semana() (indicador del tablero). Usa la empresa K de 70.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_kprop  '00000000-0000-0000-0000-0000000000b1'
\set u_otro   '00000000-0000-0000-0000-00000000000f'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_k from public.empresas where razon_social = 'Empresa K SA de CV' \gset
select (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 7)::text as pasada,
       (date_trunc('week', now() at time zone 'America/Mexico_City')::date - 14)::text as antepasada \gset

-- 1500 entradas de una sola persona en la semana pasada: más que el máximo de filas de la API.
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
select :'empresa_k', id, 'entrada', 'panel', 'Volumen',
       ((:'pasada'::date + 3)::timestamp + make_interval(secs => g)) at time zone 'America/Mexico_City'
  from public.trabajadores, generate_series(1, 1500) g
 where empresa_id = :'empresa_k' and numero_empleado = '502';

\echo '--- Indicador de la semana'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_kprop', false) \gset
select tests.afirmar(
  (select trabajaron = 2 and conformes = 1 and objetadas = 0 from public.conformidad_semana(:'empresa_k', :'pasada')),
  'semana pasada: 2 trabajaron (aunque una tenga 1500 entradas), 1 confirmó');
select tests.afirmar(
  (select trabajaron = 1 and conformes = 0 and objetadas = 1 from public.conformidad_semana(:'empresa_k', :'antepasada')),
  'semana antepasada: la última respuesta cuenta (objeción)');

select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.afirmar(
  (select trabajaron = 0 and conformes = 0 and objetadas = 0 from public.conformidad_semana(:'empresa_k', :'pasada')),
  'otra empresa obtiene ceros (RLS)');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset

\echo '--- Fin indicadores'

\echo '--- Días de descanso adicionales'
reset role;
select id as empresa_k2 from public.empresas where razon_social = 'Empresa K SA de CV' \gset
select id as kiki2 from public.trabajadores where empresa_id = :'empresa_k2' and numero_empleado = '501' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_kprop', false) \gset
update public.trabajadores set dias_descanso_adicionales = '{6}' where id = :'kiki2';
select tests.afirmar((select dias_descanso_adicionales = '{6}' from public.trabajadores where id = :'kiki2'), 'se guarda el sábado como descanso adicional');
select tests.debe_fallar(format($$update public.trabajadores set dias_descanso_adicionales = '{0}' where id = %L$$, :'kiki2'), 'el descanso adicional repite el obligatorio (domingo)');
select tests.debe_fallar(format($$update public.trabajadores set dias_descanso_adicionales = '{6,6}' where id = %L$$, :'kiki2'), 'días repetidos');
select tests.debe_fallar(format($$update public.trabajadores set dias_descanso_adicionales = '{7}' where id = %L$$, :'kiki2'), 'día inexistente');
select tests.debe_fallar(format($$update public.trabajadores set dias_descanso_adicionales = '{1,2,3,4}' where id = %L$$, :'kiki2'), 'más de 3 días adicionales');
-- Una semana nueva pendiente (hace 3 semanas) para pedirla en el kiosco.
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva)
  values (:'empresa_k2', :'kiki2', 'entrada', 'panel', 'Prueba descansos',
          ((date_trunc('week', now() at time zone 'America/Mexico_City')::date - 21 + 1)::timestamp + time '09:00') at time zone 'America/Mexico_City');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false) \gset
select tests.afirmar(
  (select public.kiosco_semana('501', '4826', date_trunc('week', now() at time zone 'America/Mexico_City')::date - 21)
          -> 'dias_descanso_adicionales' = '[6]'::jsonb),
  'el kiosco recibe los días adicionales para calcular la semana igual que la app');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
