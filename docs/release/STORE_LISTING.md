# RESALEVAULT — Fichas de publicación (Microsoft Store y GitHub Releases)

Material listo para **pegar** en los formularios. Todo lo que dice aquí está
verificado; lo que no se ha probado no se afirma.

- Se ha generado y validado con el validador oficial de Microsoft el paquete
  `.appx` (`docs/DISTRIBUCION.md`, Ruta B).
- El listado de la Store **no** se ha enviado todavía (falta tu cuenta).

---

## 1. Microsoft Store — Microsoft Store listing

### Nombre del producto (Name)

```
RESALEVAULT
```

> Si el nombre está reservado en la Store, usa `RESALEVAULT - Reseller Manager`
> como *App name* y mantén `RESALEVAULT` como `identityName` en
> `electron-builder.appx.yml`.

### Campos obligatorios

| Campo | Valor |
|---|---|
| Categoría | `Business` (alternativa: `Personal finance`) |
| Precio base | Gratis (con funciones de pago **dentro de la app**, activadas por licencia) |
| Idiomas compatibles | Español (España) `es-ES`, Inglés (Estados Unidos) `en-US` |
| Público objetivo | Adultos (mayores de 18) |
| Política de privacidad | URL pública del fichero `PRIVACY.md` (ver §3) |
| Página web | `https://github.com/16ray/RESALEVAULT` |
| Correo de soporte | *(tu correo)* |

### Descripción breve (Short description, máx. ~200 caracteres)

Español:

```
Gestiona tu negocio de compraventa: inventario, compras, ventas, márgenes y
etiquetas. Funciona sin conexión y tus datos se quedan en tu equipo.
```

Inglés:

```
Run your resale business: inventory, purchases, sales, margins and labels.
Works offline and your data stays on your device.
```

### Descripción larga (Description)

Español:

```
RESALEVAULT es la herramienta de trabajo para quien compra y revende: ropa,
tecnología, coleccionables, muebles… todo lo que pasa por tus manos.

QUÉ PUEDES HACER
• Inventario con fotos, estado, categoría y ubicación.
• Compras y ventas con el margen calculado al céntimo.
• Etiquetas y códigos para identificar cada artículo.
• Informes de beneficio por periodo, canal y categoría.
• Copias de seguridad y exportación de tus datos.

PENSADA PARA TRABAJAR SIN INTERNET
La aplicación funciona sin conexión. Tus datos se guardan en tu propio equipo y
solo salen de él si tú exportas un fichero o activas una función que lo indique.

IDIOMAS
Español e inglés, con la moneda y el formato que elijas.

SOBRE LAS LICENCIAS
Puedes usar las funciones gratuitas todo el tiempo que quieras. Las funciones
avanzadas se activan con una licencia. Si una licencia caduca, tu trabajo y tus
datos NO se pierden: sigues accediendo a ellos.
```

Inglés:

```
RESALEVAULT is the working tool for people who buy and resell: clothing,
electronics, collectibles, furniture — anything that passes through your hands.

WHAT YOU CAN DO
• Inventory with photos, condition, category and location.
• Purchases and sales with margins calculated to the cent.
• Labels and codes to identify every item.
• Profit reports by period, channel and category.
• Backups and export of your data.

BUILT TO WORK OFFLINE
The app works without an internet connection. Your data is stored on your own
device and only leaves it if you export a file or enable a feature that says so.

LANGUAGES
Spanish and English, with the currency and format you choose.

ABOUT LICENCES
You can use the free features for as long as you like. Advanced features are
unlocked with a licence. If a licence expires, your work and your data are NOT
lost: you keep access to them.
```

### Novedades de esta versión (What's new in this version)

```
Primera versión publicada (0.5.0).
• Inventario, compras, ventas, márgenes y etiquetas.
• Comprobación del puesto de licencia y revocaciones (opcional, requiere conexión).
• Funciona sin conexión: las funciones gratuitas no dependen de servidores.
```

### Notas de la versión en inglés

```
First published release (0.5.0).
• Inventory, purchases, sales, margins and labels.
• Licence seat check and revocations (optional, requires a connection).
• Works offline: free features do not depend on servers.
```

### Categorías / palabras clave (para búsqueda)

```
reseller, inventario, inventory, compraventa, resale, margen, profit, etiquetas,
labels, vinted, wallapop, segunda mano, second hand
```

### Requisitos declarados (Age rating / Declaraciones)

- No contiene contenido generado por el usuario publicado públicamente.
- No recopila datos de salud, financieros sensibles ni de ubicación precisa.
- No contiene publicidad de terceros.

---

## 2. GitHub Release v0.5.0 — texto para pegar

**Título:**

```
RESALEVAULT v0.5.0 — primera versión pública
```

**Cuerpo:**

```markdown
Primera versión pública de RESALEVAULT, la herramienta de escritorio para
gestionar compraventa e inventario.

## Descargas
- `RESALEVAULT-Setup-0.5.0.exe` — instalador para Windows 10/11 (x64).
- `SHA256SUMS.txt` — hashes SHA-256 para comprobar la descarga.

## Comprobar la descarga (recomendado)
```powershell
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
```
El valor debe coincidir con el de `SHA256SUMS.txt`.

## Qué incluye
- Inventario, compras, ventas, márgenes y etiquetas.
- Funciona **sin conexión**; las funciones gratuitas no dependen de servidores.
- Comprobación opcional del puesto de licencia y de revocaciones.
- Datos locales: `%APPDATA%\RESALEVAULT`.

## Aviso honesto sobre la firma
Este instalador **no está firmado por una autoridad de certificación de
confianza** (cuestan 150–300 €/año). Windows puede mostrar «editor
desconocido» o un aviso de SmartScreen. El paquete está firmado con un
certificado **autofirmado de desarrollo**, no reconocido por Windows.
Se publica el hash SHA-256 para que puedas verificar la integridad. No se pide
desactivar ninguna protección de Windows para instalarlo.

## Requisitos
- Windows 10/11 de 64 bits.
- No requiere permisos de administrador (instalación por usuario).

## macOS
No hay binario de macOS. Se publicará cuando se pueda compilar y firmar en un
Mac (ver `docs/release/MACOS_STATUS.md`). No se ofrece un `.exe` como si fuera
de macOS.
```

---

## 3. URL pública de la política de privacidad (obligatoria en la Store)

La Store exige una URL pública. La forma **gratuita** más simple:

1. Sube este repositorio a GitHub (Ruta A).
2. La URL será:
   `
   https://github.com/16ray/RESALEVAULT/blob/master/PRIVACY.md
   `
3. Pega esa URL en el campo *Privacy policy URL* del envío.

El fichero `PRIVACY.md` (raíz del repositorio) es la versión publicable de
`docs/PRIVACIDAD.md`, sin notas internas.

---

## 4. Qué NO afirmar en la ficha (evitar rechazos y promesas falsas)

- No prometer «sin virus garantizado» ni «aprobado por Microsoft»: aún no hay
  resultado de la validación de la Store.
- No afirmar que está «firmado por Microsoft»: solo la Store firma el paquete
  **después** de aprobarlo.
- No incluir capturas de pantalla de funciones que no existan.
- No usar logotipos de terceros (Vinted, Wallapop, eBay…) sin permiso: solo se
  nombran como *canales* de venta, sin sus logos.
