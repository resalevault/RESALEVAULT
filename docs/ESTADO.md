# RESALEVAULT — Estado del proyecto

Documento de transparencia: qué funciona **de verdad** (verificado ejecutándolo),
qué falta y qué costes implicará. No se marca nada como terminado sin pruebas.

Última actualización: **21/10/2026** — **Guion de publicación único**: nuevo
`docs/release/GUION_PUBLICACION.md`, el documento que une las dos rutas
(GitHub+winget y Microsoft Store) en **un solo orden de ejecución**, marcando en
cada paso si es **TÚ** (requiere tu cuenta/equipo) o **YO** (comando ya probado).
Incluye el estado de partida real (qué está listo y qué no), el camino corto
recomendado y lo que **no** hay que hacer. Además, honestidad sobre MSIX: el
README de la entrega ahora avisa de que, en la versión de la Store, Windows
**virtualiza** `%APPDATA%` (comprobado en la documentación oficial de Microsoft)
y la app muestra la ruta real desde Ajustes. El guion entra en la carpeta de
entrega (18 ficheros). Bloque anterior: **Revisión de promesas del material
público**: auditoría de cada afirmación de la ficha de la Store y del PR de
winget contra el código; todas se confirman (canales reales, informes por
canal/categoría, instalación por usuario, privacidad exacta), y se corrigieron
dos puntos (cuerpo del release duplicado → remite a `--print-notes`; matiz «no
dependen de ningún servidor» en la ficha). Bloque anterior: **Coherencia
documental + texto de release automático**: contradicciones corregidas
(500/500 → 501/501, «(54)» → «(65)», 161,0 MB → 160,98 MB) y 158 canales, 37
tablas, esquema v5, 501/501, 70/70 y 65/65 idénticos en todos los documentos.
(`ENVIO_STORE.md`) con el comando para verificar el `publisher` real dentro del
`.appx`, y guía de capturas (`CAPTURAS.md`) con resoluciones oficiales y las 6
pantallas concretas, usando los **datos de ejemplo** que ya trae la app
(reversibles). Bloque anterior: **Material de publicación listo**: los
manifiestos de winget se corrigieron al esquema **1.12.0** (el recomendado por la
plantilla de PR de `microsoft/winget-pkgs`) y llevan la cabecera
`yaml-language-server` obligatoria; el validador oficial de Microsoft da
**«Manifest validation succeeded.»** **sin avisos**. Añadidos el texto del
release, el cuerpo del PR, la ficha de la Store y una **`PRIVACY.md` pública**
(la exige la Store). Bloque anterior: **Artefactos regenerados con el cliente
online**: instalador NSIS firmado (autofirmado) y paquete AppX reconstruidos y
**verificados extrayendo el `app.asar`** (contienen el cliente, 0 secretos);
carpeta de entrega `RESALEVAULT_RELEASE` reconstruida en el escritorio real.
Bloque anterior: **cliente online de
licencias** — la aplicación de escritorio ya **confirma el puesto y consulta
revocaciones** contra
la Edge Function, con reglas offline-first (nunca borra datos, nunca corta el
trabajo sin conexión) y sin exponer ningún secreto. 31 pruebas nuevas, 97 % de
cobertura del cliente, **65/65 comprobaciones** de interfaz y **501/501** pruebas
totales. Bloque anterior: botón obligatorio **«Comprar licencia» / «Buy license»** que abre el Discord oficial
(canal IPC dedicado con lista blanca, 12 pruebas nuevas y **61/61 comprobaciones**
de interfaz en Electron real); **soporte macOS preparado** (objetivo `dmg`/`zip`
x64+arm64, permisos mínimos, barra nativa `hiddenInset`); **higiene de producción
corregida** (los paquetes de prueba `smoke`/`ui-smoke`/`benchmark` ya **no viajan**
al usuario — verificado extrayendo el `.asar` y el `.appx`); instalador NSIS y
AppX regenerados y **carpeta de entrega `RESALEVAULT_RELEASE` creada en el
escritorio real** con documentación y hashes verificados. Informe completo en
[`docs/AUDITORIA.md`](AUDITORIA.md) y `RESALEVAULT_RELEASE/Documentation/`.
Bloque anterior: **distribución gratuita**: rutas GitHub+winget y Microsoft Store
preparadas a 0 €. Generador de manifiestos winget y **validado con
el validador oficial de Microsoft** (`winget validate` → correcto); paquete
**AppX/MSIX generado e inspeccionado** (protocolo `rv-media` declarado, versión 4
componentes, sin firmar a propósito para que lo firme la Store). Guía completa en
[`docs/DISTRIBUCION.md`](DISTRIBUCION.md).
Bloque anterior: **backend de licencias (Supabase)**: Edge Function desplegada
con control de **puestos**, **revocación** y consulta de revocaciones; migración
aplicada en el proyecto real; script de sincronización con verificación previa
de firmas; **43 pruebas nuevas** del backend y **prueba de extremo a extremo en
vivo contra el proyecto desplegado** (firma falsificada → 403, puestos agotados →
409, revocada → 403; ver `docs/BACKEND.md`). Detalle en
[`docs/TEST-REPORT.md`](TEST-REPORT.md). Bloques anteriores: control de
versiones, firma autofirmada, avisos de terceros, ESLint, cobertura, CI, banco de
pruebas con 50.000 artículos, **aplicación real de los límites de plan**,
**registro de emisión de licencias auditable** (`npm run license:list`) y
**pantalla «Acerca de»**.

