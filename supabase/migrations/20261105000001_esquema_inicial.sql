-- =============================================================================
-- Checador: esquema inicial
--
-- Principios (ver docs/stack.md y docs/analisis-legal.md):
--   * Multiempresa con aislamiento por Row Level Security (RLS).
--   * Bitácora de eventos de SOLO INSERCIÓN, encadenada con SHA-256 por empresa.
--     Las correcciones son eventos nuevos; nunca se modifica ni se borra un evento.
--   * La hora del servidor es la fuente de verdad. La captura sin conexión se
--     marca como "diferida" y conserva ambas horas.
--   * Acuerdos, firmas y conformidades también son de solo inserción
--     (prueba plena, LFT art. 132 fr. XXXIV, 3.er párr.).
--   * Los trabajadores no se borran: se dan de baja (conservación, LFT art. 804).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.rol_miembro as enum ('propietario', 'admin', 'supervisor', 'kiosco');
create type public.tipo_evento as enum (
  'entrada', 'salida', 'inicio_pausa', 'fin_pausa', -- captura
  'correccion', 'anulacion'                         -- ajustes del empleador
);
create type public.origen_evento as enum ('pwa', 'kiosco', 'panel');
create type public.rol_firmante as enum ('trabajador', 'empleador');
create type public.respuesta_conformidad as enum ('conforme', 'objeta');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- Formato de fecha y hora canónico (UTC, microsegundos) para los hashes.
create function public.ts_canonico(t timestamptz) returns text
language sql immutable parallel safe set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

create function public.sha256_texto(t text) returns bytea
language sql immutable parallel safe set search_path = '' as $$
  select sha256(convert_to(t, 'UTF8'))
$$;

-- Bloquea UPDATE, DELETE y TRUNCATE en tablas de solo inserción.
create function public.prohibir_modificacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'La tabla % es de solo inserción: % no está permitido', tg_table_name, tg_op
    using errcode = 'insufficient_privilege',
          hint = 'Registra una corrección o anulación como un evento nuevo.';
end;
$$;

create function public.validar_zona_horaria() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.zona_horaria) then
    raise exception 'Zona horaria inválida: %', new.zona_horaria using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas, membresías y centros de trabajo
-- -----------------------------------------------------------------------------
create table public.empresas (
  id            uuid primary key default gen_random_uuid(),
  razon_social  text not null check (length(btrim(razon_social)) > 0),
  rfc           text check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  zona_horaria  text not null default 'America/Mexico_City',
  creado_en     timestamptz not null default now()
);
create trigger empresas_zona_horaria before insert or update of zona_horaria on public.empresas
  for each row execute function public.validar_zona_horaria();

