-- =============================================================================
-- Checador: aceptación de los términos y del aviso de privacidad, y aviso de cada empresa
--
-- * aceptaciones_legales: quién aceptó, en nombre de qué empresa, qué versiones, cuándo y desde
--   dónde (IP y navegador). Solo inserción: una versión nueva se acepta con un registro nuevo.
--   Lo acepta el propietario (términos, cláusula 1.2: quien crea la cuenta obliga al Cliente).
-- * empresas.aviso_privacidad_url: enlace al aviso de privacidad de la empresa para su personal
--   (la empresa es responsable de los datos de su personal; modelo en
--   docs/legal/modelo-aviso-privacidad-personal.md). La app y el kiosco lo muestran.
-- =============================================================================

create table public.aceptaciones_legales (
  id                 bigint generated always as identity primary key,
  empresa_id         uuid not null references public.empresas (id),
  user_id            uuid not null references auth.users (id),
  terminos_version   text not null check (terminos_version ~ '^[0-9]+(\.[0-9]+)*$' and length(terminos_version) <= 20),
  privacidad_version text not null check (privacidad_version ~ '^[0-9]+(\.[0-9]+)*$' and length(privacidad_version) <= 20),
  aceptado_en        timestamptz not null default now(),
  evidencia          jsonb not null default '{}'::jsonb check (jsonb_typeof(evidencia) = 'object')
);
create index aceptaciones_legales_empresa_idx on public.aceptaciones_legales (empresa_id, aceptado_en desc);
alter table public.aceptaciones_legales enable row level security;
create policy aceptaciones_legales_select on public.aceptaciones_legales for select to authenticated
  using (public.es_gestor(empresa_id));
revoke all on public.aceptaciones_legales from public, anon, authenticated;
grant select on public.aceptaciones_legales to authenticated;
create trigger aceptaciones_legales_solo_insercion before update or delete on public.aceptaciones_legales
  for each row execute function public.prohibir_modificacion();

-- El propietario acepta las versiones vigentes en nombre de su empresa.
create function public.aceptar_documentos_legales(p_empresa uuid, p_terminos text, p_privacidad text, p_evidencia jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if auth.uid() is null or public.mi_rol(p_empresa) is distinct from 'propietario' then
    raise exception 'Solo el propietario de la cuenta puede aceptar los términos' using errcode = 'insufficient_privilege';
  end if;
  insert into public.aceptaciones_legales (empresa_id, user_id, terminos_version, privacidad_version, evidencia)
  values (p_empresa, auth.uid(), p_terminos, p_privacidad,
          case when jsonb_typeof(p_evidencia) = 'object' then p_evidencia else '{}'::jsonb end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.aceptar_documentos_legales(uuid, text, text, jsonb) from public, anon;
grant execute on function public.aceptar_documentos_legales(uuid, text, text, jsonb) to authenticated;

alter table public.empresas
  add column aviso_privacidad_url text
  check (aviso_privacidad_url ~ '^https://[^\s]+$' and length(aviso_privacidad_url) <= 500);
