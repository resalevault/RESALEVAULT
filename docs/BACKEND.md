# RESALEVAULT — Backend de licencias (Supabase)

Estado a **20/10/2026**: backend **desplegado y probado en vivo** contra el
proyecto real de Supabase. El cliente de la aplicación de escritorio **aún no lo
usa** (siguiente bloque de trabajo).

---

## 1. Qué hace y qué no hace

**Hace:**

- Validar códigos de licencia firmados (Ed25519) en el servidor.
- Controlar **puestos** (máquinas) por licencia: activar, desactivar, liberar.
- **Revocar** licencias y consultar la lista de revocadas.
- Servir un punto de salud (`/health`) para comprobar que todo responde.

**No hace:**

- No emite licencias: la clave privada **nunca** sale de la máquina del emisor.
- No procesa pagos ni gestiona cuentas de usuario.
- No ve ni almacena datos del inventario, pedidos o clientes del usuario final.
- No recibe el `code_hash` local de 32 bits de la app (es interno y no comparable
  con el SHA-256 del servidor).

---

## 2. Arquitectura

```
Emisor (tu equipo)                     Supabase (proyecto ugfefewrikcghfwqhezi)
─────────────────────                   ─────────────────────────────────────────
npm run license:keygen   ──clave──►     (la clave privada NO se sube jamás)
npm run license:new      firma local
npm run license:sync     ──HTTPS──►     PostgREST /rest/v1/licenses  (service_role)
                                        tablas RLS deny-all
                                        │
Usuario final (app de escritorio)       Edge Function /functions/v1/licence
    │  (cliente pendiente)              ├── POST /activate     puestos + estado
    └──────────────────────────────────►├── POST /deactivate
                                        ├── GET  /revocations?since=
                                        └── GET  /health
```

Reglas de seguridad:

1. **La clave privada Ed25519 vive solo en la máquina del emisor**
   (`tools/keys/`, excluida de Git). Una filtración de la base de datos no
   permite emitir licencias nuevas.
2. **Las tablas están con RLS activo y sin políticas** (deny-all): ni siquiera
   la clave publishable puede leerlas. Solo `service_role` (que salta RLS) las
   toca, y eso ocurre en dos sitios: `license:sync` (desde tu equipo) y la Edge
   Function (en Supabase).
3. **La aplicación habla con la Edge Function, nunca con las tablas.** La app
   solo lleva la URL del proyecto y la clave **publishable** (pública por
   diseño).
4. **Offline-first**: el token se valida localmente con Ed25519. El servidor se
   consulta para revocaciones como mucho **una vez cada 7 días**; si Supabase
   no responde o está en pausa, la licencia sigue funcionando.
5. Las constantes de la función (`keys.ts`) están **duplicadas** respecto a
   `src/shared/license-keys.ts` porque Supabase solo recibe la carpeta de la
   función; `tests/licence-keys-sync.test.ts` impide que las copias diverjan.

---

## 3. Piezas del repositorio

| Pieza | Ruta |
|---|---|
| Esquema Postgres | `supabase/migrations/20261020000001_licensing.sql` |
| Edge Function | `supabase/functions/licence/{index,core,code,keys}.ts` |
| Emisión local | `scripts/generate-license.mjs` (`license:keygen`/`new`/`list`/`verify`) |
| Subida del registro | `scripts/license-sync.mjs` (`npm run license:sync`) |
| Clave pública de la app | `src/shared/license-keys.ts` |
| Verificador local | `src/main/services/license.ts` |
| Pruebas | `tests/licence-{code,endpoint,keys-sync}.test.ts` (43 pruebas) |

Rutas de la Edge Function (`verify_jwt` activo, sin CORS: solo la app de
escritorio la llama desde el proceso principal):

| Ruta | Cuerpo | Éxito | Fallos |
|---|---|---|---|
| `POST /activate` | `{code, machineId, machineLabel, appVersion, os}` | 200 `ok, plan, seats, seatsUsed` | 403 `bad_signature`/`revoked`/`suspended` · 404 `unknown_code` · 409 `seats_exhausted` · 400 `invalid_input` |
| `POST /deactivate` | `{code, machineId}` | 200 `removed` | mismos 4xx |
| `GET /revocations?since=ISO` | — | 200 `codes[], cursor` | 400 |
| `GET /health` | — | 200 `{"ok":true,"version":1}` | — |