---

## Resumen

| Fase | Estado |
|---|---|
| **1. Base técnica** | ✅ **Completada** |
| **2. Inventario** | ✅ **Completada** (incluye fotos, documentos y CSV) |
| **3. Compras, pedidos y finanzas** | ✅ **Completada** (beneficio **neto**) |
| **4. Productividad de almacén** | ✅ **Completada** (códigos, etiquetas, preparación) |
| **5. Inteligencia e IA** | ✅ **Completada** (AI Studio BYOK) |
| 6. Licencias y comercialización | 🟡 Límites aplicados + **backend online desplegado y probado**; falta el cliente en la app |
| 7. Business y expansión | 🟡 Local sí; multiusuario real ⛔ sin backend |
| 8. Lanzamiento | 🟡 Copias ✅; instalador NSIS **firmado (autofirmado)**; **distribución gratuita preparada** (winget validado + paquete Store generado, ver [`docs/DISTRIBUCION.md`](DISTRIBUCION.md)); **carpeta de entrega `RESALEVAULT_RELEASE` creada**; instalación local bloqueada por Device Guard |
| **Shipping Tracker** | ✅ **Completado** (navegador integrado + 46 transportistas) |
| **Calidad (ESLint, cobertura, CI, benchmark)** | ✅ **Completado** |
| **Comprar licencia (Discord)** | ✅ **Completado** (botón es/en + lista blanca + 12 pruebas + 61/61 interfaz) |
| **macOS** | ⛔ **Bloqueado**: configuración y permisos listos, pero no hay un Mac para compilar/firmar (ver `RESALEVAULT_RELEASE/Documentation/MACOS_STATUS.md`) |

---

## Verificación ejecutada

