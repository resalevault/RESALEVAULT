# RESALEVAULT â€” Estado del proyecto

Documento de transparencia: quÃ© funciona **de verdad** (verificado ejecutÃ¡ndolo),
quÃ© falta y quÃ© costes implicarÃ¡. No se marca nada como terminado sin pruebas.

Ãšltima actualizaciÃ³n: **21/10/2026** â€” **Arreglado un fallo real de instalaciÃ³n de
dependencias en CI**: a partir de **npm 11.19** los scripts de ciclo de vida de
las **dependencias** estÃ¡n **bloqueados por defecto** (`allowScripts`), y Electron
44 ya **no declara** un `install` que se ejecute solo. Resultado: en un clon limpio,
`npm ci` **no descargaba el binario de Electron** y los trabajos `smoke`/`smoke:ui`
de CI habrÃ­an **fallado**. Reproducido y verificado: `npm ci` en un clon limpio
dejaba `node_modules/electron/dist/electron.exe` ausente; con el arreglo
(`"postinstall": "install-electron"`), el mismo `npm ci` produce un Electron
funcional (`v44.9.0`, humo **66/66**). AÃ±adido ademÃ¡s **`npm run preflight`**
(`scripts/preflight.mjs`, 8 pruebas), que detecta el binario ausente y explica la
causa y la soluciÃ³n en lugar de fallar de forma crÃ­ptica; se ejecuta antes de
`dev`, `smoke`, `smoke:ui`, `doctor` y `bench`. Total de pruebas: **509** (39
archivos). AdemÃ¡s, la carpeta de entrega incluye ya la **polÃ­tica de privacidad**
(`PRIVACY.md`) y los **tÃ©rminos de servicio** (`TERMS.md`, borrador): **20
ficheros**. Bloque anterior: **TÃ©rminos de
servicio y auditorÃ­a de coherencia**: nuevo **borrador** `TERMS.md` (es/en) con los
hechos reales del programa (planes, puestos, caducidad, revocaciÃ³n, nunca se borran
datos), pendiente de tu revisiÃ³n; el manifiesto de winget aÃ±ade **`LicenseUrl`**
(lo piden los revisores para paquetes propietarios) y `winget validate` sigue
pasando. AdemÃ¡s, una **auditorÃ­a de coherencia** encontrÃ³ y corrigiÃ³ **13
afirmaciones falsas u obsoletas** de la documentaciÃ³n (cobertura, pruebas del
backend, cÃ³digos de error, lÃ­mite de fotos, Â«no hay backendÂ», firma del exe,
tamaÃ±os, migraciones). Bloque anterior: **Guion de publicaciÃ³n Ãºnico**: nuevo
`docs/release/GUION_PUBLICACION.md`, el documento que une las dos rutas
(GitHub+winget y Microsoft Store) en **un solo orden de ejecuciÃ³n**, marcando en
cada paso si es **TÃš** (requiere tu cuenta/equipo) o **YO** (comando ya probado).
Incluye el estado de partida real (quÃ© estÃ¡ listo y quÃ© no), el camino corto
recomendado y lo que **no** hay que hacer. AdemÃ¡s, honestidad sobre MSIX: el
README de la entrega ahora avisa de que, en la versiÃ³n de la Store, Windows
**virtualiza** `%APPDATA%` (comprobado en la documentaciÃ³n oficial de Microsoft)
y la app muestra la ruta real desde Ajustes. El guion entra en la carpeta de
entrega (18 ficheros). Bloque anterior: **RevisiÃ³n de promesas del material
pÃºblico**: auditorÃ­a de cada afirmaciÃ³n de la ficha de la Store y del PR de
winget contra el cÃ³digo; todas se confirman (canales reales, informes por
canal/categorÃ­a, instalaciÃ³n por usuario, privacidad exacta), y se corrigieron
dos puntos (cuerpo del release duplicado â†’ remite a `--print-notes`; matiz Â«no
dependen de ningÃºn servidorÂ» en la ficha). Bloque anterior: **Coherencia
documental + texto de release automÃ¡tico**: contradicciones corregidas
(500/500 â†’ 501/501, Â«(54)Â» â†’ Â«(65)Â», 161,0 MB â†’ 160,98 MB) y 158 canales, 37
tablas, esquema v5, 501/501, 70/70 y 65/65 idÃ©nticos en todos los documentos.
(`ENVIO_STORE.md`) con el comando para verificar el `publisher` real dentro del
`.appx`, y guÃ­a de capturas (`CAPTURAS.md`) con resoluciones oficiales y las 6
pantallas concretas, usando los **datos de ejemplo** que ya trae la app
(reversibles). Bloque anterior: **Material de publicaciÃ³n listo**: los
manifiestos de winget se corrigieron al esquema **1.12.0** (el recomendado por la
plantilla de PR de `microsoft/winget-pkgs`) y llevan la cabecera
`yaml-language-server` obligatoria; el validador oficial de Microsoft da
**Â«Manifest validation succeeded.Â»** **sin avisos**. AÃ±adidos el texto del
release, el cuerpo del PR, la ficha de la Store y una **`PRIVACY.md` pÃºblica**
(la exige la Store). Bloque anterior: **Artefactos regenerados con el cliente
online**: instalador NSIS firmado (autofirmado) y paquete AppX reconstruidos y
**verificados extrayendo el `app.asar`** (contienen el cliente, 0 secretos);
carpeta de entrega `RESALEVAULT_RELEASE` reconstruida en el escritorio real.
Bloque anterior: **cliente online de
licencias** â€” la aplicaciÃ³n de escritorio ya **confirma el puesto y consulta
revocaciones** contra
la Edge Function, con reglas offline-first (nunca borra datos, nunca corta el
trabajo sin conexiÃ³n) y sin exponer ningÃºn secreto. 31 pruebas nuevas, 97 % de
cobertura del cliente, **65/65 comprobaciones** de interfaz y **501/501** pruebas
totales. Bloque anterior: botÃ³n obligatorio **Â«Comprar licenciaÂ» / Â«Buy licenseÂ»** que abre el Discord oficial
(canal IPC dedicado con lista blanca, 12 pruebas nuevas y **61/61 comprobaciones**
de interfaz en Electron real); **soporte macOS preparado** (objetivo `dmg`/`zip`
x64+arm64, permisos mÃ­nimos, barra nativa `hiddenInset`); **higiene de producciÃ³n
corregida** (los paquetes de prueba `smoke`/`ui-smoke`/`benchmark` ya **no viajan**
al usuario â€” verificado extrayendo el `.asar` y el `.appx`); instalador NSIS y
AppX regenerados y **carpeta de entrega `RESALEVAULT_RELEASE` creada en el
escritorio real** con documentaciÃ³n y hashes verificados. Informe completo en
[`docs/AUDITORIA.md`](AUDITORIA.md) y `RESALEVAULT_RELEASE/Documentation/`.
Bloque anterior: **distribuciÃ³n gratuita**: rutas GitHub+winget y Microsoft Store
preparadas a 0 â‚¬. Generador de manifiestos winget y **validado con
el validador oficial de Microsoft** (`winget validate` â†’ correcto); paquete
**AppX/MSIX generado e inspeccionado** (protocolo `rv-media` declarado, versiÃ³n 4
componentes, sin firmar a propÃ³sito para que lo firme la Store). GuÃ­a completa en
[`docs/DISTRIBUCION.md`](DISTRIBUCION.md).
Bloque anterior: **backend de licencias (Supabase)**: Edge Function desplegada
con control de **puestos**, **revocaciÃ³n** y consulta de revocaciones; migraciÃ³n
aplicada en el proyecto real; script de sincronizaciÃ³n con verificaciÃ³n previa
de firmas; **39 pruebas nuevas** del backend y **prueba de extremo a extremo en
vivo contra el proyecto desplegado** (firma falsificada â†’ 403, puestos agotados â†’
409, revocada â†’ 403; ver `docs/BACKEND.md`). Detalle en
[`docs/TEST-REPORT.md`](TEST-REPORT.md). Bloques anteriores: control de
versiones, firma autofirmada, avisos de terceros, ESLint, cobertura, CI, banco de
pruebas con 50.000 artÃ­culos, **aplicaciÃ³n real de los lÃ­mites de plan**,
**registro de emisiÃ³n de licencias auditable** (`npm run license:list`) y
**pantalla Â«Acerca deÂ»**.

