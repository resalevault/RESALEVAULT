# RESALEVAULT — Compilación e instalación en Windows

---

## 1. Requisitos

| Requisito | Versión | Comprobación |
|---|---|---|
| Node.js | ≥ 22.12 | `node --version` (probado con 24.21 y con Electron 44: Node 24.22) |
| npm | ≥ 10 | `npm --version` |
| Windows | 10/11 x64 | `win32` |
| Visual Studio Build Tools | **NO hacen falta** | no hay módulos nativos |

> **No se usa `better-sqlite3` ni ningún módulo nativo con compilador C++.** La
> base de datos es `node:sqlite`, incluida en el runtime de Electron. Por eso
> el entorno de compilación no necesita Build Tools ni Python.

---

## 2. Compilar para desarrollo

```powershell
npm ci          # instalación reproducible desde package-lock.json
npm run dev     # arranca en modo desarrollo con recarga
```

## 3. Verificar antes de publicar

```powershell
npm run typecheck     # 0 errores
npm test              # 384 pruebas
npm run lint          # ESLint, 0 problemas
npm run smoke         # 70 comprobaciones de datos
npm run smoke:ui      # 54 comprobaciones con Electron real
npm run doctor        # entorno y node:sqlite
npm run build         # compilación de los tres procesos
```

`npm run bench` genera el banco de pruebas con 50.000 artículos
(ver `docs/TEST-REPORT.md`).

---

## 4. Generar el instalador

```powershell
npm run dist
```

Sale en `release/`:

- `RESALEVAULT-Setup-<versión>.exe` — instalador NSIS
- `win-unpacked/` — versión sin instalar (útil para probar)

La instalación **no requiere administrador**: es por usuario
(`perMachine: false`). El desinstalador **conserva** `%APPDATA%\RESALEVAULT`
por diseño (`deleteAppDataOnUninstall: false`): desinstalar no borra el
inventario.

## 5. Firma (recomendada)

```powershell
npm run sign:setup    # crea un certificado autofirmado de desarrollo (gratis)
npm run dist:signed   # compila, firma y verifica
```

Ver `docs/FIRMA.md`. Resumen: el autofirmado **no** elimina los avisos de
Windows ni el bloqueo de Device Guard. Para distribución pública hace falta un
certificado OV/IV.

## 6. Verificar la integridad de un instalador recibido

```powershell
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
Get-AuthenticodeSignature .\RESALEVAULT-Setup-0.5.0.exe | Format-List Status, StatusMessage
```

El SHA-256 se publica junto a cada instalador.

---

## 7. Qué se incluye y qué no

### Se incluye

- Compilación de los tres procesos (`out/main`, `out/preload`, `out/renderer`)
- `zod` y `bwip-js` (dependencias de producción)
- `THIRD-PARTY-NOTICES.md` en `resources/`
- Licencias de Electron/Chromium generadas por electron-builder

### NO se incluye

| Qué | Por qué |
|---|---|
| `node_modules` de desarrollo | no son parte del programa |
| `tools/keys/license-private.pem` | **clave privada de licencias** |
| `tools/signing/*.pfx` | **clave privada de firma** |
| Fuentes `.ts` / `.map` | excluidos en `electron-builder.yml` |
| Datos de usuario | viven en `%APPDATA%`, nunca en el paquete |
| `scripts/`, `docs/`, `tests/` | no se empaquetan |

---

## 8. Errores habituales de compilación

| Error | Causa real | Solución |
|---|---|---|
| `Cannot create symbolic link … winCodeSign` | Windows sin privilegio de creación de enlaces simbólicos | Es cosmético al extraer la caché; **la firma sigue funcionando** |
| `Cannot find module 'node:sqlite'` | Electron anterior a 40 | usar la versión de `package-lock.json` |
| SmartScreen / Device Guard bloquea el instalador | Sin certificado de confianza pública | ver `docs/FIRMA.md` |
| `EACCES` al escribir en `release/` | proceso anterior bloqueando la carpeta | cerrar instaladores abiertos |

---

## 9. Instalación manual en un equipo propio (sin CA pública)

Solo en equipos que tú controles. Ver sección 4 de `docs/FIRMA.md`: importar el
`.cer` en `Cert:\LocalMachine\Root`. **Nunca pidas esto a un cliente.**
