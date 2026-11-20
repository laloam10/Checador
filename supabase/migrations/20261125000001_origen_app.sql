-- =============================================================================
-- Checador: origen 'app' en la bitácora (fase 2 de docs/plan-app-movil.md)
--
-- La app instalada desde las tiendas registra checadas por la misma ruta que la PWA
-- (/api/eventos), con el token de sesión de la persona. Para distinguirlas en la bitácora
-- y en las exportaciones, quedan con origen 'app' (la PWA sigue siendo 'pwa'). Las reglas
-- son las mismas: solo la propia persona trabajadora, solo entrada/salida/pausas, y la
-- pausa toma la regla del centro de trabajo (art. 64 LFT).
--
-- 'app' se compara como texto: un valor nuevo de un enum no puede usarse como literal en
-- la misma transacción en que se agrega.
-- =============================================================================

alter type public.origen_evento add value if not exists 'app';

drop policy eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (
    (origen::text in ('pwa', 'app')
       and tipo in ('entrada', 'salida', 'inicio_pausa', 'fin_pausa')
       and public.soy_trabajador(trabajador_id))
    or (origen = 'panel' and public.puede_consultar(empresa_id))
  );

create or replace function public.eventos_pausa_segun_centro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'inicio_pausa' and new.origen::text in ('pwa', 'app', 'kiosco', 'whatsapp') then
    select c.pausa_puede_salir into new.puede_salir
      from public.trabajadores t
      join public.centros_trabajo c on c.id = t.centro_trabajo_id
     where t.id = new.trabajador_id;
  end if;
  return new;
end;
$$;
