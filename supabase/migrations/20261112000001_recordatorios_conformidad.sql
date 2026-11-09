-- =============================================================================
-- Checador: recordatorios de conformidad semanal por correo
--
-- Cada lunes a las 10:00 (hora del centro de México) se envía un correo a cada
-- trabajador con correo que tenga:
--   * semanas terminadas, con checadas, a las que no ha respondido, o
--   * semanas que objetó y en las que el empleador registró cambios después.
-- Se revisan las últimas 8 semanas y se envía, como máximo, un correo por persona
-- cada 6 días. La conformidad sigue siendo voluntaria: el silencio no es
-- conformidad (por eso conviene recordarla; ver docs/analisis-legal.md).
--
-- Por qué en la base y no en la app: el envío necesita leer a todas las empresas y
-- la app nunca usa la llave service_role (CLAUDE.md). Lo hacen funciones que la API
-- no puede ejecutar; pg_cron las llama como postgres, pg_net hace la petición a
-- Resend y la llave vive en Supabase Vault.
--
-- Configuración de cada proyecto (no va en la migración; ver docs/publicacion.md):
--   select vault.create_secret('<llave de envío de Resend>', 'checador_resend_llave');
--   select vault.create_secret('https://checador.jemba.mx', 'checador_url_app');
--   select vault.create_secret('Reloj Checador <no-responder@checador.jemba.mx>', 'checador_remitente');
-- Opcional, solo para pruebas locales: 'checador_resend_url' (por omisión, la API de Resend).
-- Sin esos secretos no se envía nada (Supabase local, CI).
-- =============================================================================

-- El empleador puede apagar los recordatorios de su empresa.
alter table public.empresas add column recordatorios_conformidad boolean not null default true;

-- -----------------------------------------------------------------------------
-- Registro de envíos (no es evidencia de la jornada: el estado se actualiza al
-- conocer la respuesta del servicio de correo).
-- -----------------------------------------------------------------------------
create table public.recordatorios_conformidad (
  id                     bigint generated always as identity primary key,
  empresa_id             uuid not null,
  trabajador_id          uuid not null,
  correo                 text not null,
  semanas_sin_respuesta  date[] not null default '{}',
  semanas_corregidas     date[] not null default '{}',
  enviado_en             timestamptz not null default now(),
  -- Identificador de la petición en pg_net (net._http_response).
  solicitud_id           bigint,
  -- null mientras no se conoce la respuesta.
  estado                 text check (estado in ('enviado', 'fallido')),
  detalle                text,
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id)
);
create index recordatorios_trabajador_idx on public.recordatorios_conformidad (trabajador_id, enviado_en desc);
create index recordatorios_empresa_idx on public.recordatorios_conformidad (empresa_id, enviado_en desc);
create index recordatorios_pendientes_idx on public.recordatorios_conformidad (solicitud_id) where estado is null;

alter table public.recordatorios_conformidad enable row level security;
create policy recordatorios_select on public.recordatorios_conformidad for select to authenticated
  using (public.puede_consultar(empresa_id));
-- Sin políticas de escritura: solo escriben las funciones de envío.
grant select on public.recordatorios_conformidad to authenticated;
grant all on public.recordatorios_conformidad to service_role;

-- -----------------------------------------------------------------------------
-- Qué recordar
-- -----------------------------------------------------------------------------

