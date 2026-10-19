# RESALEVAULT — Firma de código

Estado real de la firma, cómo reproducirla y qué limitaciones tiene.

---

## 1. Qué se firma

Electron-builder firma con el mismo certificado:

| Artefacto | Ruta |
|---|---|
| Ejecutable principal | `release\win-unpacked\RESALEVAULT.exe` |
| Instalador | `release\RESALEVAULT-Setup-<version>.exe` |
| Desinstalador | `release\RESALEVAULT-Setup-<version>.__uninstaller.exe` |
| Utilidad de elevación | `resources\elevate.exe` (dentro del paquete) |

---

## 2. Estado actual: certificado **autofirmado de desarrollo**

Se ha generado un certificado de firma de código **gratuito** y **local**:

```
Asunto:  CN=RESALEVAULT (Desarrollo), O=RESALEVAULT, C=ES
Tipo:    CodeSigningCert (autofirmado, RSA 3072, SHA-256)
Validez: 2 años
Archivo: tools\signing\dev-signing.pfx   (excluido de Git)
```

Comando para generarlo (idempotente, no sobrescribe):

```powershell
npm run sign:setup
```

Compilación firmada y verificación automática:

```powershell
npm run dist:signed
```

### Evidencia de la última compilación

```
Artefacto: release\RESALEVAULT-Setup-0.5.0.exe
Tamaño:    118,44 MB
SHA-256:   91a65a6038516e66dd4d91993ddd3e0a6ebf61ef7a86f6d6fe1bacc09278327d
Firma:     UnknownError
```

Y el detalle del estado:

```
Status:        UnknownError
StatusMessage: A certificate chain processed, but terminated in a root
               certificate which is not trusted by the trust provider.
```

**Traducción: la firma existe y es válida criptográficamente, pero la raíz no es
de confianza pública.** Esto es exactamente lo que cabe esperar de un
certificado autofirmado. No es un fallo del empaquetado.

También están firmados `win-unpacked\RESALEVAULT.exe` (el ejecutable interno) y
`RESALEVAULT-Setup-0.5.0.__uninstaller.exe`, con el mismo estado.

> **El instalador NO es reproducible byte a byte.** NSIS incluye marcas de tiempo,
> así que dos compilaciones del mismo código dan hashes distintos. Por eso hay que
> **publicar el hash de la compilación concreta que se entregue**, no un hash
> "oficial" fijo. El script `npm run dist:signed` lo imprime en cada ejecución.
>
> Comprobado durante este trabajo: tres compilaciones consecutivas dieron
> `cc685320…`, `c28bcd4f…` y `91a65a60…`.

---

## 3. Qué significa y qué NO arregla

| Consecuencia | Estado |
|---|---|
| El binario lleva firma verificable | ✅ Sí |
| Windows muestra "editor desconocido" | ⚠️ Sí (la raíz no es confiable) |
| SmartScreen deja de avisar | ❌ **No** |
| Device Guard / AppLocker lo permiten | ❌ **No** (política de la máquina) |
| Sirve para distribución pública | ❌ **No** |
| Sirve para distribución interna controlada | ✅ Sí, instalando el certificado a mano |

**No se han desactivado protecciones de Windows** para sortear esto. No es una
opción: ocultar el problema lo empeora.

---

## 4. Por qué un autofirmado no basta

Windows solo confía en certificados cuya cadena termina en una **raíz del
programa Microsoft Trusted Root**. Un autofirmado termina en sí mismo, que no
está ahí. Por eso:

- SmartScreen no tiene reputación que consultar.
- Las políticas de empresa (Device Guard, AppLocker, Smart App Control) lo
  tratan como editor no verificado.

Para que un equipo **ajeno** confíe hay dos caminos:

1. **Certificado OV/IV de una CA pública** (150–300 €/año). Requiere, desde
   junio de 2023, que la clave privada viva en un **token USB** o un **HSM en
   nube**; ya no se emite un `.pfx` descargable.