| Prueba | Resultado |
|---|---|
| `npm run typecheck` | **0 errores** (Node y navegador) |
| `npm test` | **501 / 501** correctas (38 archivos) |
| `npm run lint` | **0 errores, 0 avisos** (ESLint 9) |
| `npm run test:coverage` | **88,66 % líneas** · 86,00 % sentencias · 90,75 % funciones · 78,40 % ramas |
| `npm run smoke` | **70 / 70** comprobaciones en Electron real |
| `npm run smoke:ui` | **65 / 65** comprobaciones de interfaz en Electron real |
| `npm run build` | ✅ los tres procesos compilados |
| `npm run doctor` | ✅ `TODO CORRECTO` (Electron 44.9, Node 24.22, SQLite 3.53.4) |
| `npm run bench` | ✅ 50.000 artículos + 1.000 pedidos (ver `docs/TEST-REPORT.md`) |
| `npm run dist:signed` | ✅ instalador firmado; `Get-AuthenticodeSignature` → `UnknownError` (raíz no confiable) |
| `winget validate` (manifiestos v0.5.0, esquema **1.12.0**) | ✅ **«Manifest validation succeeded.»** con el validador oficial de Windows, **sin avisos** (21/10/2026) |
| `npm run dist:appx` | ✅ paquete `RESALEVAULT-Store-0.5.0.appx` generado (160,98 MB); manifiesto interior inspeccionado: identidad, versión `0.5.0.0`, protocolo `rv-media` con `uap:Protocol`, en-US + es-ES, `runFullTrust`; **sin firmar a propósito** (lo firma la Store) |
| `npm run dist:signed` (instalador final) | ✅ `RESALEVAULT-Setup-0.5.0.exe` (117,67 MB) — SHA-256 `39DE1695…DB7C4B51` (21/10/2026, **con el cliente online**) |
| Paquete de producción inspeccionado | ✅ extraído el `.asar` del `.exe` **y** del `.appx`: **sin mapas de código**, **sin** `smoke`/`ui-smoke`/`benchmark`, **0 secretos**, y **con** el cliente online (`seats_exhausted`, `online_verified`, `license:refresh`) |
| `winget validate` (hash nuevo) | ✅ **«Manifest validation succeeded»** con el `InstallerSha256` del instalador real (21/10/2026) |
| Carpeta de entrega | ✅ `RESALEVAULT_RELEASE` creada en el escritorio real (`C:\Users\16ray\Desktop`); hashes recomputados sobre los ficheros entregados y coincidentes |
| Diagnóstico del bloqueo de instalación | ✅ causa raíz identificada con evento real `3033` (nivel de firma Enterprise); Defender sin detecciones; kit `verify-install.ps1` preparado (`docs/FIRMA.md` §9–10) |
| Arranque repetido (3 veces) | migraciones solo la primera vez |

El detalle completo, con las cifras medidas y lo que **no** se ha probado, está
en [`docs/TEST-REPORT.md`](TEST-REPORT.md).

### Qué cubren las pruebas de humo

**Datos (`npm run smoke`)** — dentro de Electron: migraciones, integridad, WAL,
ubicaciones jerárquicas, SKU único, búsqueda y filtros, edición masiva,
archivado, **compras con reparto de costes**, **pedidos con beneficio NETO**,
devoluciones, informes, **códigos de barras y QR**, **inteligencia**,
**activación de licencia firmada con Ed25519** y persistencia tras cerrar y
reabrir.

**Interfaz (`npm run smoke:ui`)** — carga el HTML compilado, crea un artículo por
el puente IPC, navega de verdad pulsando la barra lateral, crea un pedido y
verifica que la columna de **beneficio neto** muestra el importe correcto
(`26,10 €`), cambia de idioma y de tema, y comprueba que no hay errores en la
consola del renderer.

---

## Fase 2 — Inventario ✅

| Elemento | Estado |
|---|---|
| Ficha completa, SKU único, categorías, atributos, etiquetas | ✅ |
| Almacén → Estantería → Caja → Compartimento con rutas recalculadas | ✅ |
| Búsqueda global, 8 ordenaciones, filtros combinables, paginación | ✅ |
| Selección múltiple y edición masiva con vista previa | ✅ |
| Archivado, restauración y borrado protegido | ✅ |
| Historial de cambios por artículo | ✅ |
| **Fotografías y documentos** | ✅ |
| **Importación CSV con vista previa y detección de duplicados** | ✅ |
| **Exportación CSV** (artículos, pedidos, compras, gastos, picking) | ✅ |
| **Anuncios por plataforma** | ✅ (registro manual; sin APIs) |

### Fotografías y documentos — cómo funciona