---

## Resumen

| Fase | Estado |
|---|---|
| **1. Base tÃ©cnica** | âœ… **Completada** |
| **2. Inventario** | âœ… **Completada** (incluye fotos, documentos y CSV) |
| **3. Compras, pedidos y finanzas** | âœ… **Completada** (beneficio **neto**) |
| **4. Productividad de almacÃ©n** | âœ… **Completada** (cÃ³digos, etiquetas, preparaciÃ³n) |
| **5. Inteligencia e IA** | âœ… **Completada** (AI Studio BYOK) |
| 6. Licencias y comercializaciÃ³n | ðŸŸ¡ LÃ­mites aplicados + **backend online desplegado y probado**; falta el cliente en la app |
| 7. Business y expansiÃ³n | ðŸŸ¡ Local sÃ­; multiusuario real â›” sin backend de colaboraciÃ³n |
| 8. Lanzamiento | ðŸŸ¡ Copias âœ…; instalador NSIS **firmado (autofirmado)**; **distribuciÃ³n gratuita preparada** (winget validado + paquete Store generado, ver [`docs/DISTRIBUCION.md`](DISTRIBUCION.md)); **carpeta de entrega `RESALEVAULT_RELEASE` creada**; instalaciÃ³n local bloqueada por Device Guard |
| **Shipping Tracker** | âœ… **Completado** (navegador integrado + 46 transportistas) |
| **Calidad (ESLint, cobertura, CI, benchmark)** | âœ… **Completado** |
| **Comprar licencia (Discord)** | âœ… **Completado** (botÃ³n es/en + lista blanca + 12 pruebas + 61/61 interfaz) |
| **macOS** | â›” **Bloqueado**: configuraciÃ³n y permisos listos, pero no hay un Mac para compilar/firmar (ver `RESALEVAULT_RELEASE/Documentation/MACOS_STATUS.md`) |