---

## 4. Variables de entorno

`scripts/license-sync.mjs` se ejecuta con `node --env-file-if-exists=.env.local`
y necesita, **en tu máquina** (nunca en el repositorio):

```
SUPABASE_URL=https://ugfefewrikcghfwqhezi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

- `SUPABASE_SERVICE_ROLE_KEY`: Dashboard de Supabase → *Project Settings → API →
  secret key*. Es un secreto: `.env.local` está en `.gitignore` (`*.local`).
- La clave **publishable** (`sb_publishable_…`) que lleva la app no es secreta y
  no sirve para administrar el proyecto.

---

## 5. Despliegue (reproducible)

```powershell
npx supabase login                                   # abre el navegador
npx supabase link --project-ref ugfefewrikcghfwqhezi
npx supabase db push                                 # aplica la migración
npx supabase functions deploy licence                # sube la Edge Function
```

Verificación tras el despligue:

```powershell
npm run license:sync -- --dry-run    # verifica firmas sin subir nada
npm run license:sync                 # sube/actualiza el registro
```

Ambos comandos se ejecutaron el 20/10/2026: `db push` respondió *Remote
database is up to date* y `functions deploy licence` desplegó los 4 ficheros.

---

## 6. Prueba de extremo a extremo en vivo (20/10/2026)

Ejecutada contra `https://ugfefewrikcghfwqhezi.supabase.co/functions/v1/licence`
con una licencia real emitida con `license:new` (pro, subscription, 2 puestos) y
sincronizada con `license:sync` (4 licencias en el registro, todas con firma
válida):

| # | Acción | Esperado | Resultado |
|---|---|---|---|
| 1 | `GET /health` | 200 | **200** `{"ok":true,"version":1}` ✅ |
| 2 | Activar código **falsificado** (firma alterada) | rechazo | **403** `bad_signature` ✅ |
| 3 | Activar máquina A | ok, puestos 1/2 | **200** `seatsUsed:1` ✅ |
| 4 | Activar máquina B | ok, puestos 2/2 | **200** `seatsUsed:2` ✅ |
| 5 | Activar máquina C | agotado | **409** `seats_exhausted` ✅ |
| 6 | Desactivar máquina A | libera puesto | **200** `removed:true` ✅ |
| 7 | Activar máquina C (puesto liberado) | ok | **200** `seatsUsed:2` ✅ |
| 8 | Revocar la licencia en la DB (service_role) | status=revoked | **200** fila actualizada ✅ |
| 9 | Activar con la licencia **revocada** | rechazo | **403** `revoked` ✅ |
| 10 | `GET /revocations?since=…` | devuelve el hash | **200** `codes:["6285e77f…"]` ✅ |
| 11 | `license:sync` (4 licencias) | sube y verifica | verificado + subidas ✅ |

**Todos los resultados anteriores son salidas reales de las peticiones.** No se
ha simulado ninguna respuesta.

---

## 7. Costes y riesgos (honestos)

| Punto | Situación |
|---|---|
| Coste hoy | **0 €** — Supabase Free (verificado 20/10/2026: 500 MB DB, 5 GB egress, 500.000 invocaciones/mes) |
| **Pausa por inactividad** | Supabase pausa los proyectos **tras ~1 semana sin actividad**. Por eso el diseño es offline-first: las licencias ya emitidas siguen validándose sin servidor. Reactivar es gratuito desde el Dashboard. |
| DPA / RGPD | Antes de **vender**, revisar que el plan gratuito de Supabase cubra el acuerdo de encargo de tratamiento. **No se ha revisado con un abogado** (sin presupuesto). |
| Secretos | La clave de servicio solo vive en `.env.local` (ignorada). Exponerla permitiría alterar el registro de licencias. |
| Disponibilidad | Si Supabase desaparece, la app sigue funcionando en local; habría que migrar el registro (el código firmado + hash es portable). |

---

## 8. Qué falta (siguiente bloque)

1. **Cliente en la app** (`src/main/services/…`): llamar a `/activate` y
   `/deactivate`, consultar `/revocations` como máximo cada 7 días, y caer al
   modo local si no hay red. Con IPC propio (nada de canales genéricos) y pruebas.
2. Prueba E2E del flujo completo **desde la aplicación** (no solo HTTP).
3. Actualizar `PRIVACIDAD.md` cuando el cliente empiece a conectarse.
