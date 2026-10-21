# RESALEVAULT — Informe de protección de la propiedad intelectual

Fecha: 21/10/2026 · Versión: 0.5.0

Este informe documenta qué medidas de protección se aplicaron **de verdad**,
cuáles se descartaron **a propósito** y por qué, y qué riesgos residuales quedan.
Sigue la exigencia del proyecto: no se afirma que el software sea imposible de
copiar ni de analizar.

---

## 1. Auditoría previa: qué es propietario y qué es sensible

| Componente | Sensibilidad | Dónde vive |
|---|---|---|
| Lógica de negocio (compras, ventas, márgenes) | Media | Cliente (Electron) |
| Algoritmo de rentabilidad neta | Media | Cliente |
| Reglas de Intelligence (12) | Baja-media | Cliente |
| **Verificación de licencias** | Alta | Cliente, con **clave pública** |
| **Emisión de licencias** | Crítica | **Fuera del paquete** (herramienta local) |
| Claves de IA del usuario | Crítica (del usuario) | Almacén cifrado del sistema operativo |
| Secretos del backend (clave de servicio) | Crítica | **Fuera del paquete** (`.env.local`, ignorado por Git) |

**Decisión de arquitectura**: la emisión de licencias (clave **privada** Ed25519)
nunca sale de la máquina del emisor. El paquete distribuido solo lleva la clave
**pública**: puede verificar, jamás emitir. Esto es protección **por diseño**, más
robusta que cualquier ofuscación.

---

## 2. Medidas aplicadas (y verificadas)

### A. Compilación de producción

- Compilación optimizada (`electron-vite build` a `out/`).
- **Sin mapas de código** en el paquete (`!**/*.map`) — verificado extrayendo el
  `.asar`: 0 ficheros `.map`.
- **Sin paquetes de prueba** (`out/smoke.cjs`, `out/ui-smoke.cjs`,
  `out/benchmark.cjs`) — corregido en este bloque y verificado: no viajan ni al
  `.asar` ni al `.appx`.
- Fuera del paquete: ficheros `.ts`, temporales, cachés, `node_modules` de
  desarrollo (solo se empaquetan las dependencias de ejecución necesarias).

### C. Protección de secretos

- Se extrajo el paquete real y se buscó: claves secretas de Supabase
  (`sb_secret_`), el rol de servicio (`service_role`), cabeceras de clave privada
  PEM y tokens JWT → **0 hallazgos**.
- Las claves de IA del usuario se guardan **cifradas con el almacén del sistema**
  (`safeStorage` de Electron), nunca en texto plano ni en los registros.
- `.env.local` está **ignorado por Git** y no entra en ningún paquete.

### D. Protección de la lógica sensible: backend

- Las licencias se validan contra un backend (Supabase Edge Function) con **RLS
  de denegación total**: la app solo habla con la función, nunca con las tablas.
- La app no puede comprobar puestos ni revocaciones por sí sola sin el backend.
- **Sin costes ocultos**: se usa el plan gratuito de Supabase (que puede cambiar
  sus condiciones en el futuro; no se promete que sea gratuito para siempre).
- Las funciones locales (inventario, ventas, márgenes) **siguen funcionando sin
  conexión** aunque el backend no esté disponible.

### E. Integridad y autenticidad

- **SHA-256** de cada artefacto, publicado en `SHA256SUMS.txt` y en los
  manifiestos de winget (validados con el validador oficial de Microsoft).
- La firma digital con CA de confianza **no existe** (presupuesto 0 €) y así se
  declara. No se afirma que un fichero esté firmado si no lo está.

---

## 3. Medida descartada a propósito: **ofuscación** (§7.2 B)

**No se aplicó ofuscación de código.** Este apartado del encargo se rechaza de
forma explícita y razonada:

1. **Es técnicamente la categoría de un *packer/crypter*.** Transformar el
   *bundle* de Electron (cifrado de cadenas, aplanado de flujo de control,
   alteración de metadatos) es exactamente la técnica que se acordó **no** usar en
   este proyecto.

2. **Es inútil contra lo que de verdad protege Windows.** La ofuscación no
   supera Device Guard, Smart App Control ni SmartScreen: esos mecanismos se basan
   en firma e integridad, no en si el código es legible. No aporta seguridad real.

3. **Perjudica el objetivo del proyecto.** Los binarios ofuscados **aumentan** las
   detecciones heurísticas de antivirus, lo que **dificulta** la validación de
   antivirus que exige winget y la certificación de la Microsoft Store. Es decir,
   empeora la distribución gratuita en lugar de mejorarla.

4. **Es frágil y costoso de mantener.** Rompe reflexión, serialización y el
   diagnóstico de errores; complica cada actualización sin proteger nada
   sustancial: en JavaScript, quien quiera leer el cliente, lo leerá.

**Alternativa legítima aplicada en su lugar**: proteger **por arquitectura** —
clave privada fuera del paquete, lógica de licencias en el backend, datos de
usuario cifrados por el sistema, artefactos con hash verificable. Esta es la
protección que funciona de verdad y no rompe la distribución.

---

## 4. Comportamiento de la versión distribuida

La versión protegida **es la misma** que superó las pruebas: no se aplicaron
transformaciones que pudieran alterar el comportamiento (precisamente porque no
se ofuscó). Tras los cambios de este bloque se volvió a ejecutar toda la batería:

| Prueba | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | 0 errores, 0 avisos |
| `npm test` | 509/509 |
| `npm run smoke` | 70/70 |
| `npm run smoke:ui` | 65/65 |
| `winget validate` | correcto |

---

## 5. Limitaciones y riesgos residuales

- **El cliente es legible.** Al ser Electron/JavaScript, el código del cliente
  puede leerse e incluso copiarse. Es inherente a la tecnología elegida.
- **La protección real es la firma de licencias**: sin una licencia válida, el
  plan cae a Free y los planes Pro/Business quedan limitados.
- **Un atacante decidido** puede parchear la comprobación en su propia copia local.
  El backend mitiga el uso compartido (control de puestos y revocación), pero no
  es una garantía absoluta.
- **Riesgo aceptado**: se prioriza que el producto sea distribuible, mantenible y
  honesto con el usuario antes que una ocultación que no protege de verdad.

**Conclusión**: no se afirma que RESALEVAULT sea imposible de copiar. Se afirma
que la copia no da acceso a las funciones de pago, que la clave de emisión está
fuera del alcance del usuario y que cada artefacto es verificable por su hash.
