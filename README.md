# RESALEVAULT

**EVERY ITEM. EVERY PROFIT.**

Aplicación de escritorio para Windows pensada para quien **compra y revende**:
inventario, compras, pedidos, márgenes reales, etiquetas e informes. Funciona
**sin conexión** y tus datos se quedan en tu equipo.

- **Versión:** 0.5.0
- **Plataforma:** Windows 10 / 11 (x64). macOS: preparado, sin binario todavía.
- **Idiomas:** español e inglés.
- **Coste del proyecto: 0 €.** Ningún servicio de pago contratado.

---

## Qué hace

- **Inventario** con fotos, estado, categoría, ubicación, etiquetas y SKU con
  dígito de control.
- **Compras** con reparto de costes y **pedidos con beneficio neto**
  (comisión, envío, descuentos y devoluciones incluidos).
- **Preparación de pedidos** agrupada por ubicación y con escaneo de
  comprobación.
- **Etiquetas** imprimibles: códigos de barras (Code128, 39, EAN-13, DataMatrix)
  y QR.
- **Informes financieros**: beneficio por periodo, canal y categoría; análisis de
  antigüedad y de margen.
- **Inteligencia local**: 12 reglas que avisan de artículos parados, margen bajo
  o precios mejorables. Sin IA y sin conexión.
- **AI Studio (opcional)**: redacción de anuncios con **tu propia clave** de
  Gemini, OpenAI o Anthropic. La clave se guarda en el almacén cifrado del
  sistema, nunca en la base de datos.
- **Shipping Tracker**: directorio de transportistas y seguimiento en un
  navegador integrado y aislado. Sin *scraping*.
- **Copias de seguridad** en ZIP, con restauración en dos fases y conservación
  de la base anterior.
- **Importación / exportación CSV**.
- **Licencias y planes** con los límites aplicados de verdad en el proceso
  principal. **Si una licencia caduca, tus datos no se borran.**

Detalle de funciones por plan: [`docs/FREE-VS-PRO-VS-BUSINESS.md`](docs/FREE-VS-PRO-VS-BUSINESS.md).

---

## Privacidad en una frase

**Tus datos son tuyos y se quedan en tu equipo.** No hay telemetría, ni
analíticas, ni publicidad. La única conexión en segundo plano es la comprobación
del puesto de licencia, y solo si activas una licencia; **nunca bloquea la
aplicación** y **nunca envía** tu inventario, pedidos ni clientes.

Política completa: [`PRIVACY.md`](PRIVACY.md).

---

## Descargar e instalar

Las descargas están en la página de **Releases** de este repositorio.

> **Aviso honesto sobre la firma:** el instalador **no está firmado por una
> autoridad de certificación de confianza**. Windows puede mostrar «editor
> desconocido» o un aviso de SmartScreen. El proyecto publica el **hash
> SHA-256** de cada artefacto para que puedas comprobar la integridad:
>
> ```powershell
> Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
> ```
>
> **No hay que desactivar ninguna protección de Windows para instalarlo**, ni
> este proyecto lo recomienda.

También está previsto publicarlo en la **Microsoft Store** (paquete `.appx`
listo); mientras tanto, el instalador de Releases es la vía disponible.

---

## Dónde se guardan los datos

```
%APPDATA%\RESALEVAULT\
├── data\resalevault.sqlite    Base de datos SQLite (+ WAL)
├── media\                     Fotos y documentos originales
├── thumbs\                    Miniaturas (los originales no se tocan)
├── backups\                   Copias de seguridad .zip
└── logs\resalevault.log       Registro de diagnóstico
```

- Nada se escribe en la carpeta de instalación: actualizar la app **no toca tu
  inventario**.
- El inventario funciona **completo sin conexión**.
- El desinstalador **no borra** tus datos; si quieres eliminarlos, borra esa
  carpeta tú mismo.

Cómo hacer copias y recuperar: [`docs/RECUPERACION.md`](docs/RECUPERACION.md).

---

## Calidad y verificación

Todo lo que se afirma aquí se ha **ejecutado**, no se ha supuesto:

| Comprobación | Resultado |
|---|---|
| Pruebas unitarias (`npm test`) | **509 / 509** (39 archivos) |
| Cobertura de líneas | **88,66 %** |
| Prueba de humo de datos en Electron real | **70 / 70** (66 en un clon limpio, ver nota) |
| Prueba de humo de interfaz en Electron real | **65 / 65** |
| `typecheck` / `lint` | 0 errores · 0 avisos |
| Banco de pruebas (`npm run bench`) | 50.000 artículos + 1.000 pedidos |
| Validador oficial de manifiestos (`winget validate`) | «Manifest validation succeeded.» |

### Qué **no** está verificado (y no se afirma)

- **La instalación de extremo a extremo** en un equipo limpio: el equipo de
  desarrollo la bloquea por política de firma. Kit de verificación incluido en
  `Windows/verify-install.ps1` de la entrega.
- **El resultado de la Microsoft Store**: el paquete está listo, pero no se ha
  enviado ni validado.
