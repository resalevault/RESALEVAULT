# RESALEVAULT

**EVERY ITEM. EVERY PROFIT.**

AplicaciÃ³n de escritorio para Windows pensada para quien **compra y revende**:
inventario, compras, pedidos, mÃ¡rgenes reales, etiquetas e informes. Funciona
**sin conexiÃ³n** y tus datos se quedan en tu equipo.

- **VersiÃ³n:** 0.5.0
- **Plataforma:** Windows 10 / 11 (x64). macOS: preparado, sin binario todavÃ­a.
- **Idiomas:** espaÃ±ol e inglÃ©s.
- **Coste del proyecto: 0 â‚¬.** NingÃºn servicio de pago contratado.

---

## QuÃ© hace

- **Inventario** con fotos, estado, categorÃ­a, ubicaciÃ³n, etiquetas y SKU con
  dÃ­gito de control.
- **Compras** con reparto de costes y **pedidos con beneficio neto**
  (comisiÃ³n, envÃ­o, descuentos y devoluciones incluidos).
- **PreparaciÃ³n de pedidos** agrupada por ubicaciÃ³n y con escaneo de
  comprobaciÃ³n.
- **Etiquetas** imprimibles: cÃ³digos de barras (Code128, 39, EAN-13, DataMatrix)
  y QR.
- **Informes financieros**: beneficio por periodo, canal y categorÃ­a; anÃ¡lisis de
  antigÃ¼edad y de margen.
- **Inteligencia local**: 12 reglas que avisan de artÃ­culos parados, margen bajo
  o precios mejorables. Sin IA y sin conexiÃ³n.
- **AI Studio (opcional)**: redacciÃ³n de anuncios con **tu propia clave** de
  Gemini, OpenAI o Anthropic. La clave se guarda en el almacÃ©n cifrado del
  sistema, nunca en la base de datos.
- **Shipping Tracker**: directorio de transportistas y seguimiento en un
  navegador integrado y aislado. Sin *scraping*.
- **Copias de seguridad** en ZIP, con restauraciÃ³n en dos fases y conservaciÃ³n
  de la base anterior.
- **ImportaciÃ³n / exportaciÃ³n CSV**.
- **Licencias y planes** con los lÃ­mites aplicados de verdad en el proceso
  principal. **Si una licencia caduca, tus datos no se borran.**

Detalle de funciones por plan: [`docs/FREE-VS-PRO-VS-BUSINESS.md`](docs/FREE-VS-PRO-VS-BUSINESS.md).

---

## Privacidad en una frase

**Tus datos son tuyos y se quedan en tu equipo.** No hay telemetrÃ­a, ni
analÃ­ticas, ni publicidad. La Ãºnica conexiÃ³n en segundo plano es la comprobaciÃ³n
del puesto de licencia, y solo si activas una licencia; **nunca bloquea la
aplicaciÃ³n** y **nunca envÃ­a** tu inventario, pedidos ni clientes.

PolÃ­tica completa: [`PRIVACY.md`](PRIVACY.md).

---

## Descargar e instalar

Las descargas estÃ¡n en la pÃ¡gina de **Releases** de este repositorio.

> **Aviso honesto sobre la firma:** el instalador **no estÃ¡ firmado por una
> autoridad de certificaciÃ³n de confianza**. Windows puede mostrar Â«editor
> desconocidoÂ» o un aviso de SmartScreen. El proyecto publica el **hash
> SHA-256** de cada artefacto para que puedas comprobar la integridad:
>
> ```powershell
> Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
> ```
>
> **No hay que desactivar ninguna protecciÃ³n de Windows para instalarlo**, ni
> este proyecto lo recomienda.

TambiÃ©n estÃ¡ previsto publicarlo en la **Microsoft Store** (paquete `.appx`
listo); mientras tanto, el instalador de Releases es la vÃ­a disponible.

---

## DÃ³nde se guardan los datos

