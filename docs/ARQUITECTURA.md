# RESALEVAULT â€” Arquitectura

Documento de decisiones tÃ©cnicas. Cada decisiÃ³n incluye el motivo, porque en un
proyecto mantenible el "por quÃ©" vale mÃ¡s que el "quÃ©".

---

## 1. ElecciÃ³n de tecnologÃ­a

| Pieza | ElecciÃ³n | Motivo |
|---|---|---|
| Contenedor | **Electron 44** | AplicaciÃ³n de escritorio Windows con actualizaciones y un Ãºnico proceso de interfaz maduro. |
| Lenguaje | **TypeScript 5.9** (`strict`) | Los errores de tipo son los mÃ¡s baratos de corregir. |
| Interfaz | **React 19** + Vite 7 | Ecosistema conocido, recarga en caliente, sin framework pesado. |
| Empaquetado | **electron-vite 6** | Compila main, preload y renderer con una sola configuraciÃ³n. |
| Base de datos | **`node:sqlite`** (SQLite 3.53) | Ver siguiente apartado. |
| Pruebas | **Vitest 4** | RÃ¡pido, misma configuraciÃ³n de rutas que el cÃ³digo. |
| ValidaciÃ³n | **zod 4** | ValidaciÃ³n en la frontera IPC con tipos derivados. |

### Por quÃ© `node:sqlite` y no `better-sqlite3`

El entorno de destino no tiene **ni Python ni Visual Studio Build Tools**.
`better-sqlite3` es un mÃ³dulo nativo que exige recompilarse para el ABI de
Electron; sin compilador, la instalaciÃ³n falla.

`node:sqlite` viene incluido en Node 24, que es el Node que incorpora Electron
44. Se comprobÃ³ antes de escribir cÃ³digo con `npm run doctor`:

```
electron                   : 44.9.0
node (electron)            : 24.22.0
node:sqlite                : disponible (DatabaseSync)
sqlite version             : 3.53.4
sqlite escritura en disco  : ...\doctor.sqlite (filas=1)
```

Consecuencias positivas:

1. **Cero dependencias nativas.** `npm install` no compila nada.
2. **El mismo cÃ³digo en producciÃ³n y en pruebas.** La capa de datos no importa
   `electron`, asÃ­ que las pruebas corren en Node puro en milisegundos.
3. SQLite completo: WAL, claves forÃ¡neas, transacciones, CTE recursivas.

El precio: al ser un mÃ³dulo experimental de Node, su API podrÃ­a cambiar. Por eso
**todo** el acceso pasa por `src/main/db/database.ts`, un Ãºnico archivo de ~200
lÃ­neas. Si algÃºn dÃ­a hace falta cambiar de controlador, se sustituye ahÃ­.

---

## 2. SeparaciÃ³n de responsabilidades

```
main/       Node: datos, archivos, licencias, IA, servicios online
preload/    Puente: 158 canales concretos. Sin lÃ³gica de negocio.
renderer/   React: presentaciÃ³n. Sin acceso a Node ni al sistema.
shared/     Tipos, esquemas y utilidades puras (sin Node, sin DOM)
```

Regla que se cumple en todo el cÃ³digo: **`shared/` no importa nada de Node ni
del DOM**, de modo que se puede compilar tanto para el proceso principal como
para el navegador. Los tipos de dominio y los esquemas zod viven ahÃ­.

---

## 3. Frontera IPC

### No hay `invoke` genÃ©rico

El preload expone un objeto con mÃ©todos nombrados:

```ts
window.resalevault.products.create({ name: 'Camiseta' })
```

El renderer **no** puede hacer `invoke('cualquier-canal')`. Cada mÃ©todo estÃ¡
atado a un canal, y cada canal tiene su esquema zod en el proceso principal.
Si el renderer estuviera comprometido, el conjunto de operaciones posibles sigue
siendo exactamente el declarado.

