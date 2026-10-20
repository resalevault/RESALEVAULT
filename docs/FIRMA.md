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
SHA-256:   d75a7b23ae068af141eef41947fe55853b2b4403a6af2ab2cbcd655aefbe8141
Commit:    a7fb7f2
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
> Comprobado durante este trabajo: compilaciones consecutivas del mismo código
> dieron, entre otros, `cc685320…`, `c28bcd4f…`, `91a65a60…`, `9ebed6a1…`,
> `741c091a…`, `228f4858…` y `d75a7b23…`. El hash **no identifica la versión del código**,
> solo el archivo concreto.

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
- **La instalación sigue bloqueada en este equipo** por una política de nivel
  de firma Enterprise (evento `3033` de Code Integrity, ver sección 9), y un
  autofirmado no lo cambia.
- Para entregar a clientes hace falta un certificado OV/IV. Es el único gasto
  que desbloquea realmente la distribución; a 0 €, la vía es verificar la
  instalación en una máquina limpia (sección 10).

---

## 9. Diagnóstico del bloqueo de instalación (20/10/2026)

Evidencia real recogida en este equipo, **sin modificar ni desactivar nada**:

| Comprobación | Resultado |
|---|---|
| `Win32_DeviceGuard.CodeIntegrityPolicyEnforcementStatus` | `2` = integridad de código **impuesta** |
| Evento `3033` (19/10/2026 23:01) | `node.exe` intentó ejecutar `RESALEVAULT-Setup-0.4.0.exe`: «did not meet the **Enterprise signing level requirements**» |
| Evento `3033` (19/10/2026 22:58) | `cmd.exe` intentó ejecutar `RESALEVAULT-Setup-0.3.0.exe`: mismo rechazo |
| Smart App Control (`VerifiedAndReputablePolicyState`) | `0` = **desactivado** (no es el causante) |
| Windows Defender (`Get-MpThreatDetection`) | **cero detecciones** (no hay falso positivo que corregir) |
| Política WDAC desplegada (`SiPolicy.p7b`) | ausente (la verificación viene activada por otra vía del sistema) |

Conclusiones:

1. El bloqueo lo emite la verificación de **nivel de firma Enterprise** de
   Windows. Un certificado autofirmado no lo cumple, y **ninguna ofuscación,
   inserción de NOP o reempaquetado lo arreglaría**: empaquetar un binario sin
   publisher confiable empeora su reputación ante los antivirus, no la mejora.
2. La política **no se toca ni se desactiva**: este proyecto no baja defensas
   de Windows.
3. **No existe hoy ninguna detección de antivirus** del proyecto. Se deja
   escrito por honestidad.

Salidas legítimas: certificado OV/IV (sección 4) o verificar la instalación en
una máquina sin esa política (sección 10).

---

## 10. Verificación de instalación en una máquina limpia (0 €)

Kit incluido en el repositorio: **`scripts/verify-install.ps1`**. Comprueba el
hash SHA-256 del instalador (y opcionalmente que coincide con el publicado),
instala en silencio, arranca la aplicación, comprueba que sigue en memoria a los
20 segundos y que se crearon base de datos y migraciones; escribe un informe y
devuelve código 0 (todo correcto) o 1.

Pasos en la máquina destino (otro PC de Windows sin políticas de la
organización; no hace falta ser administrador porque la instalación es por
usuario):

1. Copiar a un USB `RESALEVAULT-Setup-0.5.0.exe` y `verify-install.ps1`.
2. Abrir PowerShell en esa carpeta y ejecutar:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\verify-install.ps1 -ExpectedHash d75a7b23ae068af141eef41947fe55853b2b4403a6af2ab2cbcd655aefbe8141
   ```

3. Debe terminar con `RESULTADO: TODO CORRECTO` y dejar el informe
   `verificacion-install-<fecha>.txt`.

Si no hay otra máquina física, una alternativa gratuita es VirtualBox con una
ISO de evaluación oficial de Windows (90 días). Windows 11 Home no incluye ni
Sandbox ni Hyper-V, por eso el kit no depende de ninguno de los dos.

**Estado honesto: el kit está escrito, sin errores de sintaxis y probado en
modo `-HashOnly` (hash correcto del instalador 0.5.0). La instalación en una
maquina limpia sigue pendiente de ejecutarse y no se afirma lo contrario.**

---

## 11. Antivirus y SmartScreen (política de distribución)

Situación medida a 20/10/2026: **Defender sin ninguna detección** del proyecto.

Reglas que se seguirán al distribuir (legítimas y sin coste):

- **Nada de ofuscación, cifrado de cadenas ni reempaquetado**: la transparencia
  es lo que construye reputación; ocultar el binario la destruye y dispara las
  heurísticas de los antivirus.
- Publicar el **hash SHA-256** de cada release junto a la descarga (ya aparece
  en «Acerca de» y en la documentación).
- Enviar cada release nuevo a los portales de revisión gratuitos, empezando por
  Microsoft: <https://www.microsoft.com/wdsi/filesubmission>.
- Con certificado OV/IV (cuando haya presupuesto), SmartScreen acumula
  reputación por volumen de instalaciones legítimas.
