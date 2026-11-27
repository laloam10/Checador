-- =============================================================================
-- Checador: interruptor del cobro
--
-- Las reglas de cobro (prueba que termina, falta de pago, conservación y aviso de borrado) solo
-- aplican con el cobro encendido. Así la versión con cobro puede estar en producción antes de
-- que Stripe esté activo sin bloquear a nadie: con el cobro apagado, situacion_cobro() responde
-- 'ninguna' para todas las empresas (decisión del 2026-11-27; docs/cobro.md, «Interruptor»).
--
-- Valor inicial: encendido si ya hay suscripciones de Stripe (checador-pruebas y el Supabase
-- local), apagado si no (producción). Jemba lo enciende en el editor SQL con activar_cobro().
-- =============================================================================

create table public.ajustes_cobro (
  id            boolean primary key default true check (id),  -- una sola fila
  activo        boolean not null,
  cambiado_en   timestamptz not null default now()
);
alter table public.ajustes_cobro enable row level security;
revoke all on public.ajustes_cobro from public, anon, authenticated;
insert into public.ajustes_cobro (activo)
select exists (select 1 from public.suscripciones where proveedor = 'stripe');

-- La lógica de siempre (20261208000001) queda como _cobro_situacion_base; _cobro_situacion le
-- antepone el interruptor. Los disparadores y situacion_cobro() siguen llamando a _cobro_situacion.
alter function public._cobro_situacion(uuid) rename to _cobro_situacion_base;

create function public._cobro_situacion(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce((select activo from public.ajustes_cobro), false)
              then public._cobro_situacion_base(p_empresa) || jsonb_build_object('cobro_activo', true)
              else jsonb_build_object('nivel', 'ninguna', 'cobro_activo', false) end
$$;
revoke execute on function public._cobro_situacion(uuid) from public, anon, authenticated;

-- Para Jemba, en el editor SQL, el día que Stripe esté activo en modo real:
--   select public.activar_cobro();     -- 30 días de prueba desde hoy a quien esté en prueba
--   select public.activar_cobro(45);   -- o los días que decidas (mínimo 14)
-- Quien sigue en prueba sin tarjeta recibe al menos p_dias_prueba días desde hoy: sin esto, las
-- pruebas que «terminaron» con el cobro apagado pasarían a solo lectura al encenderlo.
create function public.activar_cobro(p_dias_prueba integer default 30) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_extendidas integer;
begin
  if p_dias_prueba is null or p_dias_prueba < 14 then
    raise exception 'La prueba al activar el cobro debe ser de al menos 14 días' using errcode = 'check_violation';
  end if;
  if (select activo from public.ajustes_cobro) then
    return jsonb_build_object('activo', true, 'cambio', false, 'mensaje', 'El cobro ya estaba encendido');
  end if;
  update public.suscripciones
     set prueba_hasta = greatest(prueba_hasta, now() + make_interval(days => p_dias_prueba)), actualizada_en = now()
   where estado = 'prueba' and suscripcion_externa is null;
  get diagnostics v_extendidas = row_count;
  update public.ajustes_cobro set activo = true, cambiado_en = now();
  return jsonb_build_object('activo', true, 'cambio', true, 'pruebas_extendidas', v_extendidas,
    'prueba_hasta', now() + make_interval(days => p_dias_prueba));
end;
$$;

-- Emergencia (por ejemplo, Stripe caído): apaga todas las restricciones de cobro.
create function public.desactivar_cobro() returns jsonb
language plpgsql set search_path = '' as $$
begin
  update public.ajustes_cobro set activo = false, cambiado_en = now();
  return jsonb_build_object('activo', false);
end;
$$;

revoke execute on function public.activar_cobro(integer), public.desactivar_cobro() from public, anon, authenticated;
