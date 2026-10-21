# RESALEVAULT — Privacidad y datos

Este documento describe **cómo funciona el programa de verdad**, no una versión
revisada. Si algo no está implementado, se dice.

---

## 1. Principio

**Los datos son del usuario y se quedan en su equipo.**

RESALEVAULT es una aplicación de escritorio. No tiene servidor propio, no tiene
telemetría, no tiene analíticas y no envía nada a terceros salvo cuando **el
usuario** lo pide explícitamente. La única excepción es el **backend de
licencias** (Supabase), descrito en la sección 6, al que la aplicación se conecta
**solo para confirmar el puesto y consultar revocaciones**, y solo cuando hay una
licencia activada.

---

## 2. Qué datos se guardan y dónde

Todo en `C:\Users\<usuario>\AppData\Roaming\RESALEVAULT\`:

| Carpeta | Contenido |
|---|---|
| `data\` | Base de datos SQLite (`resalevault.sqlite` + WAL) |
| `media\` | Imágenes originales |
| `thumbs\` | Miniaturas generadas localmente |
| `backups\` | Copias de seguridad ZIP |
| `logs\` | Registro de actividad |

### Qué hay dentro de la base de datos

- Productos: nombre, marca, talla, color, estado, categoría, SKU, notas, fechas,
  precios y costes **en céntimos enteros**.
- Compras, pedidos, líneas, gastos, devoluciones, métodos de pago.
- Ubicaciones jerárquicas.
- Códigos de seguimiento introducidos por el usuario.
- Preferencias e idioma.
- Historial de cambios y registro de actividad.
- Licencia activada (código firmado + identificador de dispositivo local).
- Metadatos de las imágenes (nombre, tamaño, fecha, hash).

### Qué NO se guarda

- No se guarda ninguna **contraseña**. La aplicación no tiene cuentas.
- No se guardan **claves de IA** en la base de datos: se guardan en el almacén
  cifrado del sistema operativo (ver sección 5).
- No se guardan datos de pago porque no hay pagos.

---

## 3. Conexiones a internet

La aplicación **no abre conexiones salvo que el usuario lo pida**, con **una
excepción**: la comprobación de licencia descrita en la sección 6, que se hace en
segundo plano y **nunca bloquea** el programa. Además hay dos conexiones que el
usuario pide a mano:

### 3.1 Navegador de transportistas (Shipping Tracker)

El usuario pulsa **«Seguir»** en un código y se abre la web del transportista en
una vista aislada dentro de la aplicación. Ahí el usuario navega manualmente.

- Solo se permite **HTTPS** (los `http://` se muestran como inseguros).
- No se ejecuta ningún script de la página en el proceso de la aplicación.
- No hay *scraping*: RESALEVAULT **no lee, no parsea y no almacena** el contenido
  de esas páginas.
- No hay sondeos automáticos en segundo plano.
- Solo se puebla el estado del envío si el usuario lo confirma a mano, o si una
  API oficial (con credenciales del usuario) lo devuelve.

### 3.2 Licencia (segundo plano, no bloqueante)

Si hay una licencia activada, la aplicación confirma el puesto y consulta
revocaciones contra el backend de licencias. Detalles exactos en la sección 6.
**No** envía inventario, pedidos, clientes, fotos ni datos personales.

### 3.3 AI Studio (opcional, con clave del usuario)

Ver sección 5.

**No hay:** telemetría, publicidad, análisis de uso, ni envío de estadísticas.

---

## 4. Ventana aislada: qué puede hacer una página web

La vista de transportistas usa `WebContentsView` con estas restricciones
(verificado por pruebas automatizadas):

- `contextIsolation` activa y **sin preload**: la página no tiene acceso al
  sistema de archivos ni a los canales IPC.
- **Sin Node.js** en la página.
- **Sin permiso de almacenamiento** (no puede escribir en disco).
- Se bloquean **pop-ups**, **descargas** y la apertura de archivos.
- Se rechazan certificados TLS inválidos (no hay «aceptar de todos modos»).
- Se comprueba el dominio antes de navegar.

---

## 5. AI Studio — qué ocurre con los datos