---

## VerificaciÃ³n ejecutada

| Prueba | Resultado |
|---|---|
| `npm run typecheck` | **0 errores** (Node y navegador) |
| `npm test` | **509 / 509** correctas (39 archivos) |
| `npm run lint` | **0 errores, 0 avisos** (ESLint 9) |
| `npm run test:coverage` | **88,66 % lÃ­neas** Â· 86,00 % sentencias Â· 90,75 % funciones Â· 78,40 % ramas |
| `npm run smoke` | **70 / 70** comprobaciones en Electron real |
| `npm run smoke:ui` | **65 / 65** comprobaciones de interfaz en Electron real |
| `npm run build` | âœ… los tres procesos compilados |
| `npm run doctor` | âœ… `TODO CORRECTO` (Electron 44.9, Node 24.22, SQLite 3.53.4) |
| `npm run bench` | âœ… 50.000 artÃ­culos + 1.000 pedidos (ver `docs/TEST-REPORT.md`) |
| `npm run dist:signed` | âœ… instalador firmado; `Get-AuthenticodeSignature` â†’ `UnknownError` (raÃ­z no confiable) |
| `winget validate` (manifiestos v0.5.0, esquema **1.12.0**) | âœ… **Â«Manifest validation succeeded.Â»** con el validador oficial de Windows, **sin avisos** (21/10/2026) |
| `npm run dist:appx` | âœ… paquete `RESALEVAULT-Store-0.5.0.appx` generado (160,98 MB); manifiesto interior inspeccionado: identidad, versiÃ³n `0.5.0.0`, protocolo `rv-media` con `uap:Protocol`, en-US + es-ES, `runFullTrust`; **sin firmar a propÃ³sito** (lo firma la Store) |
| `npm run dist:signed` (instalador final) | âœ… `RESALEVAULT-Setup-0.5.0.exe` (117,67 MB) â€” SHA-256 `39DE1695â€¦DB7C4B51` (21/10/2026, **con el cliente online**) |
| Paquete de producciÃ³n inspeccionado | âœ… extraÃ­do el `.asar` del `.exe` **y** del `.appx`: **sin mapas de cÃ³digo**, **sin** `smoke`/`ui-smoke`/`benchmark`, **0 secretos**, y **con** el cliente online (`seats_exhausted`, `online_verified`, `license:refresh`) |
| `winget validate` (hash nuevo) | âœ… **Â«Manifest validation succeededÂ»** con el `InstallerSha256` del instalador real (21/10/2026) |
| Carpeta de entrega | âœ… `RESALEVAULT_RELEASE` creada en el escritorio real (`C:\Users\16ray\Desktop`); hashes recomputados sobre los ficheros entregados y coincidentes |
| DiagnÃ³stico del bloqueo de instalaciÃ³n | âœ… causa raÃ­z identificada con evento real `3033` (nivel de firma Enterprise); Defender sin detecciones; kit `verify-install.ps1` preparado (`docs/FIRMA.md` Â§9â€“10) |
| Arranque repetido (3 veces) | migraciones solo la primera vez |

El detalle completo, con las cifras medidas y lo que **no** se ha probado, estÃ¡
en [`docs/TEST-REPORT.md`](TEST-REPORT.md).

### QuÃ© cubren las pruebas de humo

**Datos (`npm run smoke`)** â€” dentro de Electron: migraciones, integridad, WAL,
ubicaciones jerÃ¡rquicas, SKU Ãºnico, bÃºsqueda y filtros, ediciÃ³n masiva,
archivado, **compras con reparto de costes**, **pedidos con beneficio NETO**,
devoluciones, informes, **cÃ³digos de barras y QR**, **inteligencia**,
**activaciÃ³n de licencia firmada con Ed25519** y persistencia tras cerrar y
reabrir.

**Interfaz (`npm run smoke:ui`)** â€” carga el HTML compilado, crea un artÃ­culo por
el puente IPC, navega de verdad pulsando la barra lateral, crea un pedido y
verifica que la columna de **beneficio neto** muestra el importe correcto
(`26,10 â‚¬`), cambia de idioma y de tema, y comprueba que no hay errores en la
consola del renderer.

---