2. **Azure Artifact Signing** (antes Trusted Signing), ~9,99 $/mes, sin token.
   Organizaciones de la UE pueden optar; los **particulares** están limitados a
   EE. UU. y Canadá, así que como particular en España probablemente haya que
   darse de alta como autónomo/SL.

**EV ya no aporta ventaja**: desde 2024 Microsoft eliminó el salto automático de
SmartScreen para certificados EV. Pagar el doble no acelera nada.

### Para distribución interna (coste 0)

Si el programa se instala en equipos que tú controlas, puedes confiar en el
certificado manualmente:

```powershell
# En el equipo destino, como administrador, una sola vez:
Import-Certificate -FilePath dev-signing.cer -CertStoreLocation Cert:\LocalMachine\Root
```

Exporta antes el `.cer` desde el `.pfx`:

```powershell
$pwd = ConvertTo-SecureString (Get-Content tools\signing\dev-signing.password) -AsPlainText -Force
Export-Certificate -Cert (Get-PfxCertificate -FilePath tools\signing\dev-signing.pfx -Password $pwd) -FilePath dev-signing.cer
```

> Esto **solo** debe hacerse en equipos propios. Nunca pidas a un cliente que
> instale una raíz de confianza para usar tu programa.

---

## 5. Cómo verificar una descarga

```powershell
# 1. Firma
Get-AuthenticodeSignature .\RESALEVAULT-Setup-0.5.0.exe | Format-List Status, StatusMessage, SignerCertificate

# 2. Integridad
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
```

El SHA-256 se publica junto a cada instalador. Si no coincide, **no lo ejecutes**.

---

## 6. Cómo configurar un certificado real cuando lo tengas

No hay que tocar código: basta con las variables de entorno que ya usa
`scripts/dist-signed.mjs`.

```powershell
# Opción A: archivo .pfx en un HSM/token
$env:WIN_CSC_LINK = "C:\ruta\certificado.pfx"
$env:WIN_CSC_KEY_PASSWORD = "contraseña"
npm run dist:signed

# Opción B: Azure Artifact Signing
# Se firma con signtool y el perfil de certificado de Azure; no hay .pfx.
```

En `scripts/dist-signed.mjs` sustituye la ruta de desarrollo por las variables de
entorno y el resto del proceso (compilar, firmar, verificar, calcular hash) sigue
igual.

---

## 7. Protección de la clave

- El `.pfx` y su contraseña viven en `tools\signing\`, **excluido de Git**.
- `tools\keys\license-private.pem` (clave de licencias) también está excluida.
- No se incluyen en el instalador: `electron-builder.yml` solo empaqueta `out/` y
  `package.json`.
- Si el `.pfx` se ve comprometido: revoca el certificado, genera uno nuevo y
  vuelve a compilar. Con un autofirmado, basta con borrar `tools\signing\` y
  ejecutar `npm run sign:setup`.

### Comprobación real del paquete (ejecutada)

```
release\win-unpacked\resources\
  app.asar                  29.898 KB
  elevate.exe                  120 KB
  THIRD-PARTY-NOTICES.md      23,4 KB   ← avisos de terceros incluidos

Búsqueda de *.pem, *.pfx, *.key, *.password, license-private*  → ninguna
Búsqueda de *.sqlite, *.sqlite-wal                             → ninguno
```

Se confirma que **no hay claves privadas, ni datos de usuario, ni bases de datos
de prueba** dentro del paquete distribuible.

---

## 8. Resumen honesto

- **La firma funciona.** El pipeline firma instalador, ejecutable y
  desinstalador; está verificado con `Get-AuthenticodeSignature`.
- **La confianza pública no existe.** No se ha gastado dinero y no se ha
  simulado lo contrario.
- **La instalación sigue bloqueada en este equipo** por Device Guard, y un
  autofirmado no lo cambia.
- Para entregar a clientes hace falta un certificado OV/IV. Es el único gasto
  que desbloquea realmente la distribución.
