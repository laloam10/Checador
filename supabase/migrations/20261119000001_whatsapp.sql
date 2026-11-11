-- =============================================================================
-- Checador: checada por WhatsApp
--
-- Un solo número de WhatsApp atiende a todas las empresas. Los mensajes llegan a
-- /api/whatsapp/webhook (la app verifica la firma de Meta) y la app llama a las
-- funciones whatsapp_*() de aquí. La checada NO pasa por ningún modelo de IA: es una
-- regla fija, igual que el kiosco. La hora la fija el servidor (trigger de eventos).
--
-- Identidad:
--   * El empleador captura el celular en la ficha (trabajadores.telefono).
--   * La persona se vincula UNA vez escribiendo su PIN (el del kiosco), con el mismo
--     bloqueo por intentos. Cambiar el teléfono obliga a vincularse de nuevo.
--   * Riesgo que no se elimina: quien tenga el teléfono desbloqueado puede checar por
--     otra persona (como compartir el PIN del kiosco). Lo mitiga la conformidad semanal.
--
-- Quién puede llamar a estas funciones:
--   El webhook no tiene sesión de usuario y la app nunca usa la llave service_role.
--   Por eso las funciones reciben un secreto de servicio (256 bits, solo en el servidor
--   de la app) y lo comparan con su huella SHA-256 guardada aquí. Son las ÚNICAS
--   funciones ejecutables por `anon`; sin el secreto no hacen nada ni revelan nada.
--   Configuración (una vez por proyecto, en el SQL Editor; ver docs/publicacion.md):
--     select public.configurar_secreto_servicio('whatsapp', '<secreto>');
-- =============================================================================

alter type public.origen_evento add value if not exists 'whatsapp';

-- -----------------------------------------------------------------------------
-- Teléfono del trabajador
-- -----------------------------------------------------------------------------
alter table public.trabajadores
  add column telefono text check (telefono ~ '^[0-9]{10,15}$'),
  add column telefono_verificado_en timestamptz;
comment on column public.trabajadores.telefono is
  'Celular para checar por WhatsApp, solo dígitos con código de país (México: 52 + 10 dígitos).';
-- Un número atiende a todas las empresas: el teléfono identifica a UNA persona activa.
create unique index trabajadores_telefono_idx on public.trabajadores (telefono)
  where telefono is not null and fecha_baja is null;

-- México: WhatsApp entrega 521XXXXXXXXXX; se guarda 52XXXXXXXXXX. Diez dígitos = México.
create function public._telefono_normalizado(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when d ~ '^521[0-9]{10}$' then '52' || right(d, 10)
    when d ~ '^[0-9]{10}$' then '52' || d
    else nullif(d, '')
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- El teléfono se guarda normalizado; cambiarlo quita la verificación, y nadie de la API
-- puede marcar un teléfono como verificado (solo whatsapp_vincular()).
create function public.trabajadores_proteger_telefono() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.telefono := public._telefono_normalizado(new.telefono);
  if tg_op = 'UPDATE' and new.telefono is distinct from old.telefono then
    new.telefono_verificado_en := null;
  end if;
  if new.telefono is null then
    new.telefono_verificado_en := null;
  end if;
  if new.telefono_verificado_en is not null
     and (tg_op = 'INSERT' or new.telefono_verificado_en is distinct from old.telefono_verificado_en)
     and current_user in ('authenticated', 'anon') then
    raise exception 'El teléfono solo se verifica cuando la persona escribe su PIN por WhatsApp'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger trabajadores_proteger_telefono before insert or update on public.trabajadores
  for each row execute function public.trabajadores_proteger_telefono();

-- La regla de la pausa del centro (art. 64) aplica también a WhatsApp.
create or replace function public.eventos_pausa_segun_centro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'inicio_pausa' and new.origen::text in ('pwa', 'kiosco', 'whatsapp') then
    select c.pausa_puede_salir into new.puede_salir
      from public.trabajadores t
      join public.centros_trabajo c on c.id = t.centro_trabajo_id
     where t.id = new.trabajador_id;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Secreto de servicio (solo su huella)
-- -----------------------------------------------------------------------------
create table public.secretos_servicio (
  nombre         text primary key,
  huella         bytea not null,
  actualizado_en timestamptz not null default now()
);
alter table public.secretos_servicio enable row level security;
-- Sin políticas ni privilegios: inaccesible por la API.

-- Solo desde el SQL Editor (postgres): guarda la huella, nunca el secreto.
create function public.configurar_secreto_servicio(p_nombre text, p_secreto text) returns void
language plpgsql set search_path = '' as $$
begin
  if length(coalesce(p_secreto, '')) < 32 then
    raise exception 'El secreto debe tener al menos 32 caracteres';
  end if;
  insert into public.secretos_servicio (nombre, huella)
  values (p_nombre, extensions.digest(p_secreto, 'sha256'))
  on conflict (nombre) do update set huella = excluded.huella, actualizado_en = now();
end;
$$;

create function public._servicio_autorizado(p_nombre text, p_secreto text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.secretos_servicio s
     where s.nombre = p_nombre and s.huella = extensions.digest(coalesce(p_secreto, ''), 'sha256'))
$$;

-- -----------------------------------------------------------------------------
-- Funciones del webhook
-- -----------------------------------------------------------------------------

-- Quién escribe y en qué estado está. Sin vínculo no revela nombre ni empresa.
create function public.whatsapp_estado(p_secreto text, p_telefono text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._telefono_normalizado(p_telefono);
  t     record;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  select tr.id, tr.empresa_id, tr.nombre, tr.telefono_verificado_en, e.razon_social, c.zona_horaria,
         exists (select 1 from public.pines_trabajador p where p.trabajador_id = tr.id) as tiene_pin
    into t
    from public.trabajadores tr
    join public.empresas e on e.id = tr.empresa_id
    join public.centros_trabajo c on c.empresa_id = tr.empresa_id and c.id = tr.centro_trabajo_id
   where tr.telefono = v_tel and tr.fecha_baja is null;
  if not found then
    return jsonb_build_object('ok', true, 'registrado', false);
  end if;
  if t.telefono_verificado_en is null then
    return jsonb_build_object('ok', true, 'registrado', true, 'vinculado', false, 'tiene_pin', t.tiene_pin);
  end if;
  return jsonb_build_object(
    'ok', true, 'registrado', true, 'vinculado', true,
    'nombre', t.nombre, 'empresa', t.razon_social, 'zona_horaria', t.zona_horaria,
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'hora_efectiva', e.hora_efectiva,
               'puede_salir', e.puede_salir, 'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido)
             order by e.id)
        from public.eventos e
       where e.trabajador_id = t.id
         and (e.hora_efectiva > now() - interval '36 hours' or e.hora_servidor > now() - interval '36 hours')
    ), '[]'::jsonb),
    'semanas_por_revisar', coalesce((
      select jsonb_agg(jsonb_build_object('lunes', s.lunes, 'clase', s.clase) order by s.lunes)
        from public._semanas_por_confirmar(t.id) s
    ), '[]'::jsonb)
  );
