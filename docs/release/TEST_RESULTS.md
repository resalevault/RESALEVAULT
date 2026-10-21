# RESALEVAULT â€” Resultados de pruebas (21/10/2026)

Registro de lo que se ejecutÃ³ **realmente** durante este bloque. Cada cifra
proviene de una ejecuciÃ³n concreta, no de una estimaciÃ³n.

---

## 1. ComprobaciÃ³n de tipos (TypeScript estricto)

```
npm run typecheck   â†’  0 errores
```

Dos proyectos: `tsconfig.node.json` (proceso principal y preload) y
`tsconfig.web.json` (interfaz). Ambos sin incidencias.

---

## 2. AnÃ¡lisis estÃ¡tico (ESLint)

```
npm run lint   â†’  0 errores, 0 avisos
```

---

## 3. Pruebas unitarias y de integraciÃ³n

```
npm test   â†’  39 archivos, 509 pruebas, 509 superadas, 0 fallidas
```

Cobertura (Vitest + V8):

| MÃ©trica | Valor |
|---|---|
| Sentencias | 86.00 % (3707/4310) |
| Ramas | 78.40 % (2316/2954) |
| Funciones | 90.75 % (638/703) |
| LÃ­neas | 88.66 % (3402/3837) |

### Pruebas nuevas de este bloque (`tests/licence-online.test.ts`, 31)

Cliente online de licencias, en tres capas:

**Funciones puras (sin red ni base de datos)**
1. La activaciÃ³n se construye con la clave publishable como `Bearer`.
2. Se recorta el cÃ³digo y se rellenan los campos opcionales vacÃ­os.
3. La liberaciÃ³n de puesto arma el cuerpo correcto.
4. El cursor `since` solo viaja cuando existe.
5. El hash del cÃ³digo es estable e ignora espacios exteriores.

**InterpretaciÃ³n de respuestas**

6. Se acepta una activaciÃ³n correcta y se distinguen los puestos.
7. Se distingue un puesto Â«ya activoÂ».
8. **No** se cree un `ok:true` con un estado HTTP de error.
9. Se traduce un rechazo con motivo y puestos usados.
10. Un cuerpo invÃ¡lido se trata como error de servidor, sin lanzar.
11. La lista de revocaciones descarta entradas raras.
12. Una lista invÃ¡lida no revoca nada.
13. El servidor acepta â†’ Â«verificadoÂ».
14. Sin red â†’ se conserva el plan.
15. Un error temporal del servidor **no** es bloqueante.
16. Una revocaciÃ³n **sÃ­** es bloqueante.
17. La comprobaciÃ³n toca cada 7 dÃ­as y no antes.

**Servicio con `fetch` inyectada**

18. Licencia activa â†’ verificado y fecha guardada (+ evento).
19. Sin red â†’ licencia y plan intactos, estado Â«offlineÂ».
20. Error 500 del servidor â†’ la licencia no cambia (no bloqueante).
21. Rechazo bloqueante â†’ estado Â«rejectedÂ».
22. No se comprueba de nuevo antes de 7 dÃ­as (0 llamadas).
23. `force` ignora la periodicidad.
24. Sin licencia activa no se llama a la red.
25. La liberaciÃ³n informa si el servidor la confirmÃ³.
26. Sin red, la liberaciÃ³n local sigue adelante.
27. Las revocaciones se cachean y el cursor avanza.
28. Un fallo de red al pedir revocaciones no cambia nada.

**IntegraciÃ³n con `LicenseService`**

29. Una revocaciÃ³n baja el plan a Free **sin borrar datos** (el producto
    del usuario sigue ahÃ­).
30. Sin red, `refreshOnline` conserva el plan y no lanza.
31. Sin cliente online, el servicio funciona como antes.

### Pruebas del botÃ³n de compra (`tests/links.test.ts`, 12, bloque anterior)

1. La lista blanca contiene el Discord oficial con la URL exacta.
2. Todas las URLs permitidas son HTTPS.
3. Solo se resuelven los destinos declarados.
4. `isAllowedUrl` distingue la URL permitida de cualquier otra (comparaciÃ³n exacta).
5. El servicio abre el destino permitido en el navegador del sistema.
6. Un destino desconocido se rechaza sin abrir nada.
7. Un fallo real al abrir se comunica como error, no como Ã©xito.
8. Se copia la URL exacta al portapapeles.
9. Copiar un destino desconocido se rechaza.
10. El texto del botÃ³n es exactamente `Comprar licencia` / `Buy license`.
11. El aviso dice explÃ­citamente que **no** se compra ni se piden datos de pago.
12. Existe un texto de respaldo por si el enlace no se abre.

### Pruebas del backend de licencias (43, en bloques anteriores)

CÃ³digos de licencia, claves y sincronizaciÃ³n, endpoint (firma vÃ¡lida, firma
falsificada â†’ 403, puestos agotados â†’ 409, revocada â†’ 403, `/revocations`).

---

## 4. Humo del proceso principal

```
npm run smoke   â†’  70 comprobaciones, 70 correctas, 0 fallidas
```