- **Se comprueba el tipo REAL por firma binaria.** Un `.jpg` que sea un
  ejecutable se rechaza (hay prueba).
- Se guardan por **SHA-256**: la misma foto subida dos veces ocupa un archivo.
- **El original nunca se modifica**; la miniatura es un archivo aparte.
- Se sirven por el protocolo propio `rv-media:`, que valida cada ruta y rechaza
  cualquier intento de salir de la carpeta de datos.
- Límites: 25 MB por archivo, 30 fotos y 20 documentos por artículo.
- Se puede elegir portada, reordenar y abrir documentos con la aplicación del
  sistema.

---

## Fase 3 — Compras, pedidos y finanzas ✅

| Elemento | Estado |
|---|---|
| Proveedores | ✅ |
| Compras con envío, otros gastos y descuento | ✅ |
| **Reparto de costes entre artículos** (proporcional / igual / ninguno) | ✅ |
| **Materializar lotes**: crear artículos desde una compra | ✅ |
| Gastos generales con categorías y periodicidad | ✅ |
| Pedidos con varios artículos, comisiones y envíos | ✅ |
| **Beneficio NETO** (descuenta comisiones, envíos, cargos y devoluciones) | ✅ |
| Devoluciones con reembolso y reintroducción en inventario | ✅ |
| Cancelación de pedidos que devuelve los artículos | ✅ |
| **Impedir vender dos veces el mismo artículo** | ✅ |
| Coste de venta **congelado** en el pedido | ✅ |
| Informes: por plataforma, mes, categoría, estado, artículo | ✅ |
| Calculadora de rentabilidad **antes de comprar** | ✅ |

### Contra el doble conteo (importante)

1. El coste de una compra **no** es un gasto general: se reparte entre los
   artículos y se escribe en ellos. El artículo es la única fuente de su coste.
2. `expenses` es **solo** para gastos generales del negocio.
3. El envío cobrado al comprador es un **ingreso**; el envío que pagas tú es un
   **coste**. Son campos distintos a propósito.
4. El reparto redondea al céntimo y **asigna el residuo a la última línea**, de
   modo que la suma repartida es exactamente el gasto.

---

## Fase 4 — Productividad de almacén ✅

| Elemento | Estado |
|---|---|
| Códigos de barras (128, 39, EAN-13, DataMatrix) y QR | ✅ |
| Etiquetas imprimibles con formato configurable | ✅ |
| Vista previa e impresión real (hoja de estilos de impresión) | ✅ |
| Etiquetas de artículos y de ubicaciones | ✅ |
| Preparación de pedidos agrupada por ubicación | ✅ |
| **Escaneo de comprobación** con lector USB (teclado) | ✅ |
| Lista de comprobación: recogido / empaquetado | ✅ |
| Marcar como enviado **solo con confirmación explícita** | ✅ |

El escaneo **no marca** un artículo si el SKU no coincide: avisa del SKU
esperado. Es justo el error que la función existe para evitar.

---

## Shipping Tracker ✅ (módulo adicional)

Detalle completo en [`docs/SEGUIMIENTO.md`](SEGUIMIENTO.md).

| Elemento | Estado |
|---|---|
| Navegador integrado con `WebContentsView` (no `<webview>`) | ✅ |
| Aislamiento: sin Node, sin preload, sandbox, sesión separada | ✅ |
| Solo HTTPS; emergentes y descargas bloqueadas; permisos denegados | ✅ |
| Directorio de **46 transportistas**, con búsqueda y filtro por región | ✅ |
| **41 dominios verificados** con una petición real; 5 marcados «sin comprobar» | ✅ |
| Gestión de códigos: alta, edición, copia, archivado y borrado | ✅ |
| **Track Now** abre la web oficial dentro de la app | ✅ |
| Relleno del código en la URL cuando el transportista lo admite | ✅ |
| Si no lo admite, se copia al portapapeles y se explica | ✅ |
| Distinción explícita entre estado `manual` y `confirmed` | ✅ |
| Funciona sin conexión (catálogo y códigos) | ✅ |
| Sin logotipos de terceros: distintivo propio con color estable | ✅ |
| Sin APIs de transportista ni seguimiento automático | ⬜ no implementado (deliberado) |

