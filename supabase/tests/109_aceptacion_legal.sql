-- =============================================================================
-- Pruebas de la aceptación de términos y aviso de privacidad. Continúa sobre 10–108.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop  '00000000-0000-0000-0000-00000000000a'
\set u_sup   '00000000-0000-0000-0000-00000000000b'
\set u_trab  '00000000-0000-0000-0000-00000000000d'
\set u_otro  '00000000-0000-0000-0000-00000000000f'
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.aceptar_documentos_legales(:'empresa_a', '1.0', '1.0', '{"ip": "189.1.2.3", "agente": "Prueba"}') as acept \gset
select tests.afirmar((select terminos_version = '1.0' and user_id = :'u_prop' and evidencia ->> 'ip' = '189.1.2.3'
                        from public.aceptaciones_legales where id = :'acept'),
  'el propietario acepta: quién, qué versiones y desde dónde');
select tests.debe_fallar(format($$select public.aceptar_documentos_legales(%L, '1.0', 'uno', '{}')$$, :'empresa_a'),
  'una versión con formato inválido');
select tests.debe_fallar(format($$update public.aceptaciones_legales set terminos_version = '9.9' where id = %s$$, :'acept'),
  'una aceptación no se modifica');
select tests.debe_fallar(format($$insert into public.aceptaciones_legales (empresa_id, user_id, terminos_version, privacidad_version) values (%L, %L, '1.0', '1.0')$$, :'empresa_a', :'u_prop'),
  'no se inserta directo en la tabla');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format($$select public.aceptar_documentos_legales(%L, '1.0', '1.0', '{}')$$, :'empresa_a'),
  'un supervisor no acepta en nombre de la empresa');
select tests.afirmar((select count(*) = 0 from public.aceptaciones_legales), 'un supervisor no ve las aceptaciones');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.debe_fallar(format($$select public.aceptar_documentos_legales(%L, '1.0', '1.0', '{}')$$, :'empresa_a'),
  'otra empresa no acepta por esta');

-- Aviso de privacidad de la empresa: solo un enlace https; lo ve su personal.
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar(format($$update public.empresas set aviso_privacidad_url = 'http://inseguro.mx/aviso' where id = %L$$, :'empresa_a'),
  'el aviso debe ser un enlace https');
update public.empresas set aviso_privacidad_url = 'https://empresa-a.mx/aviso-de-privacidad' where id = :'empresa_a';
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select aviso_privacidad_url = 'https://empresa-a.mx/aviso-de-privacidad' from public.empresas where id = :'empresa_a'),
  'la persona trabajadora ve el enlace al aviso de su empresa');
reset role;
