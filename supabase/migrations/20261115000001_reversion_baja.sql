-- =============================================================================
-- Checador: historial de bajas y forma segura de deshacer una baja por error
--
-- La baja define hasta cuándo hay que conservar los registros (durante la relación
-- y un año después, LFT art. 804). Por eso:
--   * Cada baja y cada reversión queda en historial_bajas (solo inserción): quién,
--     cuándo, qué fecha y, al deshacer, por qué.
--   * Por la API ya no se puede quitar ni cambiar la fecha de baja editando la ficha:
--     solo con revertir_baja(), que exige un motivo. Para corregir la fecha de una baja,
--     se deshace y se registra de nuevo; ambas cosas quedan en el historial.
-- =============================================================================

create table public.historial_bajas (
  id             bigint generated always as identity primary key,
  empresa_id     uuid not null,
  trabajador_id  uuid not null,
  accion         text not null check (accion in ('baja', 'reversion')),
  fecha_baja     date not null,          -- la fecha registrada o la que se deshizo
  motivo         text check (accion <> 'reversion' or length(btrim(coalesce(motivo, ''))) > 0),
  user_id        uuid,
  creado_en      timestamptz not null default now(),
  foreign key (empresa_id, trabajador_id) references public.trabajadores (empresa_id, id)
);
create index historial_bajas_trabajador_idx on public.historial_bajas (trabajador_id, creado_en);
create trigger historial_bajas_solo_insercion before update or delete on public.historial_bajas
  for each row execute function public.prohibir_modificacion();

alter table public.historial_bajas enable row level security;
create policy historial_bajas_select on public.historial_bajas for select to authenticated
  using (public.puede_consultar(empresa_id));
grant select on public.historial_bajas to authenticated;   -- sin INSERT: lo escribe el trigger
grant all on public.historial_bajas to service_role;

-- Bloquea quitar o cambiar una baja por la API (debe usarse revertir_baja()).
create function public.trabajadores_proteger_baja() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.fecha_baja is not null and new.fecha_baja is distinct from old.fecha_baja
     and current_user in ('authenticated', 'anon') then
    raise exception 'Una baja solo se deshace con su motivo (revertir_baja); la fecha no se edita directamente'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger trabajadores_proteger_baja before update of fecha_baja on public.trabajadores
  for each row execute function public.trabajadores_proteger_baja();

-- Anota en el historial cada cambio de la fecha de baja (también los hechos fuera de la API).
create function public.trabajadores_historial_baja() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fecha_baja is not distinct from old.fecha_baja then
    return null;
  end if;
  if old.fecha_baja is not null then
    insert into public.historial_bajas (empresa_id, trabajador_id, accion, fecha_baja, motivo, user_id)
    values (new.empresa_id, new.id, 'reversion', old.fecha_baja,
            coalesce(nullif(current_setting('checador.motivo_reversion', true), ''), 'Cambio directo en la base de datos'),
            auth.uid());
  end if;
  if new.fecha_baja is not null then
    insert into public.historial_bajas (empresa_id, trabajador_id, accion, fecha_baja, user_id)
    values (new.empresa_id, new.id, 'baja', new.fecha_baja, auth.uid());
  end if;
  return null;
end;
$$;
create trigger trabajadores_historial_baja after update of fecha_baja on public.trabajadores
  for each row execute function public.trabajadores_historial_baja();

-- Deshacer una baja registrada por error (propietario o administrador, con motivo).
create function public.revertir_baja(p_trabajador uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.trabajadores;
begin
  select * into v from public.trabajadores where id = p_trabajador;
  if not found or not public.es_gestor(v.empresa_id) then
    raise exception 'Solo el propietario o un administrador pueden deshacer una baja' using errcode = 'insufficient_privilege';
  end if;
  if v.fecha_baja is null then
    raise exception 'Esta persona no está dada de baja' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica por qué se deshace la baja' using errcode = 'check_violation';
  end if;
  perform set_config('checador.motivo_reversion', left(btrim(p_motivo), 1000), true);
  update public.trabajadores set fecha_baja = null where id = p_trabajador;
  perform set_config('checador.motivo_reversion', '', true);
end;
$$;
revoke execute on function public.revertir_baja(uuid, text) from public, anon;
grant execute on function public.revertir_baja(uuid, text) to authenticated;
revoke execute on function public.trabajadores_proteger_baja() from public, anon, authenticated;
revoke execute on function public.trabajadores_historial_baja() from public, anon, authenticated;

-- Bajas anteriores a esta migración: se anotan en el historial sin autor.
insert into public.historial_bajas (empresa_id, trabajador_id, accion, fecha_baja, creado_en)
select empresa_id, id, 'baja', fecha_baja, now() from public.trabajadores where fecha_baja is not null;
