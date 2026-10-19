# RESALEVAULT — Privacidad y datos

Este documento describe **cómo funciona el programa de verdad**, no una versión
revisada. Si algo no está implementado, se dice.

---

## 1. Principio

**Los datos son del usuario y se quedan en su equipo.**

RESALEVAULT es una aplicación de escritorio. No tiene servidor propio, no tiene
telemetría, no tiene analíticas y no envía nada a terceros salvo cuando **el
usuario** lo pide explícitamente.

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

La aplicación **no abre conexiones salvo que el usuario lo pida**. Hay exactamente
dos motivos:

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

### 3.2 AI Studio (opcional, con clave del usuario)

Ver sección 5.

**No hay:** telemetría, comprobación de actualizaciones, descarga de listas de
bloqueo, publicidad, análisis de uso, ni envío de estadísticas.

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

- La activación es **local**: no se envía nada a ningún servidor.
- El identificador de dispositivo es un UUID aleatorio generado en su equipo,
  no un identificador del hardware ni un número de serie.
- La clave privada de licencias está en el equipo del emisor, **nunca** en el
  instalador.

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

**No se comparte ningún dato.** No hay:

- Publicidad.
- Analíticas de uso.
- Servicios de «mejora del producto».
- Cachés externas de mapas o fuentes.
- Fuentes web de tipos de cambio (se introducen a mano).
- APIs de marketplaces conectadas.

---

## 10. Si algún día cambia esto

Si se añade cualquier componente con red (actualizaciones automáticas, backend de
licencias, marketplaces), se documentará **aquí**, con su proveedor, sus
condiciones y qué datos viajan. **Ninguna función se activará en silencio.**
