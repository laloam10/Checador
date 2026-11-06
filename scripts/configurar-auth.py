#!/usr/bin/env python3
"""
Aplica la configuración de Auth de Checador a un proyecto de Supabase por la API de
administración y comprueba que cada valor quedó guardado (ver docs/publicacion.md, paso 1.4).

Uso:
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/configurar-auth.py <project_ref> [--site-url https://checador.tuempresa.mx] [--sin-plantillas]

  El token necesita Project Settings (Read-write); Supabase lo llama project_admin_write.
  Sin --site-url no se tocan la URL del sitio ni las URLs permitidas.
  --sin-plantillas: Supabase no permite cambiar las plantillas en proyectos gratuitos con el
  correo integrado; úsalo hasta configurar el SMTP propio (o subir a Pro) y vuelve a correrlo sin él.
  --smtp-correo no-responder@checador.tudominio.mx: configura el SMTP de Resend (smtp.resend.com:465,
  usuario "resend") con ese remitente. La CONTRASEÑA (una llave de envío de Resend) nunca pasa por
  este script: se escribe a mano en Authentication → Emails → SMTP Settings.
  --limite-correos N: correos de Auth por hora (solo con SMTP propio; no exceder el límite del proveedor).
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def llamar(ref: str, metodo: str, cuerpo: dict | None = None) -> dict:
    cabeceras = {"Content-Type": "application/json", "User-Agent": "checador-configurar-auth"}
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token and token != "proxy-injected":
        cabeceras["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/config/auth",
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers=cabeceras,
        method=metodo,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:600]}")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    ref = sys.argv[1]
    plantilla = (RAIZ / "supabase" / "templates" / "codigo.html").read_text(encoding="utf-8")

    deseado = {
        # Entrada con código de 6 dígitos que vence en 15 minutos (la plantilla lo menciona).
        "mailer_otp_exp": 900,
        "mailer_otp_length": 6,
        # Confirmar el correo al registrarse (defensa contra registros con contraseña sin código).
        "mailer_autoconfirm": False,
        "external_email_enabled": True,
        "disable_signup": False,  # dueños, trabajadores y kioscos se registran al entrar por primera vez
        # Métodos que Checador no usa.
        "external_anonymous_users_enabled": False,
        "external_phone_enabled": False,
        # Defensa adicional para cuentas con contraseña.
        "security_update_password_require_reauthentication": True,
        # Plantillas en español con el código ({{ .Token }}): sin él no se puede entrar desde la app instalada.
        "mailer_subjects_magic_link": "Tu código para Checador",
        "mailer_templates_magic_link_content": plantilla,
        "mailer_subjects_confirmation": "Tu código para Checador",
        "mailer_templates_confirmation_content": plantilla,
    }
    if "--sin-plantillas" in sys.argv:
        for clave in [k for k in deseado if k.startswith("mailer_subjects_") or k.startswith("mailer_templates_")]:
            del deseado[clave]
    if "--smtp-correo" in sys.argv:
        correo = sys.argv[sys.argv.index("--smtp-correo") + 1]
        deseado.update({
            "smtp_host": "smtp.resend.com",
            "smtp_port": "465",
            "smtp_user": "resend",
            "smtp_admin_email": correo,
            "smtp_sender_name": "Checador",
        })
    if "--limite-correos" in sys.argv:
        deseado["rate_limit_email_sent"] = int(sys.argv[sys.argv.index("--limite-correos") + 1])
    if "--site-url" in sys.argv:
        url = sys.argv[sys.argv.index("--site-url") + 1].rstrip("/")
        if not url.startswith("https://"):
            raise SystemExit("La URL del sitio debe ser https://")
        deseado["site_url"] = url
        deseado["uri_allow_list"] = f"{url}/**"

    llamar(ref, "PATCH", deseado)
    actual = llamar(ref, "GET")
    fallas = 0
    for clave, valor in deseado.items():
        quedo = actual.get(clave) == valor
        fallas += not quedo
        mostrar = valor if not isinstance(valor, str) or len(valor) < 50 else f"{valor[:40]}…"
        print(f"  {'✓' if quedo else '✗'} {clave} = {mostrar!r}")
    print("Auth configurado." if not fallas else f"{fallas} valor(es) no quedaron como se esperaba.")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
