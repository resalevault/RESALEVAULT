# Historial de cambios

> **Nota previa importante.** El proyecto se ha desarrollado **sin control de
> versiones** hasta el 20/10/2026: no existía repositorio Git. Por eso las
> versiones anteriores a la 0.5.0 se reconstruyen a partir de la documentación
> (`docs/ESTADO.md`), no de etiquetas reales. A partir de la 0.5.0 cada entrada
> corresponde a commits reales.

---

## 0.5.0 — 21/10/2026

Primera versión pública. Resumen de lo que incluye y de lo que se ha verificado
de verdad. Detalle técnico completo en `docs/ESTADO.md`.

### Añadido

- **Cliente de licencias en línea (offline-first)**: confirma el puesto y
  consulta revocaciones contra una Edge Function (Supabase), **verificando
  siempre la firma en local**. Sin conexión, la licencia sigue validándose; el
  servidor nunca bloquea la app ni borra datos. 31 pruebas nuevas.
- **Shipping Tracker completo**: navegador integrado (`WebContentsView`, no
  `<webview>`), directorio de transportistas con búsqueda y filtro por región,
  códigos de seguimiento y acción «Seguir ahora». Sin *scraping*.
- **Botón «Comprar licencia» / «Buy license»** con canal IPC dedicado y lista
  blanca de enlaces.
- **Preparación para macOS**: objetivos `dmg`/`zip` (x64 + arm64), permisos
  mínimos y barra nativa `hiddenInset`. Sin binario publicado todavía.
- **Distribución gratuita (0 €)** por dos rutas: **GitHub Releases + winget** y
  **Microsoft Store** (paquete AppX/MSIX).
- **`THIRD-PARTY-NOTICES.md`** generado automáticamente.
- **Pantalla «Acerca de»**: lectura de avisos de terceros sin conexión y hash
  SHA-256 del `app.asar` en uso.
- **Firma de código con certificado autofirmado** (gratuito).
- **Integración continua**: tipos, pruebas, humo, build y auditoría.

### Cambiado

- **Los límites de plan se aplican en el proceso principal**, no solo ocultando
  botones: cuota de artículos y archivos, importación CSV, edición masiva,
  analítica, inteligencia y AI Studio.
- **Higiene de producción**: los paquetes de prueba (`smoke`, `ui-smoke`,
  `benchmark`) y los mapas de código **ya no viajan** al usuario. Verificado
  extrayendo el `app.asar` del instalador y del `.appx`.
- **Manifiestos de winget al esquema 1.12** con la cabecera
  `yaml-language-server` obligatoria; validados con el validador oficial.

### Corregido

- Errores de esquema en los manifiestos de winget detectados por el validador
  oficial de Microsoft (esquema obsoleto, cabecera ausente e `Installers` mal
  anidado).
- `doctor.cjs`: `require` duplicado.
- `setup-signing.ps1`: la comprobación dejaba el script colgado.
- `benchmark`: calculaba el tamaño del CSV antes de exportarlo.

### Verificado

- **510 / 510** pruebas (39 archivos) · **70 / 70** de humo · **65 / 65** de
  interfaz · ESLint 0 problemas · cobertura **88,66 %** de líneas.
  *(El humo da 70 en la máquina de emisión —con la clave privada— y 66 en un
  clon limpio, donde 4 comprobaciones de firma se omiten por diseño.)*
- Instalador `RESALEVAULT-Setup-0.5.0.exe` firmado (autofirmado) y paquete
  `RESALEVAULT-Store-0.5.0.appx` generados e inspeccionados.
- **Sin secretos**: `sb_secret_`, claves privadas y certificados no entran en el
  paquete (comprobado extrayendo el `app.asar`).

### Pendiente (no se afirma lo contrario)

- **Instalación de extremo a extremo en equipo limpio**: el equipo de desarrollo
  la bloquea por política de firma.
- **Publicación en la Microsoft Store**: paquete listo, sin enviar.
- **macOS**: sin binario (requiere un Mac).

### Histórico anterior a Git

> El proyecto se desarrolló **sin control de versiones** hasta el 20/10/2026. Las
> versiones 0.1.0–0.4.0 se reconstruyen a partir de la documentación, no de
> etiquetas reales.

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
