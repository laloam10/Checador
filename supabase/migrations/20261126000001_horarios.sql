-- =============================================================================
-- Checador: horarios de trabajo
--
-- La empresa define horarios (días, entrada, salida, comida y tolerancia) y elige uno por
-- omisión; cada persona usa el de la empresa, uno propio o ninguno ("sin horario fijo").
--
-- Para qué sirve:
--   * Señales informativas: retardo, salida anticipada, trabajo fuera de horario y en día no
--     programado (packages/jornada/src/horario.ts). No tienen efecto legal: no bloquean ni
--     corrigen checadas (el registro debe ser fiel, art. 132 fr. XXXIV LFT), no calculan
--     descuentos (art. 110) y no van en las exportaciones para la autoridad.
--   * Jornada pactada (art. 58, 2.º párr.): si a la persona le aplica un horario, su
--     jornada pactada por día se calcula de él y ya no se captura a mano. Así no hay dos
--     datos que puedan contradecirse. El motor y el acuerdo siguen leyendo
--     trabajadores.jornada_pactada_min, que aquí se mantiene al día con triggers.
--   * El tiempo extra se sigue midiendo por duración (arts. 66 a 68), no por la hora del reloj.
--
-- Minutos pactados de un día = salida − entrada, menos la comida si en el centro de trabajo
-- se puede salir durante la pausa (si no se puede, la pausa es tiempo efectivo, art. 64).
-- Un turno cuya salida es igual o anterior a la entrada termina al día siguiente.
-- =============================================================================

-- "HH:mm" → minutos desde la medianoche.
create function public._minutos_hhmm(p text) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select split_part(p, ':', 1)::integer * 60 + split_part(p, ':', 2)::integer
$$;

-- Duración en minutos de un tramo "HH:mm" a "HH:mm" (cruza la medianoche si fin <= inicio).
create function public._duracion_hhmm(p_inicio text, p_fin text) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select (public._minutos_hhmm(p_fin) - public._minutos_hhmm(p_inicio) + 1440 - 1) % 1440 + 1
$$;

-- Estructura válida de horarios.dias: {"1": {"entrada": "08:00", "salida": "17:00",
-- "pausa_inicio": "13:00", "pausa_fin": "14:00"}, ...}; claves 0 (domingo) a 6 (sábado).
create function public._horario_valido(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  bruto integer;
  pausa integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or p = '{}'::jsonb then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    if k !~ '^[0-6]$' or jsonb_typeof(v) <> 'object' then return false; end if;
    if coalesce(v ->> 'entrada', '') !~ re or coalesce(v ->> 'salida', '') !~ re then return false; end if;
    if exists (select 1 from jsonb_object_keys(v) x where x not in ('entrada', 'salida', 'pausa_inicio', 'pausa_fin')) then
      return false;
    end if;
    bruto := public._duracion_hhmm(v ->> 'entrada', v ->> 'salida');
    if bruto > 16 * 60 then return false; end if;
    if (v ? 'pausa_inicio') <> (v ? 'pausa_fin') then return false; end if;
    if v ? 'pausa_inicio' then
      if (v ->> 'pausa_inicio') !~ re or (v ->> 'pausa_fin') !~ re then return false; end if;
      pausa := public._duracion_hhmm(v ->> 'pausa_inicio', v ->> 'pausa_fin');
      -- La comida debe quedar dentro del turno.
      if public._duracion_hhmm(v ->> 'entrada', v ->> 'pausa_inicio') + pausa >= bruto then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

-- Jornada pactada por día que resulta de un horario.
create function public._jornada_de_horario(p_dias jsonb, p_pausa_puede_salir boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_object_agg(k,
           public._duracion_hhmm(v ->> 'entrada', v ->> 'salida')
           - case when p_pausa_puede_salir and v ? 'pausa_inicio'
                  then public._duracion_hhmm(v ->> 'pausa_inicio', v ->> 'pausa_fin') else 0 end)
    from jsonb_each(p_dias) as d(k, v)
$$;

-- -----------------------------------------------------------------------------
-- Tabla
-- -----------------------------------------------------------------------------
create table public.horarios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete restrict,
  nombre         text not null check (length(btrim(nombre)) between 1 and 60),
  dias           jsonb not null check (public._horario_valido(dias)),
  tolerancia_min smallint not null default 10 check (tolerancia_min between 0 and 60),
  creado_en      timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, nombre)
);
alter table public.horarios enable row level security;
create policy horarios_select on public.horarios for select to authenticated
  using (public.mi_rol(empresa_id) is not null or public.trabajo_en(empresa_id));