## Fase 2 â€” Inventario âœ…

| Elemento | Estado |
|---|---|
| Ficha completa, SKU Ãºnico, categorÃ­as, atributos, etiquetas | âœ… |
| AlmacÃ©n â†’ EstanterÃ­a â†’ Caja â†’ Compartimento con rutas recalculadas | âœ… |
| BÃºsqueda global, 8 ordenaciones, filtros combinables, paginaciÃ³n | âœ… |
| SelecciÃ³n mÃºltiple y ediciÃ³n masiva con vista previa | âœ… |
| Archivado, restauraciÃ³n y borrado protegido | âœ… |
| Historial de cambios por artÃ­culo | âœ… |
| **FotografÃ­as y documentos** | âœ… |
| **ImportaciÃ³n CSV con vista previa y detecciÃ³n de duplicados** | âœ… |
| **ExportaciÃ³n CSV** (artÃ­culos, pedidos, compras, gastos, picking) | âœ… |
| **Anuncios por plataforma** | âœ… (registro manual; sin APIs) |

### FotografÃ­as y documentos â€” cÃ³mo funciona

- **Se comprueba el tipo REAL por firma binaria.** Un `.jpg` que sea un
  ejecutable se rechaza (hay prueba).
- Se guardan por **SHA-256**: la misma foto subida dos veces ocupa un archivo.
- **El original nunca se modifica**; la miniatura es un archivo aparte.
- Se sirven por el protocolo propio `rv-media:`, que valida cada ruta y rechaza
  cualquier intento de salir de la carpeta de datos.
- LÃ­mites: 25 MB por archivo, 30 fotos y 20 documentos por artÃ­culo.
- Se puede elegir portada, reordenar y abrir documentos con la aplicaciÃ³n del
  sistema.

---

## Fase 3 â€” Compras, pedidos y finanzas âœ…

| Elemento | Estado |
|---|---|
| Proveedores | âœ… |
| Compras con envÃ­o, otros gastos y descuento | âœ… |
| **Reparto de costes entre artÃ­culos** (proporcional / igual / ninguno) | âœ… |
| **Materializar lotes**: crear artÃ­culos desde una compra | âœ… |
| Gastos generales con categorÃ­as y periodicidad | âœ… |
| Pedidos con varios artÃ­culos, comisiones y envÃ­os | âœ… |
| **Beneficio NETO** (descuenta comisiones, envÃ­os, cargos y devoluciones) | âœ… |
| Devoluciones con reembolso y reintroducciÃ³n en inventario | âœ… |
| CancelaciÃ³n de pedidos que devuelve los artÃ­culos | âœ… |
| **Impedir vender dos veces el mismo artÃ­culo** | âœ… |
| Coste de venta **congelado** en el pedido | âœ… |
| Informes: por plataforma, mes, categorÃ­a, estado, artÃ­culo | âœ… |
| Calculadora de rentabilidad **antes de comprar** | âœ… |

### Contra el doble conteo (importante)

1. El coste de una compra **no** es un gasto general: se reparte entre los
   artÃ­culos y se escribe en ellos. El artÃ­culo es la Ãºnica fuente de su coste.
2. `expenses` es **solo** para gastos generales del negocio.
3. El envÃ­o cobrado al comprador es un **ingreso**; el envÃ­o que pagas tÃº es un
   **coste**. Son campos distintos a propÃ³sito.
4. El reparto redondea al cÃ©ntimo y **asigna el residuo a la Ãºltima lÃ­nea**, de
   modo que la suma repartida es exactamente el gasto.

---

## Fase 4 â€” Productividad de almacÃ©n âœ…

| Elemento | Estado |
|---|---|
| CÃ³digos de barras (128, 39, EAN-13, DataMatrix) y QR | âœ… |
| Etiquetas imprimibles con formato configurable | âœ… |
| Vista previa e impresiÃ³n real (hoja de estilos de impresiÃ³n) | âœ… |
| Etiquetas de artÃ­culos y de ubicaciones | âœ… |
| PreparaciÃ³n de pedidos agrupada por ubicaciÃ³n | âœ… |
| **Escaneo de comprobaciÃ³n** con lector USB (teclado) | âœ… |
| Lista de comprobaciÃ³n: recogido / empaquetado | âœ… |
| Marcar como enviado **solo con confirmaciÃ³n explÃ­cita** | âœ… |

El escaneo **no marca** un artÃ­culo si el SKU no coincide: avisa del SKU
esperado. Es justo el error que la funciÃ³n existe para evitar.

---

## Shipping Tracker âœ… (mÃ³dulo adicional)

Detalle completo en [`docs/SEGUIMIENTO.md`](SEGUIMIENTO.md).