### Los errores son cÃ³digos, no textos

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload }
type AppErrorPayload = { code: ErrorCode; params?: Record<string, string | number> }
```

Motivos:

1. `ipcRenderer.invoke` pierde la estructura de una excepciÃ³n al serializarla.
2. El mensaje debe traducirse: el renderer recibe `sku_duplicate` y lo convierte
   en Â«Ya existe un artÃ­culo con este SKUÂ» en el idioma activo.
3. Los detalles internos (rutas, SQL) se quedan en el registro local, nunca
   llegan a la interfaz.

### Control de origen

Cada manejador comprueba que la llamada viene del `webContents` de la ventana
principal. Comparar el `id` es mÃ¡s robusto que comparar URLs, que cambian entre
desarrollo y producciÃ³n.

---

## 4. Base de datos

### Convenciones

| Aspecto | DecisiÃ³n | Motivo |
|---|---|---|
| Dinero | `INTEGER` en **cÃ©ntimos** | `0.1 + 0.2 !== 0.3`. En contabilidad eso es un error. |
| Identificadores | UUID v4 en `TEXT` | Permite fusionar bases o sincronizar sin colisiones. |
| Fechas | `TEXT` ISO-8601 UTC | Ordenables lexicogrÃ¡ficamente, legibles. |
| Estados | Tabla `product_statuses` | El enunciado los pide configurables; una tabla lo permite sin migrar cÃ³digo. |
| Unicidad de SKU | Ãndice `UNIQUE` con `COLLATE NOCASE` | La unicidad se garantiza en la base de datos, no solo en la interfaz. |
| Integridad | `PRAGMA foreign_keys = ON` | Las claves forÃ¡neas declaradas se cumplen de verdad. |

### Migraciones versionadas

- Cada migraciÃ³n tiene versiÃ³n entera, nombre y funciÃ³n `up`.
- Se aplican **en orden y dentro de una transacciÃ³n**: si una falla, la base de
  datos queda exactamente como estaba (hay una prueba que lo verifica).
- Se registran en `schema_migrations` (versiÃ³n, nombre, fecha) y se sincroniza
  `PRAGMA user_version`.
- Si la base de datos tiene una versiÃ³n **superior** a la que conoce el
  programa, se aborta el arranque en lugar de degradar el esquema.
- Nunca se modifica una migraciÃ³n ya publicada: se aÃ±ade una nueva.

### Transacciones anidadas

`Database.transaction()` usa `BEGIN IMMEDIATE` en el nivel externo y
`SAVEPOINT` en los anidados. AsÃ­ un repositorio puede llamar a otro sin romper
la atomicidad ni provocar Â«cannot start a transaction within a transactionÂ».

### Reglas de negocio en la capa de datos

- No se elimina una categorÃ­a con subcategorÃ­as ni con artÃ­culos: se devuelve
  `cannot_delete_has_children` o `cannot_delete_in_use` con el recuento.
- No se elimina una ubicaciÃ³n con contenido, por el mismo motivo.
- Eliminar un artÃ­culo exige **archivarlo antes**. Es una salvaguarda deliberada
  contra pÃ©rdidas accidentales; el error `conflict` lo explica.
- Archivar guarda el estado anterior en el historial, y restaurar lo recupera.
- El filtro por categorÃ­a o por almacÃ©n **incluye los descendientes**: filtrar
  por Â«RopaÂ» trae tambiÃ©n Â«CamisetasÂ».

---

## 5. GeneraciÃ³n de SKU

PatrÃ³n configurable con tokens: `{PREFIX}`, `{CAT}`, `{YYYY}`, `{YY}`, `{MM}`,
`{DD}`, `{SEQ}` y `{SEQ:4}` (relleno con ceros).

- Por defecto: `RV-CAM-2603-0001` (categorÃ­a, aÃ±o-mes, secuencia).
- La unicidad se comprueba contra la base de datos y se resuelve **incrementando
  la secuencia**, no adivinando. El contador vive en la tabla `counters`.
- Si el patrÃ³n guardado dejara de ser vÃ¡lido, se usa el patrÃ³n por defecto en
  lugar de generar SKU repetidos.
- El usuario puede escribir su propio SKU; se normaliza a mayÃºsculas y se
  comprueba su disponibilidad.

---

## 6. Seguridad de Electron

| Medida | Estado |
|---|---|
| `contextIsolation` | activado |
| `nodeIntegration` (y en worker y en subframes) | desactivado |
| `sandbox` | activado |
| `webSecurity`, `allowRunningInsecureContent: false` | activado |
| API IPC restringida | 158 canales concretos, con esquema zod cada uno |
| ValidaciÃ³n de entrada | en el proceso principal, no en la interfaz |
| Control del emisor | solo el `webContents` de la ventana principal |
| CSP | cabecera HTTP **y** `<meta>` inyectada al compilar |
| Ventanas nuevas | denegadas; `https` se abre en el navegador del sistema |
| NavegaciÃ³n externa | bloqueada |
| `<webview>` | bloqueado |
| Permisos del navegador | denegados por defecto |
| Secretos en el ejecutable | ninguno |
| Registro sin secretos | redacciÃ³n automÃ¡tica de claves y tokens |
| SQL parametrizado | 100 %; nunca se concatena texto del usuario |

### CSP en producciÃ³n

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: rv-media:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```

