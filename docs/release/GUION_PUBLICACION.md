# RESALEVAULT â€” Guion de publicaciÃ³n (quÃ© hacer y en quÃ© orden)

Este es el documento **Ãºnico** que une todo lo preparado para publicar la
versiÃ³n 0.5.0. EstÃ¡ escrito para que lo sigas de arriba abajo el dÃ­a de la
publicaciÃ³n.

Leyenda de responsable:

- **TÃš** â€” requiere tu cuenta o tu equipo (yo no puedo ni debo hacerlo por ti).
- **YO** â€” puedo hacerlo yo cuando me lo pidas (comandos preparados y probados).

> Todo lo que dice Â«verificadoÂ» en este proyecto se ha **ejecutado**. Lo que no
> se ha probado se marca como **pendiente**, sin adornos.

---

## 0. Estado de partida (21/10/2026)

| Elemento | Estado |
|---|---|
| CÃ³digo, pruebas (509/509) y documentaciÃ³n | âœ… listo |
| Instalador `RESALEVAULT-Setup-0.5.0.exe` (117,67 MB) | âœ… generado y firmado (autofirmado) |
| Paquete `RESALEVAULT-Store-0.5.0.appx` (160,98 MB) | âœ… generado (sin firmar a propÃ³sito) |
| Manifiestos de winget (esquema 1.12) | âœ… validados con `winget validate`, sin avisos |
| Ficha de la Store, PR de winget, privacidad, capturas | âœ… redactados |
| Carpeta `RESALEVAULT_RELEASE` en tu escritorio | âœ… 19 ficheros con hashes comprobados |
| **Repositorio de GitHub** | âŒ **no existe todavÃ­a** |
| **Cuenta de la Microsoft Store** | âŒ **no creada todavÃ­a** |
| **InstalaciÃ³n probada en equipo limpio** | âŒ **pendiente** |

Las dos rutas son **independientes** y **complementarias**. Puedes hacer solo
una; hacer las dos da mejor cobertura (GitHub+winget llega antes; la Store firma
el paquete y evita los avisos de Windows).

---

## RUTA A â€” GitHub Releases + winget

Detalle completo: [`PUBLICACION_RUTA_A.md`](PUBLICACION_RUTA_A.md).

### A1. Crear tu cuenta/repositorio de GitHub â€” **TÃš**

Necesitas una cuenta en GitHub (gratuita) y que exista el repositorio. Tienes
dos opciones:

- **AutomÃ¡tica (recomendada).** Crea un token con permiso `repo` en
  <https://github.com/settings/tokens>, exponlo en la sesiÃ³n y yo lanzo el
  script (que ya estÃ¡ probado y **simula por defecto**):

  ```powershell
  $env:GH_TOKEN = "ghp_..."          # TÃš: pega tu token
  npm run publish:github -- --repo 16ray/RESALEVAULT            # YO: simula
  npm run publish:github -- --repo 16ray/RESALEVAULT --confirm  # YO: publica
  ```

- **Manual.** Creas el repositorio en la web, y luego:

  ```powershell
  git remote add origin https://github.com/16ray/RESALEVAULT.git   # YO
  git push -u origin master                                        # YO
  ```

### A2. Crear la Release v0.5.0 â€” **TÃš** (o **YO** con el token)

Adjunta **dos** ficheros (estÃ¡n en `release/`):

- `RESALEVAULT-Setup-0.5.0.exe`
- `SHA256SUMS.txt`

El **cuerpo** del release no lo escribas a mano: genÃ©ralo con
`npm run publish:github --print-notes` (lee el changelog, asÃ­ que siempre dice
lo mismo que el resto de la documentaciÃ³n).

> **TÃš** debes verificar que la descarga funciona: abre la pÃ¡gina de la release
> en un navegador y descarga el instalador.

### A3. Probar la instalaciÃ³n desde el manifiesto â€” **TÃš** (equipo limpio)

```powershell
winget install --manifest ".\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0"
```

Esto **no se puede probar en tu equipo actual** (polÃ­tica de firma Enterprise,
ver [`docs/FIRMA.md`](../FIRMA.md) Â§9). Hazlo en un equipo limpio o en una
mÃ¡quina virtual. **No marques esta casilla del PR hasta haberla hecho.**

### A4. Abrir el Pull Request a `microsoft/winget-pkgs` â€” **TÃš**

