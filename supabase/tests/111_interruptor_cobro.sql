-- =============================================================================
-- Pruebas del interruptor del cobro (20261209000001). Continúa sobre 10–110 (108 lo encendió).
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop '00000000-0000-0000-0000-00000000000a'
\set u_trab '00000000-0000-0000-0000-00000000000d'
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as trab_a from public.trabajadores where empresa_id = :'empresa_a' and nombre = 'Ana Pérez' \gset

-- Prueba terminada hace 10 días sin tarjeta: con el cobro encendido, suspendida.
update public.suscripciones set estado = 'prueba', periodo_fin = null, pago_vencido_desde = null, suscripcion_externa = null,
       prueba_hasta = now() - interval '10 days' where empresa_id = :'empresa_a';
select tests.afirmar(public._cobro_situacion(:'empresa_a') ->> 'nivel' = 'suspendida', 'cobro encendido: prueba vencida, suspendida');
select tests.afirmar((public._cobro_situacion(:'empresa_a') ->> 'cobro_activo')::boolean, 'la situación dice que el cobro está encendido');

-- Apagado: ninguna restricción, aunque la prueba haya vencido.
select tests.afirmar((public.desactivar_cobro() ->> 'activo')::boolean = false, 'se apaga el cobro');
select tests.afirmar(public._cobro_situacion(:'empresa_a') = '{"nivel": "ninguna", "cobro_activo": false}'::jsonb, 'cobro apagado: sin restricciones');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
insert into public.eventos (empresa_id, trabajador_id, tipo, origen) values (:'empresa_a', :'trab_a', 'entrada', 'pwa');
select tests.afirmar(true, 'cobro apagado: el personal checa aunque la prueba haya vencido');
reset role;
select tests.afirmar(public.enviar_avisos_borrado() = 0 and not exists (select 1 from public.empresas_por_borrar()),
  'cobro apagado: ni avisos de borrado ni empresas por borrar');

-- Encender: a quien sigue en prueba sin tarjeta le da los días de prueba desde hoy.
select tests.debe_fallar($$select public.activar_cobro(7)$$, 'activar con menos de 14 días de prueba');
select tests.afirmar((public.activar_cobro(30) ->> 'pruebas_extendidas')::int >= 1, 'al encender se extienden las pruebas');
select tests.afirmar((select prueba_hasta between now() + interval '29 days' and now() + interval '31 days' from public.suscripciones where empresa_id = :'empresa_a'),
  'la prueba vencida queda en 30 días desde hoy');
select tests.afirmar(public._cobro_situacion(:'empresa_a') ->> 'nivel' = 'ninguna', 'al encender, la empresa en prueba no queda bloqueada');
select tests.afirmar((public.activar_cobro() ->> 'cambio')::boolean = false, 'encender dos veces no vuelve a extender');

-- Desde la API no se cambia el interruptor.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar($$select public.desactivar_cobro()$$, 'apagar el cobro desde la API');
select tests.debe_fallar($$select public.activar_cobro()$$, 'encender el cobro desde la API');
select tests.debe_fallar($$update public.ajustes_cobro set activo = false$$, 'cambiar el ajuste desde la API');
select tests.afirmar((public.situacion_cobro(:'empresa_a') ->> 'cobro_activo')::boolean, 'el panel sabe si el cobro está encendido');
reset role;
