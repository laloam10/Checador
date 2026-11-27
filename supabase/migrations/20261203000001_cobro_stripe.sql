-- =============================================================================
-- Checador: cobro con Stripe (fase 2 de docs/cobro.md)
--
-- La app (servidor) es la única que escribe la suscripción, con el secreto del servicio
-- "cobro" (nunca la llave service_role):  select public.configurar_secreto_servicio('cobro', '<secreto>');
--   * cobro_vincular_cliente: al contratar, guarda el cliente de Stripe de la empresa (para no
--     crear dos si se vuelve a intentar).
--   * cobro_actualizar: con cada aviso de Stripe (suscripción creada, cambiada o cancelada).
-- Esta fase tampoco restringe nada por falta de pago (eso es la fase 3).
-- =============================================================================

create function public.cobro_vincular_cliente(p_secreto text, p_empresa uuid, p_cliente text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public._servicio_autorizado('cobro', p_secreto) then
    raise exception 'Servicio no autorizado' using errcode = 'insufficient_privilege';
  end if;
  if p_cliente is null or p_cliente !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'Cliente inválido' using errcode = 'check_violation';
  end if;
  update public.suscripciones
     set proveedor = 'stripe', cliente_externo = p_cliente, actualizada_en = now()
   where empresa_id = p_empresa and (cliente_externo is null or cliente_externo = p_cliente);
  return found;
end;
$$;

create function public.cobro_actualizar(
  p_secreto text, p_empresa uuid, p_estado public.estado_suscripcion, p_periodo_fin timestamptz,
  p_ciclo text, p_cliente text, p_suscripcion text, p_personas integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public._servicio_autorizado('cobro', p_secreto) then
    raise exception 'Servicio no autorizado' using errcode = 'insufficient_privilege';
  end if;
  if p_estado is null or p_ciclo not in ('mensual', 'anual')
     or p_cliente !~ '^cus_[A-Za-z0-9]+$' or p_suscripcion !~ '^sub_[A-Za-z0-9]+$' then
    raise exception 'Datos de cobro inválidos' using errcode = 'check_violation';
  end if;
  update public.suscripciones
     set estado              = p_estado,
         periodo_fin         = p_periodo_fin,
         pago_vencido_desde  = case when p_estado = 'pago_vencido' then coalesce(pago_vencido_desde, now()) end,
         ciclo               = p_ciclo,
         proveedor           = 'stripe',
         cliente_externo     = p_cliente,
         suscripcion_externa = p_suscripcion,
         personas_cobradas   = greatest(coalesce(p_personas, 0), 0),
         actualizada_en      = now()
   where empresa_id = p_empresa;
  return found;
end;
$$;

revoke execute on function
  public.cobro_vincular_cliente(text, uuid, text),
  public.cobro_actualizar(text, uuid, public.estado_suscripcion, timestamptz, text, text, text, integer)
from public;
-- Las llama el servidor de la app: con la sesión de quien contrata o sin sesión (avisos de
-- Stripe). Sin el secreto no hacen nada.
grant execute on function
  public.cobro_vincular_cliente(text, uuid, text),
  public.cobro_actualizar(text, uuid, public.estado_suscripcion, timestamptz, text, text, text, integer)
to anon, authenticated;
