# RESALEVAULT

**EVERY ITEM. EVERY PROFIT.**

Aplicación de escritorio para Windows dirigida a revendedores: inventario,
ubicaciones físicas, compras, pedidos y rentabilidad real.

- **Versión:** 0.5.0
- **Estado:** aplicación funcional con inventario completo, fotografías y
  documentos, importación/exportación CSV, compras con reparto de costes,
  pedidos con **beneficio neto**, devoluciones, preparación de pedidos con
  escaneo, códigos de barras y QR, informes financieros, alertas locales,
  **AI Studio con clave propia (BYOK)**, licencias y planes con **límites
  aplicados de verdad**, **copias de seguridad con restauración**,
  internacionalización (español / inglés) y **Shipping Tracker** con navegador
  integrado aislado.
- **Calidad:** 293 pruebas unitarias · 70 de humo · 54 de interfaz · ESLint sin
  problemas · 72,0 % de cobertura · banco de pruebas con 50.000 artículos ·
  integración continua configurada.
- **Coste real invertido: 0 €.** Instalador firmado con certificado
  **autofirmado** (no elimina los avisos de Windows: ver `docs/FIRMA.md`).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ESTADO.md`](docs/ESTADO.md) | Estado real: qué funciona, qué no y por qué |
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) | Guía de uso para el usuario final |
| [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md) | Pruebas ejecutadas, cobertura y rendimiento medido |
| [`docs/FREE-VS-PRO-VS-BUSINESS.md`](docs/FREE-VS-PRO-VS-BUSINESS.md) | Comparativa de planes |
| [`docs/FIRMA.md`](docs/FIRMA.md) | Firma de código, hashes y limitaciones de Windows |
| [`docs/BUILD-WINDOWS.md`](docs/BUILD-WINDOWS.md) | Compilación e instalación |
| [`docs/LICENCIAS.md`](docs/LICENCIAS.md) | Sistema de licencias y emisión |
| [`docs/PRIVACIDAD.md`](docs/PRIVACIDAD.md) | Qué datos se guardan y a dónde viajan |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Historial de versiones |
| [`docs/RECUPERACION.md`](docs/RECUPERACION.md) | Copias y recuperación |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Diseño interno |
| [`docs/FORMULAS.md`](docs/FORMULAS.md) | Fórmulas de coste y beneficio |
| [`docs/SEGUIMIENTO.md`](docs/SEGUIMIENTO.md) | Shipping Tracker y sus límites |
| [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Licencias de terceros (generado) |

---

## 1. Requisitos

| Requisito | Versión | Comprobado |
|---|---|---|
| Windows | 10 / 11 | sí |
| Node.js | **22.12 o superior** (probado con 24.21) | sí |
| npm | 10 o superior (probado con 11.19) | sí |
| Compilador de C++ | **NO hace falta** | — |
| Python | **NO hace falta** | — |

> RESALEVAULT usa `node:sqlite`, el módulo SQLite integrado en Node 24 (que
> Electron 44 incorpora). No hay módulos nativos que compilar, así que no
> necesita Visual Studio, ni Python, ni node-gyp.

## 2. Instalación

```powershell
cd "C:\Users\16ray\Desktop\RESALEVAULT"
npm install
```

Si la descarga del binario de Electron se interrumpe:

```powershell
node node_modules/electron/install.js
```

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la aplicación en modo desarrollo, con recarga en caliente. |
| `npm run build` | Compila proceso principal, preload e interfaz en `out/`. |
| `npm run doctor` | Diagnóstico del entorno dentro de Electron (versiones, SQLite, escritura). |
| `npm run typecheck` | Comprueba los tipos de todo el proyecto (Node y navegador). |
| `npm test` | Ejecuta la batería de pruebas (**293 pruebas**, 21 archivos). |
| `npm run test:watch` | Pruebas en modo vigilancia. |
| `npm run test:coverage` | Pruebas + cobertura (71,2 % de líneas). |
| `npm run lint` | ESLint sobre todo el proyecto (0 problemas). |
| `npm run verify` | `typecheck` + `test`. Comprobación rápida antes de publicar. |
| `npm run smoke` | Prueba de humo de la capa de datos **dentro de Electron real** (70 comprobaciones). |
| `npm run smoke:ui` | Prueba de humo de la interfaz, con Electron real y navegación (54 comprobaciones). |
| `npm run bench` | Banco de pruebas de rendimiento con **50.000 artículos**. |
| `npm run notices` | Regenera `THIRD-PARTY-NOTICES.md` desde `package-lock.json`. |
| `npm run icon` | Regenera `build/icon.png` (monograma RV) usando Electron. |
| `npm run license:keygen` | **(administración)** genera el par de claves de licencias. |
| `npm run license:new` | **(administración)** emite una licencia firmada. |
| `npm run license:verify` | **(administración)** verifica un código de licencia. |
| `npm run license:list` | **(administración)** registro de emisión + reverifica cada firma. |
| `npm run dist:dir` | Empaqueta sin instalador en `release/win-unpacked/`. **Verificado.** |
| `npm run dist` | Genera el instalador NSIS de Windows en `release/`. **Verificado.** |
| `npm run sign:setup` | Crea un certificado autofirmado de desarrollo (gratuito). |
| `npm run dist:signed` | Compila, **firma** y verifica el instalador, e imprime su SHA-256. |

## 4. Dónde se guardan los datos

```
%APPDATA%\RESALEVAULT\            (en desarrollo: "RESALEVAULT (dev)")
├── data\resalevault.sqlite       Base de datos SQLite (+ archivos WAL)
├── media\                        Fotografías y documentos originales
├── thumbs\                       Miniaturas generadas (los originales no se tocan)
├── backups\                      Copias de seguridad .zip
└── logs\resalevault.log          Registro de diagnóstico
```

Cómo hacer copias y cómo recuperar: [`docs/RECUPERACION.md`](docs/RECUPERACION.md).

- Todo vive en la carpeta de datos del usuario. **Nunca** se escribe en la
  carpeta de instalación, así que actualizar el programa no toca el inventario.
- El inventario funciona completo **sin conexión a Internet**.
- En Ajustes puedes abrir la carpeta de datos con un clic.

## 5. Arquitectura en una imagen

```
┌──────────────────────────────────────────────────────────────────┐
│  RENDERER (React)  —  sin acceso a Node ni al sistema de archivos │
│  Panel · Inventario · Categorías · Ubicaciones · Ajustes          │
└───────────────▲──────────────────────────────────────────────────┘
                │  window.resalevault  (contextBridge, API explícita)
