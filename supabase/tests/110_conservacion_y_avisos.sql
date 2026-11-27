-- =============================================================================
-- Pruebas de la conservación después de terminar (términos 9.3) y de los avisos a los clientes
-- (términos 6.6 y 15). Continúa sobre 10–109. Simula Vault y pg_net dentro de una transacción
-- que se deshace al final, para no afectar otras pruebas.
-- =============================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned

\set u_prop  '00000000-0000-0000-0000-00000000000a'
\set u_trab  '00000000-0000-0000-0000-00000000000d'
\set u_otro  '00000000-0000-0000-0000-00000000000f'
select id as empresa_a from public.empresas where razon_social = 'Empresa A SA de CV' \gset

-- Sin Vault ni pg_net: no se envía nada ni falla.
select tests.afirmar(public.enviar_avisos_borrado() = 0, 'sin Vault ni pg_net no se manda el aviso de borrado');
select tests.debe_fallar($$select public.avisar_cambio_a_clientes('precio', current_date + 40, 'Sube el precio por persona.', null, true)$$,
  'sin Vault ni pg_net no se registra un aviso de cambio');

begin;
-- Simulación de Vault y pg_net.
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values
  ('checador_resend_llave', 're_prueba'), ('checador_url_app', 'https://checador.ejemplo.mx/'), ('checador_remitente', 'Checador <avisos@ejemplo.mx>');
create schema net;
create table net.enviados (id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
create table net._http_response (id bigint, status_code int, content text, error_msg text);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$
  insert into net.enviados (url, body, headers) values (url, body, headers) returning id
$$;
update auth.users set email = 'propietaria@empresa-a.mx' where id = :'u_prop';

create function pg_temp.conservar_hasta(p_empresa uuid) returns timestamptz language sql as $$
  select (public._cobro_situacion(p_empresa) ->> 'conservar_hasta')::timestamptz
$$;

-- Conservación: 12 meses desde la suspensión.
select tests.afirmar(pg_temp.conservar_hasta(:'empresa_a') is null, 'sin suspensión no hay fecha de borrado');
update public.suscripciones set estado = 'cancelada', pago_vencido_desde = null, periodo_fin = now() - interval '2 months' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.conservar_hasta(:'empresa_a') = (select periodo_fin + interval '12 months' from public.suscripciones where empresa_id = :'empresa_a'),
  'cancelada: se conserva 12 meses desde el fin del periodo pagado');
update public.suscripciones set estado = 'pago_vencido', periodo_fin = null, pago_vencido_desde = now() - interval '40 days' where empresa_id = :'empresa_a';
select tests.afirmar(pg_temp.conservar_hasta(:'empresa_a') = (select pago_vencido_desde + interval '30 days' + interval '12 months' from public.suscripciones where empresa_id = :'empresa_a'),
  'pago vencido: 12 meses desde la suspensión (día 30)');
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar((public.situacion_cobro(:'empresa_a') ->> 'conservar_hasta') is not null, 'el panel recibe la fecha de borrado');
reset role;

-- Aviso de borrado: no antes de 30 días del vencimiento.
update public.suscripciones set estado = 'cancelada', pago_vencido_desde = null, periodo_fin = now() - interval '12 months' + interval '45 days' where empresa_id = :'empresa_a';
select tests.afirmar(public.enviar_avisos_borrado() = 0, 'a 45 días del borrado todavía no se avisa');
update public.suscripciones set periodo_fin = now() - interval '12 months' + interval '20 days' where empresa_id = :'empresa_a';
select tests.afirmar(public.enviar_avisos_borrado() = 1, 'a 20 días del borrado se avisa al propietario');
select tests.afirmar((select body -> 0 ->> 'to' from net.enviados order by id desc limit 1) = '["propietaria@empresa-a.mx"]', 'el aviso va al propietario');
select tests.afirmar((select body -> 0 ->> 'subject' from net.enviados order by id desc limit 1) like 'Tus registros de Empresa A SA de CV en Checador se borrarán después del %',
  'el asunto dice la fecha de borrado');
select tests.afirmar((select body -> 0 ->> 'html' from net.enviados order by id desc limit 1) like '%https://checador.ejemplo.mx/panel/exportar%',
  'el aviso enlaza a la exportación');
select tests.afirmar(public.enviar_avisos_borrado() = 0, 'el aviso no se repite');
-- Un envío fallido se reintenta.
insert into net._http_response values ((select max(id) from net.enviados), 422, 'dirección inválida', null);
select public.revisar_correos_clientes();
select tests.afirmar((select estado from public.correos_clientes where tipo = 'borrado' order by id desc limit 1) = 'fallido', 'se anota el envío fallido');
select tests.afirmar(public.enviar_avisos_borrado() = 1, 'tras un envío fallido se vuelve a avisar');
insert into net._http_response values ((select max(id) from net.enviados), 200, '{}', null);
select public.revisar_correos_clientes();
select tests.afirmar((select estado from public.correos_clientes where tipo = 'borrado' order by id desc limit 1) = 'enviado', 'se anota el envío entregado');