end;
$$;

-- Vincula el teléfono con el PIN de la persona (mismo bloqueo que el kiosco: 5 fallos → 15 min).
create function public.whatsapp_vincular(p_secreto text, p_telefono text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._telefono_normalizado(p_telefono);
  v_t   public.trabajadores;
  v_pin public.pines_trabajador;
  v_ok  boolean;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  select * into v_t from public.trabajadores where telefono = v_tel and fecha_baja is null;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'NO_REGISTRADO');
  end if;
  select * into v_pin from public.pines_trabajador where trabajador_id = v_t.id for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'SIN_PIN');
  end if;
  if v_pin.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'codigo', 'BLOQUEADO',
      'minutos', ceil(extract(epoch from v_pin.bloqueado_hasta - now()) / 60));
  end if;
  v_ok := coalesce(extensions.crypt(coalesce(p_pin, ''), v_pin.pin_hash) = v_pin.pin_hash, false);
  if not v_ok then
    update public.pines_trabajador
       set intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
     where trabajador_id = v_t.id;
    return jsonb_build_object('ok', false, 'codigo', 'PIN');
  end if;
  update public.pines_trabajador set intentos_fallidos = 0, bloqueado_hasta = null where trabajador_id = v_t.id;
  update public.trabajadores set telefono_verificado_en = now() where id = v_t.id;
  return jsonb_build_object('ok', true, 'nombre', v_t.nombre);
end;
$$;

-- Registra una checada. p_id_cliente se deriva del id del mensaje de WhatsApp: si Meta
-- reintenta la entrega, no se duplica.
create function public.whatsapp_checar(
  p_secreto text, p_telefono text, p_tipo public.tipo_evento, p_id_cliente uuid, p_evidencia jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := public._telefono_normalizado(p_telefono);
  v_t   public.trabajadores;
  v_ev  public.eventos;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  if p_tipo not in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa') then
    return jsonb_build_object('ok', false, 'codigo', 'TIPO');
  end if;
  select * into v_t from public.trabajadores
   where telefono = v_tel and fecha_baja is null and telefono_verificado_en is not null;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'NO_VINCULADO');
  end if;
  select * into v_ev from public.eventos where empresa_id = v_t.empresa_id and id_cliente = p_id_cliente;
  if found then
    return jsonb_build_object('ok', true, 'duplicado', true, 'nombre', v_t.nombre,
                              'hora_efectiva', v_ev.hora_efectiva, 'secuencia', v_ev.secuencia);
  end if;
  insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, evidencia)
  values (v_t.empresa_id, v_t.id, p_tipo, 'whatsapp', p_id_cliente,
          coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('telefono', v_tel))
  returning * into v_ev;
  return jsonb_build_object('ok', true, 'nombre', v_t.nombre,
                            'hora_efectiva', v_ev.hora_efectiva, 'secuencia', v_ev.secuencia);
end;
$$;

-- Privilegios: solo las tres funciones del webhook son ejecutables por la API (con secreto).
revoke execute on function
  public._telefono_normalizado(text),
  public.trabajadores_proteger_telefono(),
  public.configurar_secreto_servicio(text, text),
  public._servicio_autorizado(text, text),
  public.whatsapp_estado(text, text),
  public.whatsapp_vincular(text, text, text),
  public.whatsapp_checar(text, text, public.tipo_evento, uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.whatsapp_estado(text, text),
  public.whatsapp_vincular(text, text, text),
  public.whatsapp_checar(text, text, public.tipo_evento, uuid, jsonb)
to anon, authenticated;
-- El trigger normaliza con esta función en nombre de quien escribe la ficha: es pura.
grant execute on function public._telefono_normalizado(text) to authenticated;
