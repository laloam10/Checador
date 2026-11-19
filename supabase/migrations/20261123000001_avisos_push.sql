-- =============================================================================
-- Checador: avisos por notificación (Web Push) a la persona trabajadora
--
-- Fase 1 de docs/plan-app-movil.md. Tres avisos:
--   * semana      — hay una semana terminada sin revisar, o una objetada que la empresa
--                   corrigió (misma regla que la conformidad: _semanas_por_confirmar).
--   * acuerdo     — la empresa firmó un acuerdo de registro que espera la firma de la persona.
--   * correccion  — la empresa corrigió, anuló o capturó un registro de la persona.
-- Un aviso no tiene efecto legal: no sustituye la conformidad ni la firma (art. 132
-- fr. XXXIV LFT), solo invita a hacerlas. El silencio sigue sin ser conformidad.
--
-- Reglas (docs/plan-app-movil.md):
--   * El texto de la notificación no lleva horas ni datos (se lee con el teléfono bloqueado):
--     aquí solo se guarda el tipo y la liga; el texto lo pone la app.
--   * Solo de 09:00 a 19:59 (hora del centro de trabajo) y nunca en los días de descanso
--     de la persona. Lo que llega fuera de ese horario espera; a los 7 días se descarta.
--   * La persona apaga cada tipo en su app; la empresa no puede mandar mensajes libres.
--   * El aviso de semana respeta el interruptor de recordatorios de la empresa.
--
-- Envío: pg_cron llama cada 10 minutos a /api/avisos/enviar de la app (pg_net) solo si hay
-- avisos pendientes; la app cifra y entrega con Web Push. La app no usa la llave
-- service_role: lee y anota con funciones que exigen el secreto de servicio 'avisos'
-- (mismo esquema que WhatsApp). Configuración por proyecto (docs/publicacion.md §1.10):
--   select public.configurar_secreto_servicio('avisos', '<secreto>');
--   select vault.create_secret('<secreto>', 'checador_avisos_secreto');
-- (además de 'checador_url_app', que ya usan los recordatorios por correo).
-- =============================================================================

create type public.tipo_aviso as enum ('semana', 'acuerdo', 'correccion');

-- -----------------------------------------------------------------------------
-- Dispositivos donde la persona activó los avisos
-- -----------------------------------------------------------------------------
create table public.suscripciones_push (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- La app valida que el servicio de entrega sea uno conocido (Google, Apple, Mozilla, Microsoft).
  endpoint     text not null unique check (endpoint ~ '^https?://[^/\s]+/\S*$' and length(endpoint) <= 1000),
  p256dh       text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth         text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$'),
  agente       text check (length(agente) <= 200),
  creado_en    timestamptz not null default now(),
  ultimo_envio timestamptz,
  fallos       smallint not null default 0
);
create index suscripciones_push_usuario_idx on public.suscripciones_push (user_id);
alter table public.suscripciones_push enable row level security;
create policy suscripciones_push_propias on public.suscripciones_push for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.suscripciones_push from public, anon, authenticated;
grant select on public.suscripciones_push to authenticated;
-- Altas y bajas solo con registrar_suscripcion_push() y quitar_suscripcion_push().