---

## Fase 5 — Inteligencia e IA ✅

### Intelligence ✅

12 reglas **locales** (sin IA, sin conexión, sin coste): stock estancado, margen
bajo, margen negativo, datos incompletos, sin anuncios, pendientes de preparar,
pedidos sin enviar, concentración de capital, tasa de devoluciones, gastos en
aumento, sin ventas recientes e inventario vacío.

- Cada alerta declara los **datos exactos** en los que se basa.
- Se pueden descartar 7 días, para siempre, o ajustar los umbrales.
- No se presenta ninguna correlación como causa ni se promete beneficio.

### AI Studio ✅ (BYOK)

| Elemento | Estado |
|---|---|
| Conexiones con Gemini, OpenAI y Anthropic | ✅ |
| Clave cifrada con el almacén del sistema (`safeStorage`/DPAPI) | ✅ |
| La clave nunca se devuelve, ni se registra, ni entra en un error | ✅ |
| Prueba de conexión real: consulta la lista de modelos del proveedor | ✅ |
| Modelos **consultados al proveedor** (no listas obsoletas) | ✅ |
| URL base configurable (proxy propio / endpoint regional) | ✅ |
| Ruta por tarea (un modelo distinto para cada tarea) | ✅ |
| 8 tareas: título, descripción, traducción, clasificación, atributos, palabras clave, revisión y sugerencia de precio | ✅ |
| Imágenes para análisis (hasta 4, con validación de tipo y tamaño) | ✅ |
| Registro de uso: proveedor, modelo, tokens y **coste estimado** | ✅ |
| Precio por millón de tokens **configurable por el usuario** | ✅ |
| Estimación de coste de flujos multi-IA + confirmación obligatoria | ✅ |
| Límite mensual de llamadas según el plan | ✅ |

**Aviso de honestidad:** la integración sigue la documentación oficial de cada
proveedor y su construcción de peticiones está cubierta por pruebas (cabeceras,
forma del cuerpo, mapeo de errores y cálculo de coste). **No se ha podido
verificar contra el servicio real**, porque eso exige una clave de API. Por eso:

- No hay ninguna lista de modelos escrita a mano que pueda caducar.
- Los errores se muestran con su código (`invalid_key`, `rate_limited`...).
- La pantalla no simula ninguna respuesta: sin conexión, se explica cómo
  configurarla.

Tareas que **no** se hacen: generar imágenes, falsear el estado de un producto o
inventar precios de mercado. Las sugerencias de precio se razonan con el coste y
el margen del usuario, y se etiquetan como estimación.

---

## Fase 6 — Licencias 🟡

| Elemento | Estado |
|---|---|
| Tres planes con límites centralizados (`shared/plans.ts`) | ✅ |
| **Límites aplicados en el proceso principal** (no solo en la interfaz) | ✅ *nuevo* |
| Firma Ed25519: la app solo lleva la clave **pública** | ✅ |
| Herramienta administrativa con la clave **privada** (fuera del paquete) | ✅ |
| Activación, desactivación, historial de eventos | ✅ |
| Identificador de dispositivo estable | ✅ |
| Cuotas de fundadores 200 / 200 definidas | ✅ |
| Registro de emisión de licencias (auditoría + reverificación) | ✅ *nuevo* (`npm run license:list`) |
| **Backend online en Supabase** (puestos, revocación, `/health`) | ✅ *nuevo* **desplegado y probado en vivo** (20/10/2026) |
| **Cliente online en la aplicación** (activa puesto, consulta revocaciones) | ✅ *nuevo* (31 pruebas nuevas) |
| Pasarela de pagos | ⬜ no implementada (sin presupuesto) |

### Backend online desplegado (20/10/2026)