```
%APPDATA%\RESALEVAULT\
â”œâ”€â”€ data\resalevault.sqlite    Base de datos SQLite (+ WAL)
â”œâ”€â”€ media\                     Fotos y documentos originales
â”œâ”€â”€ thumbs\                    Miniaturas (los originales no se tocan)
â”œâ”€â”€ backups\                   Copias de seguridad .zip
â””â”€â”€ logs\resalevault.log       Registro de diagnÃ³stico
```

- Nada se escribe en la carpeta de instalaciÃ³n: actualizar la app **no toca tu
  inventario**.
- El inventario funciona **completo sin conexiÃ³n**.
- El desinstalador **no borra** tus datos; si quieres eliminarlos, borra esa
  carpeta tÃº mismo.

CÃ³mo hacer copias y recuperar: [`docs/RECUPERACION.md`](docs/RECUPERACION.md).

---

## Calidad y verificaciÃ³n

Todo lo que se afirma aquÃ­ se ha **ejecutado**, no se ha supuesto:

| ComprobaciÃ³n | Resultado |
|---|---|
| Pruebas unitarias (`npm test`) | **509 / 509** (39 archivos) |
| Cobertura de lÃ­neas | **88,66 %** |
| Prueba de humo de datos en Electron real | **70 / 70** (66 en un clon limpio, ver nota) |
| Prueba de humo de interfaz en Electron real | **65 / 65** |
| `typecheck` / `lint` | 0 errores Â· 0 avisos |
| Banco de pruebas (`npm run bench`) | 50.000 artÃ­culos + 1.000 pedidos |
| Validador oficial de manifiestos (`winget validate`) | Â«Manifest validation succeeded.Â» |

### QuÃ© **no** estÃ¡ verificado (y no se afirma)

- **La instalaciÃ³n de extremo a extremo** en un equipo limpio: el equipo de
  desarrollo la bloquea por polÃ­tica de firma. Kit de verificaciÃ³n incluido en
  `Windows/verify-install.ps1` de la entrega.
- **El resultado de la Microsoft Store**: el paquete estÃ¡ listo, pero no se ha
  enviado ni validado.
- **macOS**: no hay binario. Se publicarÃ¡ cuando se pueda compilar y firmar en un
  Mac.

---

## Seguridad aplicada

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **No existe un `invoke` genÃ©rico**: la interfaz solo puede llamar a los
  **158 canales** declarados, cada uno con su validaciÃ³n en el proceso principal.
- Solo la ventana principal puede invocar IPC.
- CSP estricta, por cabecera y por `<meta>`.
- NavegaciÃ³n y ventanas nuevas bloqueadas; enlaces externos solo `https`.
- SQL siempre parametrizado.
- Los errores cruzan el puente como **cÃ³digo**, sin rutas ni SQL.
- El registro redacta cualquier campo que parezca una credencial.
- **Los lÃ­mites de plan se comprueban en el proceso principal**, no solo
  ocultando botones.
- El navegador de transportistas va sin preload, sin Node, solo HTTPS, con
  emergentes, descargas y permisos bloqueados.

---

## Desarrollo

### Requisitos

| Requisito | VersiÃ³n |
|---|---|
| Windows | 10 / 11 |
| Node.js | **22.12 o superior** (probado con 24.22) |
| npm | 10 o superior |
| Compilador de C++ / Python | **no hacen falta** |

RESALEVAULT usa `node:sqlite` (el SQLite integrado en Node 24, que Electron 44
incorpora). **No hay mÃ³dulos nativos que compilar**: no necesita Visual Studio,
ni Python, ni node-gyp.

### Puesta en marcha

```powershell
npm install
npm run dev      # abre la aplicaciÃ³n con recarga en caliente
```

### Comandos Ãºtiles