- La clave (OpenAI, Anthropic o Gemini) la introduce el **usuario**.
- Se guarda en el **almacén cifrado del sistema operativo**: Windows Credential
  Manager, macOS Keychain o Secret Service de Linux. **No** en la base de datos
  ni en un fichero de texto.
- La aplicación **no** tiene acceso al historial de uso de la cuenta de IA del
  usuario: solo hace las llamadas que él lanza.
- El contenido que se envía es lo que el usuario seleccione (por ejemplo, la
  descripción de un artículo para redactar el anuncio).
- Las llamadas van **directamente de su equipo al proveedor elegido**. La
  respuesta puede llegar a la cuenta de pago del usuario: la aplicación lo avisa
  antes de ejecutar cada lote.

**RESALEVAULT no ve ni almacena esas claves ni esas respuestas.**

---

## 6. Licencias

- La validación principal que usa la aplicación es **local**: se verifica la firma
  Ed25519 del código en el propio equipo. Una licencia ya activada **funciona sin
  conexión**.
- El identificador de dispositivo es un UUID aleatorio generado en su equipo,
  no un identificador del hardware ni un número de serie.
- La clave privada de licencias está en el equipo del emisor, **nunca** en el
  instalador ni en el backend.

### Backend de licencias (Supabase) — conectado desde el 21/10/2026

Existe un backend en **Supabase** (plan gratuito) cuyo único cometido es controlar
puestos y revocaciones:

- **Qué viaja**: el código de licencia (que ya tiene quien lo introduce), el UUID
  aleatorio del dispositivo, una etiqueta del equipo («Este equipo»), la versión
  de la aplicación y el sistema operativo. **Ningún dato del inventario, pedidos,
  clientes o proveedores.** Tampoco la clave privada, que no existe en el servidor.
- **Cuándo**: al activar, al comprobar a mano («Comprobar ahora») y, como mucho,
  una vez cada 7 días en segundo plano. Pide solo las revocaciones posteriores al
  último cursor.
- **Dónde**: `https://ugfefewrikcghfwqhezi.supabase.co` (Edge Function; las tablas
  tienen RLS sin políticas y solo el rol de servicio las escribe). La aplicación
  usa la clave **publishable**, pública por diseño.
- **Offline-first**: sin conexión la licencia sigue validándose en local; la
  ausencia del servidor **nunca** bloquea el programa y **nunca borra datos**. Si
  Supabase pausa el proyecto por inactividad (~1 semana), las licencias existentes
  siguen funcionando.
- Detalle técnico y pruebas: [`docs/BACKEND.md`](BACKEND.md).

---

## 7. Copias de seguridad

- Se guardan en `backups\`, en el propio equipo.
- Son ZIP con la base de datos comprimida e imágenes.
- **No están cifradas.** Si se desea cifrar, hay que hacerlo a nivel de sistema
  (BitLocker, por ejemplo). No se ha implementado cifrado propio porque una
  protección casera con una contraseña mal guardada da falsa sensación de
  seguridad.
- La restauración conserva la base anterior como
  `resalevault.antes-de-restaurar-<fecha>.sqlite`.

---

## 8. Desinstalación

El desinstalador **no borra** `%APPDATA%\RESALEVAULT`. Si el usuario quiere
eliminar sus datos por completo, debe borrar esa carpeta a mano. Esto está
elegido a propósito: una actualización mal hecha no debe poder costarle el
inventario.

---

## 9. Compartir datos con terceros

**No se comparte ningún dato del negocio.** No hay:

- Publicidad.
- Analíticas de uso.
- Servicios de «mejora del producto».
- Cachés externas de mapas o fuentes.
- Fuentes web de tipos de cambio (se introducen a mano).
- APIs de marketplaces conectadas.

Única comunicación con un tercero: el **backend de licencias** (Supabase,
sección 6), que recibe solo código de licencia e identificador de dispositivo
(junto con la versión de la app y el sistema operativo) y solo cuando hay una
licencia activada.

---

## 10. Si algún día cambia esto

Si se añade cualquier componente con red (actualizaciones automáticas,
marketplaces…), se documentará **aquí**, con su proveedor, sus condiciones y qué
datos viajan. **Ninguna función se activará en silencio.**

El backend de licencias está documentado en la sección 6 y **ya conectado desde
el 21/10/2026**; este documento refleja el resultado real de esa conexión.
