-- =============================================================================
-- Pruebas de horarios y de la jornada pactada que se calcula de ellos. Empresas H e I.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_hprop  '00000000-0000-0000-0000-0000000000f1'
\set u_hsup   '00000000-0000-0000-0000-0000000000f2'
\set u_htrab  '00000000-0000-0000-0000-0000000000f3'
\set u_iprop  '00000000-0000-0000-0000-0000000000f4'
\set oficina  '{"1":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00","pausa_fin":"14:00"},"2":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00","pausa_fin":"14:00"},"3":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00","pausa_fin":"14:00"},"4":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00","pausa_fin":"14:00"},"5":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00","pausa_fin":"14:00"}}'
\set nocturno '{"1":{"entrada":"22:00","salida":"06:00"},"2":{"entrada":"22:00","salida":"06:00"}}'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
insert into auth.users (id) values (:'u_hprop'), (:'u_hsup'), (:'u_htrab'), (:'u_iprop');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_hprop', false) \gset
select public.crear_empresa('Empresa H SA de CV') as empresa_h \gset
insert into public.centros_trabajo (empresa_id, nombre, pausa_puede_salir) values (:'empresa_h', 'Matriz', true) returning id as centro_h \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_h', :'centro_h', 'Hugo Horario', 'h1', '2026-01-01') returning id as hugo \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, jornada_pactada_min)
  values (:'empresa_h', :'centro_h', 'Irma Manual', 'h2', '2026-01-01', '{"1": 300}') returning id as irma \gset
insert into public.miembros (empresa_id, user_id, rol) values (:'empresa_h', :'u_hsup', 'supervisor');
reset role;
update public.trabajadores set user_id = :'u_htrab' where id = :'hugo';
set role authenticated;

\echo '--- Validación'
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{}')$$, :'empresa_h'), 'horario sin días');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{"7":{"entrada":"08:00","salida":"17:00"}}')$$, :'empresa_h'), 'día inexistente');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{"1":{"entrada":"8:00","salida":"17:00"}}')$$, :'empresa_h'), 'hora mal escrita');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{"1":{"entrada":"06:00","salida":"23:00"}}')$$, :'empresa_h'), 'turno de más de 16 horas');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{"1":{"entrada":"08:00","salida":"17:00","pausa_inicio":"13:00"}}')$$, :'empresa_h'), 'comida sin fin');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'x', '{"1":{"entrada":"08:00","salida":"17:00","pausa_inicio":"18:00","pausa_fin":"19:00"}}')$$, :'empresa_h'), 'comida fuera del turno');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias, tolerancia_min) values (%L, 'x', %L, 90)$$, :'empresa_h', :'oficina'), 'tolerancia de más de una hora');

\echo '--- Permisos'
insert into public.horarios (empresa_id, nombre, dias) values (:'empresa_h', 'Oficina', :'oficina') returning id as h_oficina \gset
insert into public.horarios (empresa_id, nombre, dias) values (:'empresa_h', 'Nocturno', :'nocturno') returning id as h_noche \gset
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'Oficina', %L)$$, :'empresa_h', :'oficina'), 'dos horarios con el mismo nombre');
select set_config('request.jwt.claim.sub', :'u_hsup', false) \gset
select tests.afirmar((select count(*) = 2 from public.horarios where empresa_id = :'empresa_h'), 'el supervisor ve los horarios');
select tests.debe_fallar(format($$insert into public.horarios (empresa_id, nombre, dias) values (%L, 'Sup', %L)$$, :'empresa_h', :'oficina'), 'el supervisor crea horarios');
update public.horarios set tolerancia_min = 30 where id = :'h_oficina';
reset role;
select tests.afirmar((select tolerancia_min = 10 from public.horarios where id = :'h_oficina'), 'el supervisor no cambia horarios');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_htrab', false) \gset
select tests.afirmar((select count(*) = 2 from public.horarios), 'la persona trabajadora ve los horarios de su empresa');
select set_config('request.jwt.claim.sub', :'u_iprop', false) \gset
select public.crear_empresa('Empresa I SA de CV') as empresa_i \gset
select tests.afirmar((select count(*) = 0 from public.horarios where empresa_id = :'empresa_h'), 'otra empresa no ve los horarios');
insert into public.horarios (empresa_id, nombre, dias) values (:'empresa_i', 'Ajeno', :'oficina') returning id as h_ajeno \gset

\echo '--- Jornada pactada que sale del horario'
select set_config('request.jwt.claim.sub', :'u_hprop', false) \gset
update public.trabajadores set horario_id = :'h_oficina' where id = :'hugo';
select tests.afirmar((select jornada_pactada_min = '{"1":480,"2":480,"3":480,"4":480,"5":480}'::jsonb from public.trabajadores where id = :'hugo'),
  'con horario, la jornada pactada se calcula: 9 h menos la comida (se puede salir) = 8 h');
update public.trabajadores set jornada_pactada_min = '{"1": 60}' where id = :'hugo';
select tests.afirmar((select jornada_pactada_min ->> '1' = '480' from public.trabajadores where id = :'hugo'),
  'con horario no se captura la jornada a mano');
select tests.debe_fallar(format($$update public.trabajadores set horario_id = %L where id = %L$$, :'h_ajeno', :'hugo'), 'asignar un horario de otra empresa');

update public.centros_trabajo set pausa_puede_salir = false where id = :'centro_h';
select tests.afirmar((select jornada_pactada_min ->> '1' = '540' from public.trabajadores where id = :'hugo'),
  'si no se puede salir en la comida, cuenta como jornada (art. 64): 9 h');
update public.horarios set dias = jsonb_set(dias, '{1,salida}', '"15:00"') where id = :'h_oficina';
select tests.afirmar((select jornada_pactada_min ->> '1' = '420' from public.trabajadores where id = :'hugo'),
  'al cambiar el horario se recalcula la jornada de quien lo tiene');

\echo '--- Horario de la empresa y sin horario fijo'
select tests.afirmar((select jornada_pactada_min = '{"1": 300}'::jsonb from public.trabajadores where id = :'irma'), 'sin horario, la jornada capturada a mano se respeta');
update public.empresas set horario_predeterminado = :'h_noche' where id = :'empresa_h';
select tests.afirmar((select jornada_pactada_min = '{"1":480,"2":480}'::jsonb from public.trabajadores where id = :'irma'),
  'el horario de la empresa aplica a quien no tiene uno propio');
select tests.afirmar((select jornada_pactada_min ->> '1' = '420' from public.trabajadores where id = :'hugo'), 'y no cambia a quien tiene uno propio');
update public.trabajadores set sin_horario_fijo = true, jornada_pactada_min = '{"1": 200}' where id = :'irma';
select tests.afirmar((select jornada_pactada_min = '{"1": 200}'::jsonb and horario_id is null from public.trabajadores where id = :'irma'),
  'sin horario fijo, la jornada vuelve a capturarse a mano');
select tests.debe_fallar(format($$update public.empresas set horario_predeterminado = %L where id = %L$$, :'h_ajeno', :'empresa_h'), 'horario de la empresa de otra empresa');

\echo '--- Borrar un horario'
delete from public.horarios where id = :'h_oficina';
select tests.afirmar((select horario_id is null and jornada_pactada_min = '{"1":480,"2":480}'::jsonb from public.trabajadores where id = :'hugo'),
  'quien tenía ese horario pasa al de la empresa');
delete from public.horarios where id = :'h_noche';
select tests.afirmar((select horario_predeterminado is null from public.empresas where id = :'empresa_h'), 'borrar el horario de la empresa lo quita como predeterminado');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'Horarios: pruebas correctas.'
