-- =============================================================================
-- Pruebas del cobro con Stripe (fase 2). Continúa sobre 10–106.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set secreto 'secreto-cobro-de-prueba-0123456789abcdef0123456789abcdef'
\set malo    'otro-secreto-0123456789abcdef0123456789abcdef0000000000'
select public.configurar_secreto_servicio('cobro', :'secreto');
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset

set role anon;
select tests.debe_fallar(format($$select public.cobro_vincular_cliente(%L, %L, 'cus_Abc123')$$, :'malo', :'empresa_a'),
  'vincular un cliente sin el secreto');
select tests.debe_fallar(format($$select public.cobro_actualizar(%L, %L, 'activa', now(), 'mensual', 'cus_Abc123', 'sub_Abc123', 3)$$, :'malo', :'empresa_a'),
  'activar una suscripción sin el secreto');
select tests.debe_fallar(format($$select public.cobro_vincular_cliente(%L, %L, 'no-es-cliente')$$, :'secreto', :'empresa_a'),
  'un identificador de cliente inválido');

select tests.afirmar(public.cobro_vincular_cliente(:'secreto', :'empresa_a', 'cus_Abc123'), 'vincula el cliente de Stripe');
select tests.afirmar(not public.cobro_vincular_cliente(:'secreto', :'empresa_a', 'cus_Otro999'), 'no cambia un cliente ya vinculado por otro');

select tests.afirmar(public.cobro_actualizar(:'secreto', :'empresa_a', 'pago_vencido', now() + interval '1 month', 'mensual', 'cus_Abc123', 'sub_Abc123', 3),
  'registra un pago vencido');
reset role;
select pago_vencido_desde as desde from public.suscripciones where empresa_id = :'empresa_a' \gset
select tests.afirmar(:'desde' <> '', 'el pago vencido guarda desde cuándo');
set role anon;
select public.cobro_actualizar(:'secreto', :'empresa_a', 'pago_vencido', now() + interval '1 month', 'mensual', 'cus_Abc123', 'sub_Abc123', 3) \g /dev/null
reset role;
select tests.afirmar((select pago_vencido_desde = :'desde'::timestamptz from public.suscripciones where empresa_id = :'empresa_a'),
  'un segundo aviso de pago vencido no reinicia la fecha');
set role anon;
select tests.afirmar(public.cobro_actualizar(:'secreto', :'empresa_a', 'activa', now() + interval '1 year', 'anual', 'cus_Abc123', 'sub_Abc123', 4),
  'al pagar, queda activa');
reset role;
select tests.afirmar((select estado = 'activa' and pago_vencido_desde is null and ciclo = 'anual' and personas_cobradas = 4 and proveedor = 'stripe'
                        from public.suscripciones where empresa_id = :'empresa_a'),
  'activa, sin fecha de pago vencido, anual, con 4 personas cobradas');
