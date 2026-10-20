# RESALEVAULT — Informe de pruebas

Todas las cifras de este documento se han **ejecutado en este equipo**. No son
estimaciones ni promesas. Cada bloque indica el comando exacto que las produce.

Fecha de la última ejecución: 2026-10-19/20.
Versión: `0.5.0`.

---

## 1. Resumen

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ 0 errores (2 proyectos: `tsconfig.node.json` y `tsconfig.web.json`) |
| `npm test` | ✅ 35 archivos, **446 pruebas** en verde |
| `npm run test:coverage` | ✅ 446 pruebas + cobertura medida (apartado 3) |
| `npm run smoke` | ✅ **70 comprobaciones** correctas, 0 fallidas |
| `npm run smoke:ui` | ✅ **54 comprobaciones** correctas, 0 fallidas |
| `npm run build` | ✅ proceso principal, preload y renderer generados |
| `npm run doctor` | ✅ `TODO CORRECTO` (Electron 44.9, Node 24.22, SQLite 3.53.4) |
| `npm run lint` | ✅ **0 errores, 0 avisos** (ESLint 9, flat config) |
| `npm run bench` | ✅ banco de pruebas con 50.000 artículos (apartado 4) |

**Ninguna prueba se ha desactivado ni desactivado para conseguir estos
resultados.**

---

## 2. Qué comprueba cada suite

### 2.1 `npm test` — pruebas unitarias y de integración (446)

Cubren la lógica de negocio sobre una base de datos real (no un doble):

- Cálculo de comisiones, descuentos, reembolsos y cancelaciones (céntimos
  enteros, sin flotantes).
- SKU con dígito de control EAN-13, colisiones y escape SQL.
- Fórmulas de coste, días en stock y alicuotas (mayoría / minoría / mixto).
- Reserva y reposición de stock al crear o cancelar pedidos.
- Bloqueo de duplicados: mismo artículo no puede venderse dos veces; misma
  devolución no puede repetirse.
- Métodos de pago y cuadre de caja (con y sin escudos).
- Reglas de inteligencia (12 reglas) y sus avisos.
- Estados de licencia, planes, límites y eventos.
- **Backend de licencias (43 pruebas)**: verificación de firmas y códigos
  (pruebas de alteración, vectores SHA-256, límites de plan/tipo/versión), las
  reglas de la Edge Function (puestos, caducidad, revocación, mapeo de errores
  HTTP) y una guarda impide que las constantes duplicadas de
  `supabase/functions/licence/keys.ts` se desvíen de las de la aplicación.
- **Aplicación real de los límites de plan** (6 pruebas dedicadas): cuota de
  artículos, cuota de archivos, funciones bloqueadas del plan Free, y que
  archivar libera cuota sin borrar filas. Incluye una activación **real**
  firmada con Ed25519 contra la clave pública incrustada.
- Conversión de unidades sin pérdida de precisión.
- Migraciones, generación de informes y claves foráneas.

### 2.2 `npm run smoke` — humo de datos (70)

Arranca una base de datos temporal, aplica **todas** las migraciones y ejecuta
flujos completos reales: crear producto → comprar → vender → devolver →
cancelar → comprobar stock → importar CSV → exportar → crear y verificar
copia → restaurar → recalcular panel.

### 2.3 `npm run smoke:ui` — humo de interfaz (54)

Lanza **Electron real** (no jsdom) con una carpeta de usuario temporal y
navega por la aplicación con DOM nativo:

- Abrir cada pantalla del menú y comprobar el título.
- Crear producto con formulario real y validaciones.
- Abrir el navegador de transportistas (`WebContentsView` real) contra
  seur.com, comprobar la barra y cerrarlo.
- Comprobar que los códigos de seguimiento persisten tras reiniciar.
- Cerrar la aplicación correctamente.

> Nota conocida y cosmética: al final, el borrado del directorio temporal a
> veces devuelve `EPERM` porque Windows aún tiene un fichero abierto. **No
> afecta al resultado**: las 54 comprobaciones ya se han ejecutado.

---

## 3. Cobertura de código

`npm run test:coverage` (proveedor v8, sobre `src/shared`, `src/main/db`,
`src/main/services`, `src/main/errors.ts` y `supabase/functions/**` — excluyendo
el adaptador de Deno `index.ts` y las constantes `keys.ts`):

