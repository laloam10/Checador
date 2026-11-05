-- =============================================================================
-- Checador: registro de exportaciones para inspección o juicio
--
--   * Cada archivo emitido (PDF o CSV) queda registrado con la huella SHA-256 del
--     archivo y de los datos, el estado de la cadena al emitirlo, quién y cuándo.
--   * Solo inserción: permite comprobar después si un archivo entregado a la
--     autoridad o en juicio es idéntico al que emitió el sistema.
-- =============================================================================

create table public.exportaciones (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id) on delete restrict,
  -- null = todos los trabajadores de la empresa
  trabajador_id     uuid references public.trabajadores (id) on delete restrict,
  desde             date not null,
  hasta             date not null check (hasta >= desde),
  formato           text not null check (formato in ('pdf', 'csv_bitacora', 'csv_resumen')),
  hash_archivo      bytea not null check (length(hash_archivo) = 32),
  hash_datos        bytea not null check (length(hash_datos) = 32),
  -- Estado de la cadena y resultado de la verificación al momento de emitir.
  cadena_secuencia  bigint not null,
  cadena_hash       bytea not null,
  cadena_integra    boolean not null,
  generado_por      uuid,
  generado_en       timestamptz not null default now()
);
create index exportaciones_empresa_idx on public.exportaciones (empresa_id, generado_en desc);
create index exportaciones_hash_idx on public.exportaciones (hash_archivo);

create function public.exportaciones_antes_de_insertar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.generado_por := auth.uid();
  new.generado_en  := clock_timestamp();
  if new.trabajador_id is not null and not exists (
       select 1 from public.trabajadores where id = new.trabajador_id and empresa_id = new.empresa_id) then
    raise exception 'El trabajador no pertenece a la empresa' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger exportaciones_antes_de_insertar before insert on public.exportaciones
  for each row execute function public.exportaciones_antes_de_insertar();
create trigger exportaciones_solo_insercion before update or delete on public.exportaciones
  for each row execute function public.prohibir_modificacion();

alter table public.exportaciones enable row level security;
create policy exportaciones_select on public.exportaciones for select to authenticated
  using (public.puede_consultar(empresa_id));
create policy exportaciones_insert on public.exportaciones for insert to authenticated
  with check (public.puede_consultar(empresa_id));
