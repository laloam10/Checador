-- =============================================================================
-- Pruebas de la checada por WhatsApp. Continúa sobre 10–95.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop   '00000000-0000-0000-0000-00000000000a'
\set u_otro   '00000000-0000-0000-0000-00000000000f'
\set secreto  'secreto-de-prueba-0123456789abcdef0123456789abcdef'
\set malo     'otro-secreto-0123456789abcdef0123456789abcdef0000'

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select id as empresa_a, (select id from public.centros_trabajo where empresa_id = e.id order by creado_en limit 1) as centro_a
  from public.empresas e where razon_social = 'Empresa A SA de CV' \gset
select tests.debe_fallar($$select public.configurar_secreto_servicio('whatsapp', 'corto')$$, 'secreto de servicio corto');
select public.configurar_secreto_servicio('whatsapp', :'secreto');

set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.debe_fallar($$select count(*) from public.secretos_servicio$$, 'leer la huella del secreto por la API');
select tests.debe_fallar($$select public.configurar_secreto_servicio('whatsapp', repeat('x', 40))$$, 'cambiar el secreto por la API');

\echo '--- Teléfono en la ficha'
insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, telefono)
  values (:'empresa_a', :'centro_a', 'Wendy WhatsApp', '0970', '2026-01-01', '(55) 1234-5678') returning id as w \gset
select tests.afirmar((select telefono = '525512345678' from public.trabajadores where id = :'w'),
  'diez dígitos se guardan con el código de México');
update public.trabajadores set telefono = '+52 1 55 1234 5678' where id = :'w';
select tests.afirmar((select telefono = '525512345678' from public.trabajadores where id = :'w'),
  'el formato 521 de WhatsApp se normaliza a 52');
select tests.debe_fallar(format($$update public.trabajadores set telefono = '12345' where id = %L$$, :'w'), 'teléfono demasiado corto');
select tests.debe_fallar(format($$update public.trabajadores set telefono_verificado_en = now() where id = %L$$, :'w'),
  'el empleador marca el teléfono como verificado');
select tests.debe_fallar(format(
  $$insert into public.trabajadores (empresa_id, centro_trabajo_id, nombre, numero_empleado, fecha_ingreso, telefono)
    values (%L, %L, 'Repetido', '0971', '2026-01-01', '5512345678')$$, :'empresa_a', :'centro_a'),
  'dos personas activas con el mismo teléfono');
select tests.debe_fallar($$select count(*) from public.codigos_whatsapp$$, 'leer los códigos de activación por la API');
select set_config('request.jwt.claim.sub', :'u_otro', false) \gset
select tests.debe_fallar(format($$select public.generar_codigo_whatsapp(%L)$$, :'w'), 'otra empresa genera el código');
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset

\echo '--- Sin el secreto no hay nada'
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(public.whatsapp_estado(:'malo', '5215512345678') ->> 'codigo' = 'NO_AUTORIZADO', 'estado con secreto incorrecto');
select tests.afirmar(public.whatsapp_vincular(:'malo', '5215512345678', '7391') ->> 'codigo' = 'NO_AUTORIZADO', 'vincular con secreto incorrecto');
select tests.afirmar(
  public.whatsapp_checar(:'malo', '5215512345678', 'entrada', '00000000-0000-4000-8000-000000000970') ->> 'codigo' = 'NO_AUTORIZADO',
  'checar con secreto incorrecto');
select tests.afirmar(public.whatsapp_estado(null, '5215512345678') ->> 'codigo' = 'NO_AUTORIZADO', 'estado sin secreto');

\echo '--- Estado y vinculación'
select tests.afirmar(public.whatsapp_estado(:'secreto', '5219999999999') = '{"ok": true, "registrado": false}'::jsonb,
  'número desconocido');
select tests.afirmar(
  public.whatsapp_estado(:'secreto', '5215512345678') = '{"ok": true, "registrado": true, "vinculado": false, "tiene_codigo": false}'::jsonb,
  'sin vincular no se revela nombre ni empresa');
select tests.afirmar(public.whatsapp_vincular(:'secreto', '5215512345678', '123456') ->> 'codigo' = 'SIN_CODIGO', 'sin código generado no se activa');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'w') as codigo \gset
select tests.afirmar(:'codigo' ~ '^[0-9]{6}$', 'el código es de 6 dígitos');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar((public.whatsapp_estado(:'secreto', '5215512345678') ->> 'tiene_codigo')::boolean, 'el estado indica que hay un código vigente');
select tests.afirmar(
  public.whatsapp_checar(:'secreto', '5215512345678', 'entrada', '00000000-0000-4000-8000-000000000970') ->> 'codigo' = 'NO_VINCULADO',
  'no se checa sin vincular');
