RESALEVAULT 0.5.0 — macOS  (PENDIENTE)
=======================================

IMPORTANTE: en esta carpeta NO hay ningún instalador de macOS.

No se incluye ningún .dmg porque NO se ha podido compilar: la
cadena de herramientas de Apple (codesign, notarytool, Xcode) solo
existe en macOS y este proyecto se ha preparado desde Windows.

NO se incluye el instalador de Windows renombrado: sería un fraude.

------------------------------------------------------------------
QUÉ SÍ ESTÁ PREPARADO
------------------------------------------------------------------

  - Configuración de compilación para macOS en electron-builder.yml
    (objetivos dmg y zip, arquitecturas x64 y arm64).
  - Permisos mínimos en build/entitlements.mac.plist.
  - Código auditado: sin rutas exclusivas de Windows.
  - Comando listo:  npm run dist:mac

------------------------------------------------------------------
CÓMO COMPLETARLO (EN UN MAC)
------------------------------------------------------------------

  git clone <repositorio>
  npm install
  npm run build
  npm run dist:mac

  Sin un certificado de desarrollador de Apple, macOS mostrará
  "desarrollador no identificado" y pedirá abrir la app con clic
  derecho → Abrir. Con una cuenta de Apple (99 EUR/año) se añade
  la firma y la notarización.

------------------------------------------------------------------
DETALLE COMPLETO
------------------------------------------------------------------

  Ver Documentation/MACOS_STATUS.md

------------------------------------------------------------------
RECURSOS
------------------------------------------------------------------

  Licencias y compra: https://discord.gg/9bMhnGvjrx
