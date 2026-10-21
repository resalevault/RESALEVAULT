# RESALEVAULT â€” CompilaciÃ³n e instalaciÃ³n en Windows

---

## 1. Requisitos

| Requisito | VersiÃ³n | ComprobaciÃ³n |
|---|---|---|
| Node.js | â‰¥ 22.12 | `node --version` (probado con 24.21 y con Electron 44: Node 24.22) |
| npm | â‰¥ 10 | `npm --version` |
| Windows | 10/11 x64 | `win32` |
| Visual Studio Build Tools | **NO hacen falta** | no hay mÃ³dulos nativos |

> **No se usa `better-sqlite3` ni ningÃºn mÃ³dulo nativo con compilador C++.** La
> base de datos es `node:sqlite`, incluida en el runtime de Electron. Por eso
> el entorno de compilaciÃ³n no necesita Build Tools ni Python.

---

## 2. Compilar para desarrollo

```powershell
npm ci          # instalaciÃ³n reproducible desde package-lock.json
npm run dev     # arranca en modo desarrollo con recarga
```

## 3. Verificar antes de publicar

```powershell
npm run typecheck     # 0 errores
npm test              # 509 pruebas
npm run lint          # ESLint, 0 problemas
npm run smoke         # 66 comprobaciones de datos (70 en la maquina de emision)
npm run smoke:ui      # 65 comprobaciones con Electron real
npm run doctor        # entorno y node:sqlite
npm run build         # compilaciÃ³n de los tres procesos
```

`npm run bench` genera el banco de pruebas con 50.000 artÃ­culos
(ver `docs/TEST-REPORT.md`).

> **Nota sobre el nÃºmero del humo.** `npm run smoke` da **66** comprobaciones en
> un clon limpio. Da **70** solo si existe la clave privada de emisiÃ³n
> (`tools/keys/license-private.pem`, que **no se versiona**): sus 4 comprobaciones
> extra firman y validan una licencia de prueba. Si te salen 66, es lo correcto.

---

## 4. Generar el instalador

```powershell
npm run dist
```

Sale en `release/`:

- `RESALEVAULT-Setup-<versiÃ³n>.exe` â€” instalador NSIS
- `win-unpacked/` â€” versiÃ³n sin instalar (Ãºtil para probar)

La instalaciÃ³n **no requiere administrador**: es por usuario
(`perMachine: false`). El desinstalador **conserva** `%APPDATA%\RESALEVAULT`
por diseÃ±o (`deleteAppDataOnUninstall: false`): desinstalar no borra el
inventario.

## 5. Firma (recomendada)

```powershell
npm run sign:setup    # crea un certificado autofirmado de desarrollo (gratis)
npm run dist:signed   # compila, firma y verifica
```

Ver `docs/FIRMA.md`. Resumen: el autofirmado **no** elimina los avisos de
Windows ni el bloqueo de Device Guard. Para distribuciÃ³n pÃºblica hace falta un
certificado OV/IV.

## 6. Verificar la integridad de un instalador recibido

```powershell
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
Get-AuthenticodeSignature .\RESALEVAULT-Setup-0.5.0.exe | Format-List Status, StatusMessage
```

El SHA-256 se publica junto a cada instalador.

---

## 7. QuÃ© se incluye y quÃ© no

### Se incluye

- CompilaciÃ³n de los tres procesos (`out/main`, `out/preload`, `out/renderer`)
- `zod` y `bwip-js` (dependencias de producciÃ³n)
- `THIRD-PARTY-NOTICES.md` en `resources/`
- Licencias de Electron/Chromium generadas por electron-builder

### NO se incluye

| QuÃ© | Por quÃ© |
|---|---|
| `node_modules` de desarrollo | no son parte del programa |
| `tools/keys/license-private.pem` | **clave privada de licencias** |
| `tools/signing/*.pfx` | **clave privada de firma** |
| Fuentes `.ts` / `.map` | excluidos en `electron-builder.yml` |
| Datos de usuario | viven en `%APPDATA%`, nunca en el paquete |
| `scripts/`, `docs/`, `tests/` | no se empaquetan |

---

## 8. Errores habituales de compilaciÃ³n

| Error | Causa real | SoluciÃ³n |
|---|---|---|
| `Cannot create symbolic link â€¦ winCodeSign` | Windows sin privilegio de creaciÃ³n de enlaces simbÃ³licos | Es cosmÃ©tico al extraer la cachÃ©; **la firma sigue funcionando** |
| `Cannot find module 'node:sqlite'` | Electron anterior a 40 | usar la versiÃ³n de `package-lock.json` |
| SmartScreen / Device Guard bloquea el instalador | Sin certificado de confianza pÃºblica | ver `docs/FIRMA.md` |
| `EACCES` al escribir en `release/` | proceso anterior bloqueando la carpeta | cerrar instaladores abiertos |

---

## 9. InstalaciÃ³n manual en un equipo propio (sin CA pÃºblica)

Solo en equipos que tÃº controles. Ver secciÃ³n 4 de `docs/FIRMA.md`: importar el
`.cer` en `Cert:\LocalMachine\Root`. **Nunca pidas esto a un cliente.**