- **Proveedor: Supabase Free** (elegido por el propietario del proyecto),
  proyecto `ugfefewrikcghfwqhezi`, coste **0 €**.
- **Edge Function `licence`** con las rutas `/activate`, `/deactivate`,
  `/revocations` y `/health`; las tablas `licenses` y `license_activations`
  tienen RLS **sin políticas**: solo el `service_role` las toca.
- **La clave privada Ed25519 no está en el servidor**: la emisión sigue siendo
  local (`npm run license:new`) y la subida del registro (`npm run license:sync`)
  verifica cada firma **antes** de subirla.
- **Prueba en vivo realizada**: firma falsificada → `403 bad_signature`; dos
  activaciones ok → tercera `409 seats_exhausted`; liberar un puesto → ok;
  revocar → `403 revoked` y `/revocations` devuelve el hash. Tabla completa en
  [`docs/TEST-REPORT.md`](TEST-REPORT.md) y [`docs/BACKEND.md`](BACKEND.md).
- **Offline-first**: el token se valida sin red; el servidor se consulta como
  mucho cada 7 días. Si Supabase pausa el proyecto por inactividad (~1 semana),
  las licencias existentes **siguen funcionando**.

### Cliente online de la aplicación (21/10/2026)

El cliente de escritorio **ya se conecta** al backend, con estas reglas:

- **Offline primero, sin excepciones**: la firma Ed25519 se verifica siempre en
  local. El backend sirve para controlar **puestos** y **revocaciones**, no para
  conceder el plan. Si el servidor cae, una licencia ya activada **conserva su
  plan** y la app sigue funcionando.
- **Nunca borra datos**: un rechazo del servidor solo cambia el estado de la
  licencia (y, en una revocación, los límites del plan). Inventario, pedidos y
  fotos quedan intactos. Hay una prueba dedicada que lo comprueba.
- **Comprobación perezosa**: se refresca como mucho cada 7 días
  (`ONLINE_RECHECK_DAYS`). Las revocaciones se piden solo desde el último cursor
  (`/revocations?since=…`) y se guardan sus **hashes** en una caché local
  (`license_revocations`), de modo que una revocación surte efecto aunque el
  equipo esté sin conexión al consultar.
- **Sin secretos**: la app envía la clave **publishable** de Supabase como
  `Bearer` (pública por diseño, limitada por RLS). La clave `sb_secret_` **nunca**
  sale del servidor. Verificado sobre el paquete compilado: 0 apariciones.
- **Un solo canal IPC dedicado** (`license:refresh`), botón «Comprobar ahora» en
  la pantalla de Licencias y estado visible (verificada / sin conexión /
  rechazada), traducido a español e inglés.
- **Nuevas piezas**: `src/main/services/licence-online.ts`,
  `src/shared/licence-backend.ts`, migración `005-license-online.ts`,
  `tests/licence-online.test.ts` (31 pruebas, 97 % de cobertura del cliente).

Migración 005 (aditiva, no destructiva): `licenses.online_state`,
`licenses.online_error`, `licenses.revocation_cursor` y la tabla
`license_revocations`.

Aviso honesto: el cliente respeta lo que diga el servidor, pero **la instalación
real en una máquina limpia sigue bloqueada** por este equipo (nivel de firma
Enterprise), y **la publicación en GitHub/Store sigue pendiente** de las cuentas
del propietario. Nada de eso se puede afirmar como hecho.

### Límites realmente aplicados (corrección importante)

Antes de este bloque, los planes existían pero **casi ningún límite se
comprobaba** en el proceso principal. Ahora se aplican en
`src/main/ipc/register.ts` y `register-modules.ts`:

| Límite | Canal protegido |
|---|---|
| Cuota de artículos | `products:create` |
| Cuota de archivos | `media:import` |
| Importación CSV | `csv:import` |
| Edición masiva | `products:bulkUpdate` / `bulkPreview` |
| Analítica | `finance:report` |
| Inteligencia | `intelligence:report` |
| AI Studio + cuota mensual | `ai:generate` |

