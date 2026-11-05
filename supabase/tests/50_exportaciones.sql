-- =============================================================================
-- Pruebas del registro de exportaciones. Continúa sobre 10–40.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_sup    '00000000-0000-0000-0000-00000000000b'
\set u_kiosco '00000000-0000-0000-0000-00000000000c'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_otro   '00000000-0000-0000-0000-00000000000f'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as empresa_b from public.empresas where razon_social = 'Empresa B SA de CV' \gset
select id as trab_a from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '001' \gset
set role authenticated;

\echo '--- Registro de exportaciones'
select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
insert into public.exportaciones (empresa_id, trabajador_id, desde, hasta, formato, hash_archivo, hash_datos, cadena_secuencia, cadena_hash, cadena_integra)
  values (:'empresa_a', :'trab_a', '2026-10-26', '2026-11-08', 'pdf', sha256('pdf'), sha256('datos'), 10, sha256('c'), true);
select tests.afirmar(
  (select generado_por = :'u_sup'::uuid from public.exportaciones where formato = 'pdf'),
  'un supervisor puede exportar y queda registrado quién lo hizo');
select tests.debe_fallar(format($$insert into public.exportaciones (empresa_id, desde, hasta, formato, hash_archivo, hash_datos, cadena_secuencia, cadena_hash, cadena_integra) values (%L, '2026-01-01', '2026-01-07', 'xlsx', sha256('x'), sha256('x'), 1, sha256('x'), true)$$, :'empresa_a'),
  'formato no soportado');
select tests.debe_fallar(format($$insert into public.exportaciones (empresa_id, desde, hasta, formato, hash_archivo, hash_datos, cadena_secuencia, cadena_hash, cadena_integra) values (%L, '2026-01-01', '2026-01-07', 'pdf', '\x00', sha256('x'), 1, sha256('x'), true)$$, :'empresa_a'),
  'huella que no es SHA-256');

select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.debe_fallar(format($$insert into public.exportaciones (empresa_id, trabajador_id, desde, hasta, formato, hash_archivo, hash_datos, cadena_secuencia, cadena_hash, cadena_integra) values (%L, %L, '2026-01-01', '2026-01-07', 'pdf', sha256('x'), sha256('x'), 1, sha256('x'), true)$$, :'empresa_b', :'trab_a'),
  'exportar un trabajador de otra empresa');
select tests.afirmar((select count(*) = 0 from public.exportaciones), 'otra empresa no ve las exportaciones');

select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.debe_fallar(format($$insert into public.exportaciones (empresa_id, trabajador_id, desde, hasta, formato, hash_archivo, hash_datos, cadena_secuencia, cadena_hash, cadena_integra) values (%L, %L, '2026-01-01', '2026-01-07', 'pdf', sha256('x'), sha256('x'), 1, sha256('x'), true)$$, :'empresa_a', :'trab_a'),
  'un trabajador registra exportaciones de la empresa');

select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar((select count(*) = 0 from public.exportaciones), 'un kiosco no ve exportaciones');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.debe_fallar($$update public.exportaciones set cadena_integra = false$$, 'modificar una exportación incluso como superusuario');
select tests.debe_fallar($$delete from public.exportaciones$$, 'borrar una exportación incluso como superusuario');

\echo '--- Fin exportaciones'