| Elemento | Estado |
|---|---|
| Navegador integrado con `WebContentsView` (no `<webview>`) | âœ… |
| Aislamiento: sin Node, sin preload, sandbox, sesiÃ³n separada | âœ… |
| Solo HTTPS; emergentes y descargas bloqueadas; permisos denegados | âœ… |
| Directorio de **46 transportistas**, con bÃºsqueda y filtro por regiÃ³n | âœ… |
| **41 dominios verificados** con una peticiÃ³n real; 5 marcados Â«sin comprobarÂ» | âœ… |
| GestiÃ³n de cÃ³digos: alta, ediciÃ³n, copia, archivado y borrado | âœ… |
| **Track Now** abre la web oficial dentro de la app | âœ… |
| Relleno del cÃ³digo en la URL cuando el transportista lo admite | âœ… |
| Si no lo admite, se copia al portapapeles y se explica | âœ… |
| DistinciÃ³n explÃ­cita entre estado `manual` y `confirmed` | âœ… |
| Funciona sin conexiÃ³n (catÃ¡logo y cÃ³digos) | âœ… |
| Sin logotipos de terceros: distintivo propio con color estable | âœ… |
| Sin APIs de transportista ni seguimiento automÃ¡tico | â¬œ no implementado (deliberado) |

---

## Fase 5 â€” Inteligencia e IA âœ…

### Intelligence âœ…

12 reglas **locales** (sin IA, sin conexiÃ³n, sin coste): stock estancado, margen
bajo, margen negativo, datos incompletos, sin anuncios, pendientes de preparar,
pedidos sin enviar, concentraciÃ³n de capital, tasa de devoluciones, gastos en
aumento, sin ventas recientes e inventario vacÃ­o.

- Cada alerta declara los **datos exactos** en los que se basa.
- Se pueden descartar 7 dÃ­as, para siempre, o ajustar los umbrales.
- No se presenta ninguna correlaciÃ³n como causa ni se promete beneficio.

### AI Studio âœ… (BYOK)

| Elemento | Estado |
|---|---|
| Conexiones con Gemini, OpenAI y Anthropic | âœ… |
| Clave cifrada con el almacÃ©n del sistema (`safeStorage`/DPAPI) | âœ… |
| La clave nunca se devuelve, ni se registra, ni entra en un error | âœ… |
| Prueba de conexiÃ³n real: consulta la lista de modelos del proveedor | âœ… |
| Modelos **consultados al proveedor** (no listas obsoletas) | âœ… |
| URL base configurable (proxy propio / endpoint regional) | âœ… |
| Ruta por tarea (un modelo distinto para cada tarea) | âœ… |
| 8 tareas: tÃ­tulo, descripciÃ³n, traducciÃ³n, clasificaciÃ³n, atributos, palabras clave, revisiÃ³n y sugerencia de precio | âœ… |
| ImÃ¡genes para anÃ¡lisis (hasta 4, con validaciÃ³n de tipo y tamaÃ±o) | âœ… |
| Registro de uso: proveedor, modelo, tokens y **coste estimado** | âœ… |
| Precio por millÃ³n de tokens **configurable por el usuario** | âœ… |
| EstimaciÃ³n de coste de flujos multi-IA + confirmaciÃ³n obligatoria | âœ… |
| LÃ­mite mensual de llamadas segÃºn el plan | âœ… |

**Aviso de honestidad:** la integraciÃ³n sigue la documentaciÃ³n oficial de cada
proveedor y su construcciÃ³n de peticiones estÃ¡ cubierta por pruebas (cabeceras,
forma del cuerpo, mapeo de errores y cÃ¡lculo de coste). **No se ha podido
verificar contra el servicio real**, porque eso exige una clave de API. Por eso:

- No hay ninguna lista de modelos escrita a mano que pueda caducar.
- Los errores se muestran con su cÃ³digo (`invalid_key`, `rate_limited`...).
- La pantalla no simula ninguna respuesta: sin conexiÃ³n, se explica cÃ³mo
  configurarla.

Tareas que **no** se hacen: generar imÃ¡genes, falsear el estado de un producto o
inventar precios de mercado. Las sugerencias de precio se razonan con el coste y
el margen del usuario, y se etiquetan como estimaciÃ³n.

---

## Fase 6 â€” Licencias ðŸŸ¡

| Elemento | Estado |
|---|---|
| Tres planes con lÃ­mites centralizados (`shared/plans.ts`) | âœ… |
| **LÃ­mites aplicados en el proceso principal** (no solo en la interfaz) | âœ… *nuevo* |
| Firma Ed25519: la app solo lleva la clave **pÃºblica** | âœ… |
| Herramienta administrativa con la clave **privada** (fuera del paquete) | âœ… |
| ActivaciÃ³n, desactivaciÃ³n, historial de eventos | âœ… |
| Identificador de dispositivo estable | âœ… |
| Cuotas de fundadores 200 / 200 definidas | âœ… |
| Registro de emisiÃ³n de licencias (auditorÃ­a + reverificaciÃ³n) | âœ… *nuevo* (`npm run license:list`) |
| **Backend online en Supabase** (puestos, revocaciÃ³n, `/health`) | âœ… *nuevo* **desplegado y probado en vivo** (20/10/2026) |
| **Cliente online en la aplicaciÃ³n** (activa puesto, consulta revocaciones) | âœ… *nuevo* (31 pruebas nuevas) |
| Pasarela de pagos | â¬œ no implementada (sin presupuesto) |