En la interfaz, `PlanGate` explica la función bloqueada con un enlace a
Licencias, en lugar de mostrar una pantalla rota.

Generación de licencias:

```powershell
npm run license:keygen                       # solo la primera vez
npm run license:new -- --plan pro --kind founder --holder "Nombre"
npm run license:verify -- --code <codigo>
npm run license:list                         # registro de emision + reverificacion
```

**No se han generado las 400 licencias fundadoras.** El registro de emisión que
lo bloqueaba ya está implementado (`tools/keys/issued-licenses.jsonl`, privado y
excluido de Git); ahora el bloqueo es comercial: se emiten una a una cuando haya
clientes reales. Detalles en [`docs/LICENCIAS.md`](LICENCIAS.md).

---

## Fases 7 y 8

| Elemento | Estado |
|---|---|
| Icono propio (`build/icon.png`, monograma RV) | ✅ |
| **Copias de seguridad** (ZIP, verificación, rotación, restauración en dos fases) | ✅ |
| Instalador NSIS generado | ✅ `RESALEVAULT-Setup-0.5.0.exe` |
| **Firma de código** (certificado autofirmado, 0 €) | ✅ **firmado y verificado** |
| **Avisos de terceros** incluidos en el paquete (`resources/`) | ✅ |
| Instalación probada en este equipo | ❌ bloqueada por política de nivel de **firma Enterprise** (evento CI `3033`; diagnóstico en `docs/FIRMA.md` §9); kit de verificación en máquina limpia listo (§10) |
| Organizaciones, usuarios, permisos, sincronización | ⬜ local pendiente; online ⛔ sin backend |

### Sobre la firma y el bloqueo (importante antes de distribuir)

El instalador **se genera y se firma**. La verificación real:

```
Get-AuthenticodeSignature release\RESALEVAULT-Setup-0.5.0.exe
  Status:        UnknownError
  StatusMessage: A certificate chain processed, but terminated in a root
                 certificate which is not trusted by the trust provider.
```

Es decir: **la firma es criptográficamente válida, pero la raíz no es de
confianza pública**, porque el certificado es autofirmado. Eso es exactamente lo
esperado. Un certificado autofirmado **no** elimina SmartScreen ni el bloqueo de
Device Guard.

En este equipo, Windows bloquea la ejecución del instalador con una **política
de nivel de firma Enterprise** en modo impuesto (eventos `3033` de Code
Integrity que citan el nombre del instalador; no es Smart App Control ni
Defender: ambos comprobados y descartados). **La instalación de extremo a
extremo no se ha podido verificar aquí y no se afirma lo contrario.** Lo que sí
está verificado es el contenido: `release\win-unpacked\RESALEVAULT.exe`
arranca, migra la base de datos y crea la copia automática. Para cerrar el
pendiente hay un **kit de verificación en máquina limpia** de 0 €
(`scripts/verify-install.ps1`, instrucciones en `docs/FIRMA.md` §10). **Defender
no tiene ninguna detección** del proyecto (comprobado 20/10/2026).

Procedimiento completo, generación del certificado y verificación de hashes en
[`docs/FIRMA.md`](FIRMA.md). Para distribución pública hace falta un
certificado OV/IV de una CA (150–300 €/año). **No se ha comprado ninguno.**

---

## Lo que el programa NO hace (y no afirma hacer)

- **No se conecta a Vinted ni a ningún marketplace.** Los anuncios se registran
  a mano. No hay sincronización automática.
- **Los estados de seguimiento son manuales.** Abrir la web de un transportista
  no confirma nada y no se presenta como si lo hiciera.
- **AI Studio no se ha verificado contra los proveedores reales** (requiere una
  clave). Las peticiones están probadas; la respuesta real, no.
- **No se envía información del negocio a ningún servidor** salvo cuando el
  usuario lanza explícitamente una tarea de IA, y en ese caso solo van los datos
  del artículo y el prompt. Para las licencias existe ya un backend en Supabase
  (solo recibe el código de licencia y el identificador de dispositivo, nunca
  inventario ni pedidos) y **el cliente de la app aún no está conectado a él**.