1. Haz *fork* de `microsoft/winget-pkgs`.
2. Copia los **tres** YAML de `dist-winget\RESALEVAULT\RESALEVAULT\0.5.0\` a
   `manifests/r/RESALEVAULT/RESALEVAULT/0.5.0/`.
3. Abre el PR con el tÃ­tulo `New package: RESALEVAULT.RESALEVAULT version 0.5.0`
   y el cuerpo de [`WINGET_PR_BODY.md`](WINGET_PR_BODY.md).

> Si la URL de tu release no es exactamente la esperada, regenera los
> manifiestos antes del PR:
> `npm run winget:manifests -- --url "<URL real>" --repo 16ray/RESALEVAULT` (**YO**).

**QuÃ© esperar (honesto):** el PR puede tardar dÃ­as y puede recibir un
`Binary-Validation-Error` si algÃºn antivirus da un falso positivo. Si ocurre, se
responde con el envÃ­o a revisiÃ³n de Microsoft; no se oculta nada.

---

## RUTA B â€” Microsoft Store

Detalle completo: [`ENVIO_STORE.md`](ENVIO_STORE.md).

### B1. Registrar la cuenta de desarrollador â€” **TÃš**

El registro de **persona individual es gratuito** (desde septiembre de 2025).
NecesitarÃ¡s verificar tu identidad (documento y *selfie*), asÃ­ que solo puedes
hacerlo tÃº. Cuando tengas la cuenta, **apunta tu `Publisher` real** (tiene el
formato `CN=XXXXXXXXXXXXXXXX`).

### B2. Sustituir el `Publisher` en el paquete â€” **YO**

El `.appx` lleva un `Publisher` de relleno (`CN=RESALEVAULT`). Cuando me des tu
valor real, yo:

1. Lo pongo en `electron-builder.appx.yml`.
2. Regenero el paquete: `npm run dist:appx`.
3. **Verifico** el `Publisher` dentro del `.appx` real (no me fÃ­o del fichero de
   configuraciÃ³n).

> **TÃš** puedes comprobarlo tÃº mismo siguiendo [`ENVIO_STORE.md`](ENVIO_STORE.md) Â§2.

### B3. Capturas de pantalla â€” **TÃš** (o **YO** si ejecutas la app)

La Store pide mÃ­nimo 1, recomendadas 4â€“8 (`.png`, mÃ­nimo **1366Ã—768**). GuÃ­a con
las 6 pantallas concretas y los datos de ejemplo: [`CAPTURAS.md`](CAPTURAS.md).

- **TÃš** ejecutas la app, acticas los **datos de ejemplo** (reversibles), haces
  las capturas y luego los borras.
- Si me lo pides, **YO** te preparo los comandos de captura y el recorte.

### B4. Rellenar y enviar el envÃ­o â€” **TÃš**

Copia y pega desde [`STORE_LISTING.md`](STORE_LISTING.md): nombre, descripciones
(es/en), categorÃ­a, palabras clave, requisitos y la URL de privacidad
(`PRIVACY.md` ya publicado en tu repositorio de GitHub tras la Ruta A).

### B5. Esperar la validaciÃ³n de la Store â€” **TÃš**

AquÃ­ **no hay resultados inventados**: hasta que Microsoft valide, el estado real
es Â«enviado, sin resultadoÂ». Cuando lo tengas, registra el resultado en
[`ENVIO_STORE.md`](ENVIO_STORE.md) Â§8. **Solo la Store firma el paquete**, asÃ­
que hasta ese momento no se puede afirmar que Windows deje de avisar.

---

## VerificaciÃ³n de instalaciÃ³n en equipo limpio (comÃºn a las dos rutas)

Independientemente de la ruta, hace falta probar de verdad que instala. Copia
`Windows\verify-install.ps1` de la carpeta de entrega al equipo limpio y ejecÃºtalo
(no requiere permisos de administrador). Cuando termine en `RESULTADO: TODO
CORRECTO`, avÃ­same y actualizo `docs/ESTADO.md` y `docs/TEST-REPORT.md` con el
resultado real.

---

## Lo que NO hay que hacer (y por quÃ©)

- **No desactivar ninguna protecciÃ³n de Windows** para instalar. Ninguna ruta lo
  necesita y el proyecto no lo recomienda.
- **No ofuscar el instalador** para esquivar antivirus: es la categorÃ­a
  *packer/crypter*, y ademÃ¡s la propia Store y winget lo rechazarÃ­an por
  detecciÃ³n heurÃ­stica.
- **No prometer** Â«sin virus garantizadoÂ» ni Â«aprobado por MicrosoftÂ» hasta tener
  el resultado real de la Store.
- **No inventar** capturas, resultados de validaciÃ³n ni cifras de descargas.

---

## Orden recomendado (camino corto)

1. **TÃš:** crear la cuenta de GitHub y el token.
2. **YO:** publicar la release en GitHub (A1â€“A2) y regenerar/validar los
   manifiestos.
3. **TÃš:** probar la instalaciÃ³n en equipo limpio (A3) y abrir el PR de winget
   (A4). â†’ *Ya hay descarga pÃºblica*.
4. **TÃš:** registrar la cuenta de la Store y darte tu `Publisher`.
5. **YO:** regenerar el `.appx` con tu `Publisher` real (B2).
6. **TÃš:** capturas (B3) y envÃ­o (B4). â†’ *La Store firma el paquete al aprobarlo*.
7. **YO:** registrar los resultados reales en la documentaciÃ³n cuando estÃ©n.

---

## Costes

**0 â‚¬.** GitHub, el repositorio pÃºblico, la cuenta individual de la Microsoft
Store y todas las herramientas son gratuitas. El Ãºnico gasto opcional sigue
siendo el **certificado de firma de confianza pÃºblica** (150â€“300 â‚¬/aÃ±o), que
**no** es necesario para ninguna de las dos rutas.

> Nota honesta: los planes gratuitos de servicios en lÃ­nea (GitHub Actions,
> Supabase) **no se prometen indefinidamente**. Ninguno es necesario para usar el
> programa: sin ellos, el inventario, los pedidos y las copias siguen
> funcionando.
