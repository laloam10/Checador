-- =============================================================================
-- Pruebas de invitaciones y gestión de accesos. Continúa sobre 10 y 20.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Las sesiones de prueba se iniciaron con código enviado al correo (claim amr = otp).
select set_config('request.jwt.claims', '{"amr":[{"method":"otp"}]}', false) \gset

\set u_prop  '00000000-0000-0000-0000-00000000000a'
\set u_sup   '00000000-0000-0000-0000-00000000000b'
\set u_adm   '00000000-0000-0000-0000-000000000020'
\set u_kio2  '00000000-0000-0000-0000-000000000021'
\set u_nocf  '00000000-0000-0000-0000-000000000022'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id, email, email_confirmed_at) values
  (:'u_adm', 'admin@empresa-a.mx', now()),
  (:'u_kio2', 'kiosco.bodega@empresa-a.mx', now()),
  (:'u_nocf', 'sinconfirmar@empresa-a.mx', null);
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as centro_b from public.centros_trabajo where empresa_id = :'empresa_a' and nombre = 'Bodega' \gset

set role authenticated;

\echo '--- Invitar'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.invitaciones (empresa_id, email, rol) values (:'empresa_a', 'ADMIN@empresa-a.mx', 'admin');
insert into public.invitaciones (empresa_id, email, rol, centro_trabajo_id)
  values (:'empresa_a', 'kiosco.bodega@empresa-a.mx', 'kiosco', :'centro_b');
insert into public.invitaciones (empresa_id, email, rol) values (:'empresa_a', 'sinconfirmar@empresa-a.mx', 'supervisor');
select tests.debe_fallar(format($$insert into public.invitaciones (empresa_id, email, rol) values (%L, 'x@y.mx', 'propietario')$$, :'empresa_a'),
  'invitar a alguien como propietario');
select tests.debe_fallar(format($$insert into public.invitaciones (empresa_id, email, rol, centro_trabajo_id) values (%L, 'x@y.mx', 'supervisor', %L)$$, :'empresa_a', :'centro_b'),
  'centro de trabajo en una invitación que no es de kiosco');
select tests.debe_fallar(format($$insert into public.invitaciones (empresa_id, email, rol) values (%L, 'admin@EMPRESA-A.mx', 'supervisor')$$, :'empresa_a'),
  'dos invitaciones pendientes para el mismo correo');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format($$insert into public.invitaciones (empresa_id, email, rol) values (%L, 'otro@y.mx', 'kiosco')$$, :'empresa_a'),
  'un supervisor invita');
select tests.afirmar((select count(*) = 0 from public.invitaciones), 'un supervisor no ve las invitaciones');
select tests.debe_fallar(format($$select * from public.miembros_de_empresa(%L)$$, :'empresa_a'), 'un supervisor lista los accesos con correos');

\echo '--- Aceptar al entrar'
select set_config('request.jwt.claim.sub', :'u_adm', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 1, 'el administrador invitado queda vinculado al entrar');
select tests.afirmar(public.mi_rol(:'empresa_a') = 'admin', 'con rol de administrador');
select tests.debe_fallar(format($$insert into public.invitaciones (empresa_id, email, rol) values (%L, 'otro.admin@y.mx', 'admin')$$, :'empresa_a'),
  'un administrador invita a otro administrador');
insert into public.invitaciones (empresa_id, email, rol) values (:'empresa_a', 'super2@empresa-a.mx', 'supervisor');

select set_config('request.jwt.claim.sub', :'u_kio2', false) \gset
select public.vincular_mi_cuenta();
select tests.afirmar(
  (select rol = 'kiosco' and centro_trabajo_id = :'centro_b'::uuid from public.miembros where user_id = :'u_kio2'),
  'el kiosco invitado queda limitado a su centro');
select tests.afirmar((public.kiosco_identificar('050', '9157') ->> 'ok')::boolean, 'y ya puede identificar al personal de ese centro');

select set_config('request.jwt.claim.sub', :'u_nocf', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'un correo sin confirmar no acepta invitaciones');

-- Sesión iniciada con contraseña y correo "confirmado" sin código (p. ej. con "Confirm email"
-- apagado): no debe vincularse a un trabajador ni aceptar invitaciones.
reset role;
\set u_pass '00000000-0000-0000-0000-000000000023'
insert into auth.users (id, email, email_confirmed_at, encrypted_password)
  values (:'u_pass', 'jefe.invitado@empresa-a.mx', now(), '$2a$10$hashdeunacontrasena');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.invitaciones (empresa_id, email, rol) values (:'empresa_a', 'jefe.invitado@empresa-a.mx', 'supervisor');
select set_config('request.jwt.claim.sub', :'u_pass', false) \gset
select set_config('request.jwt.claims', '{"amr":[{"method":"password"}]}', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'una sesión con contraseña no acepta invitaciones aunque el correo figure como confirmado');
select tests.afirmar(public.mi_rol(:'empresa_a') is null, 'y no obtiene acceso a la empresa');
select set_config('request.jwt.claims', '{}', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'una sesión sin método de autenticación tampoco');
select set_config('request.jwt.claims', '{"amr":[{"method":"otp"}]}', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 1, 'la misma cuenta, entrando con código, sí acepta su invitación');

\echo '--- Listar y quitar accesos'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar(
  (select count(*) filter (where email = 'admin@empresa-a.mx' and rol = 'admin') = 1 from public.miembros_de_empresa(:'empresa_a')),
  'el propietario ve los accesos con su correo');

select set_config('request.jwt.claim.sub', :'u_adm', false) \gset
delete from public.miembros where user_id = :'u_prop';
select tests.afirmar((select count(*) = 1 from public.miembros where user_id = :'u_prop'), 'un administrador no puede quitar al propietario');
delete from public.miembros where user_id = :'u_kio2';
select tests.afirmar((select count(*) = 0 from public.miembros where user_id = :'u_kio2'), 'un administrador puede quitar un kiosco');
delete from public.invitaciones where email = 'super2@empresa-a.mx';
select tests.afirmar((select count(*) = 0 from public.invitaciones where email = 'super2@empresa-a.mx'), 'un administrador cancela una invitación pendiente');

reset role;
\echo '--- Fin invitaciones'

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar((select count(*) >= 2 from public.trabajadores_con_pin(:'empresa_a')), 'el panel sabe quién tiene PIN sin ver los PINs');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false) \gset
select tests.debe_fallar(format($$select * from public.trabajadores_con_pin(%L)$$, :'empresa_a'), 'otra empresa consulta quién tiene PIN');
reset role;