-- Empresas por borrar: solo con el plazo vencido y 30 días después del aviso entregado.
select tests.afirmar(not exists (select 1 from public.empresas_por_borrar() where empresa_id = :'empresa_a'), 'con el plazo vigente no aparece por borrar');
update public.suscripciones set periodo_fin = now() - interval '12 months' - interval '1 day' where empresa_id = :'empresa_a';
-- Cambió la fecha de borrado: el aviso anterior no cuenta y se manda uno nuevo.
select tests.afirmar((select not lista_para_borrar and aviso_entregado_en is null from public.empresas_por_borrar() where empresa_id = :'empresa_a'),
  'vencida sin aviso entregado para esa fecha: aparece, pero no lista para borrar');
select tests.afirmar(public.enviar_avisos_borrado() = 1, 'con la fecha nueva se avisa de nuevo');
insert into net._http_response values ((select max(id) from net.enviados), 200, '{}', null);
select public.revisar_correos_clientes();
select tests.afirmar((select not lista_para_borrar and borrar_desde > now() + interval '29 days' from public.empresas_por_borrar() where empresa_id = :'empresa_a'),
  'aviso recién entregado: no se borra sino 30 días después');
update public.correos_clientes set enviado_en = now() - interval '31 days' where tipo = 'borrado' and estado = 'enviado';
select tests.afirmar((select lista_para_borrar from public.empresas_por_borrar() where empresa_id = :'empresa_a'),
  'plazo vencido y aviso de hace más de 30 días: lista para borrar');
-- Si vuelve a contratar, ya no se borra.
update public.suscripciones set estado = 'activa', periodo_fin = now() + interval '20 days' where empresa_id = :'empresa_a';
select tests.afirmar(not exists (select 1 from public.empresas_por_borrar() where empresa_id = :'empresa_a'), 'si vuelve a contratar ya no aparece por borrar');

-- Avisos de cambios.
select tests.debe_fallar($$select public.avisar_cambio_a_clientes('precio', current_date + 10, 'Sube el precio por persona.', null, true)$$,
  'un cambio con menos de 30 días de anticipación');
select tests.debe_fallar($$select public.avisar_cambio_a_clientes('otro', current_date + 40, 'Sube el precio por persona.')$$, 'un tipo de cambio inválido');
select tests.debe_fallar($$select public.avisar_cambio_a_clientes('precio', current_date + 40, 'corto')$$, 'un resumen vacío o muy corto');
select tests.afirmar((select (v ->> 'enviado')::boolean = false and (v ->> 'correos')::int >= 1 and v -> 'ejemplo' ? 'subject'
                        from public.avisar_cambio_a_clientes('precio', current_date + 40, 'Sube el precio por persona.') v),
  'sin p_enviar solo muestra a cuántos se avisaría y un ejemplo');
select tests.afirmar(not exists (select 1 from public.avisos_cambios), 'la vista previa no registra el aviso');
select tests.afirmar((public.avisar_cambio_a_clientes('precio', current_date + 40, 'La persona adicional pasa de $50 a $55 al mes.', 'https://jemba.mx/precios', true) ->> 'correos')::int >= 1,
  'con p_enviar registra el aviso y manda los correos');
select tests.afirmar((select body::text like '%propietaria@empresa-a.mx%' and body::text like '%https://jemba.mx/precios%' from net.enviados order by id desc limit 1),
  'el aviso de cambio va a los propietarios con el enlace');
select tests.afirmar((select count(*) from public.correos_clientes where tipo = 'cambio') >= 1, 'cada aviso de cambio queda en la bitácora de correos');
select tests.debe_fallar($$update public.avisos_cambios set resumen = 'Otro texto distinto'$$, 'modificar un aviso de cambio');

-- Lectura desde la API: los miembros ven los avisos; el personal y otras cuentas no ven la bitácora.
set role authenticated;
select set_config('request.jwt.claim.sub', :'u_prop', false) \gset
select tests.afirmar((select count(*) from public.avisos_cambios) = 1, 'un miembro del panel ve el aviso de cambio');
select tests.debe_fallar($$select count(*) from public.correos_clientes$$, 'leer la bitácora de correos desde la API');
select tests.debe_fallar($$insert into public.avisos_cambios (tipo, vigente_desde, resumen) values ('precio', current_date, 'Aviso falso desde la API')$$,
  'publicar un aviso desde la API');
select tests.debe_fallar($$select public.avisar_cambio_a_clientes('precio', current_date + 40, 'Sube el precio por persona.')$$, 'avisar cambios desde la API');
select tests.debe_fallar($$select public.enviar_avisos_borrado()$$, 'mandar avisos de borrado desde la API');
select tests.debe_fallar($$select * from public.empresas_por_borrar()$$, 'listar empresas por borrar desde la API');
select set_config('request.jwt.claim.sub', :'u_trab', false) \gset
select tests.afirmar((select count(*) from public.avisos_cambios) = 0, 'el personal (sin panel) no ve los avisos de cambio');
reset role;
set role anon;
select tests.debe_fallar($$select count(*) from public.avisos_cambios$$, 'leer avisos sin sesión');
reset role;
rollback;
