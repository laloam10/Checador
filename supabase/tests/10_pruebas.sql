-- =============================================================================
-- Pruebas de esquema, RLS e integridad de la bitácora.
-- Se ejecutan con run-local.sh. Cualquier fallo detiene el script (ON_ERROR_STOP).
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
-- Las sesiones de prueba se iniciaron con código enviado al correo (claim amr = otp).
select set_config('request.jwt.claims', '{"amr":[{"method":"otp"}]}', false) \gset

-- Utilidades de prueba ---------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.debe_fallar(p_sql text, p_descr text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLO: se permitió: %', p_descr;
exception when others then
  if sqlerrm like 'FALLO:%' then raise; end if;
  raise notice 'ok (rechazado): % [%]', p_descr, sqlerrm;
end;
$$;

create function tests.afirmar(p_cond boolean, p_descr text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALLO: %', p_descr;
  end if;
  raise notice 'ok: %', p_descr;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- Usuarios ----------------------------------------------------------------------
\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_sup    '00000000-0000-0000-0000-00000000000b'
\set u_kiosco '00000000-0000-0000-0000-00000000000c'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_trab2  '00000000-0000-0000-0000-00000000000e'
\set u_otro   '00000000-0000-0000-0000-00000000000f'
insert into auth.users (id) values (:'u_prop'), (:'u_sup'), (:'u_kiosco'), (:'u_trab'), (:'u_trab2'), (:'u_otro');

-- Preparación: empresa A ----------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.crear_empresa('Empresa A SA de CV', 'AAA010101AAA') as empresa_a \gset
insert into public.centros_trabajo (empresa_id, nombre) values (:'empresa_a', 'Matriz') returning id as centro_a \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Ana Pérez', '001', '2026-01-15') returning id as trab_a \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Beto López', '002', '2026-02-01') returning id as trab_a2 \gset
-- La cuenta de cada trabajador solo se liga con vincular_mi_cuenta(); en la preparación se liga directamente.
reset role;
update public.trabajadores set user_id = :'u_trab' where id = :'trab_a';
update public.trabajadores set user_id = :'u_trab2' where id = :'trab_a2';
set role authenticated;
insert into public.miembros (empresa_id, user_id, rol) values (:'empresa_a', :'u_sup', 'supervisor'), (:'empresa_a', :'u_kiosco', 'kiosco');

-- Preparación: empresa B ----------------------------------------------------------
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select public.crear_empresa('Empresa B SA de CV') as empresa_b \gset
insert into public.centros_trabajo (empresa_id, nombre) values (:'empresa_b', 'Sucursal') returning id as centro_b \gset

-- =============================================================================
\echo '--- Captura del trabajador (PWA)'
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset

-- El cliente intenta fijar la hora del servidor y la secuencia: el trigger las ignora.
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, hora_servidor, hora_efectiva, secuencia, hash_anterior, hash)
  values (:'empresa_a', :'trab_a', 'entrada', 'pwa', '2020-01-01', '2020-01-01', 999, '\x00', '\x00');
select tests.afirmar(
  (select hora_servidor > now() - interval '1 minute' and hora_efectiva = hora_servidor and secuencia = 1
     from public.eventos where empresa_id = :'empresa_a' and secuencia = 1),
  'hora del servidor y secuencia las fija el servidor');

select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'entrada', 'pwa')$$,
  :'empresa_a', :'trab_a2'), 'trabajador checa por otro trabajador');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values (%L, %L, 'entrada', 'panel', 'x', now())$$,
  :'empresa_a', :'trab_a'), 'trabajador usa origen panel');
-- La PWA no decide si puede salir durante la pausa: lo impone el centro (art. 64).
insert into public.eventos (empresa_id, trabajador_id, tipo, origen)
  values (:'empresa_a', :'trab_a', 'inicio_pausa', 'pwa');
select tests.afirmar(
  (select puede_salir from public.eventos where empresa_id = :'empresa_a' and secuencia = 2),
  'la pausa toma la configuración del centro de trabajo (art. 64)');

-- Captura diferida (sin conexión).
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, diferido, hora_dispositivo)
  values (:'empresa_a', :'trab_a', 'fin_pausa', 'pwa', true, now() - interval '2 hours');
select tests.afirmar(
  (select diferido and hora_efectiva = hora_dispositivo and hora_servidor > hora_dispositivo
     from public.eventos where empresa_id = :'empresa_a' and secuencia = 3),
  'captura diferida conserva ambas horas y usa la del dispositivo como efectiva');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, diferido, hora_dispositivo) values (%L, %L, 'salida', 'pwa', true, now() - interval '10 days')$$,
  :'empresa_a', :'trab_a'), 'captura diferida con más de 7 días de antigüedad');