┌───────────────┴──────────────────────────────────────────────────┐
│  PRELOAD  —  único puente; 46 canales concretos, ninguno genérico │
└───────────────▲──────────────────────────────────────────────────┘
                │  IPC con validación zod de cada entrada
┌───────────────┴──────────────────────────────────────────────────┐
│  MAIN (Node)                                                      │
│  ├── ipc/          manejadores + validación + control de origen    │
│  ├── db/           SQLite, migraciones versionadas, repositorios   │
│  ├── services/     ajustes, rutas, log, seguridad, datos de demo   │
│  └── errors.ts     errores por CÓDIGO, no por texto                │
└───────────────▲──────────────────────────────────────────────────┘
                │
        SQLite 3.53 (node:sqlite) + archivos en disco
```

Detalle completo en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## 6. Estructura del proyecto

```
src/
├── main/                      Proceso principal (Node)
│   ├── index.ts               Arranque, instancia única, cierre limpio
│   ├── window.ts              Ventana sin marco + diagnóstico del renderer
│   ├── errors.ts              Errores de dominio con código
│   ├── ipc/                   register.ts + register-modules.ts: 151 canales
│   ├── db/
│   │   ├── database.ts        Conexión, transacciones, caché de sentencias
│   │   ├── migrator.ts        Motor de migraciones versionadas
│   │   ├── migrations/        001 esquema · 002 datos base · 003 comercio · 004 seguimiento
│   │   ├── context.ts         Composición de repositorios
│   │   └── repositories/      products, categories, locations, orders, tracking…
│   └── services/              settings, paths, logger, security, backup, license,
│                              finance, csv-io, intelligence, labels, media, ai,
│                              browser (WebContentsView), demo-data
├── preload/index.ts           Puente contextBridge
├── shared/                    Tipos, esquemas zod, CSP, SKU, formato, planes, transportistas
└── renderer/src/              Interfaz React
    ├── App.tsx                Composición + enrutado
    ├── app.css                Identidad visual completa
    ├── i18n/                  es.ts, en.ts, motor de traducción
    ├── lib/                   api.ts, app-context.tsx, hooks.ts
    ├── components/            Icons, ui, TitleBar, Sidebar, CarrierBadge, PlanGate
    └── pages/                 Dashboard, Inventory, Orders, ShippingTracker, AiStudio…
