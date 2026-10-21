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
npm test   →  39 archivos, 509 pruebas, 509 superadas, 0 fallidas
```

Cobertura (Vitest + V8):

| Métrica | Valor |
|---|---|
| Sentencias | 86.00 % (3707/4310) |
| Ramas | 78.40 % (2316/2954) |
| Funciones | 90.75 % (638/703) |
| Líneas | 88.66 % (3402/3837) |

### Pruebas nuevas de este bloque (`tests/licence-online.test.ts`, 31)

Cliente online de licencias, en tres capas:

**Funciones puras (sin red ni base de datos)**
1. La activación se construye con la clave publishable como `Bearer`.
2. Se recorta el código y se rellenan los campos opcionales vacíos.
3. La liberación de puesto arma el cuerpo correcto.
4. El cursor `since` solo viaja cuando existe.
5. El hash del código es estable e ignora espacios exteriores.

**Interpretación de respuestas**

6. Se acepta una activación correcta y se distinguen los puestos.
7. Se distingue un puesto «ya activo».
8. **No** se cree un `ok:true` con un estado HTTP de error.
9. Se traduce un rechazo con motivo y puestos usados.
10. Un cuerpo inválido se trata como error de servidor, sin lanzar.
11. La lista de revocaciones descarta entradas raras.
12. Una lista inválida no revoca nada.
13. El servidor acepta → «verificado».
14. Sin red → se conserva el plan.
15. Un error temporal del servidor **no** es bloqueante.
16. Una revocación **sí** es bloqueante.
17. La comprobación toca cada 7 días y no antes.

**Servicio con `fetch` inyectada**

18. Licencia activa → verificado y fecha guardada (+ evento).
19. Sin red → licencia y plan intactos, estado «offline».
20. Error 500 del servidor → la licencia no cambia (no bloqueante).
21. Rechazo bloqueante → estado «rejected».
22. No se comprueba de nuevo antes de 7 días (0 llamadas).
23. `force` ignora la periodicidad.
24. Sin licencia activa no se llama a la red.
25. La liberación informa si el servidor la confirmó.
26. Sin red, la liberación local sigue adelante.
27. Las revocaciones se cachean y el cursor avanza.
28. Un fallo de red al pedir revocaciones no cambia nada.

**Integración con `LicenseService`**

29. Una revocación baja el plan a Free **sin borrar datos** (el producto
    del usuario sigue ahí).
30. Sin red, `refreshOnline` conserva el plan y no lanza.
31. Sin cliente online, el servicio funciona como antes.

### Pruebas del botón de compra (`tests/links.test.ts`, 12, bloque anterior)

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

> **Matiz honesto (70 frente a 66).** Cuatro de esas comprobaciones firman una
> licencia de prueba con la clave **privada** del proyecto y la validan con la
> pública que lleva la app. La clave privada (`tools/keys/license-private.pem`)
> **no se versiona** (es un secreto). Por eso:
> - En esta máquina de desarrollo (con la clave) salen **70**.
> - En un **clon limpio del repositorio** (sin la clave) salen **66**, y las 4
>   comprobaciones de firma se omiten por diseño, no fallan.
>
> Es decir, el número **66** es el esperado en CI y en cualquier equipo donde no
> se tenga el secreto de emisión. Documentado para que la cifra no se malinterprete.

---

## 5. Humo de la interfaz dentro de Electron real

```
npm run smoke:ui   →  65 comprobaciones, 65 correctas, 0 fallidas
```

Carga el HTML **compilado** con el preload real y pulsa elementos de verdad.
Comprobaciones nuevas de este bloque (4, comprobación online):

1. Se muestra la tarjeta de comprobación online.
2. Sin licencia, el estado online es «sin comprobar todavía».
3. Sin licencia no se ofrece comprobar ahora.
4. La llamada de comprobación responde **sin lanzar** aunque no haya red
   (el cliente simulado devuelve «sin red»: la prueba nunca sale a internet).

Comprobaciones del botón de compra (7, bloque anterior):

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
hash del instalador real (`39de1695…`, compilación del 21/10/2026 con el cliente
online).

---

## 7. Verificación de seguridad del paquete

Se extrajo el contenido real del paquete (`app.asar` dentro del instalador NSIS
`win-unpacked` y dentro del `.appx`):

| Comprobación | Resultado |
|---|---|
| Mapas de código (`.map`) en el paquete | **0** |
| `out/smoke.cjs`, `ui-smoke.cjs`, `benchmark.cjs` | **0** (excluidos) |
| `sb_secret_` / `service_role` / clave privada | **0** |
| `password =` con valor real | **0** (solo etiquetas de interfaz) |
| Ficheros propios en el paquete | 5 (`main`, `preload`, 2 assets, `index.html`) |
| Cliente online presente (`seats_exhausted`, `online_verified`, `license:refresh`) | **sí** en el `.exe` y en el `.appx` |
| Clave **publishable** de Supabase (pública por diseño) | presente (necesaria) |
| Manifiesto del `.appx` (`rv-media`, x64, versión 0.5.0.0) | correcto |

El `app.asar` del instalador y el del `.appx` pesan lo mismo (25.521.688 bytes):
son el mismo código.

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