### Backend online desplegado (20/10/2026)

- **Proveedor: Supabase Free** (elegido por el propietario del proyecto),
  proyecto `ugfefewrikcghfwqhezi`, coste **0 â‚¬**.
- **Edge Function `licence`** con las rutas `/activate`, `/deactivate`,
  `/revocations` y `/health`; las tablas `licenses` y `license_activations`
  tienen RLS **sin polÃ­ticas**: solo el `service_role` las toca.
- **La clave privada Ed25519 no estÃ¡ en el servidor**: la emisiÃ³n sigue siendo
  local (`npm run license:new`) y la subida del registro (`npm run license:sync`)
  verifica cada firma **antes** de subirla.
- **Prueba en vivo realizada**: firma falsificada â†’ `403 bad_signature`; dos
  activaciones ok â†’ tercera `409 seats_exhausted`; liberar un puesto â†’ ok;
  revocar â†’ `403 revoked` y `/revocations` devuelve el hash. Tabla completa en
  [`docs/TEST-REPORT.md`](TEST-REPORT.md) y [`docs/BACKEND.md`](BACKEND.md).
- **Offline-first**: el token se valida sin red; el servidor se consulta como
  mucho cada 7 dÃ­as. Si Supabase pausa el proyecto por inactividad (~1 semana),
  las licencias existentes **siguen funcionando**.

### Cliente online de la aplicaciÃ³n (21/10/2026)

El cliente de escritorio **ya se conecta** al backend, con estas reglas:

- **Offline primero, sin excepciones**: la firma Ed25519 se verifica siempre en
  local. El backend sirve para controlar **puestos** y **revocaciones**, no para
  conceder el plan. Si el servidor cae, una licencia ya activada **conserva su
  plan** y la app sigue funcionando.
- **Nunca borra datos**: un rechazo del servidor solo cambia el estado de la
  licencia (y, en una revocaciÃ³n, los lÃ­mites del plan). Inventario, pedidos y
  fotos quedan intactos. Hay una prueba dedicada que lo comprueba.
- **ComprobaciÃ³n perezosa**: se refresca como mucho cada 7 dÃ­as
  (`ONLINE_RECHECK_DAYS`). Las revocaciones se piden solo desde el Ãºltimo cursor
  (`/revocations?since=â€¦`) y se guardan sus **hashes** en una cachÃ© local
  (`license_revocations`), de modo que una revocaciÃ³n surte efecto aunque el
  equipo estÃ© sin conexiÃ³n al consultar.
- **Sin secretos**: la app envÃ­a la clave **publishable** de Supabase como
  `Bearer` (pÃºblica por diseÃ±o, limitada por RLS). La clave `sb_secret_` **nunca**
  sale del servidor. Verificado sobre el paquete compilado: 0 apariciones.
- **Un solo canal IPC dedicado** (`license:refresh`), botÃ³n Â«Comprobar ahoraÂ» en
  la pantalla de Licencias y estado visible (verificada / sin conexiÃ³n /
  rechazada), traducido a espaÃ±ol e inglÃ©s.
- **Nuevas piezas**: `src/main/services/licence-online.ts`,
  `src/shared/licence-backend.ts`, migraciÃ³n `005-license-online.ts`,
  `tests/licence-online.test.ts` (31 pruebas, 97 % de cobertura del cliente).

MigraciÃ³n 005 (aditiva, no destructiva): `licenses.online_state`,
`licenses.online_error`, `licenses.revocation_cursor` y la tabla
`license_revocations`.

Aviso honesto: el cliente respeta lo que diga el servidor, pero **la instalaciÃ³n
real en una mÃ¡quina limpia sigue bloqueada** por este equipo (nivel de firma
Enterprise), y **la publicaciÃ³n en GitHub/Store sigue pendiente** de las cuentas
del propietario. Nada de eso se puede afirmar como hecho.

### LÃ­mites realmente aplicados (correcciÃ³n importante)

Antes de este bloque, los planes existÃ­an pero **casi ningÃºn lÃ­mite se
comprobaba** en el proceso principal. Ahora se aplican en
`src/main/ipc/register.ts` y `register-modules.ts`:

