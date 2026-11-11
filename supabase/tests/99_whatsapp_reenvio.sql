-- =============================================================================
-- Pruebas del límite de reenvíos al asistente. Continúa sobre 10–98.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set secreto  'secreto-de-prueba-0123456789abcdef0123456789abcdef'
\set malo     'otro-secreto-0123456789abcdef0123456789abcdef0000'

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \gset
select tests.debe_fallar($$select count(*) from public.whatsapp_reenvios$$, 'leer los contadores de reenvío por la API');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset

select tests.afirmar(public.whatsapp_permitir_reenvio(:'malo', '5215500000009') ->> 'codigo' = 'NO_AUTORIZADO', 'reenvío con secreto incorrecto');
select tests.afirmar(
  public.whatsapp_permitir_reenvio(:'secreto', '5215511112222') = '{"ok": true, "permitido": false, "aviso": false}'::jsonb,
  'un trabajador registrado nunca se reenvía al asistente');
select tests.afirmar(
  public.whatsapp_permitir_reenvio(:'secreto', '5215500000009') = '{"ok": true, "permitido": true, "aviso": false}'::jsonb,
  'un número desconocido sí se reenvía');
select public.whatsapp_permitir_reenvio(:'secreto', '5215500000009') from generate_series(2, 20) \g /dev/null
select tests.afirmar(
  public.whatsapp_permitir_reenvio(:'secreto', '5215500000009') = '{"ok": true, "permitido": false, "aviso": true}'::jsonb,
  'el mensaje 21 de la hora no se reenvía y se avisa una vez');
select tests.afirmar(
  public.whatsapp_permitir_reenvio(:'secreto', '5215500000009') = '{"ok": true, "permitido": false, "aviso": false}'::jsonb,
  'después ya no se avisa');
select tests.afirmar((public.whatsapp_permitir_reenvio(:'secreto', '5215500000010') ->> 'permitido')::boolean, 'otro número tiene su propio límite');

reset role;
select tests.afirmar(
  (select count(*) = 2 and bool_and(octet_length(huella) = 32) from public.whatsapp_reenvios),
  'solo se guarda la huella del teléfono, no el número');
update public.whatsapp_reenvios set cuenta = 300 where huella = extensions.digest('525500000010', 'sha256');
set role anon;
select tests.afirmar(not (public.whatsapp_permitir_reenvio(:'secreto', '5215500000011') ->> 'permitido')::boolean,
  'el límite global por hora corta los reenvíos de cualquier número');
reset role;
update public.whatsapp_reenvios set hora = hora - interval '2 days';
set role anon;
select tests.afirmar((public.whatsapp_permitir_reenvio(:'secreto', '5215500000009') ->> 'permitido')::boolean, 'pasada la hora, el límite se reinicia');
reset role;
select tests.afirmar((select count(*) = 1 from public.whatsapp_reenvios), 'los contadores viejos se borran');
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Reenvío al asistente: pruebas correctas.'
