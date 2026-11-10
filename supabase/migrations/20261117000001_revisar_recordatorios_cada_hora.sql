-- =============================================================================
-- Checador: revisar el resultado de los recordatorios cada hora
--
-- pg_net guarda las respuestas de Resend unas 6 horas. La revisión solo corría los
-- lunes a las 16:20 UTC, así que un envío hecho en otro momento (por ejemplo, una
-- prueba manual) perdía su respuesta y al día siguiente quedaba como "fallido"
-- aunque Resend lo hubiera aceptado. Ahora se revisa cada hora; si no hay envíos
-- pendientes, no hace nada.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('checador-revisar-recordatorios', '20 * * * *',
                          'select public.revisar_envios_recordatorios()');
  end if;
end;
$$;
