-- =============================================================================
-- Checador: solo se pueden ejecutar por la API las funciones diseñadas para eso
--
-- Corrige 20261110000001_endurecimiento.sql, que otorgó EXECUTE sobre TODAS las
-- funciones a `authenticated` y con ello re-expuso _kiosco_verificar() (verificación
-- interna del PIN) y las funciones de trigger. Lo detectó el asesor de seguridad de Supabase.
--
-- Funciones ejecutables por `authenticated`:
--   * API de la app (validan por dentro quién las llama): crear_empresa, vincular_mi_cuenta,
--     verificar_cadena, asignar_pin, establecer_mi_pin, kiosco_identificar, kiosco_checar,
--     kiosco_firmar_acuerdo, miembros_de_empresa, trabajadores_con_pin, acuerdo_vigente,
--     acuerdo_pendiente.
--   * Auxiliares de las políticas RLS (las políticas las necesitan; solo informan al
--     usuario su propio rol): mi_rol, es_gestor, puede_consultar, soy_trabajador, trabajo_en.
--   * Funciones puras sin privilegios: ts_canonico, sha256_texto, evento_canonico, pin_valido.
-- Todo lo demás (triggers, _kiosco_verificar, rls_auto_enable de Supabase): sin EXECUTE.
-- Las funciones nuevas NO son ejecutables por omisión: cada una necesita su GRANT.
-- =============================================================================

revoke execute on all functions in schema public from authenticated, anon, public;
alter default privileges in schema public revoke execute on functions from authenticated, anon, public;

grant execute on function
  public.crear_empresa(text, text),
  public.vincular_mi_cuenta(),
  public.verificar_cadena(uuid),
  public.asignar_pin(uuid, text),
  public.establecer_mi_pin(uuid, text),
  public.kiosco_identificar(text, text),
  public.kiosco_checar(text, text, public.tipo_evento, uuid, boolean, timestamptz, jsonb),
  public.kiosco_firmar_acuerdo(text, text, uuid, jsonb),
  public.miembros_de_empresa(uuid),
  public.trabajadores_con_pin(uuid),
  public.acuerdo_vigente(uuid),
  public.acuerdo_pendiente(uuid),
  public.mi_rol(uuid),
  public.es_gestor(uuid),
  public.puede_consultar(uuid),
  public.soy_trabajador(uuid),
  public.trabajo_en(uuid),
  public.ts_canonico(timestamptz),
  public.sha256_texto(text),
  public.evento_canonico(public.eventos),
  public.pin_valido(text)
to authenticated;
