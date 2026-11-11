-- =============================================================================
-- Checador: límite de mensajes reenviados al asistente (Forja)
--
-- Los mensajes de números que NO están registrados como trabajadores se reenvían a un
-- asistente con IA. Cada reenvío cuesta (tokens del modelo) y cualquiera puede escribir al
-- número, así que se limita:
--   * 20 mensajes por hora por teléfono; al pasar el límite se avisa una vez y luego se calla.
--   * 300 mensajes por hora en total (contiene un abuso desde muchos números).
-- Privacidad: de quien no es usuario no se guarda el teléfono, solo su huella SHA-256, y las
-- filas se borran al cumplir un día.
-- Los mensajes de trabajadores registrados nunca se reenvían al asistente.
-- =============================================================================

create table public.whatsapp_reenvios (
  huella  bytea not null,
  hora    timestamptz not null,
  cuenta  integer not null default 0,
  primary key (huella, hora)
);
alter table public.whatsapp_reenvios enable row level security;
revoke all on public.whatsapp_reenvios from public, anon, authenticated;

-- ¿Se puede reenviar al asistente un mensaje de este teléfono? Cuenta el intento.
create function public.whatsapp_permitir_reenvio(p_secreto text, p_telefono text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tel    text := public._telefono_normalizado(p_telefono);
  v_hora   timestamptz := date_trunc('hour', now());
  v_cuenta integer;
  v_total  integer;
begin
  if not public._servicio_autorizado('whatsapp', p_secreto) then
    return jsonb_build_object('ok', false, 'codigo', 'NO_AUTORIZADO');
  end if;
  -- Un trabajador registrado nunca va al asistente (sus mensajes pueden ser una objeción).
  if v_tel is null or exists (select 1 from public.trabajadores t where t.telefono = v_tel and t.fecha_baja is null) then
    return jsonb_build_object('ok', true, 'permitido', false, 'aviso', false);
  end if;
  delete from public.whatsapp_reenvios where hora < now() - interval '1 day';
  insert into public.whatsapp_reenvios (huella, hora, cuenta)
  values (extensions.digest(v_tel, 'sha256'), v_hora, 1)
  on conflict (huella, hora) do update set cuenta = public.whatsapp_reenvios.cuenta + 1
  returning cuenta into v_cuenta;
  select coalesce(sum(cuenta), 0) into v_total from public.whatsapp_reenvios where hora = v_hora;
  return jsonb_build_object('ok', true,
    'permitido', v_cuenta <= 20 and v_total <= 300,
    'aviso', v_cuenta = 21);
end;
$$;

revoke execute on function public.whatsapp_permitir_reenvio(text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_permitir_reenvio(text, text) to anon, authenticated;
