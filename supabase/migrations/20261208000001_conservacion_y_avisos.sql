-- =============================================================================
-- Checador: conservación después de terminar y avisos a los clientes
--
-- * Conservación (términos, cláusulas 7.2 y 9.3; LFT art. 804): una empresa suspendida
--   (cancelada, prueba terminada sin pago o pago vencido de más de 30 días) conserva el acceso
--   de solo lectura y la exportación durante 12 meses desde la suspensión. _cobro_situacion
--   agrega `conservar_hasta`; el panel lo muestra.
--   El borrado NO es automático: la bitácora es de solo inserción y antes de borrar hay que
--   revisar que no haya una obligación legal de conservar (juicio, inspección). Jemba revisa
--   empresas_por_borrar() y borra a mano (docs/cobro.md, «Conservación y borrado»).
-- * Aviso de borrado: 30 días antes de `conservar_hasta`, un correo a cada propietario
--   (enviar_avisos_borrado, diario). Nunca se borra antes de 30 días después del aviso.
-- * Avisos de cambios (términos 6.6 y 15): avisar_cambio_a_clientes() la corre Jemba desde el
--   editor SQL; exige al menos 30 días de anticipación, manda un correo a cada propietario y
--   el panel muestra el cambio hasta que entra en vigor.
-- Los correos usan el mismo mecanismo que los recordatorios (pg_net + Resend + Vault).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Situación de cobro: misma lógica que 20261206000001, más `conservar_hasta`.
-- -----------------------------------------------------------------------------
create or replace function public._cobro_situacion(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (
    select su.*,
           case
             when su.estado = 'pago_vencido' then su.pago_vencido_desde
             -- Prueba terminada sin forma de pago (con tarjeta, el proveedor cobra al terminar).
             when su.estado = 'prueba' and su.suscripcion_externa is null and su.prueba_hasta <= now() then su.prueba_hasta
           end as base,
           -- Pago vencido: 15 días de aviso y suspensión a los 30. Prueba terminada: 1 día y 7.
           case when su.estado = 'pago_vencido' then interval '15 days' else interval '1 day' end as gracia,
           case when su.estado = 'pago_vencido' then interval '30 days' else interval '7 days' end as suspension
      from public.suscripciones su where su.empresa_id = p_empresa
  ),
  v as (
    select case
      when not exists (select 1 from s) then jsonb_build_object('nivel', 'ninguna')
      when (select estado from s) = 'cancelada' then
        jsonb_build_object('nivel', 'suspendida', 'motivo', 'cancelada', 'suspendida_desde', (select coalesce(periodo_fin, actualizada_en) from s))
      when (select base from s) is null then jsonb_build_object('nivel', 'ninguna')
      else (select jsonb_build_object(
              'nivel', case when now() < base + gracia then 'aviso'
                            when now() < base + suspension then 'solo_lectura'
                            else 'suspendida' end,
              'motivo', case when estado = 'pago_vencido' then 'pago_vencido' else 'prueba_terminada' end,
              'desde', base,
              'solo_lectura_desde', base + gracia,
              'suspendida_desde', base + suspension) from s)
    end as j
  )
  -- Términos 9.3: 12 meses de solo lectura y exportación desde la suspensión.
  select case when j ->> 'nivel' = 'suspendida'
              then j || jsonb_build_object('conservar_hasta', (j ->> 'suspendida_desde')::timestamptz + interval '12 months')
              else j end
    from v
$$;

-- -----------------------------------------------------------------------------
-- Avisos de cambios de precio, términos o aviso de privacidad. Solo inserción: es la
-- evidencia de qué se avisó y cuándo. Lo leen los miembros de cualquier empresa (es el mismo
-- aviso para todos); lo escribe solo avisar_cambio_a_clientes().
-- -----------------------------------------------------------------------------
create table public.avisos_cambios (
  id             bigint generated always as identity primary key,
  tipo           text not null check (tipo in ('precio', 'terminos', 'privacidad')),
  vigente_desde  date not null,
  resumen        text not null check (length(resumen) between 10 and 1000),
  enlace         text check (enlace ~ '^https://[^\s]+$' and length(enlace) <= 500),
  creado_en      timestamptz not null default now()
);
create index avisos_cambios_vigente_idx on public.avisos_cambios (vigente_desde);
alter table public.avisos_cambios enable row level security;
create policy avisos_cambios_select on public.avisos_cambios for select to authenticated
  using (exists (select 1 from public.miembros m where m.user_id = (select auth.uid())));
revoke all on public.avisos_cambios from public, anon, authenticated;
grant select on public.avisos_cambios to authenticated;
create trigger avisos_cambios_solo_insercion before update or delete on public.avisos_cambios
  for each row execute function public.prohibir_modificacion();

-- -----------------------------------------------------------------------------
-- Bitácora de correos a los clientes (aviso de borrado y avisos de cambios). Nadie de la API
-- la lee: es para Jemba (por ejemplo, para demostrar que avisó antes de borrar).
-- -----------------------------------------------------------------------------
create table public.correos_clientes (
  id               bigint generated always as identity primary key,
  tipo             text not null check (tipo in ('borrado', 'cambio')),
  empresa_id       uuid not null references public.empresas (id),
  correo           text not null,
  conservar_hasta  timestamptz,
  aviso_cambio_id  bigint references public.avisos_cambios (id),
  enviado_en       timestamptz not null default now(),
  -- Identificador de la petición en pg_net (net._http_response).
  solicitud_id     bigint,
  -- null mientras no se conoce la respuesta.
  estado           text check (estado in ('enviado', 'fallido')),
  detalle          text,
  check ((tipo = 'borrado') = (conservar_hasta is not null)),
  check ((tipo = 'cambio') = (aviso_cambio_id is not null))
);
create index correos_clientes_empresa_idx on public.correos_clientes (empresa_id, tipo, enviado_en desc);
create index correos_clientes_pendientes_idx on public.correos_clientes (solicitud_id) where estado is null;
alter table public.correos_clientes enable row level security;
revoke all on public.correos_clientes from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ayudantes de correo
-- -----------------------------------------------------------------------------

-- Fecha en español: «27 de noviembre de 2026».
create function public._fecha_texto(p date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select format('%s de %s de %s', extract(day from p),
    (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
           'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from p)::int], extract(year from p))
$$;

-- Botón de un correo.
create function public._correo_boton(p_url text, p_texto text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select format('<p style="margin:20px 0"><a href="%s" style="display:inline-block;padding:12px 18px;border-radius:10px;'
    || 'background:#24560c;color:#ffffff;text-decoration:none;font-weight:600">%s</a></p>',
    public._html(p_url), public._html(p_texto))
$$;

-- Secretos de Resend en Vault; null si faltan Vault, pg_net o algún secreto.
create function public._resend_secretos() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  execute $q$
    select jsonb_build_object(
      'llave', max(decrypted_secret) filter (where name = 'checador_resend_llave'),
      'url_app', rtrim(max(decrypted_secret) filter (where name = 'checador_url_app'), '/'),
      'remitente', max(decrypted_secret) filter (where name = 'checador_remitente'),
      'url_api', coalesce(max(decrypted_secret) filter (where name = 'checador_resend_url'), 'https://api.resend.com/emails/batch'))
      from vault.decrypted_secrets
     where name in ('checador_resend_llave', 'checador_url_app', 'checador_remitente', 'checador_resend_url')
  $q$ into v;
  if v ->> 'llave' is null or v ->> 'url_app' is null or v ->> 'remitente' is null then
    return null;
  end if;
  return v;
end;
$$;

-- Manda un lote (hasta 100 correos, límite de Resend en /emails/batch); devuelve la solicitud.
create function public._resend_enviar(p_secretos jsonb, p_correos jsonb) returns bigint
language plpgsql set search_path = '' as $$
declare
  v_id bigint;
begin
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 15000)'
    into v_id
    using p_secretos ->> 'url_api', p_correos,
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (p_secretos ->> 'llave'));
  return v_id;
end;
$$;

-- Propietarios de una empresa, con su correo.
create function public._propietarios(p_empresa uuid) returns table (correo text)
language sql stable set search_path = '' as $$
  select distinct u.email::text from public.miembros m join auth.users u on u.id = m.user_id
   where m.empresa_id = p_empresa and m.rol = 'propietario' and u.email is not null
$$;

-- -----------------------------------------------------------------------------
-- Aviso de borrado (términos 9.3)
-- -----------------------------------------------------------------------------

create function public._correo_aviso_borrado(
  p_razon_social text, p_correo text, p_motivo text, p_suspendida_desde date, p_conservar_hasta date,
  p_remitente text, p_url_app text
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_causa text := case p_motivo
    when 'cancelada' then format('La suscripción de %s a Checador terminó el %s.', p_razon_social, public._fecha_texto(p_suspendida_desde))
    else format('El servicio de Checador para %s está suspendido por falta de pago desde el %s.', p_razon_social, public._fecha_texto(p_suspendida_desde))
  end;
  v_url text := p_url_app || '/panel/exportar';
  v_html text;
  v_texto text;
begin
  v_html := '<p style="margin:0 0 12px;font-size:17px;font-weight:700">Tus registros se borrarán pronto</p>'
    || format('<p style="margin:0 0 12px">%s Conservamos tus registros en solo lectura durante 12 meses para que puedas consultarlos y exportarlos.</p>', public._html(v_causa))
    || format('<p style="margin:0 0 12px"><strong>Después del %s los borraremos.</strong> La ley te obliga a conservar los controles de asistencia (Ley Federal del Trabajo, artículo 804): exporta tus registros antes de esa fecha y guárdalos.</p>',
              public._fecha_texto(p_conservar_hasta))
    || public._correo_boton(v_url, 'Exportar mis registros')
    || '<p style="margin:0">Si quieres seguir usando Checador, contrata de nuevo desde Configuración → Suscripción y tus registros se conservan.</p>';
  v_texto := v_causa || E' Conservamos tus registros en solo lectura durante 12 meses para que puedas consultarlos y exportarlos.\n\n'
    || format(E'Después del %s los borraremos. La ley te obliga a conservar los controles de asistencia (Ley Federal del Trabajo, artículo 804): exporta tus registros antes de esa fecha y guárdalos.\n\n', public._fecha_texto(p_conservar_hasta))
    || format(E'Exportar: %s\n\n', v_url)
    || 'Si quieres seguir usando Checador, contrata de nuevo desde Configuración → Suscripción y tus registros se conservan.';
  return jsonb_build_object(
    'from', p_remitente,
    'to', jsonb_build_array(p_correo),
    'subject', format('Tus registros de %s en Checador se borrarán después del %s', p_razon_social, public._fecha_texto(p_conservar_hasta)),
    'html', public._correo_marco(v_html,
      format('Recibes este correo porque eres propietario de la cuenta de %s en Checador.', public._html(p_razon_social))),
    'text', v_texto);
end;
$$;

-- Empresas que deben recibir el aviso: suspendidas, a 30 días o menos de `conservar_hasta`,
-- sin un aviso enviado (o en camino) para esa fecha. Un envío fallido se reintenta al día siguiente.
create function public.empresas_por_avisar_borrado()
returns table (empresa_id uuid, razon_social text, motivo text, suspendida_desde timestamptz, conservar_hasta timestamptz)
language sql stable set search_path = '' as $$
  select e.id, e.razon_social, x.s ->> 'motivo', (x.s ->> 'suspendida_desde')::timestamptz, (x.s ->> 'conservar_hasta')::timestamptz
    from public.empresas e
    join public.suscripciones su on su.empresa_id = e.id
    cross join lateral (select public._cobro_situacion(e.id) as s) x
   where x.s ->> 'nivel' = 'suspendida'
     and (x.s ->> 'conservar_hasta')::timestamptz - interval '30 days' <= now()
     and not exists (select 1 from public.correos_clientes c
                      where c.tipo = 'borrado' and c.empresa_id = e.id
                        and c.conservar_hasta = (x.s ->> 'conservar_hasta')::timestamptz
                        and c.estado is distinct from 'fallido')
$$;

create function public.enviar_avisos_borrado() returns integer
language plpgsql set search_path = '' as $$
declare
  v_sec     jsonb := public._resend_secretos();
  v_correos jsonb := '[]';
  v_filas   jsonb := '[]';
  v_total   integer := 0;
  v_sol     bigint;
  r         record;
  p         record;
begin
  if v_sec is null then
    raise notice 'Avisos de borrado: faltan Vault, pg_net o secretos de Resend; no se envía nada.';
    return 0;
  end if;
  for r in select * from public.empresas_por_avisar_borrado() loop
    for p in select * from public._propietarios(r.empresa_id) loop
      v_correos := v_correos || jsonb_build_array(public._correo_aviso_borrado(
        r.razon_social, p.correo, r.motivo,
        (r.suspendida_desde at time zone 'America/Mexico_City')::date,
        (r.conservar_hasta at time zone 'America/Mexico_City')::date,
        v_sec ->> 'remitente', v_sec ->> 'url_app'));
      v_filas := v_filas || jsonb_build_array(jsonb_build_object(
        'empresa_id', r.empresa_id, 'correo', p.correo, 'conservar_hasta', r.conservar_hasta));
      if jsonb_array_length(v_correos) = 100 then
        v_sol := public._resend_enviar(v_sec, v_correos);
        insert into public.correos_clientes (tipo, empresa_id, correo, conservar_hasta, solicitud_id)
        select 'borrado', x.empresa_id, x.correo, x.conservar_hasta, v_sol
          from jsonb_to_recordset(v_filas) as x(empresa_id uuid, correo text, conservar_hasta timestamptz);
        v_total := v_total + 100;
        v_correos := '[]';
        v_filas := '[]';
      end if;
    end loop;
  end loop;
  if jsonb_array_length(v_correos) > 0 then
    v_sol := public._resend_enviar(v_sec, v_correos);
    insert into public.correos_clientes (tipo, empresa_id, correo, conservar_hasta, solicitud_id)
    select 'borrado', x.empresa_id, x.correo, x.conservar_hasta, v_sol
      from jsonb_to_recordset(v_filas) as x(empresa_id uuid, correo text, conservar_hasta timestamptz);
    v_total := v_total + jsonb_array_length(v_correos);
  end if;
  raise notice 'Avisos de borrado: % correo(s) en cola.', v_total;
  return v_total;
end;
$$;

-- Para Jemba, en el editor SQL: empresas cuyo plazo de conservación ya venció. Se pueden borrar
-- cuando `lista_para_borrar` (el aviso se entregó hace al menos 30 días), después de revisar a
-- mano que no haya una obligación legal de conservar (docs/cobro.md).
create function public.empresas_por_borrar()
returns table (empresa_id uuid, razon_social text, motivo text, suspendida_desde timestamptz,
               conservar_hasta timestamptz, aviso_entregado_en timestamptz, borrar_desde timestamptz,
               lista_para_borrar boolean)
language sql stable set search_path = '' as $$
  select e.id, e.razon_social, x.s ->> 'motivo', (x.s ->> 'suspendida_desde')::timestamptz, h.conservar_hasta,
         a.entregado, greatest(h.conservar_hasta, a.entregado + interval '30 days'),
         a.entregado is not null and greatest(h.conservar_hasta, a.entregado + interval '30 days') <= now()
    from public.empresas e
    join public.suscripciones su on su.empresa_id = e.id
    cross join lateral (select public._cobro_situacion(e.id) as s) x
    cross join lateral (select (x.s ->> 'conservar_hasta')::timestamptz as conservar_hasta) h
    cross join lateral (select min(c.enviado_en) as entregado from public.correos_clientes c
                         where c.tipo = 'borrado' and c.empresa_id = e.id
                           and c.conservar_hasta = h.conservar_hasta and c.estado = 'enviado') a
   where x.s ->> 'nivel' = 'suspendida' and h.conservar_hasta <= now()
   order by h.conservar_hasta
$$;

-- -----------------------------------------------------------------------------
-- Avisos de cambios (términos 6.6 y 15)
-- -----------------------------------------------------------------------------

create function public._correo_aviso_cambio(
  p_razon_social text, p_correo text, p_tipo text, p_vigente_desde date, p_resumen text, p_enlace text,
  p_remitente text, p_url_app text
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_que text := case p_tipo when 'precio' then 'cambia el precio de Checador'
                            when 'terminos' then 'cambian los términos del servicio de Checador'
                            else 'cambia el aviso de privacidad de Checador' end;
  v_despues text := case p_tipo
    when 'precio' then 'El nuevo precio se aplica desde el periodo que empiece en esa fecha o después. Si no estás de acuerdo, puedes cancelar antes desde Configuración → Suscripción.'
    when 'terminos' then 'Si no estás de acuerdo, puedes cancelar antes de esa fecha desde Configuración → Suscripción; seguir usando Checador después implica aceptarlos.'
    else 'Si tienes dudas sobre el uso de tus datos, responde a este correo.' end;
  v_html text;
  v_texto text;
begin
  v_html := format('<p style="margin:0 0 12px;font-size:17px;font-weight:700">Aviso de cambio</p>')
    || format('<p style="margin:0 0 12px">A partir del <strong>%s</strong> %s.</p>', public._fecha_texto(p_vigente_desde), public._html(v_que))
    || format('<p style="margin:0 0 12px;padding:12px 14px;border:1px solid #dfe6cf;border-radius:10px;background:#fbfcf7">%s</p>',
              replace(public._html(p_resumen), E'\n', '<br>'))
    || case when p_enlace is not null then public._correo_boton(p_enlace, 'Ver el detalle') else '' end
    || format('<p style="margin:0">%s</p>', public._html(v_despues));
  v_texto := format(E'A partir del %s %s.\n\n%s\n\n', public._fecha_texto(p_vigente_desde), v_que, p_resumen)
    || case when p_enlace is not null then format(E'Detalle: %s\n\n', p_enlace) else '' end
    || v_despues;
  return jsonb_build_object(
    'from', p_remitente,
    'to', jsonb_build_array(p_correo),
    'subject', format('Aviso: a partir del %s %s', public._fecha_texto(p_vigente_desde), v_que),
    'html', public._correo_marco(v_html,
      format('Recibes este aviso porque eres propietario de la cuenta de %s en Checador. Panel: %s',
             public._html(p_razon_social), public._html(p_url_app || '/panel'))),
    'text', v_texto);
end;
$$;

-- Destinatarios: propietarios de las empresas con el servicio vigente (en prueba, activas o con
-- pago vencido). Las canceladas ya no tienen relación de servicio que cambie.
create function public._destinatarios_aviso_cambio()
returns table (empresa_id uuid, razon_social text, correo text)
language sql stable set search_path = '' as $$
  select e.id, e.razon_social, p.correo
    from public.empresas e
    join public.suscripciones su on su.empresa_id = e.id and su.estado in ('prueba', 'activa', 'pago_vencido')
    cross join lateral public._propietarios(e.id) p
   order by e.razon_social, p.correo
$$;

-- Para Jemba, en el editor SQL. Sin p_enviar => true solo muestra a cuántos se avisaría y un
-- ejemplo del correo; con true registra el aviso (lo muestra el panel) y manda los correos.
--   select public.avisar_cambio_a_clientes('precio', '2027-03-01', 'La persona adicional del tramo 3 a 10 pasa de $50 a $55 al mes, más IVA.');
--   select public.avisar_cambio_a_clientes('precio', '2027-03-01', '...', null, true);
create function public.avisar_cambio_a_clientes(
  p_tipo text, p_vigente_desde date, p_resumen text, p_enlace text default null, p_enviar boolean default false
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_hoy      date := (now() at time zone 'America/Mexico_City')::date;
  v_sec      jsonb := public._resend_secretos();
  v_aviso    bigint;
  v_correos  jsonb := '[]';
  v_filas    jsonb := '[]';
  v_total    integer := 0;
  v_empresas integer;
  v_sol      bigint;
  r          record;
begin
  if p_tipo is null or p_tipo not in ('precio', 'terminos', 'privacidad') then
    raise exception 'Tipo inválido: usa precio, terminos o privacidad' using errcode = 'check_violation';
  end if;
  -- Términos 6.6 y 15: al menos 30 días de anticipación.
  if p_vigente_desde is null or p_vigente_desde < v_hoy + 30 then
    raise exception 'El cambio debe entrar en vigor al menos 30 días después de hoy (el %), según los términos 6.6 y 15', v_hoy + 30
      using errcode = 'check_violation';
  end if;
  if p_resumen is null or length(trim(p_resumen)) < 10 then
    raise exception 'Escribe un resumen del cambio (al menos 10 caracteres)' using errcode = 'check_violation';
  end if;

  select count(*), count(distinct d.empresa_id) into v_total, v_empresas from public._destinatarios_aviso_cambio() d;
  if not p_enviar then
    return jsonb_build_object(
      'enviado', false,
      'empresas', v_empresas,
      'correos', v_total,
      'ejemplo', public._correo_aviso_cambio('Tu empresa', 'propietario@ejemplo.mx', p_tipo, p_vigente_desde, trim(p_resumen), p_enlace,
                                             coalesce(v_sec ->> 'remitente', 'Checador <avisos@ejemplo.mx>'),
                                             coalesce(v_sec ->> 'url_app', 'https://checador.jemba.mx')) - 'html',
      'siguiente_paso', 'Revisa el ejemplo y vuelve a correrla con p_enviar => true');
  end if;
  if v_sec is null then
    raise exception 'Faltan Vault, pg_net o los secretos de Resend; no se registró ni se envió nada' using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.avisos_cambios (tipo, vigente_desde, resumen, enlace)
  values (p_tipo, p_vigente_desde, trim(p_resumen), p_enlace) returning id into v_aviso;
  v_total := 0;
  for r in select * from public._destinatarios_aviso_cambio() loop
    v_correos := v_correos || jsonb_build_array(public._correo_aviso_cambio(
      r.razon_social, r.correo, p_tipo, p_vigente_desde, trim(p_resumen), p_enlace, v_sec ->> 'remitente', v_sec ->> 'url_app'));
    v_filas := v_filas || jsonb_build_array(jsonb_build_object('empresa_id', r.empresa_id, 'correo', r.correo));
    if jsonb_array_length(v_correos) = 100 then
      v_sol := public._resend_enviar(v_sec, v_correos);
      insert into public.correos_clientes (tipo, empresa_id, correo, aviso_cambio_id, solicitud_id)
      select 'cambio', x.empresa_id, x.correo, v_aviso, v_sol from jsonb_to_recordset(v_filas) as x(empresa_id uuid, correo text);
      v_total := v_total + 100;
      v_correos := '[]';
      v_filas := '[]';
    end if;
  end loop;
  if jsonb_array_length(v_correos) > 0 then
    v_sol := public._resend_enviar(v_sec, v_correos);
    insert into public.correos_clientes (tipo, empresa_id, correo, aviso_cambio_id, solicitud_id)
    select 'cambio', x.empresa_id, x.correo, v_aviso, v_sol from jsonb_to_recordset(v_filas) as x(empresa_id uuid, correo text);
    v_total := v_total + jsonb_array_length(v_correos);
  end if;
  return jsonb_build_object('enviado', true, 'aviso_id', v_aviso, 'empresas', v_empresas, 'correos', v_total,
                            'siguiente_paso', 'En una hora revisa: select estado, count(*) from correos_clientes where aviso_cambio_id = ' || v_aviso || ' group by 1');
end;
$$;

-- Anota si Resend aceptó cada envío (como revisar_envios_recordatorios).
create function public.revisar_correos_clientes() returns integer
language plpgsql set search_path = '' as $$
declare
  v_n integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    execute $q$
      update public.correos_clientes r
         set estado = case when x.status_code between 200 and 299 then 'enviado' else 'fallido' end,
             detalle = case when x.status_code between 200 and 299 then null
                            else left(coalesce(x.error_msg, 'HTTP ' || x.status_code || ': ' || x.content::text), 500) end
        from net._http_response x
       where r.estado is null and x.id = r.solicitud_id
    $q$;
    get diagnostics v_n = row_count;
  end if;
  update public.correos_clientes
     set estado = 'fallido', detalle = 'Sin respuesta del servicio de correo'
   where estado is null and enviado_en < now() - interval '1 day';
  return v_n;
end;
$$;

-- Nadie de la API ejecuta estas funciones: las llama pg_cron o Jemba desde el editor SQL.
revoke execute on function
  public._fecha_texto(date),
  public._correo_boton(text, text),
  public._resend_secretos(),
  public._resend_enviar(jsonb, jsonb),
  public._propietarios(uuid),
  public._correo_aviso_borrado(text, text, text, date, date, text, text),
  public.empresas_por_avisar_borrado(),
  public.enviar_avisos_borrado(),
  public.empresas_por_borrar(),
  public._correo_aviso_cambio(text, text, text, date, text, text, text, text),
  public._destinatarios_aviso_cambio(),
  public.avisar_cambio_a_clientes(text, date, text, text, boolean),
  public.revisar_correos_clientes()
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Programación: aviso de borrado a diario a las 16:40 UTC (10:40 en el centro de México);
-- revisión de entregas cada hora.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('checador-avisos-borrado', '40 16 * * *', 'select public.enviar_avisos_borrado()');
    perform cron.schedule('checador-revisar-correos-clientes', '25 * * * *', 'select public.revisar_correos_clientes()');
  end if;
end;
$$;
