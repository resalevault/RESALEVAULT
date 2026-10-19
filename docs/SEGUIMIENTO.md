# RESALEVAULT — Shipping Tracker

Módulo de seguimiento de envíos con navegador integrado.

---

## 1. Qué hace y qué no

| Hace | No hace |
|---|---|
| Guarda códigos de seguimiento en SQLite (funciona sin conexión) | No consulta APIs de transportistas |
| Abre la web oficial del transportista **dentro de la app** | No abre Chrome, Edge ni el navegador del sistema |
| Rellena el código en la URL cuando el transportista lo admite | No rellena formularios por DOM ni rompe CAPTCHAs |
| Copia el código al portapapeles cuando no hay plantilla | No hace seguimiento automático en segundo plano |
| Distingue estado manual de confirmado | No inventa estados ni fechas de entrega |
| Directorio de 46 transportistas, editable | No usa logotipos de terceros |

**Sin conexión** funcionan: el directorio, el alta, la edición, el archivado, el
borrado y los filtros. Solo la carga de la web del transportista necesita red.

---

## 2. El navegador integrado

Se usa **`WebContentsView`**, la API actual de Electron. **No** se usa
`<webview>`: el propio proyecto de Electron lo desaconseja por inestabilidad y
problemas de seguridad.

```
┌───────────────────────────────────────────────┐
│  Barra de título propia            (38 px)    │  React
├────────────┬──────────────────────────────────┤
│            │  Barra del navegador   (44 px)   │  React
│ Navegación ├──────────────────────────────────┤
│  lateral   │                                   │
│            │   WebContentsView (vista nativa)  │  contenido externo
│  (232 px)  │   aislada, sin preload            │
└────────────┴──────────────────────────────────┘
```

Las tres medidas viven en `src/shared/layout.ts` **y** en las variables CSS. Hay
una prueba que compara ambas para que no se desincronicen (si se desfasan, la
vista taparía la barra o dejaría un hueco).

### Aislamiento

| Medida | Valor |
|---|---|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| `preload` | **ninguno**: la página externa no recibe ningún puente |
| Partición de sesión | `persist:carrier-browser` (cookies separadas de la app) |
| Protocolos permitidos | **solo `https:`** |
| `will-navigate` / `will-redirect` | bloquea cualquier cosa que no sea https |
| Ventanas emergentes | denegadas + aviso con opción de abrirla en la misma vista |
| Descargas | bloqueadas + aviso |
| Permisos (cámara, micro, geo, portapapeles) | denegados |
| Certificados TLS | validación **por defecto**, no se relaja |
| DevTools | desactivado |

Una página externa **no puede** ejecutar acciones de RESALEVAULT: no conoce
`window.resalevault` y vive en otro proceso de renderizado.

---

## 3. Directorio de transportistas

46 operadores en `src/shared/carriers-seed.ts`, sembrados en la base de datos de
forma idempotente al arrancar (`INSERT OR IGNORE`): añadir uno nuevo no requiere
migración y **no pisa** las correcciones del usuario.

### Cómo se rellena el código

Cada transportista declara una estrategia:

- **`url`** — la plantilla lleva `{code}` y el código se sustituye codificado.
  El usuario no pega nada.
- **`copy`** — se abre su buscador oficial y el código se copia al portapapeles.

Solo se usa `url` cuando el patrón es público y estable. **No se inventaron
parámetros.** Ejemplos con `url`: DHL, UPS, FedEx, DPD, Colissimo, Evri, PostNL,
Amazon Logistics, USPS, Aramex, Packeta, Cainiao. El resto usa `copy`.

### Verificación de URLs

Los dominios se comprobaron con una petición HTTPS real:

- **41 de 46 respondieron.**
- Sin respuesta o bloqueados por anti-bot: `envialia`, `chronopost`,
  `mondial-relay`, `postnord`, `canada-post`. Se mantienen en el directorio pero
  marcados como **«Sin comprobar»** en la interfaz.