-- -----------------------------------------------------------------------------
-- Qué avisos quiere recibir la persona (sin fila = todos)
-- -----------------------------------------------------------------------------
create table public.preferencias_avisos (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  semana         boolean not null default true,
  acuerdo        boolean not null default true,
  correccion     boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table public.preferencias_avisos enable row level security;
create policy preferencias_avisos_select on public.preferencias_avisos for select to authenticated
  using (user_id = (select auth.uid()));
create policy preferencias_avisos_insert on public.preferencias_avisos for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy preferencias_avisos_update on public.preferencias_avisos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.preferencias_avisos from public, anon, authenticated;
grant select, insert, update on public.preferencias_avisos to authenticated;

-- -----------------------------------------------------------------------------
-- Cola de avisos (no es evidencia de la jornada; nadie de la API la lee ni la escribe)
-- -----------------------------------------------------------------------------
create table public.avisos (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  empresa_id    uuid not null,
  trabajador_id uuid not null,
  tipo          public.tipo_aviso not null,
  -- Evita repetir el mismo aviso: 'semana:<lunes>:<clase>', 'acuerdo:<id>', 'correccion:<evento>'.
  clave         text not null,
  url           text not null check (url ~ '^/[A-Za-z0-9/?=&_-]*$'),
  creado_en     timestamptz not null default now(),
  estado        text check (estado in ('enviado', 'descartado', 'vencido')),
  enviado_en    timestamptz,
  unique (user_id, tipo, clave),
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id)
);
create index avisos_pendientes_idx on public.avisos (user_id) where estado is null;
alter table public.avisos enable row level security;
revoke all on public.avisos from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Origen de los avisos
-- -----------------------------------------------------------------------------

