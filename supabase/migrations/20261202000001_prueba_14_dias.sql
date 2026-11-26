-- =============================================================================
-- Checador: la prueba gratis dura 14 días (antes 30; migración 20261201000001)
--
-- Decisión del 2026-11-26 (docs/cobro.md). Las pruebas en curso se recortan a 14 días desde
-- que se creó su suscripción, sin quedar en el pasado: a quien ya pasó de 14 días le queda
-- hasta hoy.
-- =============================================================================

create or replace function public.crear_suscripcion_empresa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.suscripciones (empresa_id, prueba_hasta) values (new.id, now() + interval '14 days');
  return new;
end;
$$;

update public.suscripciones
   set prueba_hasta = greatest(creada_en + interval '14 days', now()), actualizada_en = now()
 where estado = 'prueba' and prueba_hasta > creada_en + interval '14 days';
