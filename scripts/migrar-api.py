#!/usr/bin/env python3
"""
Aplica las migraciones de supabase/migrations/ a un proyecto de Supabase usando la
API de administración (HTTPS), sin conexión directa a la base ni Docker.

Compatible con la CLI: registra cada migración en supabase_migrations.schema_migrations
con la misma versión que el nombre del archivo, así `npx supabase db push` no las repite.
Cada migración y su registro se aplican en UNA sola transacción: si falla, no queda nada a medias.

Uso:
  SUPABASE_ACCESS_TOKEN=sbp_... python3 scripts/migrar-api.py <project_ref> [--verificar]

  El token necesita los permisos Database (Read-write) y Migrations (Read-write).
  --verificar  además ejecuta supabase/verificar-seguridad.sql y falla si hay hallazgos.
"""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "supabase" / "migrations"
ETIQUETA = "$checador_migracion$"


def consulta(ref: str, sql: str, reintentar: bool = True):
    cabeceras = {"Content-Type": "application/json", "User-Agent": "checador-migrar-api"}
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if token and token != "proxy-injected":
        cabeceras["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers=cabeceras,
        method="POST",
    )
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b"[]")
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="replace")
            # Los 5xx de la API suelen ser temporales; los 4xx (SQL inválido, permisos) no se reintentan.
            if reintentar and e.code >= 500 and intento < 3:
                time.sleep(2 ** intento * 2)
                continue
            raise RuntimeError(f"HTTP {e.code}: {cuerpo[:800]}") from None


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    ref = sys.argv[1]
    verificar = "--verificar" in sys.argv[2:]

    consulta(ref, """
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key, statements text[], name text);
    """)
    aplicadas = {f["version"] for f in consulta(ref, "select version from supabase_migrations.schema_migrations")}

    pendientes = sorted(p for p in MIGRACIONES.glob("*.sql") if p.name.split("_", 1)[0] not in aplicadas)
    print(f"Proyecto {ref}: {len(aplicadas)} migración(es) ya aplicada(s), {len(pendientes)} pendiente(s).")
    for archivo in pendientes:
        version, nombre = archivo.stem.split("_", 1)
        sql = archivo.read_text(encoding="utf-8")
        if ETIQUETA in sql:
            raise RuntimeError(f"{archivo.name} contiene la etiqueta reservada {ETIQUETA}")
        registro = (
            "insert into supabase_migrations.schema_migrations (version, name, statements) values "
            f"('{version}', '{nombre}', array[{ETIQUETA}{sql}{ETIQUETA}]);"
        )
        try:
            # Sin reintento automático: si la API responde 5xx DESPUÉS de aplicar la migración,
            # repetirla daría un error engañoso. Se consulta el historial para saber qué pasó.
            consulta(ref, f"{sql}\n;\n{registro}", reintentar=False)
        except RuntimeError as e:
            time.sleep(3)
            ya = consulta(ref, f"select 1 from supabase_migrations.schema_migrations where version = '{version}'")
            if not ya:
                print(f"  ✗ {archivo.name}: {e}")
                return 1
            print(f"  ✓ {archivo.name} (la API respondió con error, pero el historial confirma que se aplicó)")
            continue
        print(f"  ✓ {archivo.name}")

    if verificar:
        hallazgos = consulta(ref, (RAIZ / "supabase" / "verificar-seguridad.sql").read_text(encoding="utf-8"))
        if hallazgos:
            print(f"Verificación de seguridad: {len(hallazgos)} hallazgo(s):")
            for h in hallazgos:
                print(f"  - [{h['nivel']}] {h['hallazgo']}: {h['objeto']}")
            return 1
        print("Verificación de seguridad: sin hallazgos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
