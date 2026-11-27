-- =============================================================================
-- Checador: una prueba que termina sin forma de pago se suspende a los 7 días
--
-- Decisión del 2026-11-28 (docs/cobro.md). Sigue a 20261205000001:
--   primer día después de la prueba    aviso (agrega una tarjeta)
--   desde el día siguiente             solo lectura
--   a los 7 días del fin de la prueba  suspendida (antes, 30)
-- El pago vencido de una suscripción ya contratada no cambia (15 y 30 días).
-- =============================================================================

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
  )
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
  end
$$;