| LÃ­mite | Canal protegido |
|---|---|
| Cuota de artÃ­culos | `products:create` |
| Cuota de archivos | `media:import` |
| ImportaciÃ³n CSV | `csv:import` |
| EdiciÃ³n masiva | `products:bulkUpdate` / `bulkPreview` |
| AnalÃ­tica | `finance:report` |
| Inteligencia | `intelligence:report` |
| AI Studio + cuota mensual | `ai:generate` |

En la interfaz, `PlanGate` explica la funciÃ³n bloqueada con un enlace a
Licencias, en lugar de mostrar una pantalla rota.

GeneraciÃ³n de licencias:

```powershell
npm run license:keygen                       # solo la primera vez
npm run license:new -- --plan pro --kind founder --holder "Nombre"
npm run license:verify -- --code <codigo>
npm run license:list                         # registro de emision + reverificacion
```

**No se han generado las 400 licencias fundadoras.** El registro de emisiÃ³n que
lo bloqueaba ya estÃ¡ implementado (`tools/keys/issued-licenses.jsonl`, privado y
excluido de Git); ahora el bloqueo es comercial: se emiten una a una cuando haya
clientes reales. Detalles en [`docs/LICENCIAS.md`](LICENCIAS.md).

---

## Fases 7 y 8

| Elemento | Estado |
|---|---|
| Icono propio (`build/icon.png`, monograma RV) | âœ… |
| **Copias de seguridad** (ZIP, verificaciÃ³n, rotaciÃ³n, restauraciÃ³n en dos fases) | âœ… |
| Instalador NSIS generado | âœ… `RESALEVAULT-Setup-0.5.0.exe` |
| **Firma de cÃ³digo** (certificado autofirmado, 0 â‚¬) | âœ… **firmado y verificado** |
| **Avisos de terceros** incluidos en el paquete (`resources/`) | âœ… |
| InstalaciÃ³n probada en este equipo | âŒ bloqueada por polÃ­tica de nivel de **firma Enterprise** (evento CI `3033`; diagnÃ³stico en `docs/FIRMA.md` Â§9); kit de verificaciÃ³n en mÃ¡quina limpia listo (Â§10) |
| Organizaciones, usuarios, permisos, sincronizaciÃ³n | â¬œ local pendiente; online â›” sin backend de colaboraciÃ³n |

### Sobre la firma y el bloqueo (importante antes de distribuir)

El instalador **se genera y se firma**. La verificaciÃ³n real:

```
Get-AuthenticodeSignature release\RESALEVAULT-Setup-0.5.0.exe
  Status:        UnknownError
  StatusMessage: A certificate chain processed, but terminated in a root
                 certificate which is not trusted by the trust provider.
```

Es decir: **la firma es criptogrÃ¡ficamente vÃ¡lida, pero la raÃ­z no es de
confianza pÃºblica**, porque el certificado es autofirmado. Eso es exactamente lo
esperado. Un certificado autofirmado **no** elimina SmartScreen ni el bloqueo de
Device Guard.

En este equipo, Windows bloquea la ejecuciÃ³n del instalador con una **polÃ­tica
de nivel de firma Enterprise** en modo impuesto (eventos `3033` de Code
Integrity que citan el nombre del instalador; no es Smart App Control ni
Defender: ambos comprobados y descartados). **La instalaciÃ³n de extremo a
extremo no se ha podido verificar aquÃ­ y no se afirma lo contrario.** Lo que sÃ­
estÃ¡ verificado es el contenido: `release\win-unpacked\RESALEVAULT.exe`
arranca, migra la base de datos y crea la copia automÃ¡tica. Para cerrar el
pendiente hay un **kit de verificaciÃ³n en mÃ¡quina limpia** de 0 â‚¬
(`scripts/verify-install.ps1`, instrucciones en `docs/FIRMA.md` Â§10). **Defender
no tiene ninguna detecciÃ³n** del proyecto (comprobado 20/10/2026).

Procedimiento completo, generaciÃ³n del certificado y verificaciÃ³n de hashes en
[`docs/FIRMA.md`](FIRMA.md). Para distribuciÃ³n pÃºblica hace falta un
certificado OV/IV de una CA (150â€“300 â‚¬/aÃ±o). **No se ha comprado ninguno.**

---

## Lo que el programa NO hace (y no afirma hacer)

- **No se conecta a Vinted ni a ningÃºn marketplace.** Los anuncios se registran
  a mano. No hay sincronizaciÃ³n automÃ¡tica.
- **Los estados de seguimiento son manuales.** Abrir la web de un transportista
  no confirma nada y no se presenta como si lo hiciera.
- **AI Studio no se ha verificado contra los proveedores reales** (requiere una
  clave). Las peticiones estÃ¡n probadas; la respuesta real, no.
