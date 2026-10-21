# RESALEVAULT — Guion de publicación (qué hacer y en qué orden)

Este es el documento **único** que une todo lo preparado para publicar la
versión 0.5.0. Está escrito para que lo sigas de arriba abajo el día de la
publicación.

Leyenda de responsable:

- **TÚ** — requiere tu cuenta o tu equipo (yo no puedo ni debo hacerlo por ti).
- **YO** — puedo hacerlo yo cuando me lo pidas (comandos preparados y probados).

> Todo lo que dice «verificado» en este proyecto se ha **ejecutado**. Lo que no
> se ha probado se marca como **pendiente**, sin adornos.

---

## 0. Estado de partida (21/10/2026)

| Elemento | Estado |
|---|---|
| Código, pruebas (509/509) y documentación | ✅ listo |
| Instalador `RESALEVAULT-Setup-0.5.0.exe` (117,67 MB) | ✅ generado y firmado (autofirmado) |
| Paquete `RESALEVAULT-Store-0.5.0.appx` (160,98 MB) | ✅ generado (sin firmar a propósito) |
| Manifiestos de winget (esquema 1.12) | ✅ validados con `winget validate`, sin avisos |
| Ficha de la Store, PR de winget, privacidad, capturas | ✅ redactados |
| Carpeta `RESALEVAULT_RELEASE` en tu escritorio | ✅ 19 ficheros con hashes comprobados |
| **Repositorio de GitHub** | ❌ **no existe todavía** |
| **Cuenta de la Microsoft Store** | ❌ **no creada todavía** |
| **Instalación probada en equipo limpio** | ❌ **pendiente** |

Las dos rutas son **independientes** y **complementarias**. Puedes hacer solo
una; hacer las dos da mejor cobertura (GitHub+winget llega antes; la Store firma
el paquete y evita los avisos de Windows).

---

## RUTA A — GitHub Releases + winget

Detalle completo: [`PUBLICACION_RUTA_A.md`](PUBLICACION_RUTA_A.md).

### A1. Crear tu cuenta/repositorio de GitHub — **TÚ**

Necesitas una cuenta en GitHub (gratuita) y que exista el repositorio. Tienes
dos opciones:

- **Automática (recomendada).** Crea un token con permiso `repo` en
  <https://github.com/settings/tokens>, exponlo en la sesión y yo lanzo el
  script (que ya está probado y **simula por defecto**):

  ```powershell
  $env:GH_TOKEN = "ghp_..."          # TÚ: pega tu token
  npm run publish:github -- --repo 16ray/RESALEVAULT            # YO: simula
  npm run publish:github -- --repo 16ray/RESALEVAULT --confirm  # YO: publica
  ```

- **Manual.** Creas el repositorio en la web, y luego:

  ```powershell
  git remote add origin https://github.com/16ray/RESALEVAULT.git   # YO
  git push -u origin master                                        # YO
  ```

### A2. Crear la Release v0.5.0 — **TÚ** (o **YO** con el token)

Adjunta **dos** ficheros (están en `release/`):

- `RESALEVAULT-Setup-0.5.0.exe`
- `SHA256SUMS.txt`

El **cuerpo** del release no lo escribas a mano: genéralo con
`npm run publish:github --print-notes` (lee el changelog, así que siempre dice
lo mismo que el resto de la documentación).

> **TÚ** debes verificar que la descarga funciona: abre la página de la release
> en un navegador y descarga el instalador.

### A3. Probar la instalación desde el manifiesto — **TÚ** (equipo limpio)

```powershell
winget install --manifest ".\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0"
```

Esto **no se puede probar en tu equipo actual** (política de firma Enterprise,
ver [`docs/FIRMA.md`](../FIRMA.md) §9). Hazlo en un equipo limpio o en una
máquina virtual. **No marques esta casilla del PR hasta haberla hecho.**

### A4. Abrir el Pull Request a `microsoft/winget-pkgs` — **TÚ**

