# RESALEVAULT — Publicación Ruta A (GitHub Releases + winget)

Guía de ejecución **paso a paso**, con lo que ya está hecho marcado como tal.
Todo lo que dice «verificado» se ha ejecutado en este equipo.

> Estado actual: **los manifiestos están validados con el validador oficial de
> Microsoft** y listos para el PR. Falta crear la cuenta/repositorio de GitHub y
> publicar la release (requiere tu cuenta: no puedo crearla ni publicar por ti).

---

## 0. Qué está hecho y verificado

| Paso | Estado | Evidencia |
|---|---|---|
| Generador de manifiestos con esquema **1.12.0** (recomendado por la plantilla de PR) | ✅ verificado | 13 pruebas (`tests/winget-manifests.test.ts`) |
| Cabecera `# yaml-language-server: $schema=…` en los tres ficheros | ✅ verificado | Formato `https://aka.ms/winget-manifest.<tipo>.1.12.0.schema.json` |
| Manifiestos v0.5.0 generados | ✅ verificado | `dist-winget/RESALEVAULT/RESALEVAULT/0.5.0/` |
| `InstallerSha256` = hash del instalador real | ✅ verificado | `39DE1695…DB7C4B51` |
| Validación con el validador oficial | ✅ verificado | `winget validate` → **«Manifest validation succeeded.»** (21/10/2026, sin avisos) |

**Errores de esquema corregidos** (los cazó el validador oficial, no se
ocultaron): faltaba `PackageName`; URL y hash iban en la raíz en vez de dentro de
`Installers`; el esquema `1.6.0` estaba obsoleto; faltaba la cabecera
`yaml-language-server`; y la URL de esa cabecera usaba el formato largo en lugar
del acortador `aka.ms`. Todo corregido y cubierto con pruebas.

---

## 1. Crear el repositorio y subir el código (tu cuenta)

```powershell
# Requiere haber iniciado sesión en GitHub en tu equipo.
git remote add origin https://github.com/16ray/RESALEVAULT.git
git push -u origin master
```

> Si el repositorio se llama distinto, ajusta `--repo` y la URL en el paso 3.

---

## 2. Publicar la Release v0.5.0 (tu cuenta)

1. Adjunta **`release/RESALEVAULT-Setup-0.5.0.exe`**.
2. Adjunta un fichero **`SHA256SUMS.txt`** con esta línea:
   ```
   39de1695e34c7b0d262864a6f8b545a0e6955239a381e30d97083999db7c4b51  RESALEVAULT-Setup-0.5.0.exe
   ```
   (La copia de la carpeta de entrega ya lo tiene.)
3. Pega el cuerpo del release desde `docs/release/STORE_LISTING.md` §2.

La URL resultante debe ser exactamente:

```
https://github.com/16ray/RESALEVAULT/releases/download/v0.5.0/RESALEVAULT-Setup-0.5.0.exe
```

Es la que ya está escrita en los manifiestos. Si la release queda en otro sitio,
regenera los manifiestos:

```powershell
npm run winget:manifests -- --url "<URL real>" --repo 16ray/RESALEVAULT
winget validate --manifest ".\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0"
```

---

## 3. Probar la instalación desde el manifiesto (antes del PR)

Requiere **yum/a** conexión. Desde una terminal **no elevada**:

```powershell
winget install --manifest ".\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0"
```

Honestidad: en **este** equipo la instalación está bloqueada por la política de
nivel de firma Enterprise (ver `docs/FIRMA.md` §9), así que **no puedo marcar
esta casilla como verificada aquí**. Hazla en un equipo limpio o en Windows
Sandbox. En la plantilla del PR hay una casilla que exige confirmar esta prueba:
no la marques hasta haberla hecho de verdad.

---

## 4. Abrir el Pull Request (tu cuenta)

1. Haz **fork** de `microsoft/winget-pkgs`.
2. Copia los **tres** YAML a:
   ```
   manifests/r/RESALEVAULT/RESALEVAULT/0.5.0/
   ```
   - `RESALEVAULT.RESALEVAULT.yaml`
   - `RESALEVAULT.RESALEVAULT.en-US.yaml`
   - `RESALEVAULT.RESALEVAULT.installer.yaml`
3. Abre el PR. **Título:**
   ```
   New package: RESALEVAULT.RESALEVAULT version 0.5.0
   ```
   **Cuerpo:** usa `docs/release/WINGET_PR_BODY.md`.

---

## 5. Riesgos conocidos del PR (honestos)

- **`Binary-Validation-Error`**: winget analiza el instalador con varios
  antivirus. Hoy Defender no detecta nada, pero **no se garantiza** que pase.
  Si hay un falso positivo, se recurre al envío a Microsoft para revisión.
- **`Validation-Domain`**: la URL apunta al release de GitHub del propio autor,
  que es lo que winget exige. No debería dar problema.
- **Firma**: el instalador no está firmado por una CA de confianza. winget no lo
  exige para `.exe`, pero puede aparecer el aviso de SmartScreen al instalar a
  mano. **No se desactiva ninguna protección de Windows.**
- **Empaquetado por el robot**: la validación de winget instala en modo
  silencioso (NSIS `/S`). El instalador está configurado como por usuario
  (`Scope: user`) y NSIS acepta `/S`, así que debería funcionar; se confirmará
  con el resultado real.
