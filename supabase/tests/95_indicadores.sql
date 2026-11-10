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