1. Haz *fork* de `microsoft/winget-pkgs`.
2. Copia los **tres** YAML de `dist-winget\RESALEVAULT\RESALEVAULT\0.5.0\` a
   `manifests/r/RESALEVAULT/RESALEVAULT/0.5.0/`.
3. Abre el PR con el título `New package: RESALEVAULT.RESALEVAULT version 0.5.0`
   y el cuerpo de [`WINGET_PR_BODY.md`](WINGET_PR_BODY.md).

> Si la URL de tu release no es exactamente la esperada, regenera los
> manifiestos antes del PR:
> `npm run winget:manifests -- --url "<URL real>" --repo 16ray/RESALEVAULT` (**YO**).

**Qué esperar (honesto):** el PR puede tardar días y puede recibir un
`Binary-Validation-Error` si algún antivirus da un falso positivo. Si ocurre, se
responde con el envío a revisión de Microsoft; no se oculta nada.

---

## RUTA B — Microsoft Store

Detalle completo: [`ENVIO_STORE.md`](ENVIO_STORE.md).

### B1. Registrar la cuenta de desarrollador — **TÚ**

El registro de **persona individual es gratuito** (desde septiembre de 2025).
Necesitarás verificar tu identidad (documento y *selfie*), así que solo puedes
hacerlo tú. Cuando tengas la cuenta, **apunta tu `Publisher` real** (tiene el
formato `CN=XXXXXXXXXXXXXXXX`).

### B2. Sustituir el `Publisher` en el paquete — **YO**

El `.appx` lleva un `Publisher` de relleno (`CN=RESALEVAULT`). Cuando me des tu
valor real, yo:

1. Lo pongo en `electron-builder.appx.yml`.
2. Regenero el paquete: `npm run dist:appx`.
3. **Verifico** el `Publisher` dentro del `.appx` real (no me fío del fichero de
   configuración).

> **TÚ** puedes comprobarlo tú mismo siguiendo [`ENVIO_STORE.md`](ENVIO_STORE.md) §2.

### B3. Capturas de pantalla — **TÚ** (o **YO** si ejecutas la app)

La Store pide mínimo 1, recomendadas 4–8 (`.png`, mínimo **1366×768**). Guía con
las 6 pantallas concretas y los datos de ejemplo: [`CAPTURAS.md`](CAPTURAS.md).

- **TÚ** ejecutas la app, acticas los **datos de ejemplo** (reversibles), haces
  las capturas y luego los borras.
- Si me lo pides, **YO** te preparo los comandos de captura y el recorte.

### B4. Rellenar y enviar el envío — **TÚ**

Copia y pega desde [`STORE_LISTING.md`](STORE_LISTING.md): nombre, descripciones
(es/en), categoría, palabras clave, requisitos y la URL de privacidad
(`PRIVACY.md` ya publicado en tu repositorio de GitHub tras la Ruta A).

### B5. Esperar la validación de la Store — **TÚ**

Aquí **no hay resultados inventados**: hasta que Microsoft valide, el estado real
es «enviado, sin resultado». Cuando lo tengas, registra el resultado en
[`ENVIO_STORE.md`](ENVIO_STORE.md) §8. **Solo la Store firma el paquete**, así
que hasta ese momento no se puede afirmar que Windows deje de avisar.

---

## Verificación de instalación en equipo limpio (común a las dos rutas)

Independientemente de la ruta, hace falta probar de verdad que instala. Copia
`Windows\verify-install.ps1` de la carpeta de entrega al equipo limpio y ejecútalo
(no requiere permisos de administrador). Cuando termine en `RESULTADO: TODO
CORRECTO`, avísame y actualizo `docs/ESTADO.md` y `docs/TEST-REPORT.md` con el
resultado real.

---

## Lo que NO hay que hacer (y por qué)

- **No desactivar ninguna protección de Windows** para instalar. Ninguna ruta lo
  necesita y el proyecto no lo recomienda.
- **No ofuscar el instalador** para esquivar antivirus: es la categoría
  *packer/crypter*, y además la propia Store y winget lo rechazarían por
  detección heurística.
- **No prometer** «sin virus garantizado» ni «aprobado por Microsoft» hasta tener
  el resultado real de la Store.
- **No inventar** capturas, resultados de validación ni cifras de descargas.

---

## Orden recomendado (camino corto)

1. **TÚ:** crear la cuenta de GitHub y el token.
2. **YO:** publicar la release en GitHub (A1–A2) y regenerar/validar los
   manifiestos.
3. **TÚ:** probar la instalación en equipo limpio (A3) y abrir el PR de winget
   (A4). → *Ya hay descarga pública*.
4. **TÚ:** registrar la cuenta de la Store y darte tu `Publisher`.
5. **YO:** regenerar el `.appx` con tu `Publisher` real (B2).
6. **TÚ:** capturas (B3) y envío (B4). → *La Store firma el paquete al aprobarlo*.
7. **YO:** registrar los resultados reales en la documentación cuando estén.

---

## Costes

**0 €.** GitHub, el repositorio público, la cuenta individual de la Microsoft
Store y todas las herramientas son gratuitas. El único gasto opcional sigue
siendo el **certificado de firma de confianza pública** (150–300 €/año), que
**no** es necesario para ninguna de las dos rutas.

> Nota honesta: los planes gratuitos de servicios en línea (GitHub Actions,
> Supabase) **no se prometen indefinidamente**. Ninguno es necesario para usar el
> programa: sin ellos, el inventario, los pedidos y las copias siguen
> funcionando.