| Métrica | Valor | Umbral configurado |
|---|---|---|
| Líneas | **88,32 %** | 50 % |
| Sentencias | **85,72 %** | 50 % |
| Funciones | **90,77 %** | 50 % |
| Ramas | **77,92 %** | 40 % |

Los umbrales son **bajos a propósito**: se prefiere un número honesto que subir
con pruebas de valor, no rellenar porcentajes con tests triviales. Se excluyen
del cálculo los servicios de sistema (rutas, ventana, navegador) y las pantallas
React: el valor de la interfaz está en el humo de interfaz real, no en un
porcentaje de líneas.

---

## 4. Rendimiento con 50.000 artículos

`npm run bench` — base de datos real en disco, **misma capa de datos que la
aplicación**, temporizador `performance.now()`.

Entorno: Windows, Node 24.22 (la capa de datos no depende de Electron, así que
el banco es repetible en CI).

### Datos sembrados

- **50.000 artículos** (categorías, marcas, costes, estados variados)
- **1.000 pedidos** con línea, comisión y gastos de envío
- Base de datos: **20 MB**

### Resultados

| Operación | Tiempo |
|---|---|
| Abrir base nueva + migrar | **24,1 ms** |
| `PRAGMA integrity_check` (50.000 filas) | 253 ms |
| Página 1 del inventario (50) | **25,6 ms** |
| Página 500 (OFFSET alto) | 54,8 ms |
| Búsqueda por texto completo | **70,0 ms** |
| Búsqueda por SKU | 68,7 ms |
| Filtrar por categoría (con descendientes) | 33,6 ms |
| Filtrar por estado + ordenar por coste | 31,0 ms |
| Filtrar por antigüedad (≥90 días) | 40,8 ms |
| Agregado de capital (aggregate) | 12,4 ms |
| Crear 100 artículos (SKU + historial + actividad) | 52,6 ms |
| Editar 100 artículos | 31,7 ms |
| Edición masiva de 100 artículos | 4,9 ms |
| Archivar 100 artículos | 5,3 ms |
| Panel de resumen | 152,8 ms |
| Informe financiero completo | 180,9 ms |
| Inteligencia (12 reglas) | 160,8 ms |
| Exportar 50.000 artículos a CSV (10 MB) | 457,2 ms |
| Crear copia de seguridad ZIP (20 MB) | 1.248,7 ms |
| Verificar copia (CRC + integrity_check) | 618,7 ms |
| Preparar restauración (validar + extraer) | 806,5 ms |
| Memoria residente (RSS) tras todo lo anterior | **298 MB** |

### Lectura honesta

- **Inventario: correcto.** Todo lo que hace el usuario mientras navega está
  por debajo de 100 ms a 50.000 artículos. La paginación de 50 se mantiene.
- **Informe financiero (181 ms) y panel (153 ms): aceptables**, pero se notan.
  Son consultas agregadas sobre todo el histórico; solo se ejecutan al abrir la
  pantalla o cambiar filtros.
- **Búsqueda por texto: es un barrido lineal** (`LIKE '%…%'`) y por eso cuesta
  ~70 ms. Es así a propósito: una búsqueda que contiene necesita leer todas las
  filas. Con 50.000 artículos sigue siendo imperceptible para una persona. Si
  alguna vez se llegara al límite de Pro (20.000), es un valor sobrado.
- **Página 500 (55 ms) frente a página 1 (26 ms):** es el coste de `OFFSET`.
  No se corrige porque la navegación real de un usuario no salta 500 páginas
  hacia atrás; optimizar eso obligaría a cursor por clave y complicaría las
  consultas sin beneficio.
- **Copia de seguridad (1,25 s)** incluye `VACUUM INTO` + ZIP. Es correcto
  para 20 MB; con bases mucho mayores el usuario lo notará.

**No se han añadido índices nuevos**: las mediciones no justifican ninguno.
Se re-evalúa si se superan los 100.000 artículos.

---

## 5. Prueba en vivo del backend de licencias (Supabase)

Ejecutada el **20/10/2026** contra el proyecto real desplegado
(`ugfefewrikcghfwqhezi.supabase.co/functions/v1/licence`), con una licencia
emitida y sincronizada de verdad. Todas las filas son salidas reales:

