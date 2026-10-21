# RESALEVAULT — Distribución gratuita en Windows (0 €)

Guía de las **dos rutas de distribución** elegidas, con el estado real de cada
paso. Nada se da por hecho: lo ejecutado está marcado como «verificado» con su
evidencia, y lo pendiente indica quién tiene que hacerlo y qué trámite requiere.

Última actualización: **20/10/2026**.

---

## Resumen de rutas

| Ruta | Canal | Coste | Estado |
|---|---|---|---|
| **A** | GitHub Releases + winget | 0 € | Manifiestos generados y **validados con `winget validate`**; falta crear el repositorio y el PR |
| **B** | Microsoft Store (paquete AppX/MSIX) | 0 € | Paquete **generado y verificado**; falta crear la cuenta Partner Center y enviar |

Las dos rutas son **complementarias**: winget llega a usuarios técnicos hoy;
la Store elimina los avisos de SmartScreen porque **Microsoft firma el paquete
final con su certificado**.

---

## Coste de la cuenta de Microsoft Store (verificado 20/10/2026)

Fuente: Microsoft Learn, «Free developer registration for individual
developers» (actualizado 17/04/2026):

- **Sin cuota de registro**: la cuota de 19 $ se ha eliminado en el nuevo flujo
  de alta (particulares; para empresas desde mayo de 2026).
- **Verificación de identidad**: DNI/pasaporte + selfie.
- **Sin tarjeta de crédito.**
- Alta en `https://storedeveloper.microsoft.com`.

Antes de esta información, el plan técnico asumía 19 $ de cuota; con el dato
real, **ambas rutas caben en 0 €**.

---

## Ruta A — GitHub Releases + winget

### Qué está hecho y verificado

| Paso | Estado | Evidencia |
|---|---|---|
| Generador de manifiestos (`scripts/winget-manifests.mjs`), esquema **1.12.0** | ✅ verificado | 13 pruebas unitarias (`tests/winget-manifests.test.ts`) |
| Cabecera `# yaml-language-server: $schema=…` (obligatoria en el repositorio) | ✅ verificado | formato `https://aka.ms/winget-manifest.<tipo>.1.12.0.schema.json` |
| Manifiestos para v0.5.0 generados | ✅ verificado | `dist-winget/RESALEVAULT/RESALEVAULT/0.5.0/` |
| SHA-256 del manifiesto = hash publicado | ✅ verificado | `39DE1695…DB7C4B51` coincide con el instalador real |
| Validación con el validador oficial | ✅ verificado | `winget validate` → **«Manifest validation succeeded.»** (21/10/2026, sin avisos) |
| Material de publicación listo | ✅ verificado | `docs/release/PUBLICACION_RUTA_A.md`, `WINGET_PR_BODY.md`, `STORE_LISTING.md` |

Nota de honestidad: el generador tuvo **varios errores de esquema reales** a lo
largo del desarrollo (faltaba `PackageName`; URL y hash iban en la raíz en lugar
de dentro de `Installers`; usaba el esquema **obsoleto 1.6.0**; faltaba la
cabecera `yaml-language-server`; y esa cabecera usaba el formato largo en vez
del acortador `aka.ms` exigido). Los cazó el validador oficial de Microsoft y
están corregidos con pruebas que impiden la regresión.

### Pasos pendientes (requieren tu cuenta de GitHub, gratis)

1. Crear la cuenta/organización en `github.com` (si no existe).
2. Crear el repositorio público `16ray/RESALEVAULT` y subir el código:
   ```powershell
   git remote add origin https://github.com/16ray/RESALEVAULT.git
   git push -u origin master
   ```
3. Publicar la **Release v0.5.0** adjuntando `RESALEVAULT-Setup-0.5.0.exe` y un
   fichero `SHA256SUMS.txt` con el hash. La URL de descarga será la que ya
   referencian los manifiestos:
   `https://github.com/16ray/RESALEVAULT/releases/download/v0.5.0/RESALEVAULT-Setup-0.5.0.exe`
4. Regenerar manifiestos apuntando a esa URL (ya hecha arriba) y abrir el PR:
   1. Hacer fork de `microsoft/winget-pkgs`.
   2. Copiar los tres YAML a `manifests/r/RESALEVAULT/RESALEVAULT/0.5.0/` del fork.
   3. Abrir Pull Request; los robots validan y **prueban la instalación
      silenciosa** en sus máquinas.

Guía detallada con el texto listo para pegar: `docs/release/PUBLICACION_RUTA_A.md`
(pasos) y `docs/release/WINGET_PR_BODY.md` (cuerpo del PR).

### Límites honestos de winget

- El instalador sigue **sin firma de CA confiable**: winget no la exige para
  `.exe`, pero los usuarios que lo instalen manualmente (fuera de winget)
  verán el aviso de SmartScreen. Winget verifica el **hash**, no la firma.
- La validación de winget ejecuta el instalador en varios motores antivirus.
  Hoy Defender no detecta nada, pero **no se promete aprobación anticipada**.
- winget solo publica paquetes cuya URL apunta a la fuente del autor (el
  release de GitHub cumple).

---

## Ruta B — Microsoft Store (AppX/MSIX)

### Qué está hecho y verificado

