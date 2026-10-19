# RESALEVAULT — Arquitectura

Documento de decisiones técnicas. Cada decisión incluye el motivo, porque en un
proyecto mantenible el "por qué" vale más que el "qué".

---

## 1. Elección de tecnología

| Pieza | Elección | Motivo |
|---|---|---|
| Contenedor | **Electron 44** | Aplicación de escritorio Windows con actualizaciones y un único proceso de interfaz maduro. |
| Lenguaje | **TypeScript 5.9** (`strict`) | Los errores de tipo son los más baratos de corregir. |
| Interfaz | **React 19** + Vite 7 | Ecosistema conocido, recarga en caliente, sin framework pesado. |
| Empaquetado | **electron-vite 6** | Compila main, preload y renderer con una sola configuración. |
| Base de datos | **`node:sqlite`** (SQLite 3.53) | Ver siguiente apartado. |
| Pruebas | **Vitest 4** | Rápido, misma configuración de rutas que el código. |
| Validación | **zod 4** | Validación en la frontera IPC con tipos derivados. |

### Por qué `node:sqlite` y no `better-sqlite3`

El entorno de destino no tiene **ni Python ni Visual Studio Build Tools**.
`better-sqlite3` es un módulo nativo que exige recompilarse para el ABI de
Electron; sin compilador, la instalación falla.

`node:sqlite` viene incluido en Node 24, que es el Node que incorpora Electron
44. Se comprobó antes de escribir código con `npm run doctor`:

```
electron                   : 44.9.0
node (electron)            : 24.22.0
node:sqlite                : disponible (DatabaseSync)
sqlite version             : 3.53.4
sqlite escritura en disco  : ...\doctor.sqlite (filas=1)
```

Consecuencias positivas:

1. **Cero dependencias nativas.** `npm install` no compila nada.
2. **El mismo código en producción y en pruebas.** La capa de datos no importa
   `electron`, así que las pruebas corren en Node puro en milisegundos.
3. SQLite completo: WAL, claves foráneas, transacciones, CTE recursivas.

El precio: al ser un módulo experimental de Node, su API podría cambiar. Por eso
**todo** el acceso pasa por `src/main/db/database.ts`, un único archivo de ~200
líneas. Si algún día hace falta cambiar de controlador, se sustituye ahí.

---

## 2. Separación de responsabilidades

```
main/       Node: datos, archivos, licencias, IA, servicios online
preload/    Puente: 151 canales concretos. Sin lógica de negocio.
renderer/   React: presentación. Sin acceso a Node ni al sistema.
shared/     Tipos, esquemas y utilidades puras (sin Node, sin DOM)
```

Regla que se cumple en todo el código: **`shared/` no importa nada de Node ni
del DOM**, de modo que se puede compilar tanto para el proceso principal como
para el navegador. Los tipos de dominio y los esquemas zod viven ahí.

---

## 3. Frontera IPC

### No hay `invoke` genérico

El preload expone un objeto con métodos nombrados:

```ts
window.resalevault.products.create({ name: 'Camiseta' })
```

El renderer **no** puede hacer `invoke('cualquier-canal')`. Cada método está
atado a un canal, y cada canal tiene su esquema zod en el proceso principal.
Si el renderer estuviera comprometido, el conjunto de operaciones posibles sigue
siendo exactamente el declarado.

