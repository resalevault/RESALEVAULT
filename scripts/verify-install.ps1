#requires -Version 5.1
<#
RESALEVAULT - verificacion de instalacion en una maquina limpia (0 EUR)

Para que sirve: cerrar, con evidencia real, el pendiente «instalacion probada»
cuando el equipo del desarrollo tiene una politica de nivel de firma Enterprise
que bloquea el instalador autofirmado (ver docs/FIRMA.md, seccion 9).

Uso en la maquina destino (Windows, no hace falta ser administrador porque la
instalacion es por usuario):

    powershell -ExecutionPolicy Bypass -File .\verify-install.ps1

Opciones:
    -Installer    Ruta al instalador. Por defecto, el primer
                  RESALEVAULT-Setup-*.exe que haya junto a este script.
    -ExpectedHash Hash SHA-256 publicado por el autor. Si se pasa, se exige
                  coincidencia antes de instalar.
    -HashOnly     Solo calcula e imprime el hash del instalador y termina.

Salida: imprime cada paso, escribe verificacion-install-<fecha>.txt junto al
script y devuelve codigo de salida 0 si TODO ha pasado, 1 si algo falla.
#>
param(
    [string]$Installer = '',
    [string]$ExpectedHash = '',
    [switch]$HashOnly
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$failures = 0

function Step-Ok([string]$m)   { Write-Output ("  ok    " + $m) }
function Step-Fail([string]$m) { Write-Output ("  FALLO " + $m); $script:failures++ }

Write-Output ''
Write-Output 'RESALEVAULT - verificacion de instalacion'
Write-Output '========================================='

# 1. Entorno
$os = Get-CimInstance Win32_OperatingSystem
$envInfo = 'Sistema: ' + $os.Caption + ' (' + $os.Version + ')'
Write-Output $envInfo

# 2. Localizar el instalador
if (-not $Installer) {
    $cand = Get-ChildItem -Path $here -Filter 'RESALEVAULT-Setup-*.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($cand) { $Installer = $cand.FullName }
}
if (-not $Installer -or -not (Test-Path $Installer)) {
    Step-Fail 'no se encuentra el instalador junto al script (pasa la ruta con -Installer)'
    exit 1
}
Write-Output ('Instalador: ' + $Installer)

# 3. Hash SHA-256
$hash = (Get-FileHash -Path $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output ('Hash SHA-256: ' + $hash)
if ($HashOnly) { exit 0 }
if ($ExpectedHash) {
    if ($hash -eq $ExpectedHash.ToLowerInvariant()) {
        Step-Ok 'el hash coincide con el publicado por el autor'
    } else {
        Step-Fail ('el hash NO coincide con el publicado: esperado ' + $ExpectedHash.ToLowerInvariant())
        Write-Output 'No se instala nada ante una discrepancia.'
        exit 1
    }
} else {
    Write-Output '  aviso: sin -ExpectedHash no se comprueba la procedencia del fichero.'
}

# 4. Instalacion silenciosa (NSIS acepta /S; la instalacion es por usuario)
Write-Output 'Instalando en silencio...'
$proc = Start-Process -FilePath $Installer -ArgumentList '/S' -PassThru -Wait
if ($proc.ExitCode -eq 0) {
    Step-Ok 'el instalador termino con codigo 0'
} else {
    Step-Fail ('el instalador termino con codigo ' + $proc.ExitCode)
}

# 5. Ejecutable instalado
$exe = Join-Path $env:LOCALAPPDATA 'Programs\RESALEVAULT\RESALEVAULT.exe'
if (Test-Path $exe) {
    Step-Ok ('ejecutable presente: ' + $exe)
} else {
    Step-Fail ('no se encontro ' + $exe)
}

# 6. Arranque real de la aplicacion
$procName = 'RESALEVAULT'
$app = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 20
$running = Get-Process -Name $procName -ErrorAction SilentlyContinue
if ($running) {
    Step-Ok ('la aplicacion sigue en memoria tras 20 s (pid ' + ($running.Id -join ',') + ')')
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
} else {
    Step-Fail 'la aplicacion no arranco o se cerro sola'
}

# 7. Datos y migraciones creados en el primer arranque
$db = Join-Path $env:APPDATA 'RESALEVAULT\data\resalevault.sqlite'
if (Test-Path $db) {
    $size = (Get-Item $db).Length
    Step-Ok ('base de datos creada (' + $size + ' bytes): ' + $db)
} else {
    Step-Fail ('no se creo la base de datos en ' + $db)
}

# 8. Veredicto
$report = @()
$report += 'RESALEVAULT - verificacion de instalacion'
$report += 'Fecha: ' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
$report += $envInfo
$report += 'Equipo: ' + $env:COMPUTERNAME
$report += 'Instalador: ' + $Installer
$report += 'Hash SHA-256: ' + $hash
$report += ('Fallos: ' + $failures)
$reportPath = Join-Path $here ('verificacion-install-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
$report | Set-Content -Path $reportPath -Encoding UTF8
Write-Output ('Informe escrito en: ' + $reportPath)

Write-Output ''
if ($failures -eq 0) {
    Write-Output 'RESULTADO: TODO CORRECTO'
    exit 0
} else {
    Write-Output ('RESULTADO: ' + $failures + ' COMPROBACION(ES) FALLIDA(S)')
    exit 1
}
