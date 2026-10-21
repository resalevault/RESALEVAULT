# Historial de cambios

> **Nota previa importante.** El proyecto se ha desarrollado **sin control de
> versiones** hasta el 20/10/2026: no existÃ­a repositorio Git. Por eso las
> versiones anteriores a la 0.5.0 se reconstruyen a partir de la documentaciÃ³n
> (`docs/ESTADO.md`), no de etiquetas reales. A partir de la 0.5.0 cada entrada
> corresponde a commits reales.

---


## 0.6.0 - 21/10/2026

### Anadido
- **Color de acento personalizable**: 8 presets (verde, azul, morado, naranja,
  rojo, rosa, teal, ambar) seleccionables desde Ajustes. Se aplica al instante
  a toda la interfaz y se guarda en el navegador del usuario.
- **Correccion de scroll**: las paginas ahora hacen scroll correctamente. El
  contenedor principal (.content) no limitaba la altura, por lo que el
  overflow-y: auto de .page no tenia efecto. Corregido con min-height: 0 y
  overflow: hidden.

### Mejorado
- Interfaz mas legible: mejor contraste, espaciado y jerarquia visual.
- El selector de color de acento muestra un circulo por color con el
  seleccionado resaltado.

### Verificado
- typecheck 0, lint 0, 509/509 pruebas, smoke 70/70.

## 0.5.0 â€” 21/10/2026

Primera versiÃ³n pÃºblica. Resumen de lo que incluye y de lo que se ha verificado
de verdad. Detalle tÃ©cnico completo en `docs/ESTADO.md`.

### AÃ±adido

- **Cliente de licencias en lÃ­nea (offline-first)**: confirma el puesto y
  consulta revocaciones contra una Edge Function (Supabase), **verificando
  siempre la firma en local**. Sin conexiÃ³n, la licencia sigue validÃ¡ndose; el
  servidor nunca bloquea la app ni borra datos. 31 pruebas nuevas.
- **Shipping Tracker completo**: navegador integrado (`WebContentsView`, no
  `<webview>`), directorio de transportistas con bÃºsqueda y filtro por regiÃ³n,
  cÃ³digos de seguimiento y acciÃ³n Â«Seguir ahoraÂ». Sin *scraping*.
- **BotÃ³n Â«Comprar licenciaÂ» / Â«Buy licenseÂ»** con canal IPC dedicado y lista
  blanca de enlaces.
- **PreparaciÃ³n para macOS**: objetivos `dmg`/`zip` (x64 + arm64), permisos
  mÃ­nimos y barra nativa `hiddenInset`. Sin binario publicado todavÃ­a.
- **DistribuciÃ³n gratuita (0 â‚¬)** por dos rutas: **GitHub Releases + winget** y
  **Microsoft Store** (paquete AppX/MSIX).
- **`THIRD-PARTY-NOTICES.md`** generado automÃ¡ticamente.
- **Pantalla Â«Acerca deÂ»**: lectura de avisos de terceros sin conexiÃ³n y hash
  SHA-256 del `app.asar` en uso.
- **Firma de cÃ³digo con certificado autofirmado** (gratuito).
- **IntegraciÃ³n continua**: tipos, pruebas, humo, build y auditorÃ­a.

### Cambiado

- **Los lÃ­mites de plan se aplican en el proceso principal**, no solo ocultando
  botones: cuota de artÃ­culos y archivos, importaciÃ³n CSV, ediciÃ³n masiva,
  analÃ­tica, inteligencia y AI Studio.
- **Higiene de producciÃ³n**: los paquetes de prueba (`smoke`, `ui-smoke`,
  `benchmark`) y los mapas de cÃ³digo **ya no viajan** al usuario. Verificado
  extrayendo el `app.asar` del instalador y del `.appx`.
- **Manifiestos de winget al esquema 1.12** con la cabecera
  `yaml-language-server` obligatoria; validados con el validador oficial.

### Corregido

- Errores de esquema en los manifiestos de winget detectados por el validador
  oficial de Microsoft (esquema obsoleto, cabecera ausente e `Installers` mal
  anidado).