| Comando | QuÃ© hace |
|---|---|
| `npm run build` | Compila proceso principal, preload e interfaz en `out/`. |
| `npm run typecheck` | Comprueba los tipos (Node y navegador). |
| `npm test` | BaterÃ­a de pruebas (**509**). |
| `npm run test:coverage` | Pruebas + cobertura (88,66 % de lÃ­neas). |
| `npm run lint` | ESLint sobre todo el proyecto. |
| `npm run verify` | `typecheck` + `test`. |
| `npm run smoke` | Prueba de humo de datos dentro de Electron real. |
| `npm run smoke:ui` | Prueba de humo de la interfaz dentro de Electron real. |
| `npm run bench` | Rendimiento con 50.000 artÃ­culos. |
| `npm run dist` / `npm run dist:signed` | Instalador NSIS (opcionalmente firmado). |
| `npm run dist:appx` | Paquete AppX/MSIX para la Store. |
| `npm run winget:manifests` | Manifiestos de winget para el repositorio comunitario. |
| `npm run publish:github` | Publica la release en GitHub (simula por defecto; `--print-notes` muestra el texto; `--confirm` ejecuta). |

---

## Estructura del proyecto

```
src/
â”œâ”€â”€ main/                  Proceso principal (Node)
â”‚   â”œâ”€â”€ ipc/               Canales IPC + validaciÃ³n + control de origen
â”‚   â”œâ”€â”€ db/                SQLite, migraciones versionadas, repositorios
â”‚   â””â”€â”€ services/          ajustes, copias, licencias, finanzas, IA, mediosâ€¦
â”œâ”€â”€ preload/index.ts       Puente contextBridge (158 canales concretos)
â”œâ”€â”€ shared/                Tipos, esquemas zod, CSP, SKU, planes, formatos
â””â”€â”€ renderer/src/          Interfaz React (espaÃ±ol / inglÃ©s)
tests/                     509 pruebas automatizadas
scripts/                   doctor, humo, banco, empaquetado, licencias, winget
docs/                      estado, manual, pruebas, firma, licencias, privacidad
```

**Base de datos:** 37 tablas, esquema **v5**, claves forÃ¡neas activas y WAL.
Todo el dinero en **cÃ©ntimos enteros**, fechas en ISO-8601 y ids UUID v4.

---

## DocumentaciÃ³n

| Documento | Contenido |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | Estado real: quÃ© funciona y quÃ© no |
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) | GuÃ­a de uso |
| [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md) | Pruebas, cobertura y rendimiento |
| [`docs/FREE-VS-PRO-VS-BUSINESS.md`](docs/FREE-VS-PRO-VS-BUSINESS.md) | Comparativa de planes |
| [`docs/FIRMA.md`](docs/FIRMA.md) | Firma de cÃ³digo y lÃ­mites de Windows |
| [`docs/DISTRIBUCION.md`](docs/DISTRIBUCION.md) | DistribuciÃ³n gratuita (winget y Store) |
| [`docs/LICENCIAS.md`](docs/LICENCIAS.md) | Sistema de licencias |
| [`PRIVACY.md`](PRIVACY.md) | PolÃ­tica de privacidad pÃºblica |
| [`TERMS.md`](TERMS.md) | TÃ©rminos de servicio / EULA (borrador, revÃ­salo) |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Historial de versiones |
| [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Licencias de terceros (generado) |

---

## Costes

| Concepto | Coste real |
|---|---|
| Desarrollo y uso local | **0 â‚¬** |
| Herramientas (Git, ESLint, cobertura, CI, electron-builder) | **0 â‚¬** |
| Certificado de firma **autofirmado** | **0 â‚¬** |
| Certificado de firma **de confianza pÃºblica** (OV/IV) | 150â€“300 â‚¬/aÃ±o (opcional) |
| Backend de licencias (Supabase) | 0 â‚¬ (plan gratuito) |
| APIs de IA | las paga el usuario con su propia clave |

**Gasto real hasta la fecha: 0 â‚¬.** No se promete coste cero indefinido en los
servicios en lÃ­nea.

---

## Licencia

Software **propietario**. Todos los derechos reservados.

Las licencias de los componentes de terceros distribuidas con el programa estÃ¡n
en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
