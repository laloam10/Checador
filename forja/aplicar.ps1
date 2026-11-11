# Aplica la configuración del asistente de Checador sobre una instalación de Forja (Windows).
# Equivale a forja/aplicar.sh.
#
# Uso (PowerShell):
#   .\forja\aplicar.ps1 -Bot <carpeta-del-bot-de-forja> -Correo contacto@tu-dominio.mx
#
# Solo toca member/ (que Forja nunca sobrescribe al actualizar) y dos nombres en wrangler.toml.
# No maneja secretos: esos se guardan con `wrangler secret put` (ver forja/README.md).
param(
  [Parameter(Mandatory = $true)][string]$Bot,
  [Parameter(Mandatory = $true)][string]$Correo
)
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8 sin BOM, como espera la plantilla

if (-not (Test-Path (Join-Path $Bot "wrangler.toml")) -or -not (Test-Path (Join-Path $Bot "member"))) {
  throw "No parece una instalación de Forja: falta wrangler.toml o member/ en $Bot"
}
if ($Correo -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "El correo de contacto no es válido: $Correo" }

$member = Join-Path $Bot "member"
$respaldo = Join-Path $member (".respaldo-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $respaldo | Out-Null
$config = Join-Path $member "config.local.ts"
if (Test-Path $config) { Copy-Item $config $respaldo }
$kb = Join-Path $member "kb"
if (Test-Path $kb) { Copy-Item $kb (Join-Path $respaldo "kb") -Recurse }

$texto = [System.IO.File]::ReadAllText((Join-Path $aqui "member\config.local.ts"), $utf8)
[System.IO.File]::WriteAllText($config, $texto.Replace("__CORREO_DE_CONTACTO__", $Correo), $utf8)
New-Item -ItemType Directory -Path $kb -Force | Out-Null
Copy-Item (Join-Path $aqui "member\kb\*.md") $kb -Force

# Nombre público del bot y del negocio (variables no secretas de wrangler.toml).
$toml = Join-Path $Bot "wrangler.toml"
$t = [System.IO.File]::ReadAllText($toml, $utf8)
$t = [regex]::Replace($t, '(?m)^BOT_NAME = ".*"', 'BOT_NAME = "Asistente de Checador"')
$t = [regex]::Replace($t, '(?m)^BUSINESS_NAME = ".*"', 'BUSINESS_NAME = "Checador"')
[System.IO.File]::WriteAllText($toml, $t, $utf8)

Write-Host "Listo. Configuración aplicada en $Bot"
Write-Host "  - member\config.local.ts (respaldo del anterior en $respaldo)"
Write-Host "  - member\kb\: $((Get-ChildItem (Join-Path $aqui 'member\kb\*.md')).Count) documentos"
Write-Host "  - wrangler.toml: BOT_NAME y BUSINESS_NAME"
Write-Host "Sigue con forja\README.md, paso 3."