- **macOS**: no hay binario. Se publicará cuando se pueda compilar y firmar en un
  Mac.

---

## Seguridad aplicada

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **No existe un `invoke` genérico**: la interfaz solo puede llamar a los
  **158 canales** declarados, cada uno con su validación en el proceso principal.
- Solo la ventana principal puede invocar IPC.
- CSP estricta, por cabecera y por `<meta>`.
- Navegación y ventanas nuevas bloqueadas; enlaces externos solo `https`.
- SQL siempre parametrizado.
- Los errores cruzan el puente como **código**, sin rutas ni SQL.
- El registro redacta cualquier campo que parezca una credencial.
- **Los límites de plan se comprueban en el proceso principal**, no solo
  ocultando botones.
- El navegador de transportistas va sin preload, sin Node, solo HTTPS, con
  emergentes, descargas y permisos bloqueados.

---

## Desarrollo

### Requisitos

| Requisito | Versión |
|---|---|
| Windows | 10 / 11 |
| Node.js | **22.12 o superior** (probado con 24.22) |
| npm | 10 o superior |
| Compilador de C++ / Python | **no hacen falta** |

RESALEVAULT usa `node:sqlite` (el SQLite integrado en Node 24, que Electron 44
incorpora). **No hay módulos nativos que compilar**: no necesita Visual Studio,
ni Python, ni node-gyp.

### Puesta en marcha

```powershell
npm install
npm run dev      # abre la aplicación con recarga en caliente
```

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run build` | Compila proceso principal, preload e interfaz en `out/`. |
| `npm run typecheck` | Comprueba los tipos (Node y navegador). |
| `npm test` | Batería de pruebas (**509**). |
| `npm run test:coverage` | Pruebas + cobertura (88,66 % de líneas). |
| `npm run lint` | ESLint sobre todo el proyecto. |
| `npm run verify` | `typecheck` + `test`. |
| `npm run smoke` | Prueba de humo de datos dentro de Electron real. |
| `npm run smoke:ui` | Prueba de humo de la interfaz dentro de Electron real. |
| `npm run bench` | Rendimiento con 50.000 artículos. |
| `npm run dist` / `npm run dist:signed` | Instalador NSIS (opcionalmente firmado). |
| `npm run dist:appx` | Paquete AppX/MSIX para la Store. |
| `npm run winget:manifests` | Manifiestos de winget para el repositorio comunitario. |
| `npm run publish:github` | Publica la release en GitHub (simula por defecto; `--print-notes` muestra el texto; `--confirm` ejecuta). |

---

## Estructura del proyecto

```
src/
├── main/                  Proceso principal (Node)
│   ├── ipc/               Canales IPC + validación + control de origen
│   ├── db/                SQLite, migraciones versionadas, repositorios
│   └── services/          ajustes, copias, licencias, finanzas, IA, medios…
├── preload/index.ts       Puente contextBridge (158 canales concretos)
├── shared/                Tipos, esquemas zod, CSP, SKU, planes, formatos
└── renderer/src/          Interfaz React (español / inglés)
tests/                     509 pruebas automatizadas
scripts/                   doctor, humo, banco, empaquetado, licencias, winget
docs/                      estado, manual, pruebas, firma, licencias, privacidad
```

**Base de datos:** 37 tablas, esquema **v5**, claves foráneas activas y WAL.
Todo el dinero en **céntimos enteros**, fechas en ISO-8601 y ids UUID v4.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | Estado real: qué funciona y qué no |
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) | Guía de uso |
| [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md) | Pruebas, cobertura y rendimiento |
| [`docs/FREE-VS-PRO-VS-BUSINESS.md`](docs/FREE-VS-PRO-VS-BUSINESS.md) | Comparativa de planes |
| [`docs/FIRMA.md`](docs/FIRMA.md) | Firma de código y límites de Windows |
| [`docs/DISTRIBUCION.md`](docs/DISTRIBUCION.md) | Distribución gratuita (winget y Store) |
| [`docs/LICENCIAS.md`](docs/LICENCIAS.md) | Sistema de licencias |
| [`PRIVACY.md`](PRIVACY.md) | Política de privacidad pública |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Historial de versiones |
| [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Licencias de terceros (generado) |

---

## Costes

| Concepto | Coste real |
|---|---|
| Desarrollo y uso local | **0 €** |
| Herramientas (Git, ESLint, cobertura, CI, electron-builder) | **0 €** |
| Certificado de firma **autofirmado** | **0 €** |
| Certificado de firma **de confianza pública** (OV/IV) | 150–300 €/año (opcional) |
| Backend de licencias (Supabase) | 0 € (plan gratuito) |
| APIs de IA | las paga el usuario con su propia clave |

**Gasto real hasta la fecha: 0 €.** No se promete coste cero indefinido en los
servicios en línea.

---

## Licencia

Software **propietario**. Todos los derechos reservados.

Las licencias de los componentes de terceros distribuidas con el programa están
en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
