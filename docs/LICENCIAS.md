# RESALEVAULT — Licencias

Cómo funciona el sistema de licencias **de verdad**, cómo emitir licencias y
cuáles son sus límites actuales.

---

## 1. Diseño

| Aspecto | Decisión |
|---|---|
| Formato | `<payload en base64url>.<firma en base64url>` |
| Algoritmo | Ed25519 (vía `node:crypto`, sin dependencias) |
| Clave privada | `tools/keys/license-private.pem` — **solo en el equipo del emisor** |
| Clave pública | Incrustada en la aplicación (`LICENSE_PUBLIC_KEY_BASE64`) |
| Verificación | **Siempre local**, sin red |

La aplicación **no contiene la clave privada**. Por eso puede verificar una
licencia sin llamar a ningún servidor: valida la firma con la pública.

### Qué lleva el payload

`version`, `id`, `plan` (free | pro | business), `kind` (perpetual |
subscription | founder), `holder`, `issuedAt`, `expiresAt` (opcional), `seats`.

La firma cubre **todo** el payload: si alguien altera el plan, el holder o la
caducidad, la firma deja de validar y **la aplicación rebaja el plan a Free**.
Esto también aplica a una fila editada a mano en la base de datos: en
`LicenseService.state()` se reverifica la firma en cada lectura.

---

## 2. Estados

| Estado | Significado |
|---|---|
| `inactive` | No hay licencia activada. Plan: Free. |
| `active` | Licencia válida. Plan según el payload. |
| `expired` | Caducada (solo suscripciones). La verificación falla → plan Free. |
| `revoked` | Revocada por el emisor. Plan Free. |
| `transferred` | Transferida a otro dispositivo. Plan Free en este equipo. |

**Ningún estado borra datos.** Cambiar de plan solo cambia qué funciones están
disponibles; el inventario, los pedidos y las copias siguen intactos.

---

## 3. Tipos de licencia

| `kind` | Caducidad | Notas |
|---|---|---|
| `founder` | **Nunca** (sin `expiresAt`) | Edición limitada de fundadores |
| `perpetual` | **Nunca** | Compra única |
| `subscription` | Sí (`expiresAt`) | Al caducar vuelve a Free sin borrar nada |

---

## 4. Cómo emitir una licencia (administrador)

> Este procedimiento es **solo para el emisor**. Si eres cliente, usa la pestaña
> **Licencias** de la aplicación con el código que se te haya entregado.

### 4.1 Generar el par de claves (una sola vez)

```powershell
npm run license:keygen
```

Crea `tools/keys/license-private.pem` y `tools/keys/license-public.txt`.

⚠️ **Si pierdes la clave privada, no podrás emitir licencias nuevas ni
revocar.** Haz copia cifrada en un sitio seguro. Si la publicas por error en
Git, considera la clave comprometida: genera un par nuevo y reemitir las
licencias afectadas.

### 4.2 Emitir

```powershell
npm run license:new -- --plan pro --kind founder --holder "Nombre del cliente"
npm run license:new -- --plan business --kind perpetual --holder "Empresa SL"
npm run license:new -- --plan pro --kind subscription --holder "Cliente" --expires 2027-06-30
npm run license:new -- --plan pro --kind perpetual --holder "Cliente" --seats 2
```

Devuelve el **código completo** (de 200+ caracteres). Es lo único que se
entrega al cliente.

### 4.3 Verificar antes de entregar

```powershell
npm run license:verify -- --code <codigo>
```

### 4.4 Registro de emisión

**Pendiente (no está implementado):** un registro de emisión (quién, cuándo,
qué código, a qué cliente). Sin él, no se puede auditar ni revocar de forma
fiable una licencia concreta. Antes de emitir **las 200 + 200 licencias
fundadoras** hay que construirlo, porque ahora mismo la única copia del código
sería el mensaje que se envíe al cliente.

**Por eso no se han generado las 400 licencias.** Emitir códigos que no se
pueden auditar ni recuperar sería un riesgo real.

---

## 5. Cómo activa el cliente

Pestaña **Licencias** → pegar el código → **Activar**.

La activación es **local y offline**: no se envía nada a ningún servidor. Se
guarda en la base de datos y se asocia a una identidad de dispositivo generada
aleatoriamente (UUID v4 guardado localmente, no es un identificador del
hardware).

---

## 6. Activación online — estado real

**No existe.** No hay backend de licencias desplegado, y no se ha fingido uno.

Opciones evaluadas con presupuesto **0 €**:

| Opción | Coste | Problema |
|---|---|---|
| Cloudflare Workers + D1 | Plan gratuito (límites ~100k req/día) | Requiere cuenta y dominio propio; los límites **no están garantizados a largo plazo** |
| Supabase | Plan gratuito (500 MB base) | Requiere cuenta; condiciones que revisar antes de subir datos de clientes |
| VPS propio | 4–10 €/mes | **No es gratuito.** No se ha contratado nada. |

Decisión: **no se ha desplegado ningún backend**, porque:

1. Subir datos de clientes a un servicio de terceros exige antes leer sus
   condiciones y su política de privacidad. No se ha hecho.
2. Ningún plan gratuito puede prometerse indefinidamente.
3. El sistema local funciona y no necesita red.

### Consecuencia para el usuario

- No hay **periodo de gracia** porque no hay servidor que pueda caerse: las
  licencias son offline y no caducan por comprobación.
- No hay **revocación remota**, ni **límite de dispositivos** verificado en un
  servidor, ni **transferencia** gestionada.

Cuando exista backend se añadirán. La arquitectura está preparada: la
comprobación de plan pasa por `LicenseService`, un único punto que se puede
ampliar sin tocar el resto del programa.

---

## 7. Cobro

**No se ha implementado ningún cobro.** No hay pasarela de pago, no se ha
simulado ninguna transacción y no se ha marcado ninguna suscripción como pagada.
Vender licencias requiere decidir proveedor de pago (Stripe, Lemon Squeezy,
Paddle…), revisar sus condiciones, impuestos aplicables (IVA/IVA intracomunitario
para servicios digitales) y verificar los webhooks reales. Es un paso con
consecuencias fiscales: **no se hace sin autorización explícita.**

---

## 8. Preguntas frecuentes

**¿Se puede usar el programa sin licencia?**
Sí. El plan Free es funcional y no caduca.

**¿Si pierdo la licencia pierdo mis datos?**
No. Los datos son tuyos y están en tu equipo. Exporta o haz copia cuando
quieras; esas funciones nunca se bloquean.

**¿Puedo usar una licencia Pro en dos equipos?**
Solo si tiene `seats 2` o superior. Actualmente **no hay validación remota** del
número de dispositivos: la comprobación es local. Es una limitación conocida.

**¿Qué pasa si alguien edita la base de datos para cambiar su plan a Business?**
La firma Ed25519 deja de validar, la aplicación detecta la alteración y el plan
se rebaja a Free. Hay pruebas automatizadas de este caso.