create policy horarios_insert on public.horarios for insert to authenticated with check (public.es_gestor(empresa_id));
create policy horarios_update on public.horarios for update to authenticated
  using (public.es_gestor(empresa_id)) with check (public.es_gestor(empresa_id));
create policy horarios_delete on public.horarios for delete to authenticated using (public.es_gestor(empresa_id));
revoke all on public.horarios from public, anon, authenticated;
grant select, insert, update, delete on public.horarios to authenticated;

-- Horario por omisión de la empresa y horario de cada persona (siempre de la misma empresa).
alter table public.empresas add column horario_predeterminado uuid;
alter table public.empresas add constraint empresas_horario_predeterminado_fkey
  foreign key (id, horario_predeterminado) references public.horarios (empresa_id, id) on delete set null (horario_predeterminado);
alter table public.trabajadores
  add column horario_id uuid,
  add column sin_horario_fijo boolean not null default false;
alter table public.trabajadores add constraint trabajadores_horario_fkey
  foreign key (empresa_id, horario_id) references public.horarios (empresa_id, id) on delete set null (horario_id);

-- -----------------------------------------------------------------------------
-- Jornada pactada derivada del horario
-- -----------------------------------------------------------------------------
create function public.trabajadores_jornada_de_horario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_horario uuid;
  v_dias    jsonb;
  v_puede   boolean;
begin
  if new.sin_horario_fijo then
    new.horario_id := null;
    return new;
  end if;
  v_horario := coalesce(new.horario_id, (select horario_predeterminado from public.empresas where id = new.empresa_id));
  if v_horario is null then
    return new;
  end if;
  select dias into v_dias from public.horarios where id = v_horario;
  select pausa_puede_salir into v_puede from public.centros_trabajo where id = new.centro_trabajo_id;
  new.jornada_pactada_min := public._jornada_de_horario(v_dias, coalesce(v_puede, true));
  return new;
end;
$$;
create trigger trabajadores_jornada_de_horario before insert or update on public.trabajadores
  for each row execute function public.trabajadores_jornada_de_horario();

-- Si cambia un horario, el horario por omisión o la regla de la pausa del centro, se
-- recalcula la jornada de las personas activas afectadas (el trigger de arriba lo hace).
create function public._recalcular_jornadas(p_empresa uuid, p_centro uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.trabajadores t set sin_horario_fijo = t.sin_horario_fijo
   where t.empresa_id = p_empresa and t.fecha_baja is null
     and (p_centro is null or t.centro_trabajo_id = p_centro)
$$;

create function public.horarios_recalcular() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._recalcular_jornadas(new.empresa_id);
  return null;
end;
$$;
create trigger horarios_recalcular after update of dias on public.horarios
  for each row when (old.dias is distinct from new.dias) execute function public.horarios_recalcular();

create function public.empresas_recalcular_horario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._recalcular_jornadas(new.id);
  return null;
end;
$$;
create trigger empresas_recalcular_horario after update of horario_predeterminado on public.empresas
  for each row when (old.horario_predeterminado is distinct from new.horario_predeterminado)
  execute function public.empresas_recalcular_horario();

create function public.centros_recalcular_horario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._recalcular_jornadas(new.empresa_id, new.id);
  return null;
end;
$$;
create trigger centros_recalcular_horario after update of pausa_puede_salir on public.centros_trabajo
  for each row when (old.pausa_puede_salir is distinct from new.pausa_puede_salir)
  execute function public.centros_recalcular_horario();

-- -----------------------------------------------------------------------------
-- Privilegios. Las funciones puras se usan en el CHECK de la tabla: quien inserta o
-- actualiza un horario necesita poder ejecutarlas.
-- -----------------------------------------------------------------------------
revoke execute on function
  public._minutos_hhmm(text), public._duracion_hhmm(text, text), public._horario_valido(jsonb),
  public._jornada_de_horario(jsonb, boolean), public.trabajadores_jornada_de_horario(),
  public._recalcular_jornadas(uuid, uuid), public.horarios_recalcular(),
  public.empresas_recalcular_horario(), public.centros_recalcular_horario()
from public, anon, authenticated;
grant execute on function public._minutos_hhmm(text), public._duracion_hhmm(text, text), public._horario_valido(jsonb)
  to authenticated;
