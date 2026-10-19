# RESALEVAULT

**EVERY ITEM. EVERY PROFIT.**

Aplicación de escritorio para Windows dirigida a revendedores: inventario,
ubicaciones físicas, compras, pedidos y rentabilidad real.

- **Versión:** 0.5.0 (Fases 1 a 5, Shipping Tracker y copias de seguridad)
- **Estado:** aplicación funcional con inventario completo, fotografías y
  documentos, importación/exportación CSV, compras con reparto de costes,
  pedidos con **beneficio neto**, devoluciones, preparación de pedidos con
  escaneo, códigos de barras y QR, informes financieros, alertas locales,
  **AI Studio con clave propia (BYOK)**, licencias y planes,
  **copias de seguridad con restauración** e internacionalización
  (español / inglés), y **Shipping Tracker** con navegador integrado.
- **Detalle honesto de lo implementado y lo pendiente:** [`docs/ESTADO.md`](docs/ESTADO.md)

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
| `npm test` | Ejecuta la batería de pruebas (111 pruebas). |
| `npm run test:watch` | Pruebas en modo vigilancia. |
| `npm run verify` | `typecheck` + `test`. Es la comprobación rápida antes de publicar. |
| `npm run smoke` | Prueba de humo de la capa de datos **dentro de Electron real** (70 comprobaciones). |
| `npm run smoke:ui` | Prueba de humo de la interfaz: carga el HTML compilado, crea datos por el puente IPC y pulsa la navegación (54 comprobaciones). |
| `npm run icon` | Regenera `build/icon.png` (monograma RV) usando el motor de render de Electron. |
| `npm run license:new` | **(solo administración)** emite una licencia firmada. Ver más abajo. |
| `npm run dist:dir` | Empaqueta la aplicación sin instalador en `release/win-unpacked/`. **Verificado.** |
| `npm run dist` | Genera el instalador NSIS de Windows en `release/`. *(Fase 8: configuración preparada, todavía sin ejecutar)* |

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
│   ├── ipc/register.ts        46 canales IPC con validación
│   ├── db/
│   │   ├── database.ts        Conexión, transacciones, caché de sentencias
│   │   ├── migrator.ts        Motor de migraciones versionadas
│   │   ├── migrations/        001 esquema · 002 datos base
│   │   ├── context.ts         Composición de repositorios
│   │   └── repositories/      products, categories, locations, tags…
│   └── services/              settings, paths, logger, security, demo-data
├── preload/index.ts           Puente contextBridge
├── shared/                    Tipos, esquemas zod, CSP, SKU, formato
└── renderer/src/              Interfaz React
    ├── App.tsx                Composición + enrutado
    ├── app.css                Identidad visual completa
    ├── i18n/                  es.ts, en.ts, motor de traducción
    ├── lib/                   api.ts, app-context.tsx, hooks.ts
    ├── components/            Icons, ui, TitleBar, Sidebar
    └── pages/                 Dashboard, Inventory, ProductForm, …
tests/                         111 pruebas automatizadas
scripts/                       doctor, pruebas de humo, empaquetado
docs/                          Arquitectura, fórmulas y estado
```

## 7. Seguridad aplicada (resumen)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **No existe un `invoke` genérico**: el renderer solo puede llamar a los 46
  métodos declarados, cada uno con su esquema de validación en el proceso
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

## 8. Costes externos previstos

| Concepto | Coste | Cuándo |
|---|---|---|
| Desarrollo y uso local | **0 €** | ya |
| Firma de código para Windows (certificado) | ~90–400 €/año | Fase 8 |
| Backend de licencias (Cloudflare Workers + D1 o Supabase) | 0 € al empezar; ~5–25 €/mes con volumen | Fase 6 |
| APIs de IA | **las paga el cliente con su propia clave** (BYOK) | Fase 5 |
| Pasarela de pago | comisión por transacción | Fase 6 |

No se promete coste cero indefinido en los servicios online.

## 9. Licencias (administración)

La aplicación **solo lleva la clave pública**: puede verificar licencias, nunca
emitirlas. La clave privada vive en `tools/keys/license-private.pem`, que no se
empaqueta (el instalador solo incluye `out/` y `package.json`).

```powershell
npm run license:keygen                                      # solo la primera vez
npm run license:new -- --plan pro --kind founder --holder "Nombre"
npm run license:verify -- --code <codigo>
```

No se generan las 400 licencias fundadoras de golpe: se emiten una a una cuando
haya clientes reales.

## 10. Licencia

Software propietario. Todos los derechos reservados.
