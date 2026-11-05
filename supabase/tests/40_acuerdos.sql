-- =============================================================================
-- Pruebas del acuerdo con firma (art. 132 XXXIV). Continúa sobre 10–30.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_sup    '00000000-0000-0000-0000-00000000000b'
\set u_kiosco '00000000-0000-0000-0000-00000000000c'
\set u_trab   '00000000-0000-0000-0000-00000000000d'
\set u_carla  '00000000-0000-0000-0000-000000000010'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset
select id as trab_a from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '001' \gset
select id as trab_d from public.trabajadores where empresa_id = :'empresa_a' and numero_empleado = '050' \gset
select id as trab_c from public.trabajadores where empresa_id = :'empresa_a' and nombre = 'Carla Ruiz' \gset
set role authenticated;

-- =============================================================================
\echo '--- Versiones y orden de firma (app del trabajador)'
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select version = 1 from public.acuerdo_vigente(:'trab_a')), 'el acuerdo v1 firmado por ambos es el vigente');

select set_config('request.jwt.claim.sub', :'u_sup', false) \gset
select tests.debe_fallar(format($$insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso) values (%L, %L, 2, 'x', 0)$$, :'empresa_a', :'trab_a'),
  'un supervisor genera acuerdos');

select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
  values (:'empresa_a', :'trab_a', 2, 'Acuerdo v2: nueva jornada', 6) returning id as acuerdo_v2 \gset

select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (%L, %L, 'trabajador')$$, :'empresa_a', :'acuerdo_v2'),
  'el trabajador firma antes que el empleador');
select tests.afirmar((select count(*) = 0 from public.acuerdo_pendiente(:'trab_a')), 'sin firma del empleador no hay nada pendiente para el trabajador');

select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_v2', 'empleador');
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad, evidencia) values (%L, %L, 'empleador', 'autografa', '{"resguardo":"x"}')$$, :'empresa_a', :'acuerdo_v2'),
  'el empleador firma con una modalidad distinta de la electrónica');

select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select version = 2 from public.acuerdo_pendiente(:'trab_a')), 'v2 queda pendiente de la firma del trabajador');
select tests.afirmar((select version = 1 from public.acuerdo_vigente(:'trab_a')), 'mientras tanto sigue vigente v1');
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad, evidencia) values (%L, %L, 'trabajador', 'autografa', '{"resguardo":"x"}')$$, :'empresa_a', :'acuerdo_v2'),
  'el trabajador registra una firma autógrafa por su cuenta');
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad) values (%L, %L, 'trabajador', 'pin_kiosco')$$, :'empresa_a', :'acuerdo_v2'),
  'firmar con modalidad de kiosco fuera del kiosco');
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_v2', 'trabajador');
select tests.afirmar((select version = 2 from public.acuerdo_vigente(:'trab_a')), 'con ambas firmas, v2 pasa a ser el vigente');
select tests.afirmar((select count(*) = 0 from public.acuerdo_pendiente(:'trab_a')), 'y ya no hay nada pendiente');

select set_config('request.jwt.claim.sub', :'u_carla', false) \gset
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (%L, %L, 'trabajador')$$, :'empresa_a', :'acuerdo_v2'),
  'otra trabajadora firma el acuerdo de Ana');

-- =============================================================================
\echo '--- Firma autógrafa registrada por el empleador'
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
  values (:'empresa_a', :'trab_c', 1, 'Acuerdo de Carla', 0) returning id as acuerdo_c \gset
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_c', 'empleador');
select tests.debe_fallar(format($$insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad) values (%L, %L, 'trabajador', 'autografa')$$, :'empresa_a', :'acuerdo_c'),
  'firma autógrafa sin indicar dónde se resguarda el original');
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad, evidencia)
  values (:'empresa_a', :'acuerdo_c', 'trabajador', 'autografa', '{"resguardo": "Expediente físico, archivero RH", "fecha_firma": "2026-11-05"}');
select tests.afirmar(
  (select f.user_id = :'u_prop'::uuid and f.contenido_hash = a.contenido_hash
     from public.firmas_acuerdo f join public.acuerdos a on a.id = f.acuerdo_id
    where f.acuerdo_id = :'acuerdo_c' and f.firmante = 'trabajador'),
  'la firma autógrafa queda registrada por el empleador, ligada al hash del texto');
select tests.afirmar((select count(*) = 1 from public.acuerdo_vigente(:'trab_c')), 'el acuerdo con firma autógrafa queda vigente');

-- =============================================================================
\echo '--- Firma con PIN en el kiosco'
update public.miembros set centro_trabajo_id = null where user_id = :'u_kiosco';
insert into public.acuerdos (empresa_id, trabajador_id, version, contenido, dia_descanso)
  values (:'empresa_a', :'trab_d', 1, 'Acuerdo de Diego', 0) returning id as acuerdo_d \gset

select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(public.kiosco_identificar('050', '9157') -> 'acuerdo_pendiente' = 'null'::jsonb,
  'sin firma del empleador el kiosco no muestra el acuerdo');

select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante) values (:'empresa_a', :'acuerdo_d', 'empleador');

select set_config('request.jwt.claim.sub', :'u_kiosco', false) \gset
select tests.afirmar(
  (select r -> 'acuerdo_pendiente' ->> 'contenido' = 'Acuerdo de Diego' and length(r -> 'acuerdo_pendiente' ->> 'folio') = 12
     from public.kiosco_identificar('050', '9157') r),
  'tras el PIN, el kiosco muestra el texto y el folio del acuerdo pendiente');
select tests.afirmar(public.kiosco_firmar_acuerdo('050', '0002', :'acuerdo_d') ->> 'codigo' = 'CREDENCIALES', 'firmar con PIN incorrecto');
select tests.afirmar(public.kiosco_firmar_acuerdo('050', '9157', :'acuerdo_v2') ->> 'codigo' = 'SIN_ACUERDO', 'firmar en el kiosco el acuerdo de otra persona');
select tests.afirmar((public.kiosco_firmar_acuerdo('050', '9157', :'acuerdo_d') ->> 'ok')::boolean, 'firma con PIN en el kiosco');
select tests.afirmar(public.kiosco_firmar_acuerdo('050', '9157', :'acuerdo_d') ->> 'codigo' = 'SIN_ACUERDO', 'no se puede firmar dos veces');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(
  (select modalidad = 'pin_kiosco' and user_id = :'u_kiosco'::uuid and evidencia ->> 'numero_empleado' = '050'
     from public.firmas_acuerdo where acuerdo_id = :'acuerdo_d' and firmante = 'trabajador'),
  'la firma de kiosco queda registrada con la cuenta del kiosco y el número de empleado');
select tests.debe_fallar(format($$update public.firmas_acuerdo set modalidad = 'electronica' where acuerdo_id = %L$$, :'acuerdo_d'),
  'modificar una firma incluso como superusuario');

\echo '--- Fin acuerdos'