-- Semanas (por su lunes, en la zona horaria del centro de trabajo) pendientes por trabajador.
create function public.conformidades_por_recordar(p_ahora timestamptz default now())
returns table (
  empresa_id uuid, trabajador_id uuid, nombre text, correo text, razon_social text,
  semanas_sin_respuesta date[], semanas_corregidas date[]
)
language sql stable set search_path = '' as $$
  with candidatos as (
    select t.id, t.empresa_id, t.nombre, t.email, e.razon_social, c.zona_horaria,
           date_trunc('week', p_ahora at time zone c.zona_horaria)::date as lunes_actual
      from public.trabajadores t
      join public.empresas e on e.id = t.empresa_id
      join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
     where t.email is not null
       and t.fecha_baja is null
       and e.recordatorios_conformidad
       -- Como máximo un correo cada 6 días (los envíos fallidos no cuentan).
       and not exists (
         select 1 from public.recordatorios_conformidad r
          where r.trabajador_id = t.id
            and r.enviado_en > p_ahora - interval '6 days'
            and r.estado is distinct from 'fallido')
  ),
  -- Semanas ya terminadas (lunes anterior al actual) con checadas, dentro de las últimas 8.
  semanas as (
    select distinct c.id as trabajador_id,
           date_trunc('week', ev.hora_efectiva at time zone c.zona_horaria)::date as lunes
      from candidatos c
      join public.eventos ev on ev.empresa_id = c.empresa_id and ev.trabajador_id = c.id
     where ev.tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and ev.hora_efectiva >= ((c.lunes_actual - 56)::timestamp at time zone c.zona_horaria)
       and ev.hora_efectiva <  (c.lunes_actual::timestamp at time zone c.zona_horaria)
  ),
  -- Última respuesta del trabajador por semana.
  ultima as (
    select distinct on (cf.trabajador_id, cf.periodo_inicio)
           cf.trabajador_id, cf.periodo_inicio, cf.respuesta, cf.respondido_en
      from public.conformidades cf
      join candidatos c on c.id = cf.trabajador_id and c.empresa_id = cf.empresa_id
     order by cf.trabajador_id, cf.periodo_inicio, cf.respondido_en desc
  ),
  clasificadas as (
    select s.trabajador_id, s.lunes,
           case
             when u.respuesta is null then 'sin_respuesta'
             -- Objetada y con cambios del empleador posteriores a la objeción.
             when u.respuesta = 'objeta' and exists (
               select 1
                 from candidatos c
                 join public.eventos p on p.empresa_id = c.empresa_id and p.trabajador_id = c.id
                 left join public.eventos o on o.id = p.corrige_evento_id
                where c.id = s.trabajador_id
                  and p.origen = 'panel'
                  and p.hora_servidor > u.respondido_en
                  and (date_trunc('week', p.hora_efectiva at time zone c.zona_horaria)::date = s.lunes
                       or date_trunc('week', o.hora_efectiva at time zone c.zona_horaria)::date = s.lunes)
             ) then 'corregida'
           end as clase
      from semanas s
      left join ultima u on u.trabajador_id = s.trabajador_id and u.periodo_inicio = s.lunes
  )
  select c.empresa_id, c.id, c.nombre, c.email, c.razon_social,
         coalesce(array_agg(k.lunes order by k.lunes) filter (where k.clase = 'sin_respuesta'), '{}'),
         coalesce(array_agg(k.lunes order by k.lunes) filter (where k.clase = 'corregida'), '{}')
    from candidatos c
    join clasificadas k on k.trabajador_id = c.id
   where k.clase is not null
   group by c.empresa_id, c.id, c.nombre, c.email, c.razon_social
$$;

-- -----------------------------------------------------------------------------
-- Texto del correo
-- -----------------------------------------------------------------------------

create function public._html(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

-- "del 2 al 8 de noviembre de 2026", "del 26 de octubre al 1 de noviembre de 2026".
create function public._semana_texto(p_lunes date) returns text
language sql immutable parallel safe set search_path = '' as $$
  with f as (
    select p_lunes as a, p_lunes + 6 as b,
           array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                 'septiembre', 'octubre', 'noviembre', 'diciembre'] as m
  )
  select case
    when extract(month from a) = extract(month from b) then
      format('del %s al %s de %s de %s', extract(day from a), extract(day from b), m[extract(month from b)::int], extract(year from b))
    when extract(year from a) = extract(year from b) then
      format('del %s de %s al %s de %s de %s', extract(day from a), m[extract(month from a)::int],
             extract(day from b), m[extract(month from b)::int], extract(year from b))
    else
      format('del %s de %s de %s al %s de %s de %s', extract(day from a), m[extract(month from a)::int], extract(year from a),
             extract(day from b), m[extract(month from b)::int], extract(year from b))
  end
  from f
$$;

