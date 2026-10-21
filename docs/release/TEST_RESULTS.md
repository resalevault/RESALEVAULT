# RESALEVAULT — Resultados de pruebas (21/10/2026)

Registro de lo que se ejecutó **realmente** durante este bloque. Cada cifra
proviene de una ejecución concreta, no de una estimación.

---

## 1. Comprobación de tipos (TypeScript estricto)

```
npm run typecheck   →  0 errores
```

Dos proyectos: `tsconfig.node.json` (proceso principal y preload) y
`tsconfig.web.json` (interfaz). Ambos sin incidencias.

---

## 2. Análisis estático (ESLint)

```
npm run lint   →  0 errores, 0 avisos
```

---

## 3. Pruebas unitarias y de integración

```
npm test   →  37 archivos, 469 pruebas, 469 superadas, 0 fallidas
```

Cobertura (Vitest + V8):

| Métrica | Valor |
|---|---|
| Sentencias | 85.74 % (3561/4153) |
| Ramas | 77.95 % (2200/2822) |
| Funciones | 90.85 % (616/678) |
| Líneas | 88.33 % (3264/3695) |

### Pruebas nuevas de este bloque (`tests/links.test.ts`, 12)

1. La lista blanca contiene el Discord oficial con la URL exacta.
2. Todas las URLs permitidas son HTTPS.
3. Solo se resuelven los destinos declarados.
4. `isAllowedUrl` distingue la URL permitida de cualquier otra (comparación exacta).
5. El servicio abre el destino permitido en el navegador del sistema.
6. Un destino desconocido se rechaza sin abrir nada.
7. Un fallo real al abrir se comunica como error, no como éxito.
8. Se copia la URL exacta al portapapeles.
9. Copiar un destino desconocido se rechaza.
10. El texto del botón es exactamente `Comprar licencia` / `Buy license`.
11. El aviso dice explícitamente que **no** se compra ni se piden datos de pago.
12. Existe un texto de respaldo por si el enlace no se abre.

### Pruebas del backend de licencias (43, en bloques anteriores)

Códigos de licencia, claves y sincronización, endpoint (firma válida, firma
falsificada → 403, puestos agotados → 409, revocada → 403, `/revocations`).

---

## 4. Humo del proceso principal

```
npm run smoke   →  70 comprobaciones, 70 correctas, 0 fallidas
```

Incluye: persistencia real al cerrar y reabrir (datos, SKU, historial, actividad),
creación por el puente seguro y comprobación de la base de datos real.

---

## 5. Humo de la interfaz dentro de Electron real

```
npm run smoke:ui   →  61 comprobaciones, 61 correctas, 0 fallidas
```

Carga el HTML **compilado** con el preload real y pulsa elementos de verdad.
Comprobaciones nuevas de este bloque (7):

1. Se abre la pantalla de licencia.
2. El botón «Comprar licencia» está presente y con el texto exacto (español).
3. Se muestra exactamente la URL oficial de Discord.
4. El puente rechaza un destino fuera de la lista blanca.
5. El proceso principal declara el Discord oficial.
6. La pantalla aclara que **no** se compra desde la aplicación.
7. El botón dice «Buy license» tras cambiar a inglés.

*Nota honesta:* el test **no pulsa** el botón para no abrir un navegador durante
las pruebas (sería intrusivo y no determinista). Lo que prueba es que el botón
existe con el destino exacto, que el puente solo acepta la lista blanca y que el
clic está cableado a ese puente (cubierto por las pruebas 5–9 de `links.test.ts`).

*Incidencia cosmética conocida:* al terminar, el humo de interfaz no siempre
consigue borrar su carpeta temporal (`EPERM`). No afecta al resultado.

---

## 6. Validación de los manifiestos de winget

```
winget validate --manifest .\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0
→  Manifest validation succeeded.
```

Validador **oficial** de Microsoft. El `InstallerSha256` generado coincide con el
hash del instalador real.

---

## 7. Verificación de seguridad del paquete

Se extrajo el contenido real del paquete (`app.asar` y `AppX`):

| Comprobación | Resultado |
|---|---|
| Mapas de código (`.map`) en el paquete | **0** |
| `out/smoke.cjs`, `ui-smoke.cjs`, `benchmark.cjs` | **0** (excluidos) |
| `sb_secret_` / `service_role` / clave privada | **0** |
| `password =` con valor real | **0** (solo etiquetas de interfaz) |
| Ficheros propios en el paquete | 5 (`main`, `preload`, 2 assets, `index.html`) |

---

## 8. Prueba de extremo a extremo en vivo (bloque anterior)

Contra el backend **real** desplegado en Supabase:

| Caso | Resultado |
|---|---|
| `/health` | 200 |
| Firma falsificada | 403 `bad_signature` |
| Máquinas A y B activan | puestos 1 → 2 |
| Máquina C | 409 `seats_exhausted` |
| Desactivar A | libera un puesto |
| Revocar en la base de datos | 403 `revoked` |
| `/revocations` | devuelve el hash |

---

## 9. Pendiente de ejecutar

- **Instalación real en máquina limpia** (bloqueada en este PC).
- **Compilación y firma de macOS** (bloqueado: requiere un Mac).
- **AI Studio contra proveedores reales** (requiere una clave del usuario).