tests/                         293 pruebas automatizadas (21 archivos)
scripts/                       doctor, pruebas de humo, benchmark, empaquetado, licencias
docs/                          Estado, manual, pruebas, firma, licencias, privacidad…
```

**Base de datos:** 36 tablas, esquema **v4**, claves foráneas activas y WAL.
Todo el dinero en **céntimos enteros**; fechas en ISO-8601; ids UUID v4.

## 7. Seguridad aplicada (resumen)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **No existe un `invoke` genérico**: el renderer solo puede llamar a los **151
  canales** declarados, cada uno con su esquema de validación en el proceso
  principal.
- Solo la ventana principal puede invocar IPC (se comprueba el `webContents`).
- Content-Security-Policy estricta, por cabecera HTTP **y** por etiqueta `<meta>`.
- Navegación y ventanas nuevas bloqueadas; los enlaces externos van al
  navegador del sistema y solo si son `https`.
- Consultas SQL siempre parametrizadas; el texto del usuario nunca se
  concatena en una sentencia.
- Los errores cruzan el puente como **código**, nunca con rutas ni SQL.
- El registro (`logs/`) redacta automáticamente cualquier campo que parezca una
  credencial.
- **Los límites de plan se comprueban en el proceso principal**, no solo
  ocultando botones en la interfaz.
- El navegador de transportistas (`WebContentsView`) va sin preload, sin Node,
  solo HTTPS, con emergentes, descargas y permisos bloqueados.

## 8. Costes externos

| Concepto | Coste real | Cuándo |
|---|---|---|
| Desarrollo y uso local | **0 €** | ya |
| Git, ESLint, cobertura, CI, electron-builder | **0 €** | ya |
| Certificado de firma **autofirmado** | **0 €** | ya |
| Certificado de firma **de confianza pública** (OV/IV) | 150–300 €/año | antes de distribuir |
| Backend de licencias (Cloudflare Workers + D1 o Supabase) | 0 € al empezar; ~5–25 €/mes con volumen | pendiente |
| APIs de IA | **las paga el cliente con su propia clave** (BYOK) | ya |
| Pasarela de pago | comisión por transacción | pendiente |

**Gasto real hasta la fecha: 0 €.** No se ha contratado ningún servicio, ni se
ha introducido ninguna tarjeta, ni se ha iniciado ninguna prueba de pago. No se
promete coste cero indefinido en los servicios online.

## 9. Licencias (administración)

La aplicación **solo lleva la clave pública**: puede verificar licencias, nunca
emitirlas. La clave privada vive en `tools/keys/license-private.pem`, que no se
empaqueta y está excluida de Git.

```powershell
npm run license:keygen                                      # solo la primera vez
npm run license:new -- --plan pro --kind founder --holder "Nombre"
npm run license:verify -- --code <codigo>
npm run license:list                                        # registro de emision
```

Cada emisión queda anotada (con su código) en `tools/keys/issued-licenses.jsonl`,
fichero **privado** excluido de Git. `license:list` muestra quién tiene qué,
cuántas quedan de cada cuota fundadora y **reverifica la firma** de cada licencia
contra la clave pública incrustada en la aplicación.

No se generan las 400 licencias fundadoras de golpe: se emiten una a una cuando
haya clientes reales. Detalle completo en
[`docs/LICENCIAS.md`](docs/LICENCIAS.md).

## 10. Instalador

```
release\RESALEVAULT-Setup-0.5.0.exe     118,44 MB
SHA-256  741c091a8f9ea888eb7a00729e3ec1fa3e3fcb40437f7cb63c64c50ed0c8e138
Firma    presente (certificado AUTOFIRMADO: la raíz no es de confianza publica)
```

El instalador **no es reproducible byte a byte** (NSIS incluye marcas de tiempo):
publica siempre el hash de la compilación concreta que entregues.

Este equipo **bloquea su ejecución** por la política Device Guard de la
organización. La instalación de extremo a extremo **no se ha podido verificar**.
Ver [`docs/FIRMA.md`](docs/FIRMA.md).

## 11. Licencia

Software propietario. Todos los derechos reservados.

Las licencias de los componentes de terceros que se distribuyen con el programa
están en [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