### Los errores son códigos, no textos

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload }
type AppErrorPayload = { code: ErrorCode; params?: Record<string, string | number> }
```

Motivos:

1. `ipcRenderer.invoke` pierde la estructura de una excepción al serializarla.
2. El mensaje debe traducirse: el renderer recibe `sku_duplicate` y lo convierte
   en «Ya existe un artículo con este SKU» en el idioma activo.
3. Los detalles internos (rutas, SQL) se quedan en el registro local, nunca
   llegan a la interfaz.

### Control de origen

Cada manejador comprueba que la llamada viene del `webContents` de la ventana
principal. Comparar el `id` es más robusto que comparar URLs, que cambian entre
desarrollo y producción.

---

## 4. Base de datos

### Convenciones

| Aspecto | Decisión | Motivo |
|---|---|---|
| Dinero | `INTEGER` en **céntimos** | `0.1 + 0.2 !== 0.3`. En contabilidad eso es un error. |
| Identificadores | UUID v4 en `TEXT` | Permite fusionar bases o sincronizar sin colisiones. |
| Fechas | `TEXT` ISO-8601 UTC | Ordenables lexicográficamente, legibles. |
| Estados | Tabla `product_statuses` | El enunciado los pide configurables; una tabla lo permite sin migrar código. |
| Unicidad de SKU | Índice `UNIQUE` con `COLLATE NOCASE` | La unicidad se garantiza en la base de datos, no solo en la interfaz. |
| Integridad | `PRAGMA foreign_keys = ON` | Las claves foráneas declaradas se cumplen de verdad. |

### Migraciones versionadas

- Cada migración tiene versión entera, nombre y función `up`.
- Se aplican **en orden y dentro de una transacción**: si una falla, la base de
  datos queda exactamente como estaba (hay una prueba que lo verifica).
- Se registran en `schema_migrations` (versión, nombre, fecha) y se sincroniza
  `PRAGMA user_version`.
- Si la base de datos tiene una versión **superior** a la que conoce el
  programa, se aborta el arranque en lugar de degradar el esquema.
- Nunca se modifica una migración ya publicada: se añade una nueva.

### Transacciones anidadas

`Database.transaction()` usa `BEGIN IMMEDIATE` en el nivel externo y
`SAVEPOINT` en los anidados. Así un repositorio puede llamar a otro sin romper
la atomicidad ni provocar «cannot start a transaction within a transaction».

### Reglas de negocio en la capa de datos

- No se elimina una categoría con subcategorías ni con artículos: se devuelve
  `cannot_delete_has_children` o `cannot_delete_in_use` con el recuento.
- No se elimina una ubicación con contenido, por el mismo motivo.
- Eliminar un artículo exige **archivarlo antes**. Es una salvaguarda deliberada
  contra pérdidas accidentales; el error `conflict` lo explica.
- Archivar guarda el estado anterior en el historial, y restaurar lo recupera.
- El filtro por categoría o por almacén **incluye los descendientes**: filtrar
  por «Ropa» trae también «Camisetas».

---

## 5. Generación de SKU

Patrón configurable con tokens: `{PREFIX}`, `{CAT}`, `{YYYY}`, `{YY}`, `{MM}`,
`{DD}`, `{SEQ}` y `{SEQ:4}` (relleno con ceros).

- Por defecto: `RV-CAM-2603-0001` (categoría, año-mes, secuencia).
- La unicidad se comprueba contra la base de datos y se resuelve **incrementando
  la secuencia**, no adivinando. El contador vive en la tabla `counters`.
- Si el patrón guardado dejara de ser válido, se usa el patrón por defecto en
  lugar de generar SKU repetidos.
- El usuario puede escribir su propio SKU; se normaliza a mayúsculas y se
  comprueba su disponibilidad.

---

## 6. Seguridad de Electron

| Medida | Estado |
|---|---|
| `contextIsolation` | activado |
| `nodeIntegration` (y en worker y en subframes) | desactivado |
| `sandbox` | activado |
| `webSecurity`, `allowRunningInsecureContent: false` | activado |
| API IPC restringida | 151 canales concretos, con esquema zod cada uno |
| Validación de entrada | en el proceso principal, no en la interfaz |
| Control del emisor | solo el `webContents` de la ventana principal |
| CSP | cabecera HTTP **y** `<meta>` inyectada al compilar |
| Ventanas nuevas | denegadas; `https` se abre en el navegador del sistema |
| Navegación externa | bloqueada |
| `<webview>` | bloqueado |
| Permisos del navegador | denegados por defecto |
| Secretos en el ejecutable | ninguno |
| Registro sin secretos | redacción automática de claves y tokens |
| SQL parametrizado | 100 %; nunca se concatena texto del usuario |

### CSP en producción

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: rv-media:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```

`frame-ancestors` se añade **solo** por cabecera: en una etiqueta `<meta>` el
navegador la ignora y avisa por consola.

---

## 7. Estructura de la interfaz

- **Estado global mínimo**: un contexto con la información del entorno, los
  ajustes, el traductor y los formateadores. Nada de librerías de estado: no
  hacen falta y son una dependencia más que mantener.
- **Recarga de datos**: un contador `dataVersion` que se incrementa cuando el
  proceso principal emite el evento `dataChanged`. Cualquier pantalla que
  dependa de él se vuelve a consultar sola.
- **Enrutado propio** con historial (sin dependencia de router).
- **Traducciones tipadas**: el diccionario inglés se tipa a partir del español,
  así que olvidar una traducción es un error de compilación. Hay una prueba que
  comprueba además la paridad en ambos sentidos.
- **Estados vacíos explícitos**: cuando no hay datos se explica qué hacer; nunca
  se rellenan con cifras falsas.

### Identidad visual

Negro carbón, blanco roto y verde ácido (`#C8FF3D`), con estética industrial de
almacén: titulares contundentes en mayúsculas, SKU y rutas de ubicación en
tipografía monoespaciada, y tablas de alta legibilidad. Modo oscuro por defecto
y modo claro opcional, ambos con los mismos tokens de color.

---

## 8. Estrategia de pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unidad / integración | Vitest (355 pruebas, ~2 s) | Fórmulas, SKU, transacciones, migraciones, repositorios, validación zod, traducciones |
| Humo de datos | Electron real (43 comprobaciones) | Migraciones, CRUD, filtros, edición masiva, panel, archivado y **persistencia tras cerrar y reabrir** |
| Humo de interfaz | Electron real (24 comprobaciones) | Carga el HTML compilado, crea datos por el puente, navega, cambia idioma y tema, y verifica que no hay errores en consola |

Las pruebas de humo usan **carpetas temporales**: nunca tocan el inventario real.

---

## 9. Preparación para el futuro

Decisiones tomadas ahora para no rehacer nada después:

- **Organizaciones y usuarios** existen en el esquema desde la migración 001 y
  **se usan de verdad**: cada entrada de historial y de actividad apunta al
  usuario que la provocó. Cuando llegue el modo Business, los datos ya están
  atribuidos.
- Las **plataformas de venta son datos**, no código: el usuario añade las suyas.
- Los **estados de producto son configurables** mediante tabla.
- **Los anuncios multicanal** ya tienen tabla con una restricción `UNIQUE`
  `(platform_id, external_id)` que impide registrar dos veces el mismo anuncio
  externo: es la base para evitar ventas duplicadas al importar.
- La capa de datos **no importa Electron**, requisito para reutilizarla en un
  backend de sincronización.
- `product_media` ya contempla hash SHA-256, que permitirá deduplicar archivos.
