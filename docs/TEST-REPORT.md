# RESALEVAULT â€” Informe de pruebas

Todas las cifras de este documento se han **ejecutado en este equipo**. No son
estimaciones ni promesas. Cada bloque indica el comando exacto que las produce.

Fecha de la Ãºltima ejecuciÃ³n: 2026-10-21.
VersiÃ³n: `0.5.0`.

---

## 1. Resumen

| Comando | Resultado |
|---|---|
| `npm run typecheck` | âœ… 0 errores (2 proyectos: `tsconfig.node.json` y `tsconfig.web.json`) |
| `npm test` | âœ… 39 archivos, **509 pruebas** en verde |
| `npm run test:coverage` | âœ… 509 pruebas + cobertura medida (apartado 3) |
| `npm run smoke` | âœ… **70 comprobaciones** correctas, 0 fallidas (**66** en un clon limpio: 4 dependen de la clave privada, no versionada) |
| `npm run smoke:ui` | âœ… **65 comprobaciones** correctas, 0 fallidas |
| `npm run build` | âœ… proceso principal, preload y renderer generados |
| `npm run doctor` | âœ… `TODO CORRECTO` (Electron 44.9, Node 24.22, SQLite 3.53.4) |
| `npm run lint` | âœ… **0 errores, 0 avisos** (ESLint 9, flat config) |
| `npm run bench` | âœ… banco de pruebas con 50.000 artÃ­culos (apartado 4) |

**Ninguna prueba se ha desactivado ni desactivado para conseguir estos
resultados.**

---

## 2. QuÃ© comprueba cada suite

### 2.1 `npm test` â€” pruebas unitarias y de integraciÃ³n (509)

Cubren la lÃ³gica de negocio sobre una base de datos real (no un doble):

- CÃ¡lculo de comisiones, descuentos, reembolsos y cancelaciones (cÃ©ntimos
  enteros, sin flotantes).
- SKU con dÃ­gito de control EAN-13, colisiones y escape SQL.
- FÃ³rmulas de coste, dÃ­as en stock y alicuotas (mayorÃ­a / minorÃ­a / mixto).
- Reserva y reposiciÃ³n de stock al crear o cancelar pedidos.
- Bloqueo de duplicados: mismo artÃ­culo no puede venderse dos veces; misma
  devoluciÃ³n no puede repetirse.
- MÃ©todos de pago y cuadre de caja (con y sin escudos).
- Reglas de inteligencia (12 reglas) y sus avisos.
- Estados de licencia, planes, lÃ­mites y eventos.
- **Backend de licencias (39 pruebas)**: verificaciÃ³n de firmas y cÃ³digos
  (pruebas de alteraciÃ³n, vectores SHA-256, lÃ­mites de plan/tipo/versiÃ³n), las
  reglas de la Edge Function (puestos, caducidad, revocaciÃ³n, mapeo de errores
  HTTP) y una guarda impide que las constantes duplicadas de
  `supabase/functions/licence/keys.ts` se desvÃ­en de las de la aplicaciÃ³n.
- **AplicaciÃ³n real de los lÃ­mites de plan** (6 pruebas dedicadas): cuota de
  artÃ­culos, cuota de archivos, funciones bloqueadas del plan Free, y que
  archivar libera cuota sin borrar filas. Incluye una activaciÃ³n **real**
  firmada con Ed25519 contra la clave pÃºblica incrustada.
- ConversiÃ³n de unidades sin pÃ©rdida de precisiÃ³n.
- Migraciones, generaciÃ³n de informes y claves forÃ¡neas.

### 2.2 `npm run smoke` â€” humo de datos (70)

Arranca una base de datos temporal, aplica **todas** las migraciones y ejecuta
flujos completos reales: crear producto â†’ comprar â†’ vender â†’ devolver â†’
cancelar â†’ comprobar stock â†’ importar CSV â†’ exportar â†’ crear y verificar
copia â†’ restaurar â†’ recalcular panel.