select tests.afirmar(public.whatsapp_vincular(:'secreto', '5215512345678', 'xxxxxx') ->> 'codigo' = 'INCORRECTO', 'código incorrecto');
select tests.afirmar(public.whatsapp_vincular(:'secreto', '5219999999999', :'codigo') ->> 'codigo' = 'NO_REGISTRADO', 'vincular un número desconocido');
select tests.afirmar((public.whatsapp_vincular(:'secreto', '5215512345678', :'codigo') ->> 'ok')::boolean, 'el código correcto activa');
select tests.afirmar(public.whatsapp_vincular(:'secreto', '5215512345678', :'codigo') ->> 'codigo' = 'SIN_CODIGO', 'el código sirve una sola vez');
select tests.afirmar(
  (select e ->> 'nombre' = 'Wendy WhatsApp' and e ->> 'empresa' = 'Empresa A SA de CV' and (e ->> 'vinculado')::boolean
          and e -> 'eventos' = '[]'::jsonb
     from public.whatsapp_estado(:'secreto', '5215512345678') e),
  'vinculado: nombre, empresa y sin eventos');

\echo '--- Checada'
select tests.afirmar(
  (select (r ->> 'ok')::boolean and r ->> 'secuencia' is not null and r ->> 'duplicado' is null
     from public.whatsapp_checar(:'secreto', '5215512345678', 'entrada', '00000000-0000-4000-8000-000000000971', '{"wamid": "wamid.A"}') r),
  'registra la entrada');
select tests.afirmar(
  (select (r ->> 'duplicado')::boolean
     from public.whatsapp_checar(:'secreto', '5215512345678', 'entrada', '00000000-0000-4000-8000-000000000971', '{"wamid": "wamid.A"}') r),
  'el reintento de Meta no duplica');
select tests.afirmar(
  public.whatsapp_checar(:'secreto', '5215512345678', 'correccion', '00000000-0000-4000-8000-000000000972') ->> 'codigo' = 'TIPO',
  'no se registran correcciones por WhatsApp');
select tests.afirmar(
  (public.whatsapp_checar(:'secreto', '5215512345678', 'inicio_pausa', '00000000-0000-4000-8000-000000000973') ->> 'ok')::boolean,
  'registra la pausa');
select tests.afirmar(
  jsonb_array_length(public.whatsapp_estado(:'secreto', '5215512345678') -> 'eventos') = 2, 'el estado incluye los eventos recientes');

reset role;
select tests.afirmar(
  (select count(*) = 2 and bool_and(origen = 'whatsapp') and bool_and(evidencia ->> 'telefono' = '525512345678')
          and bool_and(hora_servidor is not null)
     from public.eventos where trabajador_id = :'w'),
  'los eventos quedan con origen whatsapp, teléfono y hora del servidor');
select tests.afirmar(
  (select e.puede_salir is not distinct from c.pausa_puede_salir
     from public.eventos e join public.centros_trabajo c on c.id = :'centro_a'
    where e.trabajador_id = :'w' and e.tipo = 'inicio_pausa'),
  'la pausa toma la regla del centro (art. 64)');

\echo '--- Cambio de teléfono, intentos y vencimiento'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'w') as viejo \gset
update public.trabajadores set telefono = '5587654321' where id = :'w';
select tests.afirmar((select telefono_verificado_en is null from public.trabajadores where id = :'w'),
  'cambiar el teléfono quita la verificación');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(public.whatsapp_estado(:'secreto', '5215512345678') = '{"ok": true, "registrado": false}'::jsonb,
  'el teléfono anterior deja de estar registrado');
select tests.afirmar(public.whatsapp_vincular(:'secreto', '525587654321', :'viejo') ->> 'codigo' = 'SIN_CODIGO',
  'un código generado para el celular anterior no activa el nuevo');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'w') as codigo \gset
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select public.whatsapp_vincular(:'secreto', '525587654321', 'xxxxxx') from generate_series(1, 5) \g /dev/null
select tests.afirmar(public.whatsapp_vincular(:'secreto', '525587654321', :'codigo') ->> 'codigo' = 'SIN_CODIGO',
  'cinco intentos fallidos anulan el código, aunque el sexto sea correcto');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'w') as codigo \gset
reset role;
update public.codigos_whatsapp set expira_en = now() - interval '1 minute' where trabajador_id = :'w';
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(public.whatsapp_vincular(:'secreto', '525587654321', :'codigo') ->> 'codigo' = 'SIN_CODIGO', 'un código vencido no activa');

\echo '--- La baja corta el acceso'
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select public.generar_codigo_whatsapp(:'w') as codigo \gset
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar((public.whatsapp_vincular(:'secreto', '525587654321', :'codigo') ->> 'ok')::boolean, 'se activa de nuevo');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
update public.trabajadores set fecha_baja = current_date where id = :'w';
select tests.debe_fallar(format($$select public.generar_codigo_whatsapp(%L)$$, :'w'), 'generar código para una persona dada de baja');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \gset
select tests.afirmar(
  public.whatsapp_checar(:'secreto', '525587654321', 'salida', '00000000-0000-4000-8000-000000000974') ->> 'codigo' = 'NO_VINCULADO',
  'una persona dada de baja no checa');

reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
\echo 'WhatsApp: pruebas correctas.'
