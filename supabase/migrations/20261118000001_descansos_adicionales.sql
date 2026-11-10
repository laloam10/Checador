-- =============================================================================
-- Checador: días de descanso adicionales pactados
--
-- La ley exige un día de descanso por cada seis de trabajo (LFT art. 69): es
-- trabajadores.dia_descanso, el descanso semanal obligatorio, y trabajarlo se paga
-- doble (art. 73). Muchas empresas dan además otro día (semana de 5 días). Ese día
-- adicional es un beneficio pactado: se guarda aparte para que el motor no le aplique
-- el art. 73 (ver packages/jornada/README.md, interpretación 7).
-- =============================================================================

create function public._sin_repetidos(a smallint[]) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select cardinality(a) = (select count(distinct x) from unnest(a) x)
$$;
-- La usa una restricción CHECK, que se evalúa con los permisos de quien escribe: es pura y no lee datos.
revoke execute on function public._sin_repetidos(smallint[]) from public, anon;
grant execute on function public._sin_repetidos(smallint[]) to authenticated;

alter table public.trabajadores
  add column dias_descanso_adicionales smallint[] not null default '{}',
  add constraint trabajadores_descansos_adicionales_validos check (
    dias_descanso_adicionales <@ '{0,1,2,3,4,5,6}'::smallint[]
    and cardinality(dias_descanso_adicionales) <= 3
    and not (dia_descanso = any (dias_descanso_adicionales))
    and public._sin_repetidos(dias_descanso_adicionales)
  );
comment on column public.trabajadores.dias_descanso_adicionales is
  'Días de descanso adicionales pactados (0 = domingo … 6 = sábado), además del descanso semanal obligatorio (dia_descanso, art. 69).';

-- Instantánea en el acuerdo, junto a dia_descanso (el texto firmado ya los incluye).
alter table public.acuerdos add column dias_descanso_adicionales smallint[] not null default '{}';

-- El kiosco necesita también los días adicionales para calcular la semana igual que la app.
create or replace function public.kiosco_semana(p_numero text, p_pin text, p_lunes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_trab uuid;
  v_t record;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  v_trab := (v ->> 'trabajador_id')::uuid;
  if not exists (select 1 from public._semanas_por_confirmar(v_trab) s where s.lunes = p_lunes) then
    return jsonb_build_object('ok', false, 'codigo', 'SEMANA', 'error', 'Esa semana no está pendiente de revisar.');
  end if;
  select t.dia_descanso, t.dias_descanso_adicionales, t.jornada_pactada_min, c.zona_horaria, c.nombre as centro, e.razon_social as empresa
    into v_t
    from public.trabajadores t
    join public.centros_trabajo c on c.empresa_id = t.empresa_id and c.id = t.centro_trabajo_id
    join public.empresas e on e.id = t.empresa_id
   where t.id = v_trab;

  return v || jsonb_build_object(
    'dia_descanso', v_t.dia_descanso,
    'dias_descanso_adicionales', v_t.dias_descanso_adicionales,
    'jornada_pactada_min', v_t.jornada_pactada_min,
    'zona_horaria', v_t.zona_horaria,
    'centro', v_t.centro,
    'empresa', v_t.empresa,
    'eventos', coalesce((
      with recursive cargados as (
        select e.id, e.corrige_evento_id
          from public.eventos e
         where e.trabajador_id = v_trab
           and e.hora_efectiva >= ((p_lunes - 2)::timestamp at time zone 'UTC')
           and e.hora_efectiva <  ((p_lunes + 9)::timestamp at time zone 'UTC')
        union
        select e.id, e.corrige_evento_id
          from public.eventos e
          join cargados k on e.corrige_evento_id = k.id or e.id = k.corrige_evento_id
         where e.trabajador_id = v_trab
      )
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'origen', e.origen, 'hora_efectiva', e.hora_efectiva,
               'hora_servidor', e.hora_servidor, 'puede_salir', e.puede_salir,
               'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido, 'motivo', e.motivo)
             order by e.id)
        from public.eventos e
       where e.id in (select id from cargados)
    ), '[]'::jsonb)
  );
end;
$$;