### 2.3 `npm run smoke:ui` â€” humo de interfaz (65)

Lanza **Electron real** (no jsdom) con una carpeta de usuario temporal y
navega por la aplicaciÃ³n con DOM nativo:

- Abrir cada pantalla del menÃº y comprobar el tÃ­tulo.
- Crear producto con formulario real y validaciones.
- Abrir el navegador de transportistas (`WebContentsView` real) contra
  seur.com, comprobar la barra y cerrarlo.
- Comprobar que los cÃ³digos de seguimiento persisten tras reiniciar.
- Cerrar la aplicaciÃ³n correctamente.

> Nota conocida y cosmÃ©tica: al final, el borrado del directorio temporal a
> veces devuelve `EPERM` porque Windows aÃºn tiene un fichero abierto. **No
> afecta al resultado**: las 65 comprobaciones ya se han ejecutado.

---

## 3. Cobertura de cÃ³digo

`npm run test:coverage` (proveedor v8, sobre `src/shared`, `src/main/db`,
`src/main/services`, `src/main/errors.ts` y `supabase/functions/**` â€” excluyendo
el adaptador de Deno `index.ts` y las constantes `keys.ts`):

| MÃ©trica | Valor | Umbral configurado |
|---|---|---|
| LÃ­neas | **88,66 %** | 50 % |
| Sentencias | **86,00 %** | 50 % |
| Funciones | **90,75 %** | 50 % |
| Ramas | **78,40 %** | 40 % |

Los umbrales son **bajos a propÃ³sito**: se prefiere un nÃºmero honesto que subir
con pruebas de valor, no rellenar porcentajes con tests triviales. Se excluyen
del cÃ¡lculo los servicios de sistema (rutas, ventana, navegador) y las pantallas
React: el valor de la interfaz estÃ¡ en el humo de interfaz real, no en un
porcentaje de lÃ­neas.

---

## 4. Rendimiento con 50.000 artÃ­culos

`npm run bench` â€” base de datos real en disco, **misma capa de datos que la
aplicaciÃ³n**, temporizador `performance.now()`.

Entorno: Windows, Node 24.22 (la capa de datos no depende de Electron, asÃ­ que
el banco es repetible en CI).

### Datos sembrados

- **50.000 artÃ­culos** (categorÃ­as, marcas, costes, estados variados)
- **1.000 pedidos** con lÃ­nea, comisiÃ³n y gastos de envÃ­o
- Base de datos: **20 MB**

### Resultados

| OperaciÃ³n | Tiempo |
|---|---|
| Abrir base nueva + migrar | **24,1 ms** |
| `PRAGMA integrity_check` (50.000 filas) | 253 ms |
| PÃ¡gina 1 del inventario (50) | **25,6 ms** |
| PÃ¡gina 500 (OFFSET alto) | 54,8 ms |
| BÃºsqueda por texto completo | **70,0 ms** |
| BÃºsqueda por SKU | 68,7 ms |
| Filtrar por categorÃ­a (con descendientes) | 33,6 ms |
| Filtrar por estado + ordenar por coste | 31,0 ms |
| Filtrar por antigÃ¼edad (â‰¥90 dÃ­as) | 40,8 ms |
| Agregado de capital (aggregate) | 12,4 ms |
| Crear 100 artÃ­culos (SKU + historial + actividad) | 52,6 ms |
| Editar 100 artÃ­culos | 31,7 ms |
| EdiciÃ³n masiva de 100 artÃ­culos | 4,9 ms |
| Archivar 100 artÃ­culos | 5,3 ms |
| Panel de resumen | 152,8 ms |
| Informe financiero completo | 180,9 ms |
| Inteligencia (12 reglas) | 160,8 ms |
| Exportar 50.000 artÃ­culos a CSV (10 MB) | 457,2 ms |
| Crear copia de seguridad ZIP (20 MB) | 1.248,7 ms |
| Verificar copia (CRC + integrity_check) | 618,7 ms |
| Preparar restauraciÃ³n (validar + extraer) | 806,5 ms |
| Memoria residente (RSS) tras todo lo anterior | **298 MB** |