-- Inmutabilidad para el usuario: ni siquiera existe el privilegio de modificar o borrar eventos.
select tests.debe_fallar(format($$update public.eventos set motivo = 'alterado' where empresa_id = %L$$, :'empresa_a'),
  'el trabajador modifica eventos (sin privilegio UPDATE)');
select tests.debe_fallar(format($$delete from public.eventos where empresa_id = %L$$, :'empresa_a'),
  'el trabajador borra eventos (sin privilegio DELETE)');
select tests.afirmar((select count(*) = 3 and count(motivo) = 0 from public.eventos where empresa_id = :'empresa_a'),
  'el trabajador no puede modificar ni borrar eventos');

select tests.afirmar((select count(*) = 0 from public.eventos where trabajador_id = :'trab_a2'),
  'el trabajador no ve eventos de otros trabajadores');

-- =============================================================================
\echo '--- Kiosco'
-- El kiosco no inserta directo: solo con kiosco_checar() y el PIN del trabajador.
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.asignar_pin(:'trab_a2', '2580');
select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'entrada', 'kiosco')$$,
  :'empresa_a', :'trab_a2'), 'el kiosco inserta eventos sin PIN');
select tests.afirmar(
  (public.kiosco_checar('002', '2580', 'entrada', gen_random_uuid()) ->> 'ok')::boolean,
  'el kiosco registra con número de empleado y PIN');
select tests.afirmar((select count(*) = 0 from public.eventos), 'el kiosco no puede consultar la bitácora');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, motivo, hora_efectiva) values (%L, %L, 'correccion', 'panel', 1, 'x', now())$$,
  :'empresa_a', :'trab_a'), 'el kiosco hace correcciones');

-- =============================================================================
\echo '--- Ajustes del empleador (panel)'
select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, motivo, hora_efectiva)
  values (:'empresa_a', :'trab_a', 'correccion', 'panel', 1, 'El trabajador reportó entrada a las 7:55', now() - interval '3 hours');
select tests.afirmar(
  (select registrado_por = :'u_sup'::uuid from public.eventos where empresa_id = :'empresa_a' and tipo = 'correccion'),
  'la corrección registra quién la hizo');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, hora_efectiva) values (%L, %L, 'correccion', 'panel', 1, now())$$,
  :'empresa_a', :'trab_a'), 'corrección sin motivo');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values (%L, %L, 'salida', 'panel', 'olvidó checar', now() + interval '1 hour')$$,
  :'empresa_a', :'trab_a'), 'evento manual con hora futura');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, corrige_evento_id, motivo, hora_efectiva) values (%L, %L, 'correccion', 'panel', %s, 'x', now())$$,
  :'empresa_a', :'trab_a', (select min(id) from public.eventos where trabajador_id = :'trab_a2')), 'corregir un evento de otro trabajador');
select tests.debe_fallar(format(
  $$insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, fecha_ingreso) values (%L, %L, 'X', '2026-01-01')$$,
  :'empresa_a', :'centro_a'), 'el supervisor da de alta trabajadores');

-- =============================================================================
\echo '--- Aislamiento entre empresas'
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.afirmar((select count(*) = 0 from public.eventos where empresa_id = :'empresa_a'), 'empresa B no ve eventos de A');
select tests.afirmar((select count(*) = 0 from public.trabajadores where empresa_id = :'empresa_a'), 'empresa B no ve trabajadores de A');
select tests.afirmar((select count(*) = 1 from public.empresas), 'empresa B solo ve su empresa');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values (%L, %L, 'entrada', 'panel', 'x', now())$$,
  :'empresa_a', :'trab_a'), 'empresa B inserta eventos en A');
select tests.debe_fallar(format(
  $$insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, fecha_ingreso) values (%L, %L, 'X', '2026-01-01')$$,
  :'empresa_b', :'centro_a'), 'trabajador de B en un centro de A');

-- =============================================================================
\echo '--- Acuerdo y firmas (prueba plena, art. 132 XXXIV)'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso, jornada_pactada_min)
  values (:'empresa_a', :'trab_a', 1, 'Acuerdo de registro electrónico de jornada…', 0, '{"1":576,"2":576,"3":576,"4":576,"5":576}')
  returning id as acuerdo_a \gset
select tests.debe_fallar(format(
  $$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (%L, %L, 'trabajador')$$,
  :'empresa_a', :'acuerdo_a'), 'el patrón firma como trabajador');
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_a', 'empleador');

select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_a', 'trabajador');
select tests.debe_fallar(format(
  $$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (%L, %L, 'trabajador')$$,
  :'empresa_a', :'acuerdo_a'), 'firmar dos veces el mismo acuerdo');
select tests.afirmar(
  (select bool_and(f.contenido_hash = a.contenido_hash) and count(*) = 2
     from public.firmas_acuerdo f join public.acuerdos a on a.id = f.acuerdo_id),
  'ambas firmas guardan el hash del texto firmado');

