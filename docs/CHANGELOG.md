# Historial de cambios

> **Nota previa importante.** El proyecto se ha desarrollado **sin control de
> versiones** hasta el 20/10/2026: no existía repositorio Git. Por eso las
> versiones anteriores a la 0.5.0 se reconstruyen a partir de la documentación
> (`docs/ESTADO.md`), no de etiquetas reales. A partir de la 0.5.0 cada entrada
> corresponde a commits reales.

---

## 0.5.0 — 20/10/2026

### Añadido

- **Shipping Tracker completo**: navegador integrado (`WebContentsView`, no
  `<webview>`), directorio de 46 transportistas con búsqueda y filtro por
  región, gestión de códigos de seguimiento y acción «Seguir ahora».
- **`THIRD-PARTY-NOTICES.md`** generado automáticamente con `npm run notices`
  (447 paquetes analizados, 6 distribuidos con su texto de licencia).
- **Pantalla «Acerca de» completa**: botón para leer los avisos de terceros sin
  conexión (desde `THIRD-PARTY-NOTICES.md`), enlace directo a Licencias y
  cálculo del hash SHA-256 del paquete `app.asar` en uso (en desarrollo no
  existe y se indica, en lugar de inventarlo).
- **Firma de código con certificado autofirmado** (`npm run sign:setup`,
  `npm run dist:signed`): instalador, ejecutable y desinstalador firmados, con
  verificación automática y SHA-256.
- **ESLint 9** (configuración plana) integrado en el flujo: 0 errores y 0 avisos.
- **Cobertura de pruebas** (`npm run test:coverage`): 86,5 % de líneas,
  umbrales configurados.
- **Pruebas de la lógica de dinero y de archivos**: nuevas suites para la
  importación y exportación CSV (`csv-io`, antes sin ninguna prueba), etiquetas y
  códigos de barras, ajustes, códigos de error, pedidos (listado, estados,
  comisiones, devoluciones y preparación), almacenamiento multimedia y los
  repositorios de proveedores, compras, gastos, plataformas, atributos y
  anuncios. La cobertura pasa del 72,0 % al 86,5 % de líneas.
- **Banco de pruebas de rendimiento** (`npm run bench`): 50.000 artículos y
  1.000 pedidos, con medición de apertura, búsqueda, paginación, escritura,
  informes, exportación y copias.
- **Integración continua** (`.github/workflows/ci.yml`): tipos, pruebas, humo,
  build y auditoría de dependencias.
- Documentación: `docs/FIRMA.md`, `docs/LICENCIAS.md`, `docs/BUILD-WINDOWS.md`,
  `docs/PRIVACIDAD.md`, `docs/MANUAL-USUARIO.md`,
  `docs/FREE-VS-PRO-VS-BUSINESS.md`, `docs/TEST-REPORT.md`.

### Cambiado

- **Los límites de plan ahora se aplican en el proceso principal**, no solo en la
  interfaz: cuota de artículos, cuota de archivos, importación CSV, edición
  masiva, analítica, inteligencia y AI Studio. Antes de este cambio, casi ningún
  límite estaba realmente aplicado.
- **La interfaz explica las funciones bloqueadas** con una pantalla clara
  («requiere Vault Pro o Vault Business») en vez de fallar con un error técnico.
- **El selector de artículos de Pedidos ya no carga 300 registros de golpe**:
  ahora busca en el proceso principal con retardo de 250 ms y trae 40.
- **SQL de totales de compras reescrito**: se eliminó la reescritura de la
  consulta con expresiones regulares, que era frágil.
- **`as never` eliminado** en la importación CSV y en el `preload`, sustituido
  por tipos reales.

### Corregido

- `doctor.cjs`: `require` duplicado que rompía el propio informe de diagnóstico.
- `setup-signing.ps1`: la comprobación pedía la contraseña por consola y dejaba
  el script colgado.
- `benchmark`: calculaba el tamaño del CSV antes de exportarlo.

### Verificado

- `typecheck` 0 errores · **384** pruebas · **70** de humo · **54** de interfaz ·
  ESLint 0 problemas · `doctor` correcto.
- Instalador `RESALEVAULT-Setup-0.5.0.exe` (118,43 MB) firmado.
- **La instalación real sigue bloqueada** por la política Device Guard de este
  equipo (ver `docs/FIRMA.md`, apartado 3). No se afirma lo contrario.

---

## 0.4.0 — Copias de seguridad y distribución

- Copias de seguridad en ZIP escritas a mano (sin dependencias), con `VACUUM INTO`.
- Verificación por CRC + `integrity_check`.
- **Restauración en dos fases**: preparar → reiniciar → aplicar antes de abrir
  la base de datos, conservando la anterior.
- Rotación de copias y retención configurable.
- Instalador NSIS generado por primera vez.

## 0.3.0 — Licencias

- Tres planes (Free, Pro, Business) con límites centralizados en
  `src/shared/plans.ts`.
- Firma **Ed25519**: la aplicación solo lleva la clave pública.
- Herramienta administrativa (`npm run license:new`) con la clave privada, fuera
  del paquete y fuera de Git.
- Activación y desactivación local, identidad de dispositivo, historial de
  eventos.
- **No se generaron las 400 licencias fundadoras**: falta un registro de emisión.

## 0.2.0 — Inteligencia, IA y almacén

- 12 reglas de inteligencia locales, sin IA y sin conexión.
- **AI Studio BYOK**: Gemini, OpenAI y Anthropic; claves en el almacén cifrado del
  sistema; estimación de coste y confirmación antes de gastar.
- Códigos de barras (Code128, 39, EAN-13, DataMatrix) y QR, con etiquetas
  imprimibles.
- Preparación de pedidos agrupada por ubicación y escaneo de comprobación.

## 0.1.0 — Base, inventario y compraventa

- Arquitectura Electron (main / preload / shared / renderer) con
  `contextIsolation`, `sandbox` y CSP estricta.
- SQLite mediante `node:sqlite` (**sin módulos nativos**, sin Build Tools).
- Inventario con SKU y dígito de control, categorías, ubicaciones jerárquicas,
  fotos (validación por firma binaria y deduplicación por SHA-256).
- Compras con reparto de costes, pedidos con **beneficio neto**, devoluciones.
- Importación y exportación CSV.
- Todo el dinero en **céntimos enteros**.
