# RESALEVAULT - Preparacion de firma de codigo GRATUITA (desarrollo)
#
# Crea un certificado AUTOFIRMADO de firma de codigo y lo exporta como .pfx para
# que electron-builder pueda firmar el ejecutable y el instalador.
#
# IMPORTANTE, y no se oculta en ningun sitio:
#   Un certificado autofirmado NO establece confianza publica. Windows mostrara
#   "editor desconocido" y SmartScreen seguira avisando (o bloqueando, si hay
#   politicas de Device Guard/AppLocker). Sirve para:
#     - Verificar que el proceso de firma funciona.
#     - Distribucion interna controlada, donde el certificado se instala a mano.
#     - Evitar que el binario quede "sin firmar" en auditorias internas.
#   Para distribucion publica hace falta un certificado OV/IV de una CA.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts/setup-signing.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "tools\signing"
$pfx = Join-Path $dir "dev-signing.pfx"
$passwordFile = Join-Path $dir "dev-signing.password"

Write-Output "RESALEVAULT - preparacion de firma (certificado autofirmado)"
Write-Output "============================================================="

if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

if ((Test-Path $pfx) -and (Test-Path $passwordFile)) {
  Write-Output "Ya existe un certificado de desarrollo en:"
  Write-Output "  $pfx"
  Write-Output "No se regenera. Borra ese archivo si quieres crear uno nuevo."
  exit 0
}

# Contrasena aleatoria: se guarda en un archivo local excluido de Git.
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes)
$secure = ConvertTo-SecureString -String $password -AsPlainText -Force

Write-Output "Creando certificado en el almacen del usuario actual..."

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=RESALEVAULT (Desarrollo), O=RESALEVAULT, C=ES" `
  -FriendlyName "RESALEVAULT Dev Code Signing" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -HashAlgorithm SHA256 `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(2)

Write-Output "  Huella (thumbprint): $($cert.Thumbprint)"

Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
Set-Content -Path $passwordFile -Value $password -NoNewline -Encoding ASCII
Write-Output "  Certificado exportado: $pfx"
Write-Output "  Contrasena guardada en: $passwordFile (excluido de Git)"

Write-Output ""
Write-Output "Comprobacion:"
$check = Get-ChildItem "Cert:\CurrentUser\My\$($cert.Thumbprint)"
Write-Output "  Asunto:    $($check.Subject)"
Write-Output "  Caduca:    $($check.NotAfter)"
Write-Output "  Uso:       $($check.EnhancedKeyUsageList | ForEach-Object { $_.FriendlyName })"
Write-Output "  Archivo:   $(Test-Path $pfx)"
Write-Output ""
Write-Output "Siguiente paso:  npm run dist:signed"