-- =============================================================================
\echo '--- Conformidades'
insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta)
  values (:'empresa_a', :'trab_a', '2026-11-02', '2026-11-08', '{"trabajadoMin": 2880}', 'conforme');
select tests.debe_fallar(format(
  $$insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta) values (%L, %L, '2026-11-09', '2026-11-15', '{}', 'objeta')$$,
  :'empresa_a', :'trab_a'), 'objeción sin comentario');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format(
  $$insert into public.conformidades (empresa_id, trabajador_id, periodo_inicio, periodo_fin, resumen, respuesta) values (%L, %L, '2026-11-09', '2026-11-15', '{}', 'conforme')$$,
  :'empresa_a', :'trab_a'), 'el supervisor da conformidad en nombre del trabajador');
select tests.afirmar(
  (select c.cadena_secuencia = 5 from public.conformidades c),
  'la conformidad queda anclada al estado de la cadena al responder');

-- =============================================================================
\echo '--- Bajas y conservación (art. 804)'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$delete from public.trabajadores where id = %L$$, :'trab_a2'),
  'el propietario borra trabajadores (sin privilegio DELETE, art. 804)');
select tests.afirmar((select count(*) = 1 from public.trabajadores where id = :'trab_a2'), 'el trabajador sigue existiendo');
update public.trabajadores set fecha_baja = current_date where id = :'trab_a2';

select set_config('request.jwt.claim.sub', :'u_trab2', false) \gset
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'salida', 'pwa')$$,
  :'empresa_a', :'trab_a2'), 'trabajador dado de baja checa');

reset role;
select tests.debe_fallar(format($$delete from public.trabajadores where id = %L$$, :'trab_a2'),
  'borrar trabajador incluso como superusuario');

-- =============================================================================
\echo '--- Integridad de la cadena'
select tests.debe_fallar($$update public.eventos set motivo = 'x' where secuencia = 1$$, 'UPDATE de evento como superusuario');
select tests.debe_fallar($$delete from public.eventos$$, 'DELETE de eventos como superusuario');
select tests.debe_fallar($$truncate public.eventos cascade$$, 'TRUNCATE de eventos');
select tests.debe_fallar($$update public.conformidades set respuesta = 'objeta', comentario = 'x'$$, 'UPDATE de conformidad');
select tests.debe_fallar($$update public.acuerdos set contenido = 'otro'$$, 'UPDATE de acuerdo');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar(public.verificar_cadena(:'empresa_a') is null, 'cadena de A íntegra');
select tests.debe_fallar(format($$select public.verificar_cadena(%L)$$, :'empresa_b'), 'verificar cadena de otra empresa');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.afirmar(public.verificar_cadena(:'empresa_b') is null, 'cadena vacía de B íntegra');

-- Alteración directa en la base (simula a alguien con acceso total que desactiva triggers).
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
alter table public.eventos disable trigger eventos_solo_insercion;
update public.eventos set hora_efectiva = hora_efectiva - interval '1 hour' where empresa_id = :'empresa_a' and secuencia = 2;
alter table public.eventos enable trigger eventos_solo_insercion;
select tests.afirmar(public.verificar_cadena(:'empresa_a') = 2, 'la alteración del evento 2 se detecta');

-- =============================================================================
\echo '--- Vinculación de cuenta y reintentos'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
set role authenticated;
\set u_nuevo '00000000-0000-0000-0000-000000000010'
\set u_falso '00000000-0000-0000-0000-000000000011'
reset role;
insert into auth.users (id, email, email_confirmed_at) values
  (:'u_nuevo', 'carla@ejemplo.mx', now()),
  (:'u_falso', 'Carla@Ejemplo.mx', null);
set role authenticated;
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, email, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Carla Ruiz', 'CARLA@ejemplo.mx', '2026-03-01') returning id as trab_c \gset

select set_config('request.jwt.claim.sub', :'u_falso', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'correo sin confirmar no vincula');

select set_config('request.jwt.claim.sub', :'u_nuevo', false) \gset
select tests.afirmar(public.vincular_mi_cuenta() = 1, 'correo confirmado vincula (sin distinguir mayúsculas)');
select tests.afirmar(public.vincular_mi_cuenta() = 0, 'vincular dos veces no hace nada');

insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente)
  values (:'empresa_a', :'trab_c', 'entrada', 'pwa', '11111111-1111-1111-1111-111111111111');
select tests.debe_fallar(format(
  $$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente) values (%L, %L, 'entrada', 'pwa', '11111111-1111-1111-1111-111111111111')$$,
  :'empresa_a', :'trab_c'), 'reintento con el mismo id_cliente duplica el evento');

\echo '--- Fin'
