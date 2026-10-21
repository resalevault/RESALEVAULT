RESALEVAULT 0.5.0 — Windows
==========================

EVERY ITEM. EVERY PROFIT.
Gestión profesional de compraventa e inventario para resellers.

------------------------------------------------------------------
QUÉ HAY EN ESTA CARPETA
------------------------------------------------------------------

  RESALEVAULT-Setup-0.5.0.exe .... Instalador (Windows 64 bits, usuario)
  RESALEVAULT-Store-0.5.0.appx ... Paquete para la Microsoft Store
  SHA256SUMS.txt ................. Hashes para verificar la integridad
  THIRD-PARTY-NOTICES.md ......... Licencias del software de terceros
  verify-install.ps1 ............. Kit de verificación en equipo limpio

------------------------------------------------------------------
REQUISITOS
------------------------------------------------------------------

  - Windows 10 (1809) o superior, 64 bits.
  - No requiere permisos de administrador (se instala por usuario).
  - No requiere conexión a internet para las funciones locales.

------------------------------------------------------------------
INSTALACIÓN
------------------------------------------------------------------

  1. Ejecuta RESALEVAULT-Setup-0.5.0.exe
  2. Windows puede mostrar un aviso de SmartScreen
     ("Windows protegió su PC"). Esto se debe a que el instalador
     NO está firmado con un certificado comercial.
  3. La aplicación se instala en:
        %LOCALAPPDATA%\Programs\RESALEVAULT

  IMPORTANTE: NO desactives SmartScreen, Defender ni Smart App
  Control para instalar. Si el aviso te impide continuar, la
  alternativa correcta es el paquete de la Microsoft Store
  (RESALEVAULT-Store-0.5.0.appx), que Microsoft firma él mismo.

------------------------------------------------------------------
DÓNDE ESTÁN TUS DATOS
------------------------------------------------------------------

  %APPDATA%\RESALEVAULT\
      ├── data\      base de datos
      ├── media\     fotos y documentos
      ├── thumbs\    miniaturas
      ├── backups\   copias de seguridad
      └── logs\      registros de diagnóstico

  Esa ruta es la de la instalación con el instalador (README-Windows).
  Si has instalado el paquete de la Microsoft Store (.appx), Windows
  guarda los mismos datos en una carpeta privada del paquete
  (%LOCALAPPDATA%\Packages\...\LocalCache\...) y la aplicación te
  muestra la ruta real desde "Ajustes"; los datos son los mismos.

  Tus datos NO se borran al desinstalar. Si quieres eliminarlos,
  hazlo manualmente desde esa carpeta.

------------------------------------------------------------------
VERIFICAR LA INTEGRIDAD
------------------------------------------------------------------

  PowerShell:
      Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256

  El resultado debe coincidir con SHA256SUMS.txt.

------------------------------------------------------------------
DESINSTALAR
------------------------------------------------------------------

  Configuración → Aplicaciones → RESALEVAULT → Desinstalar
  (o Panel de control → Programas y características).

  Los datos del usuario se conservan a propósito.

------------------------------------------------------------------
RECURSOS
------------------------------------------------------------------

  Licencias y compra: https://discord.gg/9bMhnGvjrx
  (la compra se gestiona en el servidor oficial de Discord;
   la aplicación no cobra ni pide datos de pago)