- **No se envÃ­a informaciÃ³n del negocio a ningÃºn servidor** salvo cuando el
  usuario lanza explÃ­citamente una tarea de IA, y en ese caso solo van los datos
  del artÃ­culo y el prompt. Para las licencias existe ya un backend en Supabase
  (solo recibe el cÃ³digo de licencia y el identificador de dispositivo, nunca
  inventario ni pedidos) y **el cliente de la app estÃ¡ conectado a Ã©l**
  (comprobaciÃ³n de puesto y revocaciones; la firma se verifica siempre en local).
- **No cambia precios ni anuncios automÃ¡ticamente.**
- **No hay modo multiusuario.** El esquema lo prepara y el plan Business declara
  `multiUser`/`sync`, pero **la funciÃ³n no existe**: el backend desplegado es
  **solo de licencias** y no ofrece colaboraciÃ³n ni sincronizaciÃ³n de datos.
- **No hay actualizaciÃ³n automÃ¡tica.** No hay servidor de actualizaciones y no se
  simula uno. El proceso manual estÃ¡ en `docs/MANUAL-USUARIO.md`.
- **No genera PDF ni XLSX todavÃ­a.** La exportaciÃ³n es CSV.
- **No hace devoluciones parciales por lÃ­nea**, ni multi-divisa, ni tipos de
  cambio automÃ¡ticos.
- **No envÃ­a correos.** RequerirÃ­a un servicio de pago.
- **No hay integraciÃ³n con marketplaces.** No hay API autorizada y **no se hace
  scraping**.
- **No promete seguridad absoluta** ni inmunidad frente a la piraterÃ­a.
- **Los informes por categorÃ­a solo publican el resultado directo de la
  mercancÃ­a.** Las comisiones y envÃ­os no se reparten por categorÃ­a porque serÃ­a
  un reparto inventado.

---

## Deuda tÃ©cnica conocida

| Punto | Impacto | Plan |
|---|---|---|
| `node:sqlite` es experimental en Node | Bajo: aislado en `database.ts` | Vigilar |
| Paquete del renderer ~1,07 MB | Bajo en escritorio | DivisiÃ³n de cÃ³digo si crece |
| Paquetes de `node_modules` en el asar (`zod`, `bwip-js`) | Bajo | Empaquetar si molesta |
| RotaciÃ³n de inventario se calcula sobre el capital actual | Bajo (documentado en la UI) | HistÃ³rico de capital |
| BÃºsqueda por texto es un barrido lineal (~70 ms a 50.000) | Bajo, medido | Ãndice FTS5 si se superan 100.000 |
| Informe financiero ~180 ms con 1.000 pedidos | Bajo | Cachear agregados si crece |
| Sin firma de confianza pÃºblica | **Alto en distribuciÃ³n** | Certificado OV/IV |
| Sin actualizaciÃ³n automÃ¡tica | Medio | Feed propio o proceso manual documentado |
| `multiUser`/`sync` declarados pero sin implementar | Medio (puede confundir) | Implementar o quitar del plan |

Los puntos ya resueltos (ESLint, selector de Pedidos, firma) se han movido a la
secciÃ³n de verificaciÃ³n.

---

## Costes externos

| Concepto | Importe estimado | Momento |
|---|---|---|
| Desarrollo y uso local | **0 â‚¬** | ya |
| Git, ESLint, cobertura, CI (GitHub Actions), electron-builder | **0 â‚¬** | ya |
| Certificado de firma **autofirmado** de desarrollo | **0 â‚¬** | ya |
| Certificado de firma **de confianza pÃºblica** (OV/IV) | 150â€“300 â‚¬/aÃ±o | antes de distribuir |
| Backend de licencias (Supabase Free) | **0 â‚¬** (verificado 20/10/2026) | desplegado; revisar DPA antes de vender |
| APIs de IA | **a cargo del cliente** (BYOK) | ya |
| Pasarela de pago | comisiÃ³n por transacciÃ³n | Fase 6 |

### Gasto real hasta la fecha: **0 â‚¬**

No se ha comprado ningÃºn certificado, ni contratado ningÃºn servidor, dominio,
API, almacenamiento, correo ni suscripciÃ³n. No se ha introducido ninguna tarjeta
bancaria. No se ha iniciado ninguna prueba gratuita.

### Lo que **no** se puede prometer gratis para siempre

| Servicio | SituaciÃ³n hoy | Riesgo |
|---|---|---|
| GitHub Actions | Plan gratuito para repositorios pÃºblicos o con minutos incluidos | Los minutos pueden agotarse |
| Supabase Free | 0 â‚¬ hoy: 500 MB de base de datos, 5 GB de trÃ¡fico, 500.000 invocaciones/mes | **Pausa el proyecto tras ~1 semana de inactividad** (reactivable gratis); las cuotas y condiciones pueden cambiar |
| APIs de IA | **Siempre** a cargo del usuario | Es BYOK por diseÃ±o |

Ninguna de estas dependencias es necesaria para usar el programa: si desaparecen,
el inventario, los pedidos y las copias siguen funcionando.