| Paso | Estado | Evidencia |
|---|---|---|
| Configuración Store (`electron-builder.appx.yml`) | ✅ verificado | No modifica el instalador NSIS |
| Paquete generado | ✅ verificado | `release/RESALEVAULT-Store-0.5.0.appx` (168.801.405 bytes, 21/10/2026) |
| Paquete **sin firmar a propósito** | ✅ verificado | electron-builder: `AppX is not signed, reason=Windows Store only build` (lo firma la Store) |
| Manifiesto interior | ✅ verificado | Inspeccionado del `.appx`: identidad `RESALEVAULT` / `CN=RESALEVAULT`, versión `0.5.0.0` (4 componentes, requisito MSIX), protocolo **`rv-media` declarado con `uap:Protocol`**, idiomas en-US + es-ES, capacidad `runFullTrust` |

### Qué **no** se ha verificado (y no se afirma)

- **No se ha creado la cuenta de Partner Center** (requiere DNI + selfie: es un
  trámite personal).
- **No se ha enviado el paquete a la Store**; por tanto, no hay resultado de su
  validación (WACK) ni aprobación. La alegación «la Store re-firma el paquete»
  está documentada por Microsoft pero **se comprobará al enviar**.
- **No se ha instalado el `.appx` en este equipo**: requiere confiar en el
  certificado o modo desarrollador, y esta máquina impone nivel de firma
  Enterprise (mismo bloqueo descrito en `docs/FIRMA.md` §9). La prueba real se
  hace tras la publicación en la Store o en una máquina limpia.

### Pasos pendientes (tu trámite + documentación)

Checklist completo y verificación del `publisher` dentro del `.appx`:
`docs/release/ENVIO_STORE.md`. Capturas (resoluciones y pantallas concretas):
`docs/release/CAPTURAS.md`. Textos de la ficha: `docs/release/STORE_LISTING.md`.

1. Crear la cuenta en `storedeveloper.microsoft.com` (gratis, con verificación
   de identidad).
2. **Anotar el `Publisher` exacto** de la cuenta (formato `CN=...`) y
   reemplazar el marcador en `electron-builder.appx.yml`:
   ```yaml
   appx:
     publisher: CN=TU-IDENTIFICADOR-DE-PARTNER-CENTER   # debe coincidir exactamente
   ```
   y regenerar con `npm run dist:appx`.
3. Crear el plan de publicación (App reservations) con el nombre elegido; usar
   ese nombre como `identityName` si difiere de `RESALEVAULT`.
4. Enviar el `.appx` + capturas + descripción + **política de privacidad**
   (la propia de la app: `docs/PRIVACIDAD.md`; puede alojarse gratis en GitHub).
5. Documentar los resultados reales de la validación de la Store antes de
   dar la ruta por publicada.

### Compatibilidad preservada (analizada, no supuesta)

- **Electron en la Store tiene precedentes** (VS Code se distribuye allí como
  paquete de escritorio).
- **Sin módulos nativos** (SQLite va dentro de Electron: `node:sqlite`), por lo
  que no hay problema de compilación en el contenedor.
- **Los datos del usuario** quedan en el `%APPDATA%` virtualizado del paquete:
  la app funciona igual, pero cambia la ruta física; documentarlo para copias
  de seguridad manuales (ver «Riesgos»).
- **El protocolo `rv-media://`** queda declarado en el manifiesto (verificado
  arriba).
- **La actualización** de un paquete de la Store la gestiona Microsoft; esta app
  no tiene auto-update, así que nada cambia, pero un paquete sideloaded
  requeriría un paquete nuevo firmado.

---

## Plan de pruebas en máquina limpia (común a ambas rutas)

Kit ya preparado: `scripts/verify-install.ps1` (instrucciones en
`docs/FIRMA.md` §10). Resumen:

1. VM limpia (VirtualBox + ISO de evaluación oficial de Windows 11) **con Smart
   App Control y todas las protecciones activas** (no se tocan).
2. **Ruta A**: `winget install RESALEVAULT.RESALEVAULT` o instalador manual.
3. **Ruta B**: instalar el paquete publicado desde la Store.
4. Comprobar: instalación → arranque → crear datos → persistencia tras reinicio →
   actualización sobre instalación previa → desinstalación **conservando los
   datos**.
5. Registrar: mensajes de error, estado de firma (`Get-AuthenticodeSignature`),
   resultado del kit (`RESULTADO: TODO CORRECTO`).

Diferencia explícita: una **instalación satisfactoria** en una VM no equivale a
**validación completa de compatibilidad** (que exigiría más versiones de
Windows y arquitecturas). Se informará de cada nivel por separado.

---

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| La validación de winget puede marcarse si algún antivirus detecta algo | Defender limpio hoy; si se marca, se tramita revisión con evidencia |
| El `publisher` del `.appx` debe coincidir con Partner Center exactamente | Marcador documentado; paso 2 de la ruta B |
| Los motores de la Store (WACK) podrían exigir cambios | No se afirma aprobación hasta tener el resultado |
| `%APPDATA%` virtualizado en MSIX cambia la ruta física de los datos | Documentado; la app usa `app.getPath('userData')`, siempre resuelto por el sistema |
| winget/Store son canales de terceros; sus políticas pueden cambiar | Las dos rutas son voluntarias; el release en GitHub siempre queda como canal propio |

---

## Comandos de referencia

```powershell
npm run dist              # instalador NSIS (ruta A)
npm run dist:appx         # paquete AppX/MSIX (ruta B)
npm run winget:manifests -- --url <url-del-release> [--repo propietario/RESALEVAULT]
winget validate --manifest dist-winget\RESALEVAULT\RESALEVAULT\<version>
```
