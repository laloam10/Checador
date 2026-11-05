-- =============================================================================
-- Checador: acuerdo de registro electrónico con firma de ambas partes
-- (LFT art. 132 fr. XXXIV, 3.er párr.: el registro hace prueba plena si se
-- acredita que fue acordado entre la persona trabajadora y la empleadora).
--
--   * Modalidades de firma del trabajador: electrónica (su cuenta verificada por
--     correo), con PIN en el kiosco, o autógrafa en papel registrada por el empleador.
--   * El empleador firma primero; el trabajador acepta después.
--   * Acuerdo vigente = la versión más reciente firmada por ambas partes.
-- =============================================================================

create type public.modalidad_firma as enum ('electronica', 'pin_kiosco', 'autografa');

alter table public.firmas_acuerdo
  add column modalidad public.modalidad_firma not null default 'electronica',
  add constraint firmas_empleador_electronica check (firmante = 'trabajador' or modalidad = 'electronica'),
  add constraint firmas_autografa_con_nota check (
    modalidad <> 'autografa' or length(btrim(coalesce(evidencia ->> 'resguardo', ''))) > 0);
comment on column public.firmas_acuerdo.user_id is
  'Cuenta que registró la firma: el propio firmante (electrónica), la cuenta del kiosco (pin_kiosco) o el empleador (autógrafa).';

-- El trabajador solo firma un acuerdo que el empleador ya firmó.
create function public.firmas_orden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.firmante = 'trabajador' and not exists (
       select 1 from public.firmas_acuerdo where acuerdo_id = new.acuerdo_id and firmante = 'empleador') then
    raise exception 'El empleador debe firmar el acuerdo antes que la persona trabajadora'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger firmas_b_orden before insert on public.firmas_acuerdo
  for each row execute function public.firmas_orden();

-- Políticas de firma por modalidad.
drop policy firmas_insert on public.firmas_acuerdo;
create policy firmas_insert on public.firmas_acuerdo for insert to authenticated
  with check (
    -- Empleador: electrónica desde el panel.
    (firmante = 'empleador' and modalidad = 'electronica' and public.es_gestor(empresa_id))
    -- Trabajador: electrónica desde su app.
    or (firmante = 'trabajador' and modalidad = 'electronica'
        and exists (select 1 from public.acuerdos a where a.id = acuerdo_id and public.soy_trabajador(a.trabajador_id)))
    -- Trabajador: firma autógrafa en papel, la registra el empleador (con dónde se resguarda el original).
    or (firmante = 'trabajador' and modalidad = 'autografa' and public.es_gestor(empresa_id))
    -- La modalidad pin_kiosco solo se inserta con kiosco_firmar_acuerdo().
  );

-- -----------------------------------------------------------------------------
-- Acuerdo vigente y pendiente
-- -----------------------------------------------------------------------------
create function public.acuerdo_vigente(p_trabajador uuid) returns setof public.acuerdos
language sql stable set search_path = '' as $$
  select a.* from public.acuerdos a
   where a.trabajador_id = p_trabajador
     and exists (select 1 from public.firmas_acuerdo f where f.acuerdo_id = a.id and f.firmante = 'empleador')
     and exists (select 1 from public.firmas_acuerdo f where f.acuerdo_id = a.id and f.firmante = 'trabajador')
   order by a.version desc
   limit 1
$$;

-- Versión más reciente que el empleador firmó y el trabajador aún no.
create function public.acuerdo_pendiente(p_trabajador uuid) returns setof public.acuerdos
language sql stable set search_path = '' as $$
  select a.* from public.acuerdos a
   where a.trabajador_id = p_trabajador
     and exists (select 1 from public.firmas_acuerdo f where f.acuerdo_id = a.id and f.firmante = 'empleador')
     and not exists (select 1 from public.firmas_acuerdo f where f.acuerdo_id = a.id and f.firmante = 'trabajador')
     and a.version > coalesce((select max(v.version) from public.acuerdo_vigente(p_trabajador) v), 0)
   order by a.version desc
   limit 1
$$;

-- -----------------------------------------------------------------------------
-- Kiosco: mostrar y firmar el acuerdo pendiente con número de empleado y PIN
-- -----------------------------------------------------------------------------
create or replace function public.kiosco_identificar(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_pend public.acuerdos;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  select * into v_pend from public.acuerdo_pendiente((v ->> 'trabajador_id')::uuid);
  return v || jsonb_build_object(
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'tipo', e.tipo, 'hora_efectiva', e.hora_efectiva,
               'puede_salir', e.puede_salir, 'corrige_evento_id', e.corrige_evento_id, 'diferido', e.diferido)
             order by e.id)
        from public.eventos e
       where e.trabajador_id = (v ->> 'trabajador_id')::uuid
         and (e.hora_efectiva > now() - interval '36 hours' or e.hora_servidor > now() - interval '36 hours')
    ), '[]'::jsonb),
    'acuerdo_pendiente', case when v_pend.id is null then null else jsonb_build_object(
      'id', v_pend.id, 'version', v_pend.version, 'contenido', v_pend.contenido,
      'folio', left(encode(v_pend.contenido_hash, 'hex'), 12)) end
  );
end;
$$;

create function public.kiosco_firmar_acuerdo(p_numero text, p_pin text, p_acuerdo uuid, p_evidencia jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := public._kiosco_verificar(p_numero, p_pin);
  v_pend public.acuerdos;
begin
  if not (v ->> 'ok')::boolean then
    return v;
  end if;
  select * into v_pend from public.acuerdo_pendiente((v ->> 'trabajador_id')::uuid);
  if v_pend.id is null or v_pend.id <> p_acuerdo then
    return jsonb_build_object('ok', false, 'codigo', 'SIN_ACUERDO', 'error', 'No hay un acuerdo pendiente de firma con ese folio.');
  end if;
  insert into public.firmas_acuerdo (empresa_id, acuerdo_id, firmante, modalidad, evidencia)
  values (v_pend.empresa_id, v_pend.id, 'trabajador', 'pin_kiosco',
          coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('numero_empleado', p_numero));
  return jsonb_build_object('ok', true, 'nombre', v ->> 'nombre', 'version', v_pend.version,
                            'folio', left(encode(v_pend.contenido_hash, 'hex'), 12));
end;
$$;
revoke execute on function public.kiosco_firmar_acuerdo(text, text, uuid, jsonb) from public, anon;
grant execute on function public.kiosco_firmar_acuerdo(text, text, uuid, jsonb) to authenticated;
