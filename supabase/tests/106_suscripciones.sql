-- =============================================================================
-- Pruebas de la suscripción de cada empresa (fase 1: estado y prueba). Continúa sobre 10–105. La prueba dura 14 días (migración 20261202000001).
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop  '00000000-0000-0000-0000-00000000000a'
\set u_sup   '00000000-0000-0000-0000-00000000000b'
\set u_trab  '00000000-0000-0000-0000-00000000000d'
\set u_otro  '00000000-0000-0000-0000-00000000000f'
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as empresa_b from public.empresas where razon_social = 'Empresa B SA de CV' \gset

-- Toda empresa tiene su suscripción en prueba por 30 días.
select tests.afirmar(not exists (select 1 from public.empresas e left join public.suscripciones s on s.empresa_id = e.id where s.empresa_id is null),
  'cada empresa tiene su suscripción');
select tests.afirmar((select estado = 'prueba' and prueba_hasta between now() + interval '13 days' and now() + interval '15 days'
                        from public.suscripciones where empresa_id = :'empresa_a'),
  'la prueba dura 14 días');

-- Una empresa nueva empieza en prueba.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select public.crear_empresa('Empresa C SA de CV') as empresa_c \gset
reset role;
select tests.afirmar(exists (select 1 from public.suscripciones where empresa_id = :'empresa_c' and estado = 'prueba'),
  'una empresa nueva empieza con su prueba');

-- Lectura: solo quien administra la empresa; nadie escribe por la API.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar((select count(*) = 1 from public.suscripciones), 'el propietario ve solo la suscripción de su empresa');
select tests.debe_fallar(format($$update public.suscripciones set estado = 'activa' where empresa_id = %L$$, :'empresa_a'),
  'el propietario no puede activar su suscripción por la API');
select tests.debe_fallar(format($$insert into public.suscripciones (empresa_id, prueba_hasta) values (%L, now() + interval '10 years')$$, :'empresa_b'),
  'nadie puede crear suscripciones por la API');
select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.afirmar((select count(*) = 0 from public.suscripciones), 'un supervisor no ve la suscripción');
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select count(*) = 0 from public.suscripciones), 'una persona trabajadora no ve la suscripción');
reset role;

-- El estado de pago vencido siempre lleva la fecha desde la que no se ha podido cobrar.
select tests.debe_fallar(format($$update public.suscripciones set estado = 'pago_vencido' where empresa_id = %L$$, :'empresa_a'),
  'pago vencido sin fecha');