-- Correo en el formato de la API de Resend ({from, to, subject, html, text}).
create function public._correo_recordatorio(
  p_nombre text, p_razon_social text, p_correo text,
  p_sin_respuesta date[], p_corregidas date[], p_remitente text, p_url_app text
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_html text := '';
  v_texto text := '';
  v_lunes date;
  v_url text;
begin
  v_html := format('<p>Hola, %s:</p><p>%s registra tu jornada con Checador. ',
                   public._html(p_nombre), public._html(p_razon_social));
  v_texto := format(E'Hola, %s:\n\n%s registra tu jornada con Checador. ', p_nombre, p_razon_social);

  if cardinality(p_sin_respuesta) > 0 then
    v_html := v_html || 'Estas semanas ya terminaron y aún no las revisas:</p><ul>';
    v_texto := v_texto || E'Estas semanas ya terminaron y aún no las revisas:\n';
    foreach v_lunes in array p_sin_respuesta loop
      v_url := p_url_app || '/registros?semana=' || v_lunes;
      v_html := v_html || format('<li><a href="%s">Semana %s</a></li>', public._html(v_url), public._semana_texto(v_lunes));
      v_texto := v_texto || format(E'- Semana %s: %s\n', public._semana_texto(v_lunes), v_url);
    end loop;
    v_html := v_html || '</ul>';
  else
    v_html := v_html || '</p>';
  end if;

  if cardinality(p_corregidas) > 0 then
    v_html := v_html || '<p>Tu empleador hizo cambios en estas semanas que objetaste. Revisa si ya son correctas:</p><ul>';
    v_texto := v_texto || E'\nTu empleador hizo cambios en estas semanas que objetaste. Revisa si ya son correctas:\n';
    foreach v_lunes in array p_corregidas loop
      v_url := p_url_app || '/registros?semana=' || v_lunes;
      v_html := v_html || format('<li><a href="%s">Semana %s</a></li>', public._html(v_url), public._semana_texto(v_lunes));
      v_texto := v_texto || format(E'- Semana %s: %s\n', public._semana_texto(v_lunes), v_url);
    end loop;
    v_html := v_html || '</ul>';
  end if;

  v_html := v_html
    || '<p>En cada semana puedes indicar que tus horas son correctas o explicar qué no coincide. '
    || 'Tu respuesta es voluntaria, pero ayuda a que tus horas queden bien registradas.</p>'
    || '<p style="color:#6c757d;font-size:13px">Recibes este correo porque tu empleador te dio de alta en Checador '
    || 'con esta dirección. Para entrar usa este mismo correo; te llegará un código.</p>';
  v_texto := v_texto
    || E'\nEn cada semana puedes indicar que tus horas son correctas o explicar qué no coincide. '
    || E'Tu respuesta es voluntaria, pero ayuda a que tus horas queden bien registradas.\n\n'
    || 'Recibes este correo porque tu empleador te dio de alta en Checador con esta dirección. '
    || 'Para entrar usa este mismo correo; te llegará un código.';

  return jsonb_build_object(
    'from', p_remitente,
    'to', jsonb_build_array(p_correo),
    'subject', case when cardinality(p_sin_respuesta) > 0
                    then 'Tienes semanas por revisar en Checador'
                    else 'Tu empleador revisó la semana que objetaste' end,
    'html', v_html,
    'text', v_texto
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Envío (pg_net + Vault). Si faltan las extensiones o los secretos, no hace nada.
-- -----------------------------------------------------------------------------

create function public.enviar_recordatorios_conformidad(p_ahora timestamptz default now())
returns integer
language plpgsql set search_path = '' as $$
declare
  v_llave     text;
  v_url_app   text;
  v_remitente text;
  v_url_api   text;
  v_correos   jsonb := '[]';
  v_filas     jsonb := '[]';
  v_total     integer := 0;
  v_solicitud bigint;
  r           record;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise notice 'Recordatorios: faltan Vault o pg_net; no se envía nada.';
    return 0;
  end if;
  select max(decrypted_secret) filter (where name = 'checador_resend_llave'),
         max(decrypted_secret) filter (where name = 'checador_url_app'),
         max(decrypted_secret) filter (where name = 'checador_remitente'),
         max(decrypted_secret) filter (where name = 'checador_resend_url')
    into v_llave, v_url_app, v_remitente, v_url_api
    from vault.decrypted_secrets
   where name in ('checador_resend_llave', 'checador_url_app', 'checador_remitente', 'checador_resend_url');
  if v_llave is null or v_url_app is null or v_remitente is null then
    raise notice 'Recordatorios: faltan secretos en Vault (checador_resend_llave, checador_url_app, checador_remitente); no se envía nada.';
    return 0;
  end if;
  v_url_app := rtrim(v_url_app, '/');
  v_url_api := coalesce(v_url_api, 'https://api.resend.com/emails/batch');

  for r in select * from public.conformidades_por_recordar(p_ahora) loop
    v_correos := v_correos || jsonb_build_array(public._correo_recordatorio(
      r.nombre, r.razon_social, r.correo, r.semanas_sin_respuesta, r.semanas_corregidas, v_remitente, v_url_app));
    v_filas := v_filas || jsonb_build_array(jsonb_build_object(
      'empresa_id', r.empresa_id, 'trabajador_id', r.trabajador_id, 'correo', r.correo,
      'semanas_sin_respuesta', r.semanas_sin_respuesta, 'semanas_corregidas', r.semanas_corregidas));

    -- Resend acepta hasta 100 correos por petición en /emails/batch.
    if jsonb_array_length(v_correos) = 100 then
      v_solicitud := net.http_post(
        url := v_url_api,
        body := v_correos,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_llave),
        timeout_milliseconds := 15000);
      insert into public.recordatorios_conformidad
        (empresa_id, trabajador_id, correo, semanas_sin_respuesta, semanas_corregidas, solicitud_id)
      select x.empresa_id, x.trabajador_id, x.correo, x.semanas_sin_respuesta, x.semanas_corregidas, v_solicitud
        from jsonb_to_recordset(v_filas) as x(empresa_id uuid, trabajador_id uuid, correo text,
                                               semanas_sin_respuesta date[], semanas_corregidas date[]);
      v_total := v_total + jsonb_array_length(v_correos);
      v_correos := '[]';
      v_filas := '[]';
    end if;
  end loop;

  if jsonb_array_length(v_correos) > 0 then
    v_solicitud := net.http_post(
      url := v_url_api,
      body := v_correos,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_llave),
      timeout_milliseconds := 15000);
    insert into public.recordatorios_conformidad
      (empresa_id, trabajador_id, correo, semanas_sin_respuesta, semanas_corregidas, solicitud_id)
    select x.empresa_id, x.trabajador_id, x.correo, x.semanas_sin_respuesta, x.semanas_corregidas, v_solicitud
      from jsonb_to_recordset(v_filas) as x(empresa_id uuid, trabajador_id uuid, correo text,
                                             semanas_sin_respuesta date[], semanas_corregidas date[]);
    v_total := v_total + jsonb_array_length(v_correos);
  end if;

  raise notice 'Recordatorios: % correo(s) en cola.', v_total;
  return v_total;