-- Usuarios del lado del empleador (y cuentas de kiosco).
create table public.miembros (
  empresa_id  uuid not null references public.empresas (id) on delete restrict,
  user_id     uuid not null references auth.users (id) on delete cascade,
  rol         public.rol_miembro not null,
  creado_en   timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index miembros_user_idx on public.miembros (user_id);

create table public.centros_trabajo (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete restrict,
  nombre        text not null check (length(btrim(nombre)) > 0),
  direccion     text,
  zona_horaria  text not null default 'America/Mexico_City',
  creado_en     timestamptz not null default now(),
  unique (empresa_id, id)
);
create trigger centros_zona_horaria before insert or update of zona_horaria on public.centros_trabajo
  for each row execute function public.validar_zona_horaria();

-- -----------------------------------------------------------------------------
-- Trabajadores
-- -----------------------------------------------------------------------------
create table public.trabajadores (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas (id) on delete restrict,
  centro_trabajo_id   uuid not null,
  -- Cuenta para el portal del trabajador (opcional: puede checar solo en kiosco).
  user_id             uuid references auth.users (id) on delete set null,
  nombre              text not null check (length(btrim(nombre)) > 0),
  numero_empleado     text,
  curp                text check (curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$'),
  fecha_ingreso       date not null,
  fecha_baja          date check (fecha_baja is null or fecha_baja >= fecha_ingreso),
  -- 0 = domingo … 6 = sábado (arts. 69 y 70).
  dia_descanso        smallint not null default 0 check (dia_descanso between 0 and 6),
  -- Distribución pactada en minutos por día de la semana (art. 58): {"1": 576, …}.
  jornada_pactada_min jsonb check (jornada_pactada_min is null or jsonb_typeof(jornada_pactada_min) = 'object'),
  creado_en           timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, numero_empleado),
  unique (empresa_id, user_id),
  foreign key (empresa_id, centro_trabajo_id) references public.centros_trabajo (empresa_id, id)
);
create index trabajadores_user_idx on public.trabajadores (user_id) where user_id is not null;

-- Conservación (art. 804): nunca se borra un trabajador; se registra su fecha de baja.
create function public.prohibir_borrado_trabajador() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'No se puede borrar un trabajador: registra su fecha_baja (conservación, LFT art. 804)'
    using errcode = 'insufficient_privilege';
end;
$$;
create trigger trabajadores_sin_borrado before delete on public.trabajadores
  for each row execute function public.prohibir_borrado_trabajador();

-- -----------------------------------------------------------------------------
-- Bitácora de eventos (solo inserción + cadena de hashes por empresa)
-- -----------------------------------------------------------------------------

-- Estado de la cadena por empresa. Solo la modifica el trigger de eventos.
create table public.cadena_estado (
  empresa_id        uuid primary key references public.empresas (id) on delete restrict,
  ultima_secuencia  bigint not null default 0,
  ultimo_hash       bytea not null default decode(repeat('00', 32), 'hex')
);

create function public.crear_cadena_empresa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cadena_estado (empresa_id) values (new.id);
  return new;
end;
$$;
create trigger empresas_crear_cadena after insert on public.empresas
  for each row execute function public.crear_cadena_empresa();

create table public.eventos (
  id                 bigint generated always as identity primary key,
  empresa_id         uuid not null,
  trabajador_id      uuid not null,
  tipo               public.tipo_evento not null,
  origen             public.origen_evento not null,
  -- Hora del servidor al recibir el evento (la fija el trigger; el cliente no puede enviarla).
  hora_servidor      timestamptz not null,
  -- Hora reportada por el dispositivo (captura sin conexión).
  hora_dispositivo   timestamptz,
  diferido           boolean not null default false,
  -- Momento que el evento representa (entrada/salida real, o la hora corregida).
  hora_efectiva      timestamptz not null,
  -- Solo para inicio_pausa: ¿puede salir del lugar? (art. 64).
  puede_salir        boolean,
  -- Para correccion/anulacion: evento afectado.
  corrige_evento_id  bigint references public.eventos (id),
  motivo             text,
  registrado_por     uuid,
  evidencia          jsonb not null default '{}'::jsonb,
  -- Cadena de hashes.
  secuencia          bigint not null,
  hash_anterior      bytea not null,
  hash               bytea not null,
  unique (empresa_id, secuencia),
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id),
  constraint eventos_pausa_requiere_puede_salir
    check ((tipo = 'inicio_pausa') = (puede_salir is not null)),
  constraint eventos_ajuste_requiere_referencia_y_motivo
    check (
      case when tipo in ('correccion', 'anulacion')
        then corrige_evento_id is not null and length(btrim(coalesce(motivo, ''))) > 0 and origen = 'panel'
        else corrige_evento_id is null
      end
    ),
  constraint eventos_panel_requiere_motivo
    check (origen <> 'panel' or length(btrim(coalesce(motivo, ''))) > 0),
  constraint eventos_diferido_requiere_hora_dispositivo
    check (not diferido or hora_dispositivo is not null)
);
create index eventos_trabajador_hora_idx on public.eventos (trabajador_id, hora_efectiva);
create index eventos_corrige_idx on public.eventos (corrige_evento_id) where corrige_evento_id is not null;