### Lectura honesta

- **Inventario: correcto.** Todo lo que hace el usuario mientras navega estÃ¡
  por debajo de 100 ms a 50.000 artÃ­culos. La paginaciÃ³n de 50 se mantiene.
- **Informe financiero (181 ms) y panel (153 ms): aceptables**, pero se notan.
  Son consultas agregadas sobre todo el histÃ³rico; solo se ejecutan al abrir la
  pantalla o cambiar filtros.
- **BÃºsqueda por texto: es un barrido lineal** (`LIKE '%â€¦%'`) y por eso cuesta
  ~70 ms. Es asÃ­ a propÃ³sito: una bÃºsqueda que contiene necesita leer todas las
  filas. Con 50.000 artÃ­culos sigue siendo imperceptible para una persona. Si
  alguna vez se llegara al lÃ­mite de Pro (20.000), es un valor sobrado.
- **PÃ¡gina 500 (55 ms) frente a pÃ¡gina 1 (26 ms):** es el coste de `OFFSET`.
  No se corrige porque la navegaciÃ³n real de un usuario no salta 500 pÃ¡ginas
  hacia atrÃ¡s; optimizar eso obligarÃ­a a cursor por clave y complicarÃ­a las
  consultas sin beneficio.
- **Copia de seguridad (1,25 s)** incluye `VACUUM INTO` + ZIP. Es correcto
  para 20 MB; con bases mucho mayores el usuario lo notarÃ¡.

**No se han aÃ±adido Ã­ndices nuevos**: las mediciones no justifican ninguno.
Se re-evalÃºa si se superan los 100.000 artÃ­culos.

---

## 5. Prueba en vivo del backend de licencias (Supabase)

Ejecutada el **20/10/2026** contra el proyecto real desplegado
(`ugfefewrikcghfwqhezi.supabase.co/functions/v1/licence`), con una licencia
emitida y sincronizada de verdad. Todas las filas son salidas reales:

| AcciÃ³n | Resultado HTTP | Cuerpo |
|---|---|---|
| `GET /health` | 200 | `{"ok":true,"version":1}` |
| Activar cÃ³digo con firma alterada | 403 | `{"ok":false,"reason":"bad_signature"}` |
| Activar mÃ¡quina A | 200 | `{"ok":true,"seatsUsed":1,...}` |
| Activar mÃ¡quina B | 200 | `{"ok":true,"seatsUsed":2,...}` |
| Activar mÃ¡quina C (puestos llenos) | 409 | `{"ok":false,"reason":"seats_exhausted"}` |
| Desactivar mÃ¡quina A | 200 | `{"ok":true,"removed":true}` |
| Activar mÃ¡quina C (puesto liberado) | 200 | `{"ok":true,"seatsUsed":2,...}` |
| Revocar licencia en la DB (service_role) | 200 | fila con `status=revoked` |
| Activar con licencia revocada | 403 | `{"ok":false,"reason":"revoked"}` |
| `GET /revocations?since=â€¦` | 200 | `{"codes":["6285e77fâ€¦"]}` |
| `npm run license:sync` (4 licencias) | â€” | *Registro verificado: 4â€¦ Subidas/actualizadas: 4* |

La prueba de revocaciÃ³n se hizo con la clave de servicio **desde el equipo del
emisor** (el cliente de la app no estÃ¡ conectado todavÃ­a): se alterÃ³ el estado
en la tabla y se comprobÃ³ que la Edge Function la rechaza. El detalle estÃ¡ en
[`docs/BACKEND.md`](BACKEND.md).

---

## 6. Pruebas de aceptaciÃ³n del producto