`frame-ancestors` se aÃ±ade **solo** por cabecera: en una etiqueta `<meta>` el
navegador la ignora y avisa por consola.

---

## 7. Estructura de la interfaz

- **Estado global mÃ­nimo**: un contexto con la informaciÃ³n del entorno, los
  ajustes, el traductor y los formateadores. Nada de librerÃ­as de estado: no
  hacen falta y son una dependencia mÃ¡s que mantener.
- **Recarga de datos**: un contador `dataVersion` que se incrementa cuando el
  proceso principal emite el evento `dataChanged`. Cualquier pantalla que
  dependa de Ã©l se vuelve a consultar sola.
- **Enrutado propio** con historial (sin dependencia de router).
- **Traducciones tipadas**: el diccionario inglÃ©s se tipa a partir del espaÃ±ol,
  asÃ­ que olvidar una traducciÃ³n es un error de compilaciÃ³n. Hay una prueba que
  comprueba ademÃ¡s la paridad en ambos sentidos.
- **Estados vacÃ­os explÃ­citos**: cuando no hay datos se explica quÃ© hacer; nunca
  se rellenan con cifras falsas.

### Identidad visual

Negro carbÃ³n, blanco roto y verde Ã¡cido (`#C8FF3D`), con estÃ©tica industrial de
almacÃ©n: titulares contundentes en mayÃºsculas, SKU y rutas de ubicaciÃ³n en
tipografÃ­a monoespaciada, y tablas de alta legibilidad. Modo oscuro por defecto
y modo claro opcional, ambos con los mismos tokens de color.

---

## 8. Estrategia de pruebas

| Nivel | Herramienta | QuÃ© cubre |
|---|---|---|
| Unidad / integraciÃ³n | Vitest (509 pruebas, ~2 s) | FÃ³rmulas, SKU, transacciones, migraciones, repositorios, validaciÃ³n zod, traducciones |
| Humo de datos | Electron real (43 comprobaciones) | Migraciones, CRUD, filtros, ediciÃ³n masiva, panel, archivado y **persistencia tras cerrar y reabrir** |
| Humo de interfaz | Electron real (24 comprobaciones) | Carga el HTML compilado, crea datos por el puente, navega, cambia idioma y tema, y verifica que no hay errores en consola |

Las pruebas de humo usan **carpetas temporales**: nunca tocan el inventario real.

---

## 9. PreparaciÃ³n para el futuro

Decisiones tomadas ahora para no rehacer nada despuÃ©s:

- **Organizaciones y usuarios** existen en el esquema desde la migraciÃ³n 001 y
  **se usan de verdad**: cada entrada de historial y de actividad apunta al
  usuario que la provocÃ³. Cuando llegue el modo Business, los datos ya estÃ¡n
  atribuidos.
- Las **plataformas de venta son datos**, no cÃ³digo: el usuario aÃ±ade las suyas.
- Los **estados de producto son configurables** mediante tabla.
- **Los anuncios multicanal** ya tienen tabla con una restricciÃ³n `UNIQUE`
  `(platform_id, external_id)` que impide registrar dos veces el mismo anuncio
  externo: es la base para evitar ventas duplicadas al importar.
- La capa de datos **no importa Electron**, requisito para reutilizarla en un
  backend de sincronizaciÃ³n.
- `product_media` ya contempla hash SHA-256, que permitirÃ¡ deduplicar archivos.