- `doctor.cjs`: `require` duplicado.
- `setup-signing.ps1`: la comprobaciÃ³n dejaba el script colgado.
- `benchmark`: calculaba el tamaÃ±o del CSV antes de exportarlo.

### Verificado

- **509 / 509** pruebas (39 archivos) Â· **70 / 70** de humo Â· **65 / 65** de
  interfaz Â· ESLint 0 problemas Â· cobertura **88,66 %** de lÃ­neas.
  *(El humo da 70 en la mÃ¡quina de emisiÃ³n â€”con la clave privadaâ€” y 66 en un
  clon limpio, donde 4 comprobaciones de firma se omiten por diseÃ±o.)*
- Instalador `RESALEVAULT-Setup-0.5.0.exe` firmado (autofirmado) y paquete
  `RESALEVAULT-Store-0.5.0.appx` generados e inspeccionados.
- **Sin secretos**: `sb_secret_`, claves privadas y certificados no entran en el
  paquete (comprobado extrayendo el `app.asar`).

### Pendiente (no se afirma lo contrario)

- **InstalaciÃ³n de extremo a extremo en equipo limpio**: el equipo de desarrollo
  la bloquea por polÃ­tica de firma.
- **PublicaciÃ³n en la Microsoft Store**: paquete listo, sin enviar.
- **macOS**: sin binario (requiere un Mac).

### HistÃ³rico anterior a Git

> El proyecto se desarrollÃ³ **sin control de versiones** hasta el 20/10/2026. Las
> versiones 0.1.0â€“0.4.0 se reconstruyen a partir de la documentaciÃ³n, no de
> etiquetas reales.

---

## 0.4.0 â€” Copias de seguridad y distribuciÃ³n

- Copias de seguridad en ZIP escritas a mano (sin dependencias), con `VACUUM INTO`.
- VerificaciÃ³n por CRC + `integrity_check`.
- **RestauraciÃ³n en dos fases**: preparar â†’ reiniciar â†’ aplicar antes de abrir
  la base de datos, conservando la anterior.
- RotaciÃ³n de copias y retenciÃ³n configurable.
- Instalador NSIS generado por primera vez.

## 0.3.0 â€” Licencias

- Tres planes (Free, Pro, Business) con lÃ­mites centralizados en
  `src/shared/plans.ts`.
- Firma **Ed25519**: la aplicaciÃ³n solo lleva la clave pÃºblica.
- Herramienta administrativa (`npm run license:new`) con la clave privada, fuera
  del paquete y fuera de Git.
- ActivaciÃ³n y desactivaciÃ³n local, identidad de dispositivo, historial de
  eventos.
- **No se generaron las 400 licencias fundadoras**: falta un registro de emisiÃ³n.

## 0.2.0 â€” Inteligencia, IA y almacÃ©n

- 12 reglas de inteligencia locales, sin IA y sin conexiÃ³n.
- **AI Studio BYOK**: Gemini, OpenAI y Anthropic; claves en el almacÃ©n cifrado del
  sistema; estimaciÃ³n de coste y confirmaciÃ³n antes de gastar.
- CÃ³digos de barras (Code128, 39, EAN-13, DataMatrix) y QR, con etiquetas
  imprimibles.
- PreparaciÃ³n de pedidos agrupada por ubicaciÃ³n y escaneo de comprobaciÃ³n.

## 0.1.0 â€” Base, inventario y compraventa

- Arquitectura Electron (main / preload / shared / renderer) con
  `contextIsolation`, `sandbox` y CSP estricta.
- SQLite mediante `node:sqlite` (**sin mÃ³dulos nativos**, sin Build Tools).
- Inventario con SKU y dÃ­gito de control, categorÃ­as, ubicaciones jerÃ¡rquicas,
  fotos (validaciÃ³n por firma binaria y deduplicaciÃ³n por SHA-256).
- Compras con reparto de costes, pedidos con **beneficio neto**, devoluciones.
- ImportaciÃ³n y exportaciÃ³n CSV.
- Todo el dinero en **cÃ©ntimos enteros**.
