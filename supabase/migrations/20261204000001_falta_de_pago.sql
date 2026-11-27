-- =============================================================================
-- Checador: restricciones por falta de pago (fase 3 de docs/cobro.md; términos, cláusula 7)
--
--   Días sin pagar     Nivel          Qué pasa
--   0 a 15             aviso          Todo funciona; el panel avisa
--   15 a 30            solo_lectura   Sin altas, sin deshacer bajas, sin capturas ni correcciones del panel,
--                                     sin generar acuerdos
--   más de 30          suspendida     Además, no se registran checadas (app, kiosco y WhatsApp lo dicen)
--
-- Se cuenta desde que no se pudo cobrar (pago_vencido_desde) o desde que terminó la prueba sin
-- forma de pago. Una suscripción cancelada queda suspendida (al terminar el periodo pagado, que
-- es cuando Stripe la cancela).
--
-- Nunca se restringe: exportar, consultar registros (empresa y personal), dar conformidad,
-- firmar acuerdos ya generados, dar de baja (reduce el cobro) ni la configuración.
-- Una checada hecha SIN CONEXIÓN antes de la suspensión se acepta aunque llegue después: si no,
-- se perdería un registro real de la jornada (art. 132 fr. XXXIV LFT).
-- Las restricciones viven en la base (disparadores): aplican por cualquier vía.
-- =============================================================================

-- Nivel de restricción y desde cuándo aplica cada etapa.
create function public._cobro_situacion(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (
    select su.*,
           case
             when su.estado = 'pago_vencido' then su.pago_vencido_desde
             -- Prueba terminada sin forma de pago (con tarjeta, el proveedor cobra al terminar).
             when su.estado = 'prueba' and su.suscripcion_externa is null and su.prueba_hasta <= now() then su.prueba_hasta
           end as base
      from public.suscripciones su where su.empresa_id = p_empresa
  )
  select case
    when not exists (select 1 from s) then jsonb_build_object('nivel', 'ninguna')
    when (select estado from s) = 'cancelada' then
      jsonb_build_object('nivel', 'suspendida', 'motivo', 'cancelada', 'suspendida_desde', (select coalesce(periodo_fin, actualizada_en) from s))
    when (select base from s) is null then jsonb_build_object('nivel', 'ninguna')
    else (select jsonb_build_object(
            'nivel', case when now() < base + interval '15 days' then 'aviso'
                          when now() < base + interval '30 days' then 'solo_lectura'
                          else 'suspendida' end,
            'motivo', case when estado = 'pago_vencido' then 'pago_vencido' else 'prueba_terminada' end,
            'desde', base,
            'solo_lectura_desde', base + interval '15 days',
            'suspendida_desde', base + interval '30 days') from s)
  end
$$;

-- Para el panel y la app: la situación de la empresa, solo para sus miembros y su personal.
create function public.situacion_cobro(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.puede_consultar(p_empresa)
          or exists (select 1 from public.trabajadores t where t.empresa_id = p_empresa and t.user_id = auth.uid())) then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  return public._cobro_situacion(p_empresa);
end;
$$;

-- Lanza el error que ve la persona si la acción no está permitida en el nivel actual.
-- p_accion: 'gestion' (panel) o 'registro' (checadas). p_hora_dispositivo: para checadas sin conexión.
create function public._exigir_cobro(p_empresa uuid, p_accion text, p_hora_dispositivo timestamptz default null) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb := public._cobro_situacion(p_empresa);
  v_nivel text := v ->> 'nivel';
begin
  if p_accion = 'gestion' and v_nivel in ('solo_lectura', 'suspendida') then
    raise exception 'El panel está en solo lectura por falta de pago. Actualiza la forma de pago en Configuración → Suscripción; tus registros siguen disponibles para consultar y exportar.'
      using errcode = 'check_violation';
  end if;
  if p_accion = 'registro' and v_nivel = 'suspendida'
     and not (p_hora_dispositivo is not null and p_hora_dispositivo < (v ->> 'suspendida_desde')::timestamptz) then
    raise exception 'El registro de jornada de tu empresa está suspendido por falta de pago. Avisa a tu empresa; tu checada no se guardó.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Checadas y capturas: las del panel son gestión; las demás, registro.
create function public.eventos_exigir_cobro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_cobro(new.empresa_id,
    case when new.origen = 'panel' then 'gestion' else 'registro' end,
    case when new.diferido then new.hora_dispositivo end);
  return new;
end;
$$;
create trigger eventos_exigir_cobro before insert on public.eventos
  for each row execute function public.eventos_exigir_cobro();

-- Altas y deshacer bajas (agregan personas); dar de baja siempre se permite.
create function public.trabajadores_exigir_cobro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (old.fecha_baja is not null and new.fecha_baja is null) then
    perform public._exigir_cobro(new.empresa_id, 'gestion');
  end if;
  return new;
end;
$$;
create trigger trabajadores_exigir_cobro before insert or update of fecha_baja on public.trabajadores
  for each row execute function public.trabajadores_exigir_cobro();

-- Generar acuerdos nuevos; firmar uno ya generado siempre se permite.
create function public.acuerdos_exigir_cobro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._exigir_cobro(new.empresa_id, 'gestion');
  return new;
end;
$$;
create trigger acuerdos_exigir_cobro before insert on public.acuerdos
  for each row execute function public.acuerdos_exigir_cobro();

-- WhatsApp: con el registro suspendido, responde el motivo en lugar de un error genérico.
create or replace function public.whatsapp_checar(
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
  begin
    insert into public.eventos (empresa_id, trabajador_id, tipo, origen, id_cliente, evidencia)
    values (v_t.empresa_id, v_t.id, p_tipo, 'whatsapp', p_id_cliente,
            coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('telefono', v_tel))
    returning * into v_ev;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'codigo', 'RECHAZADO', 'error', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'nombre', v_t.nombre,
                            'hora_efectiva', v_ev.hora_efectiva, 'secuencia', v_ev.secuencia);
end;
$$;

revoke execute on function
  public._cobro_situacion(uuid), public._exigir_cobro(uuid, text, timestamptz),
  public.eventos_exigir_cobro(), public.trabajadores_exigir_cobro(), public.acuerdos_exigir_cobro()
from public, anon, authenticated;
revoke execute on function public.situacion_cobro(uuid) from public, anon;
grant execute on function public.situacion_cobro(uuid) to authenticated;
