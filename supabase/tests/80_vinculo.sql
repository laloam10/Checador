-- =============================================================================
-- Pruebas del vínculo ficha ↔ cuenta del trabajador. Continúa sobre 10–70.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_v      '00000000-0000-0000-0000-0000000000c1'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id, email, email_confirmed_at) values (:'u_v', 'vale@a.mx', now());
select id as empresa_a, (select id from public.centros_trabajo where empresa_id = e.id order by creado_en limit 1) as centro_a
  from public.empresas e where razon_social = 'Empresa A SA de CV' \gset

\echo '--- El empleador no puede ligar fichas a cuentas'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$insert into public.trabajadores (empresa_id, centro_trabajo_id, user_id, nombre, fecha_ingreso)
  values (%L, %L, %L, 'Suplantado', '2026-01-01')$$, :'empresa_a', :'centro_a', :'u_prop'),
  'dar de alta un trabajador ya ligado a la cuenta del propietario');
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, email, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Vale Torres', 'Vale@A.mx', '2026-01-01') returning id as vale \gset
select tests.debe_fallar(format($$update public.trabajadores set user_id = %L where id = %L$$, :'u_prop', :'vale'),
  'ligar la ficha a la cuenta del propietario');

\echo '--- La persona se liga al entrar con su correo'
select set_config('request.jwt.claim.sub', :'u_v', false) \gset
select set_config('request.jwt.claims', '{"amr":[{"method":"otp"}]}', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 1, 'vincular_mi_cuenta() sí liga la ficha');

\echo '--- Cambiar el correo desvincula'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
update public.trabajadores set email = 'VALE@a.mx' where id = :'vale';
select tests.afirmar((select user_id = :'u_v'::uuid from public.trabajadores where id = :'vale'), 'cambiar solo mayúsculas no desvincula');
select tests.debe_fallar(format($$update public.trabajadores set user_id = %L where id = %L$$, :'u_trab', :'vale'),
  'cambiar la cuenta ligada por otra');
update public.trabajadores set email = 'vale.nuevo@a.mx' where id = :'vale';
select tests.afirmar((select user_id is null from public.trabajadores where id = :'vale'), 'el correo nuevo desvincula la cuenta anterior');
select set_config('request.jwt.claim.sub', :'u_v', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'la cuenta del correo anterior ya no se vuelve a ligar');

\echo '--- Desvincular sí se permite'
reset role;
update public.trabajadores set email = 'vale@a.mx' where id = :'vale';
set role authenticated;
select public.vincular_mi_cuenta();
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
update public.trabajadores set user_id = null where id = :'vale';
select tests.afirmar((select user_id is null from public.trabajadores where id = :'vale'), 'el empleador puede desvincular una cuenta');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset

\echo '--- Fin vínculo'
