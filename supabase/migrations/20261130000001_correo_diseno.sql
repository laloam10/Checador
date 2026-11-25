-- =============================================================================
-- Checador: diseño de los correos
--
-- El recordatorio semanal de conformidad usa ahora la plantilla de la marca (la misma del
-- correo con el código para entrar, supabase/templates/codigo.html): franja verde noche
-- con "checador", tarjeta blanca y pie con la empresa. Cada semana es un botón.
-- El contenido no cambia: qué semanas, a quién y con qué enlace (migración 20261112000001).
-- Correo en tablas y con estilos en línea: es lo que respetan Gmail, Outlook y Apple Mail.
-- =============================================================================

-- Marco común de los correos. p_contenido y p_pie ya vienen escapados.
create function public._correo_marco(p_contenido text, p_pie text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    || '<meta name="color-scheme" content="light"></head>'
    || '<body style="margin:0;padding:0;background:#f5f8ec;font-family:Inter,''Segoe UI'',Helvetica,Arial,sans-serif;color:#13280a">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8ec;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dfe6cf;border-radius:14px;overflow:hidden">'
    || '<tr><td style="background:#0a2103;padding:18px 24px">'
    || '<span style="display:inline-block;width:12px;height:12px;background:#c8e600;border-radius:3px;margin-right:8px;vertical-align:middle"></span>'
    || '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;vertical-align:middle">checador</span>'
    || '</td></tr>'
    || '<tr><td style="padding:28px 24px 12px;font-size:15px;line-height:1.55;color:#13280a">' || p_contenido || '</td></tr>'
    || '<tr><td style="padding:16px 24px 24px;color:#6b7563;font-size:12px;line-height:1.5;border-top:1px solid #eef2e3">' || p_pie || '</td></tr>'
    || '</table>'
    || '<p style="margin:16px 0 0;color:#8a9480;font-size:11px">Checador · registro de jornada · por Jemba</p>'
    || '</td></tr></table></body></html>'
$$;

-- Enlace a una semana, con forma de botón.
create function public._correo_semana(p_url text, p_lunes date) returns text
language sql immutable parallel safe set search_path = '' as $$
  select format(
    '<a href="%s" style="display:block;padding:12px 14px;margin:8px 0;border:1px solid #dfe6cf;border-radius:10px;'
    || 'background:#fbfcf7;color:#24560c;text-decoration:none;font-weight:600">Semana %s &rarr;</a>',
    public._html(p_url), public._semana_texto(p_lunes))
$$;

-- Misma firma y mismos datos que en la migración 20261112000001; cambia solo el HTML.
create or replace function public._correo_recordatorio(
  p_nombre text, p_razon_social text, p_correo text,
  p_sin_respuesta date[], p_corregidas date[], p_remitente text, p_url_app text
) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_html text := '';
  v_texto text := '';
  v_lunes date;
  v_url text;
begin
  v_html := format('<p style="margin:0 0 12px;font-size:17px;font-weight:700">Hola, %s:</p>'
                   || '<p style="margin:0 0 16px"><strong>%s</strong> registra tu jornada con Checador.</p>',
                   public._html(p_nombre), public._html(p_razon_social));
  v_texto := format(E'Hola, %s:\n\n%s registra tu jornada con Checador. ', p_nombre, p_razon_social);

  if cardinality(p_sin_respuesta) > 0 then
    v_html := v_html || '<p style="margin:0 0 4px">Estas semanas ya terminaron y aún no las revisas:</p>';
    v_texto := v_texto || E'Estas semanas ya terminaron y aún no las revisas:\n';
    foreach v_lunes in array p_sin_respuesta loop
      v_url := p_url_app || '/registros?semana=' || v_lunes;
      v_html := v_html || public._correo_semana(v_url, v_lunes);
      v_texto := v_texto || format(E'- Semana %s: %s\n', public._semana_texto(v_lunes), v_url);
    end loop;
  end if;

  if cardinality(p_corregidas) > 0 then
    v_html := v_html || '<p style="margin:16px 0 4px">Tu empleador hizo cambios en estas semanas que objetaste. Revisa si ya son correctas:</p>';
    v_texto := v_texto || E'\nTu empleador hizo cambios en estas semanas que objetaste. Revisa si ya son correctas:\n';
    foreach v_lunes in array p_corregidas loop
      v_url := p_url_app || '/registros?semana=' || v_lunes;
      v_html := v_html || public._correo_semana(v_url, v_lunes);
      v_texto := v_texto || format(E'- Semana %s: %s\n', public._semana_texto(v_lunes), v_url);
    end loop;
  end if;

  v_html := v_html
    || '<p style="margin:16px 0 0">En cada semana puedes indicar que tus horas son correctas o explicar qué no coincide. '
    || 'Tu respuesta es voluntaria, pero ayuda a que tus horas queden bien registradas.</p>';
  v_texto := v_texto
    || E'\nEn cada semana puedes indicar que tus horas son correctas o explicar qué no coincide. '
    || E'Tu respuesta es voluntaria, pero ayuda a que tus horas queden bien registradas.\n\n'
    || 'Recibes este correo porque tu empleador te dio de alta en Checador con esta dirección. '
    || 'Para entrar usa este mismo correo; te llegará un código.';

  return jsonb_build_object(
    'from', p_remitente,
    'to', jsonb_build_array(p_correo),
    'subject', case when cardinality(p_sin_respuesta) > 0
                    then 'Tienes semanas por revisar en Checador'
                    else 'Tu empleador revisó la semana que objetaste' end,
    'html', public._correo_marco(v_html,
      format('Recibes este correo porque %s te dio de alta en Checador con esta dirección. '
             || 'Para entrar usa este mismo correo; te llegará un código.', public._html(p_razon_social))),
    'text', v_texto
  );
end;
$$;

revoke execute on function public._correo_marco(text, text), public._correo_semana(text, date) from public, anon, authenticated;
