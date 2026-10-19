# RESALEVAULT — Estado del proyecto

Documento de transparencia: qué funciona **de verdad** (verificado ejecutándolo),
qué falta y qué costes implicará. No se marca nada como terminado sin pruebas.

Última actualización: **20/10/2026** — Bloque A (release gratuito): control de
versiones, firma autofirmada, avisos de terceros, ESLint, cobertura, CI,
benchmark con 50.000 artículos y **aplicación real de los límites de plan**.

---

## Resumen

| Fase | Estado |
|---|---|
| **1. Base técnica** | ✅ **Completada** |
| **2. Inventario** | ✅ **Completada** (incluye fotos, documentos y CSV) |
| **3. Compras, pedidos y finanzas** | ✅ **Completada** (beneficio **neto**) |
| **4. Productividad de almacén** | ✅ **Completada** (códigos, etiquetas, preparación) |
| **5. Inteligencia e IA** | ✅ **Completada** (AI Studio BYOK) |
| 6. Licencias y comercialización | 🟡 Límites **aplicados**; backend online pendiente |
| 7. Business y expansión | 🟡 Local sí; multiusuario real ⛔ sin backend |
| 8. Lanzamiento | 🟡 Copias ✅, instalador **firmado (autofirmado)**; instalación bloqueada por Device Guard |
| **Shipping Tracker** | ✅ **Completado** (navegador integrado + 46 transportistas) |
| **Calidad (ESLint, cobertura, CI, benchmark)** | ✅ **Completado** |

---

## Verificación ejecutada

| Prueba | Resultado |
|---|---|
| `npm run typecheck` | **0 errores** (Node y navegador) |
| `npm test` | **287 / 287** correctas (21 archivos) |
| `npm run test:coverage` | **71,2 %** líneas · 68,19 % sentencias · 72,29 % funciones · 58,38 % ramas |
| `npm run lint` | **0 errores, 0 avisos** (ESLint 9) |
| `npm run smoke` | **70 / 70** comprobaciones en Electron real |
| `npm run smoke:ui` | **54 / 54** comprobaciones de interfaz en Electron real |
| `npm run build` | ✅ los tres procesos compilados |
| `npm run doctor` | ✅ `TODO CORRECTO` (Electron 44.9, Node 24.22, SQLite 3.53.4) |
| `npm run bench` | ✅ 50.000 artículos + 1.000 pedidos (ver `docs/TEST-REPORT.md`) |
| `npm run dist:signed` | ✅ instalador firmado; `Get-AuthenticodeSignature` → `UnknownError` (raíz no confiable) |
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
| Registro de emisión de licencias | ⬜ **prerequisito antes de emitir en serie** |
| Backend online (revocación, control de dispositivos, pagos) | ⬜ no desplegado |

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
```

**No se han generado las 400 licencias fundadoras.** Se emiten una a una cuando
haya clientes reales, exista registro de emisión y el proceso esté probado.
Detalles en [`docs/LICENCIAS.md`](LICENCIAS.md).

---

## Fases 7 y 8

| Elemento | Estado |
|---|---|
| Icono propio (`build/icon.png`, monograma RV) | ✅ |
| **Copias de seguridad** (ZIP, verificación, rotación, restauración en dos fases) | ✅ |
| Instalador NSIS generado | ✅ `RESALEVAULT-Setup-0.5.0.exe` |
| **Firma de código** (certificado autofirmado, 0 €) | ✅ **firmado y verificado** |
| **Avisos de terceros** incluidos en el paquete (`resources/`) | ✅ |
| Instalación probada en este equipo | ❌ **bloqueada por Device Guard** |
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

En este equipo, Windows sigue bloqueando la ejecución del instalador por la
política de la organización (`Device Guard`). **La instalación de extremo a
extremo no se ha podido verificar y no se afirma lo contrario.** Lo que sí está
verificado es el contenido: `release\win-unpacked\RESALEVAULT.exe` arranca,
migra la base de datos y crea la copia automática.

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
  del artículo y el prompt.
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
| Sin registro de emisión de licencias | **Alto antes de vender** | Implementarlo |
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
| Backend de licencias | 0 € al principio; 5–25 €/mes con volumen | Fase 6 |
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
| Cloudflare Workers + D1 / Supabase | Plan gratuito con cuotas | Pueden cambiar o dejar de bastar |
| APIs de IA | **Siempre** a cargo del usuario | Es BYOK por diseño |

Ninguna de estas dependencias es necesaria para usar el programa: si desaparecen,
el inventario, los pedidos y las copias siguen funcionando.
