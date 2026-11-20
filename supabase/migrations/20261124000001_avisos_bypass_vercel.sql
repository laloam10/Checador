-- =============================================================================
-- Checador: el disparador de avisos atraviesa la protección de despliegues de Vercel
--
-- El proyecto de pruebas (checador-pruebas.vercel.app) es un despliegue de vista previa
-- protegido por Vercel Authentication: la llamada de pg_net a /api/avisos/enviar recibía 401.
-- Vercel permite un "bypass para automatización": un secreto que se manda en el encabezado
-- x-vercel-protection-bypass. Si existe en Vault como 'checador_vercel_bypass', se envía;
-- si no (producción, con dominio propio sin protección), todo sigue igual.
--   select vault.create_secret('<secreto de Vercel>', 'checador_vercel_bypass');
-- =============================================================================

create or replace function public.disparar_envio_avisos() returns bigint
language plpgsql set search_path = '' as $$
declare
  v_url     text;
  v_secreto text;
  v_destino text;
  v_bypass  text;
begin
  -- Solo si hay a quién entregar: los avisos de quien no activó ningún teléfono esperan
  -- (hasta vencer) sin despertar a la app cada 10 minutos.
  if not exists (select 1 from public.avisos a
                  where a.estado is null
                    and exists (select 1 from public.suscripciones_push s where s.user_id = a.user_id)) then
    return null;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return null;
  end if;
  select max(decrypted_secret) filter (where name = 'checador_url_app'),
         max(decrypted_secret) filter (where name = 'checador_avisos_secreto'),
         max(decrypted_secret) filter (where name = 'checador_avisos_url'),
         max(decrypted_secret) filter (where name = 'checador_vercel_bypass')
    into v_url, v_secreto, v_destino, v_bypass
    from vault.decrypted_secrets
   where name in ('checador_url_app', 'checador_avisos_secreto', 'checador_avisos_url', 'checador_vercel_bypass');
  if v_secreto is null or coalesce(v_destino, v_url) is null then
    return null;
  end if;
  -- 'checador_avisos_url' solo existe en pruebas locales (apunta a la app local).
  return net.http_post(
    url := coalesce(v_destino, rtrim(v_url, '/') || '/api/avisos/enviar'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Checador-Secreto', v_secreto)
               -- Despliegues protegidos de Vercel (pruebas): bypass para automatización.
               || case when v_bypass is null then '{}'::jsonb
                       else jsonb_build_object('x-vercel-protection-bypass', v_bypass) end,
    timeout_milliseconds := 30000);
end;
$$;

revoke execute on function public.disparar_envio_avisos() from public, anon, authenticated;
