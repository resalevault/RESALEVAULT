# RESALEVAULT â€” Informe de protecciÃ³n de la propiedad intelectual

Fecha: 21/10/2026 Â· VersiÃ³n: 0.5.0

Este informe documenta quÃ© medidas de protecciÃ³n se aplicaron **de verdad**,
cuÃ¡les se descartaron **a propÃ³sito** y por quÃ©, y quÃ© riesgos residuales quedan.
Sigue la exigencia del proyecto: no se afirma que el software sea imposible de
copiar ni de analizar.

---

## 1. AuditorÃ­a previa: quÃ© es propietario y quÃ© es sensible

| Componente | Sensibilidad | DÃ³nde vive |
|---|---|---|
| LÃ³gica de negocio (compras, ventas, mÃ¡rgenes) | Media | Cliente (Electron) |
| Algoritmo de rentabilidad neta | Media | Cliente |
| Reglas de Intelligence (12) | Baja-media | Cliente |
| **VerificaciÃ³n de licencias** | Alta | Cliente, con **clave pÃºblica** |
| **EmisiÃ³n de licencias** | CrÃ­tica | **Fuera del paquete** (herramienta local) |
| Claves de IA del usuario | CrÃ­tica (del usuario) | AlmacÃ©n cifrado del sistema operativo |
| Secretos del backend (clave de servicio) | CrÃ­tica | **Fuera del paquete** (`.env.local`, ignorado por Git) |

**DecisiÃ³n de arquitectura**: la emisiÃ³n de licencias (clave **privada** Ed25519)
nunca sale de la mÃ¡quina del emisor. El paquete distribuido solo lleva la clave
**pÃºblica**: puede verificar, jamÃ¡s emitir. Esto es protecciÃ³n **por diseÃ±o**, mÃ¡s
robusta que cualquier ofuscaciÃ³n.

---

## 2. Medidas aplicadas (y verificadas)

### A. CompilaciÃ³n de producciÃ³n

- CompilaciÃ³n optimizada (`electron-vite build` a `out/`).
- **Sin mapas de cÃ³digo** en el paquete (`!**/*.map`) â€” verificado extrayendo el
  `.asar`: 0 ficheros `.map`.
- **Sin paquetes de prueba** (`out/smoke.cjs`, `out/ui-smoke.cjs`,
  `out/benchmark.cjs`) â€” corregido en este bloque y verificado: no viajan ni al
  `.asar` ni al `.appx`.
- Fuera del paquete: ficheros `.ts`, temporales, cachÃ©s, `node_modules` de
  desarrollo (solo se empaquetan las dependencias de ejecuciÃ³n necesarias).

### C. ProtecciÃ³n de secretos

- Se extrajo el paquete real y se buscÃ³: claves secretas de Supabase
  (`sb_secret_`), el rol de servicio (`service_role`), cabeceras de clave privada
  PEM y tokens JWT â†’ **0 hallazgos**.
- Las claves de IA del usuario se guardan **cifradas con el almacÃ©n del sistema**
  (`safeStorage` de Electron), nunca en texto plano ni en los registros.
- `.env.local` estÃ¡ **ignorado por Git** y no entra en ningÃºn paquete.

### D. ProtecciÃ³n de la lÃ³gica sensible: backend

- Las licencias se validan contra un backend (Supabase Edge Function) con **RLS
  de denegaciÃ³n total**: la app solo habla con la funciÃ³n, nunca con las tablas.
- La app no puede comprobar puestos ni revocaciones por sÃ­ sola sin el backend.
- **Sin costes ocultos**: se usa el plan gratuito de Supabase (que puede cambiar
  sus condiciones en el futuro; no se promete que sea gratuito para siempre).
- Las funciones locales (inventario, ventas, mÃ¡rgenes) **siguen funcionando sin
  conexiÃ³n** aunque el backend no estÃ© disponible.

### E. Integridad y autenticidad

- **SHA-256** de cada artefacto, publicado en `SHA256SUMS.txt` y en los
  manifiestos de winget (validados con el validador oficial de Microsoft).
- La firma digital con CA de confianza **no existe** (presupuesto 0 â‚¬) y asÃ­ se
  declara. No se afirma que un fichero estÃ© firmado si no lo estÃ¡.

---

## 3. Medida descartada a propÃ³sito: **ofuscaciÃ³n** (Â§7.2 B)

**No se aplicÃ³ ofuscaciÃ³n de cÃ³digo.** Este apartado del encargo se rechaza de
forma explÃ­cita y razonada:

1. **Es tÃ©cnicamente la categorÃ­a de un *packer/crypter*.** Transformar el
   *bundle* de Electron (cifrado de cadenas, aplanado de flujo de control,
   alteraciÃ³n de metadatos) es exactamente la tÃ©cnica que se acordÃ³ **no** usar en
   este proyecto.

2. **Es inÃºtil contra lo que de verdad protege Windows.** La ofuscaciÃ³n no
   supera Device Guard, Smart App Control ni SmartScreen: esos mecanismos se basan
   en firma e integridad, no en si el cÃ³digo es legible. No aporta seguridad real.

3. **Perjudica el objetivo del proyecto.** Los binarios ofuscados **aumentan** las
   detecciones heurÃ­sticas de antivirus, lo que **dificulta** la validaciÃ³n de
   antivirus que exige winget y la certificaciÃ³n de la Microsoft Store. Es decir,
   empeora la distribuciÃ³n gratuita en lugar de mejorarla.

4. **Es frÃ¡gil y costoso de mantener.** Rompe reflexiÃ³n, serializaciÃ³n y el
   diagnÃ³stico de errores; complica cada actualizaciÃ³n sin proteger nada
   sustancial: en JavaScript, quien quiera leer el cliente, lo leerÃ¡.

**Alternativa legÃ­tima aplicada en su lugar**: proteger **por arquitectura** â€”
clave privada fuera del paquete, lÃ³gica de licencias en el backend, datos de
usuario cifrados por el sistema, artefactos con hash verificable. Esta es la
protecciÃ³n que funciona de verdad y no rompe la distribuciÃ³n.

---

## 4. Comportamiento de la versiÃ³n distribuida

La versiÃ³n protegida **es la misma** que superÃ³ las pruebas: no se aplicaron
transformaciones que pudieran alterar el comportamiento (precisamente porque no
se ofuscÃ³). Tras los cambios de este bloque se volviÃ³ a ejecutar toda la baterÃ­a:

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

- **El cliente es legible.** Al ser Electron/JavaScript, el cÃ³digo del cliente
  puede leerse e incluso copiarse. Es inherente a la tecnologÃ­a elegida.
- **La protecciÃ³n real es la firma de licencias**: sin una licencia vÃ¡lida, el
  plan cae a Free y los planes Pro/Business quedan limitados.
- **Un atacante decidido** puede parchear la comprobaciÃ³n en su propia copia local.
  El backend mitiga el uso compartido (control de puestos y revocaciÃ³n), pero no
  es una garantÃ­a absoluta.
- **Riesgo aceptado**: se prioriza que el producto sea distribuible, mantenible y
  honesto con el usuario antes que una ocultaciÃ³n que no protege de verdad.

**ConclusiÃ³n**: no se afirma que RESALEVAULT sea imposible de copiar. Se afirma
que la copia no da acceso a las funciones de pago, que la clave de emisiÃ³n estÃ¡
fuera del alcance del usuario y que cada artefacto es verificable por su hash.