-- Lunes de la semana (zona del centro de trabajo) a la que pertenece un instante.
create function public._lunes_local(p_trabajador uuid, p_instante timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', p_instante at time zone c.zona_horaria)::date
    from public.trabajadores t
    join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
   where t.id = p_trabajador
$$;

-- Semanas por revisar. La llama pg_cron cada hora; un aviso por semana y clase.
create function public.generar_avisos_semana(p_ahora timestamptz default now()) returns integer
language plpgsql set search_path = '' as $$
declare
  v_n integer;
begin
  insert into public.avisos (user_id, empresa_id, trabajador_id, tipo, clave, url)
  select t.user_id, t.empresa_id, t.id, 'semana', 'semana:' || s.lunes || ':' || s.clase,
         '/registros?semana=' || s.lunes
    from public.trabajadores t
    join public.empresas e on e.id = t.empresa_id
    cross join lateral public._semanas_por_confirmar(t.id, p_ahora) s
   where t.user_id is not null and t.fecha_baja is null and e.recordatorios_conformidad
  on conflict (user_id, tipo, clave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- La empresa firmó un acuerdo: la persona debe firmarlo también.
create function public._avisar_acuerdo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.firmante = 'empleador' then
    insert into public.avisos (user_id, empresa_id, trabajador_id, tipo, clave, url)
    select t.user_id, t.empresa_id, t.id, 'acuerdo', 'acuerdo:' || a.id, '/acuerdo'
      from public.acuerdos a
      join public.trabajadores t on t.id = a.trabajador_id
     where a.id = new.acuerdo_id and t.user_id is not null and t.fecha_baja is null
    on conflict (user_id, tipo, clave) do nothing;
  end if;
  return null;
end;
$$;
create trigger firmas_acuerdo_avisar after insert on public.firmas_acuerdo
  for each row execute function public._avisar_acuerdo();

-- La empresa corrigió, anuló o capturó un registro (todo lo que entra por el panel).
create function public._avisar_correccion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_instante timestamptz := new.hora_efectiva;
begin
  if new.origen = 'panel' then
    if new.corrige_evento_id is not null then
      select coalesce(o.hora_efectiva, new.hora_efectiva) into v_instante from public.eventos o where o.id = new.corrige_evento_id;
    end if;
    insert into public.avisos (user_id, empresa_id, trabajador_id, tipo, clave, url)
    select t.user_id, t.empresa_id, t.id, 'correccion', 'correccion:' || new.id,
           '/registros?semana=' || public._lunes_local(t.id, v_instante)
      from public.trabajadores t
     where t.id = new.trabajador_id and t.user_id is not null and t.fecha_baja is null
    on conflict (user_id, tipo, clave) do nothing;
  end if;
  return null;
end;
$$;
create trigger eventos_avisar_correccion after insert on public.eventos
  for each row execute function public._avisar_correccion();

-- -----------------------------------------------------------------------------
-- Horario de avisos: 09:00–19:59 en la zona del centro y fuera de los días de descanso.
-- -----------------------------------------------------------------------------
create function public._en_horario_de_avisos(p_trabajador uuid, p_ahora timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((
    select extract(hour from l) between 9 and 19
           and extract(dow from l)::smallint <> t.dia_descanso
           and not (extract(dow from l)::smallint = any (coalesce(t.dias_descanso_adicionales, '{}')))
      from public.trabajadores t
      join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
      cross join lateral (select p_ahora at time zone c.zona_horaria as l) x
     where t.id = p_trabajador
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- Funciones de la app (exigen el secreto de servicio 'avisos')
-- -----------------------------------------------------------------------------

-- Avisos listos para enviar, agrupados por persona y tipo (varios avisos del mismo tipo
-- llegan como una sola notificación), con los dispositivos de la persona.
create function public.avisos_por_enviar(p_secreto text, p_ahora timestamptz default now(), p_limite integer default 200)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_grupos jsonb;
begin
  if not public._servicio_autorizado('avisos', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;

  update public.avisos set estado = 'vencido'
   where estado is null and creado_en < p_ahora - interval '7 days';

  -- Lo que ya no aplica: la persona lo apagó, ya respondió o firmó, o dejó de ser su ficha.
  update public.avisos a set estado = 'descartado'
    from public.trabajadores t
   where a.estado is null and t.id = a.trabajador_id
     and (
       t.user_id is distinct from a.user_id or t.fecha_baja is not null
       or exists (select 1 from public.preferencias_avisos p
                   where p.user_id = a.user_id
                     and case a.tipo when 'semana' then not p.semana
                                     when 'acuerdo' then not p.acuerdo
                                     else not p.correccion end)
       or (a.tipo = 'semana' and not exists (
             select 1 from public._semanas_por_confirmar(a.trabajador_id, p_ahora) s
              where a.clave = 'semana:' || s.lunes || ':' || s.clase))
       or (a.tipo = 'acuerdo' and not exists (
             select 1 from public.acuerdo_pendiente(a.trabajador_id) x where a.clave = 'acuerdo:' || x.id))
     );

  select coalesce(jsonb_agg(g), '[]'::jsonb) into v_grupos
    from (
      select a.user_id, a.tipo, count(*) as cantidad,
             array_agg(a.id order by a.id) as avisos,
             -- Semana: la más antigua por revisar; corrección: la más reciente.
             case when a.tipo = 'correccion' then (array_agg(a.url order by a.id desc))[1]
                  else (array_agg(a.url order by a.clave))[1] end as url,
             (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                from public.suscripciones_push s where s.user_id = a.user_id) as suscripciones
        from public.avisos a
       where a.estado is null
         and exists (select 1 from public.suscripciones_push s where s.user_id = a.user_id)
         and public._en_horario_de_avisos(a.trabajador_id, p_ahora)
       group by a.user_id, a.tipo
       order by min(a.id)
       limit greatest(1, least(p_limite, 500))
    ) g;

  return jsonb_build_object('ok', true, 'grupos', v_grupos);
end;
$$;

-- Resultado del envío: avisos entregados a al menos un dispositivo; dispositivos que ya no
-- existen (404/410 del servicio) se borran; los que fallan 5 veces seguidas, también.
create function public.avisos_registrar_envio(p_secreto text, p_resultado jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_avisos integer;
begin
  if not public._servicio_autorizado('avisos', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  update public.avisos set estado = 'enviado', enviado_en = now()
   where estado is null and id in (select x::bigint from jsonb_array_elements_text(coalesce(p_resultado -> 'enviados', '[]')) x);
  get diagnostics v_avisos = row_count;
  update public.suscripciones_push set fallos = 0, ultimo_envio = now()
   where id in (select x::uuid from jsonb_array_elements_text(coalesce(p_resultado -> 'exitosas', '[]')) x);
  delete from public.suscripciones_push
   where id in (select x::uuid from jsonb_array_elements_text(coalesce(p_resultado -> 'caducadas', '[]')) x);
  update public.suscripciones_push set fallos = fallos + 1
   where id in (select x::uuid from jsonb_array_elements_text(coalesce(p_resultado -> 'fallidas', '[]')) x);
  delete from public.suscripciones_push where fallos >= 5;
  return jsonb_build_object('ok', true, 'avisos', v_avisos);
end;
$$;

-- -----------------------------------------------------------------------------
-- Funciones de la persona trabajadora (con sesión)
-- -----------------------------------------------------------------------------

-- Activa los avisos en este dispositivo. Si el dispositivo estaba registrado por otra
-- cuenta (teléfono compartido), pasa a la cuenta actual.
create function public.registrar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.trabajadores where user_id = auth.uid() and fecha_baja is null) then
    raise exception 'Solo una persona trabajadora activa puede activar avisos' using errcode = 'insufficient_privilege';
  end if;
  insert into public.suscripciones_push (user_id, endpoint, p256dh, auth, agente)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_agente, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        agente = excluded.agente, fallos = 0, creado_en = now();
end;
$$;

create function public.quitar_suscripcion_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.suscripciones_push where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Disparador del envío: pide a la app que envíe, solo si hay algo pendiente.
-- Sin pg_net, Vault o los secretos (pruebas locales, CI) no hace nada.
-- -----------------------------------------------------------------------------
create function public.disparar_envio_avisos() returns bigint
language plpgsql set search_path = '' as $$
declare
  v_url     text;
  v_secreto text;
  v_destino text;
begin
  -- Solo si hay a quién entregar: los avisos de quien no activó ningún teléfono esperan
  -- (hasta vencer) sin despertar a la app cada 10 minutos.
  if not exists (select 1 from public.avisos a
                  where a.estado is null
                    and exists (select 1 from public.suscripciones_push s where s.user_id = a.user_id)) then
    return null;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  select max(decrypted_secret) filter (where name = 'checador_url_app'),
         max(decrypted_secret) filter (where name = 'checador_avisos_secreto'),
         max(decrypted_secret) filter (where name = 'checador_avisos_url')
    into v_url, v_secreto, v_destino
    from vault.decrypted_secrets
   where name in ('checador_url_app', 'checador_avisos_secreto', 'checador_avisos_url');
  if v_secreto is null or coalesce(v_destino, v_url) is null then
    return null;
  end if;
  -- 'checador_avisos_url' solo existe en pruebas locales (apunta a la app local).
  return net.http_post(
    url := coalesce(v_destino, rtrim(v_url, '/') || '/api/avisos/enviar'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Checador-Secreto', v_secreto),
    timeout_milliseconds := 30000);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilegios
-- -----------------------------------------------------------------------------
revoke execute on function
  public._lunes_local(uuid, timestamptz),
  public.generar_avisos_semana(timestamptz),
  public._avisar_acuerdo(),
  public._avisar_correccion(),
  public._en_horario_de_avisos(uuid, timestamptz),
  public.avisos_por_enviar(text, timestamptz, integer),
  public.avisos_registrar_envio(text, jsonb),
  public.registrar_suscripcion_push(text, text, text, text),
  public.quitar_suscripcion_push(text),
  public.disparar_envio_avisos()
from public, anon, authenticated;
-- La app las llama sin sesión, con el secreto de servicio.
grant execute on function
  public.avisos_por_enviar(text, timestamptz, integer),
  public.avisos_registrar_envio(text, jsonb)
to anon, authenticated;
grant execute on function
  public.registrar_suscripcion_push(text, text, text, text),
  public.quitar_suscripcion_push(text)
to authenticated;

-- -----------------------------------------------------------------------------
-- Programación (solo donde hay pg_cron): semanas cada hora; envío cada 10 minutos.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('checador-avisos-semana', '5 * * * *', 'select public.generar_avisos_semana()');
    perform cron.schedule('checador-avisos-enviar', '*/10 * * * *', 'select public.disparar_envio_avisos()');
  end if;
end;
$$;
