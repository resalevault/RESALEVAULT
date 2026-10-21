# RESALEVAULT — Privacy Policy / Política de privacidad

**Last updated / Última actualización: 21 October 2026**

This document explains what RESALEVAULT does with your data. It describes the
app as it actually works.

---

## English

### Summary

RESALEVAULT is a desktop application. **Your data belongs to you and stays on
your device.** There is no telemetry, no analytics, no advertising and no
third-party data sharing, with one narrow exception: if you activate a licence,
the app contacts a licence service to confirm your seat and check for
revocations. Nothing from your inventory, orders, customers or suppliers is
ever sent.

### What is stored and where

Everything is stored on your own device, under
`%APPDATA%\RESALEVAULT\`:
`data\` (SQLite database), `media\` (original images), `thumbs\`
(thumbnails), `backups\` (ZIP backups) and `logs\` (activity log).

The database contains your products, purchases, orders, expenses, returns,
payment methods, locations, tracking codes you enter, preferences, change
history, the licence you activated (signed code + a random device identifier)
and image metadata. Money is stored as integer cents.

**It does NOT contain:** any password (the app has no accounts), any payment
data (there are no payments), or AI provider keys (those are kept in your
operating system's encrypted credential store — Windows Credential Manager,
macOS Keychain or Linux Secret Service — never in the database).

### Internet connections

The app opens **no network connections unless you ask it to**, with one
exception: the licence check below, which runs in the background and **never
blocks the app**.

- **Carrier tracking (optional, manual).** When you press "Track", the carrier's
  website opens in an isolated view with no access to your files or the app.
  Only HTTPS is allowed. The app does **not** read, parse or store the content
  of those pages, and never polls them in the background.
- **Licence check (background, non-blocking).** See below.
- **AI Studio (optional, your own key).** Calls go directly from your device to
  the provider you choose, using a key you supply. The app does not see or store
  those keys or responses.

There is **no** telemetry, advertising, usage analytics or statistics
reporting.

### Licences

Licence validation is primarily **local**: the app verifies an Ed25519
signature on your own device. An already-activated licence **works offline**.

The device identifier is a random UUID generated on your device — not a
hardware identifier and not a serial number. The licence private key exists
only on the issuer's machine, never in the installer or the server.

If you activate a licence, the app may contact a licence service (hosted on
Supabase) that controls seats and revocations. What is sent: the licence code,
the random device UUID, a device label ("This device"), the app version and the
operating system. **No inventory, order, customer or supplier data is sent.**
When: on activation, when you press "Check now", and at most once every 7 days
in the background. Without a connection, the licence keeps validating locally;
the server being unavailable **never** blocks the app and **never** deletes your
data.

### Backups

Backups are ZIP files stored on your own device. **They are not encrypted.** If
you want encryption, use full-disk encryption such as BitLocker.

### Uninstall

The uninstaller does **not** delete `%APPDATA%\RESALEVAULT`. To erase your data
completely, delete that folder yourself. This is intentional: a bad update must
never cost you your inventory.

### Third parties

No business data is shared with anyone. There is no advertising, no usage
analytics, no "product improvement" service and no connected marketplace APIs.
The only third-party communication is the licence service described above.

### Contact

Open an issue at <https://github.com/16ray/RESALEVAULT/issues>.

---

## Español

### Resumen

RESALEVAULT es una aplicación de escritorio. **Tus datos son tuyos y se quedan
en tu equipo.** No hay telemetría, ni analíticas, ni publicidad, ni cesión de
datos a terceros, con una única excepción: si activas una licencia, la
aplicación contacta con un servicio de licencias para confirmar tu puesto y
consultar revocaciones. Nunca se envía nada de tu inventario, pedidos, clientes
ni proveedores.

### Qué se guarda y dónde

Todo se guarda en tu propio equipo, en `%APPDATA%\RESALEVAULT\`: `data\` (base
de datos SQLite), `media\` (imágenes originales), `thumbs\` (miniaturas),
`backups\` (copias ZIP) y `logs\` (registro de actividad).

La base de datos contiene tus productos, compras, pedidos, gastos,
devoluciones, métodos de pago, ubicaciones, códigos de seguimiento que
introduzcas, preferencias, historial de cambios, la licencia que hayas activado
(código firmado + identificador aleatorio de dispositivo) y metadatos de
imágenes. El dinero se guarda en céntimos enteros.

**No contiene:** ninguna contraseña (la aplicación no tiene cuentas), ningún dato
de pago (no hay pagos), ni claves de proveedores de IA (esas se guardan en el
almacén cifrado del sistema operativo — Administrador de credenciales de
Windows, Llavero de macOS o Secret Service de Linux —, nunca en la base de
datos).

### Conexiones a internet

La aplicación **no abre conexiones salvo que tú lo pidas**, con una excepción:
la comprobación de licencia, que se hace en segundo plano y **nunca bloquea** la
aplicación.

- **Seguimiento de transportistas (opcional, manual).** Al pulsar «Seguir» se
  abre la web del transportista en una vista aislada, sin acceso a tus ficheros
  ni a la aplicación. Solo se permite HTTPS. La aplicación **no** lee, ni
  interpreta, ni almacena el contenido de esas páginas, ni las sondea en segundo
  plano.
- **Comprobación de licencia (segundo plano, no bloqueante).** Ver más abajo.
- **AI Studio (opcional, con tu clave).** Las llamadas van directamente de tu
  equipo al proveedor que elijas, con una clave que tú aportas. La aplicación no
  ve ni almacena esas claves ni esas respuestas.

**No hay** telemetría, publicidad, analíticas de uso ni envío de estadísticas.

### Licencias

La validación es principalmente **local**: la aplicación verifica una firma
Ed25519 en tu propio equipo. Una licencia ya activada **funciona sin conexión**.

El identificador de dispositivo es un UUID aleatorio generado en tu equipo, no
un identificador del hardware ni un número de serie. La clave privada de
licencias solo existe en el equipo del emisor, nunca en el instalador ni en el
servidor.

Si activas una licencia, la aplicación puede contactar con un servicio de
licencias (alojado en Supabase) que controla puestos y revocaciones. Qué se
envía: el código de licencia, el UUID aleatorio del dispositivo, una etiqueta del
equipo («Este equipo»), la versión de la aplicación y el sistema operativo.
**No se envía ningún dato de inventario, pedidos, clientes ni proveedores.**
Cuándo: al activar, al pulsar «Comprobar ahora» y, como mucho, una vez cada 7
días en segundo plano. Sin conexión, la licencia sigue validándose en local; que
el servidor no esté disponible **nunca** bloquea la aplicación y **nunca** borra
tus datos.

### Copias de seguridad

Las copias son ficheros ZIP guardados en tu propio equipo. **No están
cifradas.** Si quieres cifrado, usa cifrado de disco completo como BitLocker.

### Desinstalación

El desinstalador **no borra** `%APPDATA%\RESALEVAULT`. Para eliminar tus datos
por completo, borra esa carpeta tú mismo. Es intencionado: una actualización mal
hecha nunca debe costarte tu inventario.

### Terceros

No se comparte ningún dato del negocio con nadie. No hay publicidad, ni
analíticas de uso, ni servicios de «mejora del producto», ni APIs de
marketplaces conectadas. La única comunicación con un tercero es el servicio de
licencias descrito arriba.

### Contacto

Abre una incidencia en <https://github.com/16ray/RESALEVAULT/issues>.
