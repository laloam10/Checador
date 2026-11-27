-- =============================================================================
-- Pruebas de las restricciones por falta de pago (fase 3). Continúa sobre 10–107.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop  '00000000-0000-0000-0000-00000000000a'
\set u_trab  '00000000-0000-0000-0000-00000000000d'
\set u_otro  '00000000-0000-0000-0000-00000000000f'
\set secreto 'secreto-de-prueba-0123456789abcdef0123456789abcdef'
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as trab_a, centro_trabajo_id as centro_a from public.trabajadores where empresa_id = :'empresa_a' and nombre = 'Ana Pérez' \gset
select id as wendy, telefono as tel_wendy from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '0970' \gset
-- Wendy checa por WhatsApp (activada y sin baja, para probar el mensaje de rechazo).
update public.trabajadores set telefono_verificado_en = coalesce(telefono_verificado_en, now()), fecha_baja = null where id = :'wendy';

create function pg_temp.vencido_hace(p_empresa uuid, p_dias int) returns void language sql as $$
  update public.suscripciones set estado = 'pago_vencido', pago_vencido_desde = now() - make_interval(days => p_dias)
   where empresa_id = p_empresa
$$;
create function pg_temp.nivel(p_empresa uuid) returns text language sql as $$
  select public._cobro_situacion(p_empresa) ->> 'nivel'
$$;

-- En prueba vigente o activa: sin restricciones.
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'ninguna', 'en prueba vigente no hay restricciones');

-- 0 a 15 días: solo aviso.
select pg_temp.vencido_hace(:'empresa_a', 5);
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'aviso', '5 días sin pagar: aviso');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso)
  values (:'empresa_a', :'centro_a', 'Alta Con Aviso', '0801', '2026-01-10');
select tests.afirmar(true, 'con aviso todavía se puede dar de alta');
select tests.afirmar((public.situacion_cobro(:'empresa_a') ->> 'nivel') = 'aviso', 'el propietario consulta la situación');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.debe_fallar(format($$select public.situacion_cobro(%L)$$, :'empresa_a'), 'otra empresa no consulta la situación');
reset role;

-- 15 a 30 días: panel en solo lectura; el personal sigue checando.
select pg_temp.vencido_hace(:'empresa_a', 20);
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'solo_lectura', '20 días sin pagar: solo lectura');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso) values (%L, %L, 'No Entra', '0802', '2026-01-10')$$, :'empresa_a', :'centro_a'),
  'en solo lectura no se da de alta');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, motivo, hora_efectiva) values (%L, %L, 'salida', 'panel', 'Olvidó checar', now() - interval '1 hour')$$, :'empresa_a', :'trab_a'),
  'en solo lectura el panel no captura checadas');
update public.trabajadores set fecha_baja = current_date where empresa_id = :'empresa_a' and numero_empleado = '0801';
select tests.afirmar((select fecha_baja is not null from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '0801'),
  'en solo lectura sí se puede dar de baja');
select tests.debe_fallar(format($$update public.trabajadores set fecha_baja = null where empresa_id = %L and numero_empleado = '0801'$$, :'empresa_a'),
  'en solo lectura no se deshace una baja');
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (:'empresa_a', :'trab_a', 'entrada', 'pwa');
select tests.afirmar(true, 'en solo lectura el personal sigue checando');
reset role;

-- Más de 30 días: se suspende el registro, salvo checadas sin conexión anteriores a la suspensión.
select pg_temp.vencido_hace(:'empresa_a', 31);
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'suspendida', '31 días sin pagar: suspendida');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (%L, %L, 'salida', 'pwa')$$, :'empresa_a', :'trab_a'),
  'suspendida: no se registran checadas');
select tests.debe_fallar(format($$insert into public.eventos (empresa_id, trabajador_id, tipo, origen, diferido, hora_dispositivo) values (%L, %L, 'salida', 'pwa', true, now() - interval '1 hour')$$, :'empresa_a', :'trab_a'),
  'suspendida: una checada sin conexión posterior a la suspensión tampoco');
insert into public.eventos (empresa_id, trabajador_id, tipo, origen, diferido, hora_dispositivo)
  values (:'empresa_a', :'trab_a', 'salida', 'pwa', true, now() - interval '2 days');
select tests.afirmar(true, 'suspendida: una checada sin conexión de antes de la suspensión sí se registra');
reset role;
select tests.afirmar(
  (public.whatsapp_checar(:'secreto', :'tel_wendy', 'entrada', '00000000-0000-4000-8000-000000000980') ->> 'error') like '%suspendido por falta de pago%',
  'suspendida: WhatsApp responde el motivo');
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar(public.verificar_cadena(:'empresa_a') = 2, 'los rechazos no rompen la cadena (solo la secuencia 2, alterada a propósito en 10_pruebas, está rota)');

-- Cancelada: suspendida.
update public.suscripciones set estado = 'cancelada', pago_vencido_desde = null, periodo_fin = now() - interval '1 day' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'suspendida', 'cancelada: suspendida');

-- Prueba terminada sin forma de pago: mismos plazos, desde el fin de la prueba.
update public.suscripciones set estado = 'prueba', periodo_fin = null, suscripcion_externa = null, prueba_hasta = now() - interval '16 days' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'solo_lectura', 'prueba terminada hace 16 días sin tarjeta: solo lectura');
update public.suscripciones set suscripcion_externa = 'sub_Prueba123' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'ninguna', 'prueba con tarjeta registrada: el proveedor cobra, sin restricciones');

-- Al pagar, todo vuelve a funcionar.
update public.suscripciones set estado = 'activa', suscripcion_externa = null, prueba_hasta = now() + interval '14 days' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.nivel(:'empresa_a') = 'ninguna', 'al pagar: sin restricciones');