- **No cambia precios ni anuncios automáticamente.**
- **No hay modo multiusuario.** El esquema lo prepara y el plan Business declara
  `multiUser`/`sync`, pero **la función no existe**: no hay backend.
- **No hay actualización automática.** No hay servidor de actualizaciones y no se
  simula uno. El proceso manual está en `docs/MANUAL-USUARIO.md`.
- **No genera PDF ni XLSX todavía.** La exportación es CSV.
- **No hace devoluciones parciales por línea**, ni multi-divisa, ni tipos de
  cambio automáticos.
- **No envía correos.** Requeriría un servicio de pago.
- **No hay integración con marketplaces.** No hay API autorizada y **no se hace
  scraping**.
- **No promete seguridad absoluta** ni inmunidad frente a la piratería.
- **Los informes por categoría solo publican el resultado directo de la
  mercancía.** Las comisiones y envíos no se reparten por categoría porque sería
  un reparto inventado.

---

## Deuda técnica conocida

| Punto | Impacto | Plan |
|---|---|---|
| `node:sqlite` es experimental en Node | Bajo: aislado en `database.ts` | Vigilar |
| Paquete del renderer ~1,07 MB | Bajo en escritorio | División de código si crece |
| Paquetes de `node_modules` en el asar (`zod`, `bwip-js`) | Bajo | Empaquetar si molesta |
| Rotación de inventario se calcula sobre el capital actual | Bajo (documentado en la UI) | Histórico de capital |
| Búsqueda por texto es un barrido lineal (~70 ms a 50.000) | Bajo, medido | Índice FTS5 si se superan 100.000 |
| Informe financiero ~180 ms con 1.000 pedidos | Bajo | Cachear agregados si crece |
| Sin firma de confianza pública | **Alto en distribución** | Certificado OV/IV |
| Sin actualización automática | Medio | Feed propio o proceso manual documentado |
| `multiUser`/`sync` declarados pero sin implementar | Medio (puede confundir) | Implementar o quitar del plan |

Los puntos ya resueltos (ESLint, selector de Pedidos, firma) se han movido a la
sección de verificación.

---

## Costes externos

| Concepto | Importe estimado | Momento |
|---|---|---|
| Desarrollo y uso local | **0 €** | ya |
| Git, ESLint, cobertura, CI (GitHub Actions), electron-builder | **0 €** | ya |
| Certificado de firma **autofirmado** de desarrollo | **0 €** | ya |
| Certificado de firma **de confianza pública** (OV/IV) | 150–300 €/año | antes de distribuir |
| Backend de licencias (Supabase Free) | **0 €** (verificado 20/10/2026) | desplegado; revisar DPA antes de vender |
| APIs de IA | **a cargo del cliente** (BYOK) | ya |
| Pasarela de pago | comisión por transacción | Fase 6 |

### Gasto real hasta la fecha: **0 €**

No se ha comprado ningún certificado, ni contratado ningún servidor, dominio,
API, almacenamiento, correo ni suscripción. No se ha introducido ninguna tarjeta
bancaria. No se ha iniciado ninguna prueba gratuita.

### Lo que **no** se puede prometer gratis para siempre

| Servicio | Situación hoy | Riesgo |
|---|---|---|
| GitHub Actions | Plan gratuito para repositorios públicos o con minutos incluidos | Los minutos pueden agotarse |
| Supabase Free | 0 € hoy: 500 MB de base de datos, 5 GB de tráfico, 500.000 invocaciones/mes | **Pausa el proyecto tras ~1 semana de inactividad** (reactivable gratis); las cuotas y condiciones pueden cambiar |
| APIs de IA | **Siempre** a cargo del usuario | Es BYOK por diseño |

Ninguna de estas dependencias es necesaria para usar el programa: si desaparecen,
el inventario, los pedidos y las copias siguen funcionando.