Incluye: persistencia real al cerrar y reabrir (datos, SKU, historial, actividad),
creaciÃ³n por el puente seguro y comprobaciÃ³n de la base de datos real.

> **Matiz honesto (70 frente a 66).** Cuatro de esas comprobaciones firman una
> licencia de prueba con la clave **privada** del proyecto y la validan con la
> pÃºblica que lleva la app. La clave privada (`tools/keys/license-private.pem`)
> **no se versiona** (es un secreto). Por eso:
> - En esta mÃ¡quina de desarrollo (con la clave) salen **70**.
> - En un **clon limpio del repositorio** (sin la clave) salen **66**, y las 4
>   comprobaciones de firma se omiten por diseÃ±o, no fallan.
>
> Es decir, el nÃºmero **66** es el esperado en CI y en cualquier equipo donde no
> se tenga el secreto de emisiÃ³n. Documentado para que la cifra no se malinterprete.

---

## 5. Humo de la interfaz dentro de Electron real

```
npm run smoke:ui   â†’  65 comprobaciones, 65 correctas, 0 fallidas
```

Carga el HTML **compilado** con el preload real y pulsa elementos de verdad.
Comprobaciones nuevas de este bloque (4, comprobaciÃ³n online):

1. Se muestra la tarjeta de comprobaciÃ³n online.
2. Sin licencia, el estado online es Â«sin comprobar todavÃ­aÂ».
3. Sin licencia no se ofrece comprobar ahora.
4. La llamada de comprobaciÃ³n responde **sin lanzar** aunque no haya red
   (el cliente simulado devuelve Â«sin redÂ»: la prueba nunca sale a internet).

Comprobaciones del botÃ³n de compra (7, bloque anterior):

1. Se abre la pantalla de licencia.
2. El botÃ³n Â«Comprar licenciaÂ» estÃ¡ presente y con el texto exacto (espaÃ±ol).
3. Se muestra exactamente la URL oficial de Discord.
4. El puente rechaza un destino fuera de la lista blanca.
5. El proceso principal declara el Discord oficial.
6. La pantalla aclara que **no** se compra desde la aplicaciÃ³n.
7. El botÃ³n dice Â«Buy licenseÂ» tras cambiar a inglÃ©s.

*Nota honesta:* el test **no pulsa** el botÃ³n para no abrir un navegador durante
las pruebas (serÃ­a intrusivo y no determinista). Lo que prueba es que el botÃ³n
existe con el destino exacto, que el puente solo acepta la lista blanca y que el
clic estÃ¡ cableado a ese puente (cubierto por las pruebas 5â€“9 de `links.test.ts`).

*Incidencia cosmÃ©tica conocida:* al terminar, el humo de interfaz no siempre
consigue borrar su carpeta temporal (`EPERM`). No afecta al resultado.

---

## 6. ValidaciÃ³n de los manifiestos de winget

```
winget validate --manifest .\dist-winget\RESALEVAULT\RESALEVAULT\0.5.0
â†’  Manifest validation succeeded.
```

Validador **oficial** de Microsoft. El `InstallerSha256` generado coincide con el
hash del instalador real (`39de1695â€¦`, compilaciÃ³n del 21/10/2026 con el cliente
online).

---

## 7. VerificaciÃ³n de seguridad del paquete

Se extrajo el contenido real del paquete (`app.asar` dentro del instalador NSIS
`win-unpacked` y dentro del `.appx`):

| ComprobaciÃ³n | Resultado |
|---|---|
| Mapas de cÃ³digo (`.map`) en el paquete | **0** |
| `out/smoke.cjs`, `ui-smoke.cjs`, `benchmark.cjs` | **0** (excluidos) |
| `sb_secret_` / `service_role` / clave privada | **0** |
| `password =` con valor real | **0** (solo etiquetas de interfaz) |
| Ficheros propios en el paquete | 5 (`main`, `preload`, 2 assets, `index.html`) |
| Cliente online presente (`seats_exhausted`, `online_verified`, `license:refresh`) | **sÃ­** en el `.exe` y en el `.appx` |
| Clave **publishable** de Supabase (pÃºblica por diseÃ±o) | presente (necesaria) |
| Manifiesto del `.appx` (`rv-media`, x64, versiÃ³n 0.5.0.0) | correcto |

El `app.asar` del instalador y el del `.appx` pesan lo mismo (25.521.688 bytes):
son el mismo cÃ³digo.

---

## 8. Prueba de extremo a extremo en vivo (bloque anterior)

Contra el backend **real** desplegado en Supabase:

| Caso | Resultado |
|---|---|
| `/health` | 200 |
| Firma falsificada | 403 `bad_signature` |
| MÃ¡quinas A y B activan | puestos 1 â†’ 2 |
| MÃ¡quina C | 409 `seats_exhausted` |
| Desactivar A | libera un puesto |
| Revocar en la base de datos | 403 `revoked` |
| `/revocations` | devuelve el hash |

---

## 9. Pendiente de ejecutar

- **InstalaciÃ³n real en mÃ¡quina limpia** (bloqueada en este PC).
- **CompilaciÃ³n y firma de macOS** (bloqueado: requiere un Mac).
- **AI Studio contra proveedores reales** (requiere una clave del usuario).