| Acción | Resultado HTTP | Cuerpo |
|---|---|---|
| `GET /health` | 200 | `{"ok":true,"version":1}` |
| Activar código con firma alterada | 403 | `{"ok":false,"reason":"bad_signature"}` |
| Activar máquina A | 200 | `{"ok":true,"seatsUsed":1,...}` |
| Activar máquina B | 200 | `{"ok":true,"seatsUsed":2,...}` |
| Activar máquina C (puestos llenos) | 409 | `{"ok":false,"reason":"seats_exhausted"}` |
| Desactivar máquina A | 200 | `{"ok":true,"removed":true}` |
| Activar máquina C (puesto liberado) | 200 | `{"ok":true,"seatsUsed":2,...}` |
| Revocar licencia en la DB (service_role) | 200 | fila con `status=revoked` |
| Activar con licencia revocada | 403 | `{"ok":false,"reason":"revoked"}` |
| `GET /revocations?since=…` | 200 | `{"codes":["6285e77f…"]}` |
| `npm run license:sync` (4 licencias) | — | *Registro verificado: 4… Subidas/actualizadas: 4* |

La prueba de revocación se hizo con la clave de servicio **desde el equipo del
emisor** (el cliente de la app no está conectado todavía): se alteró el estado
en la tabla y se comprobó que la Edge Function la rechaza. El detalle está en
[`docs/BACKEND.md`](BACKEND.md).

---

## 6. Pruebas de aceptación del producto

| Criterio | Estado | Evidencia |
|---|---|---|
| La aplicación compila | ✅ | `npm run build` |
| Arranca correctamente | ✅ | `npm run doctor` + humo de interfaz |
| Funciones Free sin conexión | ✅ | todas las suites corren sin red |
| Los datos persisten tras reiniciar | ✅ | humo de interfaz reinicia y relee |
| Pro/Business solo con permiso | ✅ | `LicenseService.assertFeature` en proceso principal + `PlanGate` en interfaz; 6 pruebas dedicadas a los límites |
| Licencia válida funciona | ✅ | `tests/license.test.ts` |
| Licencia manipulada se rechaza | ✅ | firma Ed25519, test de alteración |
| Copias se pueden restauran | ✅ | 8 pruebas + humo de datos |
| Las migraciones no destruyen datos | ✅ | humo aplica 000→004 sobre datos reales |
| Importes financieros correctos | ✅ | céntimos enteros, tests de redondeo |
| Ventas/devoluciones mantienen stock | ✅ | tests de reserva y reemplazo |
| Integraciones no inventan datos | ✅ | sin scraping; estados solo manuales o confirmados |
| Navegador integrado aislado | ✅ | WebContentsView sin preload, solo https, sin Node |
| Errores de red no bloquean inventario | ✅ | el módulo funciona sin backend |
| Instalador contiene lo necesario | ⚠️ | generado y verificado internamente; **la instalación real está bloqueada por Device Guard** |
| `THIRD-PARTY-NOTICES.md` incluido | ✅ | generado por `npm run notices`; se empaqueta en `resources/` y se comprueba que la copia del paquete es **idéntica** a la del repositorio |
| Generador de avisos determinista | ✅ | dos ejecuciones separadas producen el mismo archivo (se eliminó la marca de tiempo que rompía la comprobación de CI) |
| Firma verificada | ⚠️ | firmado con autofirmado; `Status: UnknownError` (raíz no confiable) — ver `docs/FIRMA.md` |
| Advertencias de Windows documentadas | ✅ | `docs/FIRMA.md` |
| No se ha gastado dinero | ✅ | **0 €** |

---

## 7. Lo que NO se ha probado (y por qué)

| Pendiente | Motivo real |
|---|---|
| Instalación en un Windows limpio | Este equipo bloquea el instalador por **Device Guard** (política de la organización). No hay otra máquina disponible. **No se afirma que la instalación esté probada.** |
| Activación de licencias *online* **desde la aplicación** | El backend está desplegado y probado en vivo por HTTP (apartado 5), pero **el cliente de la app aún no lo llama**: falta el bloque de integración. |
| API de DHL u otros transportistas | Requieren registro de desarrollador (cuenta y aprobación). Sin credenciales, no se puede probar. |
| Conectores de marketplaces | Ninguna plataforma ha autorizado el acceso. Solo existe la arquitectura abstracta, **sin integración real**. |
| Sincronización multiusuario | El backend de licencias **no** sirve para sincronizar datos. No existe un backend multiusuario. |
| Pruebas de accesibilidad con lector de pantalla | No hay herramienta de lectores de pantalla instalada. La navegación por teclado y los contrastes no se han certificado. |