-- Contenido canónico que se hashea. Cualquier cambio a una columna de la lista
-- rompe la cadena. NO modificar sin una migración de versión de cadena.
create function public.evento_canonico(e public.eventos) returns text
language sql immutable parallel safe set search_path = '' as $$
  select concat_ws('|',
    'v1',
    e.secuencia::text,
    e.empresa_id::text,
    e.trabajador_id::text,
    e.tipo::text,
    e.origen::text,
    public.ts_canonico(e.hora_servidor),
    coalesce(public.ts_canonico(e.hora_dispositivo), ''),
    e.diferido::text,
    public.ts_canonico(e.hora_efectiva),
    coalesce(e.puede_salir::text, ''),
    coalesce(e.corrige_evento_id::text, ''),
    coalesce(e.motivo, ''),
    coalesce(e.registrado_por::text, ''),
    e.evidencia::text,
    encode(e.hash_anterior, 'hex')
  )
$$;

create function public.eventos_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_objetivo public.eventos;
  v_estado   public.cadena_estado;
begin
  -- Campos que controla el servidor, sin importar lo que envíe el cliente.
  new.hora_servidor  := clock_timestamp();
  new.registrado_por := auth.uid();

  -- Hora efectiva según el origen.
  if new.origen = 'panel' then
    -- Captura manual o ajuste del empleador: hora explícita, nunca futura.
    if new.tipo = 'anulacion' then
      new.hora_efectiva := new.hora_servidor;
    elsif new.hora_efectiva is null then
      raise exception 'Los eventos capturados desde el panel requieren hora_efectiva' using errcode = 'check_violation';
    elsif new.hora_efectiva > new.hora_servidor then
      raise exception 'hora_efectiva no puede ser futura' using errcode = 'check_violation';
    end if;
  elsif new.diferido then
    -- Captura sin conexión: se conserva la hora del dispositivo, dentro de una ventana razonable.
    if new.hora_dispositivo is null
       or new.hora_dispositivo > new.hora_servidor + interval '5 minutes'
       or new.hora_dispositivo < new.hora_servidor - interval '7 days' then
      raise exception 'hora_dispositivo fuera de la ventana permitida para captura diferida' using errcode = 'check_violation';
    end if;
    new.hora_efectiva := new.hora_dispositivo;
  else
    new.hora_efectiva := new.hora_servidor;
  end if;

  -- Ajustes: el evento corregido debe ser del mismo trabajador y empresa.
  if new.corrige_evento_id is not null then
    select * into v_objetivo from public.eventos where id = new.corrige_evento_id;
    if not found or v_objetivo.empresa_id <> new.empresa_id or v_objetivo.trabajador_id <> new.trabajador_id then
      raise exception 'El evento a corregir no pertenece al mismo trabajador' using errcode = 'check_violation';
    end if;
  end if;

  -- Cadena de hashes. El UPDATE bloquea la fila de la empresa y serializa las inserciones concurrentes.
  update public.cadena_estado
     set ultima_secuencia = ultima_secuencia + 1
   where empresa_id = new.empresa_id
  returning * into v_estado;
  if not found then
    raise exception 'Empresa sin cadena inicializada' using errcode = 'foreign_key_violation';
  end if;

  new.secuencia     := v_estado.ultima_secuencia;
  new.hash_anterior := v_estado.ultimo_hash;
  new.hash          := public.sha256_texto(public.evento_canonico(new));

  update public.cadena_estado set ultimo_hash = new.hash where empresa_id = new.empresa_id;
  return new;
end;
$$;

create trigger eventos_antes_de_insertar before insert on public.eventos
  for each row execute function public.eventos_antes_de_insertar();
create trigger eventos_solo_insercion before update or delete on public.eventos
  for each row execute function public.prohibir_modificacion();
create trigger eventos_sin_truncate before truncate on public.eventos
  for each statement execute function public.prohibir_modificacion();