end;
$$;

-- Anota si Resend aceptó cada envío. pg_net guarda las respuestas unas horas, por eso
-- se programa poco después del envío.
create function public.revisar_envios_recordatorios()
returns integer
language plpgsql set search_path = '' as $$
declare
  v_n integer := 0;
begin
  if to_regclass('net._http_response') is not null then
    update public.recordatorios_conformidad r
       set estado = case when x.status_code between 200 and 299 then 'enviado' else 'fallido' end,
           detalle = case when x.status_code between 200 and 299 then null
                          else left(coalesce(x.error_msg, 'HTTP ' || x.status_code || ': ' || x.content::text), 500) end
      from net._http_response x
     where r.estado is null and x.id = r.solicitud_id;
    get diagnostics v_n = row_count;
  end if;
  -- Sin respuesta después de un día: pg_net ya la descartó.
  update public.recordatorios_conformidad
     set estado = 'fallido', detalle = 'Sin respuesta del servicio de correo'
   where estado is null and enviado_en < now() - interval '1 day';
  return v_n;
end;
$$;

-- Nadie de la API ejecuta estas funciones (las llama pg_cron como postgres).
revoke execute on function
  public.conformidades_por_recordar(timestamptz),
  public._html(text),
  public._semana_texto(date),
  public._correo_recordatorio(text, text, text, date[], date[], text, text),
  public.enviar_recordatorios_conformidad(timestamptz),
  public.revisar_envios_recordatorios()
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Programación: lunes 16:00 UTC (10:00 en el centro de México, que no cambia de horario).
-- En un PostgreSQL sin pg_cron ni pg_net (pruebas locales) solo se crean las funciones.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('checador-recordatorios-conformidad', '0 16 * * 1',
                          'select public.enviar_recordatorios_conformidad()');
    perform cron.schedule('checador-revisar-recordatorios', '20 16 * * 1',
                          'select public.revisar_envios_recordatorios()');
  end if;
end;
$$;