Ese campo (`verified`) describe solo si el dominio respondió: **no** demuestra
que la página acepte el código por URL. Por eso la estrategia `copy` es la
predeterminada cuando no consta.

### Logotipos

No se incluyen. Son marcas registradas y no hay autorización de uso; además las
imágenes remotas se rompen. Se genera un **distintivo propio** con las iniciales
y un color estable derivado del identificador: el mismo transportista siempre
tiene el mismo color, sin listas que mantener.

### Corregir una URL

El catálogo está en la base de datos y es editable: **Transportistas → lápiz**.
Si un operador cambia su buscador, se corrige ahí sin esperar una actualización
del programa.

---

## 4. Estados: la distinción importante

| Situación | `status_source` | Qué significa |
|---|---|---|
| Se abrió la web del transportista | `none` | Solo se abrió. **No** hay información real |
| El usuario escribió el estado | `manual` | Es un dato del usuario, no del transportista |
| Una API autorizada lo confirmó | `confirmed` | **Reservado**: hoy no hay ninguna API integrada |

En la lista aparece una etiqueta pequeña junto al estado con esa procedencia. Es
deliberado: abrir una página y poner «entregado» no es lo mismo que saberlo.

`tracking_events` existe y está vacía. Se rellenará solo si algún día hay una
integración autorizada.

---

## 5. Modelo de datos

```sql
carriers (id, name, region, country, track_url, url_template, strategy,
          verified, integration, notes, enabled, is_custom, sort_order, ...)

trackcodes (id, code, carrier_id, name, order_ref, order_id,
            purchase_date, expected_date, status, status_source,
            last_opened_at, last_checked_at, notes, archived_at, ...)
-- índice UNIQUE parcial (code, carrier_id) WHERE archived_at IS NULL

tracking_events (id, trackcode_id, at, occurred_at, description,
                 location, status_code, source)
```

Decisiones:

- El índice único parcial **impide duplicar el mismo envío** (mismo código y
  transportista) entre los activos. Archivar libera el código, de modo que se
  puede volver a añadir. Restaurar un archivado cuya versión activa existe se
  rechaza con un error explícito.
- `order_id` permite enlazar un seguimiento con un pedido de RESALEVAULT
  (`ON DELETE SET NULL`: borrar el pedido no borra el seguimiento).

---

## 6. Limitaciones conocidas

| Limitación | Motivo |
|---|---|
| No hay estados automáticos | Requiere API oficial con credenciales. Solo DHL la ofrece gratis (250 llamadas/día) |
| Sitios que bloquean navegadores embebidos | Algunos detectan Electron y muestran captcha o bloquean. Se muestra el error con reintento |
| Sin consultas en segundo plano | Sondeo constante puede infringir condiciones de uso y disparar bloqueos |
| Sin sincronización entre equipos | Fase 7 |
| La ventana emergente se abre en la misma vista | Es la opción controlada: nunca se abre sola |

### Si algún día se integra una API

Orden recomendado: DHL (gratuita, requiere registrar una app) → agregador
(17TRACK/AfterShip, de pago) para el resto. Solo entonces se rellenarían
`tracking_events` y `status_source = 'confirmed'`.

---

## 7. Pruebas

| Suite | Qué cubre |
|---|---|
| `tests/tracking.test.ts` (27) | URLs, validación https, catálogo, duplicados, archivado/restauración, filtros, ordenación, estados, coherencia de maquetación |
| `npm run smoke:ui` | Abre el módulo, cuenta las tarjetas, rellena el formulario real, crea el código, resuelve la URL, **abre el navegador nativo**, comprueba que navega, que la barra aparece y que al cerrar los códigos siguen ahí |
| `npm run smoke` | Migración, siembra del catálogo y persistencia |

La prueba de interfaz **no** afirma que la web cargue correctamente: comprueba
que la vista se crea y navega. Si no hay red, la vista muestra el error previsto.