-- -----------------------------------------------------------------------------
-- Acuerdos y firmas (prueba plena: art. 132 fr. XXXIV, 3.er párr.)
-- -----------------------------------------------------------------------------
create table public.acuerdos (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null,
  trabajador_id       uuid not null,
  version             integer not null check (version > 0),
  -- Texto íntegro que se firma: método de registro, jornada y distribución pactadas.
  contenido           text not null check (length(btrim(contenido)) > 0),
  contenido_hash      bytea not null,
  dia_descanso        smallint not null check (dia_descanso between 0 and 6),
  jornada_pactada_min jsonb check (jornada_pactada_min is null or jsonb_typeof(jornada_pactada_min) = 'object'),
  creado_por          uuid,
  creado_en           timestamptz not null default now(),
  unique (empresa_id, id),
  unique (trabajador_id, version),
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id)
);

create function public.acuerdos_antes_de_insertar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.contenido_hash := public.sha256_texto(new.contenido);
  new.creado_por     := auth.uid();
  new.creado_en      := clock_timestamp();
  return new;
end;
$$;
create trigger acuerdos_antes_de_insertar before insert on public.acuerdos
  for each row execute function public.acuerdos_antes_de_insertar();
create trigger acuerdos_solo_insercion before update or delete on public.acuerdos
  for each row execute function public.prohibir_modificacion();

create table public.firmas_acuerdo (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null,
  acuerdo_id      uuid not null,
  firmante        public.rol_firmante not null,
  user_id         uuid not null,
  firmado_en      timestamptz not null,
  -- Hash del contenido al momento de firmar: prueba de qué texto se aceptó.
  contenido_hash  bytea not null,
  -- IP, agente de usuario, etc. (la llena la capa de servidor).
  evidencia       jsonb not null default '{}'::jsonb,
  unique (acuerdo_id, firmante),
  foreign key (empresa_id, acuerdo_id) references public.acuerdos (empresa_id, id)
);

create function public.firmas_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id    := auth.uid();
  new.firmado_en := clock_timestamp();
  select contenido_hash into new.contenido_hash from public.acuerdos where id = new.acuerdo_id;
  if new.user_id is null then
    raise exception 'Una firma requiere un usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger firmas_antes_de_insertar before insert on public.firmas_acuerdo
  for each row execute function public.firmas_antes_de_insertar();
create trigger firmas_solo_insercion before update or delete on public.firmas_acuerdo
  for each row execute function public.prohibir_modificacion();

-- -----------------------------------------------------------------------------
-- Conformidades periódicas del trabajador
-- -----------------------------------------------------------------------------
create table public.conformidades (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null,
  trabajador_id     uuid not null,
  periodo_inicio    date not null,
  periodo_fin       date not null check (periodo_fin >= periodo_inicio),
  -- Resumen que vio el trabajador (totales del motor de cálculo e IDs de eventos).
  resumen           jsonb not null,
  resumen_hash      bytea not null,
  respuesta         public.respuesta_conformidad not null,
  comentario        text,
  -- Ancla en la cadena: estado de la bitácora al responder.
  cadena_secuencia  bigint not null,
  cadena_hash       bytea not null,
  user_id           uuid not null,
  respondido_en     timestamptz not null,
  evidencia         jsonb not null default '{}'::jsonb,
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id),
  constraint conformidades_objecion_requiere_comentario
    check (respuesta <> 'objeta' or length(btrim(coalesce(comentario, ''))) > 0)
);
create index conformidades_trabajador_idx on public.conformidades (trabajador_id, periodo_inicio);

create function public.conformidades_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id       := auth.uid();
  new.respondido_en := clock_timestamp();
  new.resumen_hash  := public.sha256_texto(new.resumen::text);
  select ultima_secuencia, ultimo_hash into new.cadena_secuencia, new.cadena_hash
    from public.cadena_estado where empresa_id = new.empresa_id;
  if new.user_id is null then
    raise exception 'Una conformidad requiere un usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger conformidades_antes_de_insertar before insert on public.conformidades
  for each row execute function public.conformidades_antes_de_insertar();
create trigger conformidades_solo_insercion before update or delete on public.conformidades
  for each row execute function public.prohibir_modificacion();