| Criterio | Estado | Evidencia |
|---|---|---|
| La aplicaciÃ³n compila | âœ… | `npm run build` |
| Arranca correctamente | âœ… | `npm run doctor` + humo de interfaz |
| Funciones Free sin conexiÃ³n | âœ… | todas las suites corren sin red |
| Los datos persisten tras reiniciar | âœ… | humo de interfaz reinicia y relee |
| Pro/Business solo con permiso | âœ… | `LicenseService.assertFeature` en proceso principal + `PlanGate` en interfaz; 6 pruebas dedicadas a los lÃ­mites |
| Licencia vÃ¡lida funciona | âœ… | `tests/license.test.ts` |
| Licencia manipulada se rechaza | âœ… | firma Ed25519, test de alteraciÃ³n |
| Copias se pueden restauran | âœ… | 8 pruebas + humo de datos |
| Las migraciones no destruyen datos | âœ… | humo aplica 001â†’005 sobre datos reales (esquema v5) |
| Importes financieros correctos | âœ… | cÃ©ntimos enteros, tests de redondeo |
| Ventas/devoluciones mantienen stock | âœ… | tests de reserva y reemplazo |
| Integraciones no inventan datos | âœ… | sin scraping; estados solo manuales o confirmados |
| Navegador integrado aislado | âœ… | WebContentsView sin preload, solo https, sin Node |
| Errores de red no bloquean inventario | âœ… | el mÃ³dulo funciona sin backend |
| Instalador contiene lo necesario | âš ï¸ | generado y verificado internamente; **la instalaciÃ³n real estÃ¡ bloqueada por Device Guard** |
| `THIRD-PARTY-NOTICES.md` incluido | âœ… | generado por `npm run notices`; se empaqueta en `resources/` y se comprueba que la copia del paquete es **idÃ©ntica** a la del repositorio |
| Generador de avisos determinista | âœ… | dos ejecuciones separadas producen el mismo archivo (se eliminÃ³ la marca de tiempo que rompÃ­a la comprobaciÃ³n de CI) |
| Firma verificada | âš ï¸ | firmado con autofirmado; `Status: UnknownError` (raÃ­z no confiable) â€” ver `docs/FIRMA.md` |
| Advertencias de Windows documentadas | âœ… | `docs/FIRMA.md` |
| No se ha gastado dinero | âœ… | **0 â‚¬** |

---

## 7. Lo que NO se ha probado (y por quÃ©)

| Pendiente | Motivo real |
|---|---|
| InstalaciÃ³n en un Windows limpio | Este equipo bloquea el instalador por **Device Guard** (polÃ­tica de la organizaciÃ³n). No hay otra mÃ¡quina disponible. **No se afirma que la instalaciÃ³n estÃ© probada.** |
| ActivaciÃ³n de licencias *online* en condiciones de red reales y sostenidas | El cliente **sÃ­ estÃ¡ integrado** en la app (canal `license:refresh`) y la verificaciÃ³n en vivo pasÃ³. Lo que **no** se prueba de forma determinista es la red real: el arranque en frÃ­o supera a veces el tiempo de espera y el cliente devuelve `offline`, que es el comportamiento **correcto por diseÃ±o**. Por eso las aserciones sobre red en vivo **no** forman parte de la baterÃ­a determinista. |
| API de DHL u otros transportistas | Requieren registro de desarrollador (cuenta y aprobaciÃ³n). Sin credenciales, no se puede probar. |
| Conectores de marketplaces | Ninguna plataforma ha autorizado el acceso. Solo existe la arquitectura abstracta, **sin integraciÃ³n real**. |
| SincronizaciÃ³n multiusuario | El backend de licencias **no** sirve para sincronizar datos. No existe un backend multiusuario. |
| Pruebas de accesibilidad con lector de pantalla | No hay herramienta de lectores de pantalla instalada. La navegaciÃ³n por teclado y los contrastes no se han certificado. |
