-- =============================================================================
-- Checador: suscripción de cada empresa (fase 1: estado y prueba gratis)
--
-- Precio escalonado por persona trabajadora activa (docs/cobro.md): $199 al mes incluye hasta
-- 2 personas; de la 3.ª a la 10.ª, $50 cada una; de la 11.ª a la 40.ª, $30 cada una; más de 40,
-- cotización. Más IVA. El cálculo vive en apps/web/lib/precios.ts; el cobro (fase 2) lo hará
-- el proveedor de pagos, que escribirá aquí con el secreto del servicio "cobro".
--
-- Cada empresa nueva empieza con 30 días de prueba con todas las funciones. Esta fase NO
-- restringe nada: solo informa. Las restricciones por falta de pago (fase 3) nunca impedirán
-- exportar ni que cada persona consulte sus registros.
-- =============================================================================

create type public.estado_suscripcion as enum ('prueba', 'activa', 'pago_vencido', 'cancelada');

create table public.suscripciones (
  empresa_id          uuid primary key references public.empresas (id),
  estado              public.estado_suscripcion not null default 'prueba',
  prueba_hasta        timestamptz not null,
  -- Fase 2 (proveedor de pagos): hasta cuándo está pagado, desde cuándo no se ha podido cobrar,
  -- ciclo, identificadores del cliente y la suscripción en el proveedor, y personas cobradas.
  periodo_fin         timestamptz,
  pago_vencido_desde  timestamptz,
  ciclo               text not null default 'mensual' check (ciclo in ('mensual', 'anual')),
  proveedor           text check (proveedor in ('stripe')),
  cliente_externo     text check (length(cliente_externo) <= 255),
  suscripcion_externa text check (length(suscripcion_externa) <= 255),
  personas_cobradas   integer check (personas_cobradas >= 0),
  creada_en           timestamptz not null default now(),
  actualizada_en      timestamptz not null default now(),
  check ((estado = 'pago_vencido') = (pago_vencido_desde is not null))
);
alter table public.suscripciones enable row level security;
-- Solo quien administra la empresa ve su suscripción; nadie escribe por la API.
create policy suscripciones_select on public.suscripciones for select to authenticated
  using (public.es_gestor(empresa_id));
revoke all on public.suscripciones from public, anon, authenticated;
grant select on public.suscripciones to authenticated;

-- Prueba de 30 días al crear la empresa.
create function public.crear_suscripcion_empresa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.suscripciones (empresa_id, prueba_hasta) values (new.id, now() + interval '30 days');
  return new;
end;
$$;
revoke execute on function public.crear_suscripcion_empresa() from public, anon, authenticated;
create trigger empresas_crear_suscripcion after insert on public.empresas
  for each row execute function public.crear_suscripcion_empresa();

-- Empresas que ya existían: 30 días de prueba a partir de hoy.
insert into public.suscripciones (empresa_id, prueba_hasta)
select id, now() + interval '30 days' from public.empresas
on conflict (empresa_id) do nothing;
