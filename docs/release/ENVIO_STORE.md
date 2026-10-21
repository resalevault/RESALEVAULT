# RESALEVAULT — Envío a la Microsoft Store (Ruta B): lista de comprobación

Guía para el **día del envío**. Todo lo que dice «verificado» se ha ejecutado en
este equipo; lo que requiere tu cuenta está marcado como **tu trámite**.

> Resumen: la preparación técnica ya está hecha y validada. Lo que falta es
> **tu cuenta de Partner Center** (gratuita para particulares desde 2025) y
> hacer clic en «Enviar». No se ha enviado nada todavía.

---

## 0. Estado real (honesto)

| Elemento | Estado |
|---|---|
| Paquete `.appx` generado | ✅ verificado (`release/RESALEVAULT-Store-0.5.0.appx`, 160,98 MB) |
| Manifiesto interior correcto | ✅ identidad `RESALEVAULT`, versión `0.5.0.0` (4 componentes), `rv-media` declarado, en-US + es-ES, `runFullTrust` |
| Sin firmar a propósito | ✅ lo firma Microsoft tras aprobarlo (documentado por Microsoft; se comprobará al enviar) |
| Política de privacidad pública | ✅ `PRIVACY.md` listo para publicar vía GitHub |
| Ficha (textos) | ✅ `docs/release/STORE_LISTING.md` |
| Capturas | ⬜ pendientes de tomar (guía en `docs/release/CAPTURAS.md`) |
| **Cuenta de Partner Center** | ⬜ **tu trámite** |
| **`publisher` real sustituido** | ⬜ **tu trámite** (hoy es el marcador `CN=RESALEVAULT`) |
| Envío y validación real (WACK) | ⬜ sin hacer; **no se afirma ningún resultado** |

---

## 1. Antes de tocar nada — requisitos que debes cumplir

1. **Cuenta de Partner Center**: regístrate en
   <https://storedeveloper.microsoft.com> como **individuo** (gratis).
   Necesitas: cuenta Microsoft, verificación de identidad (documento + selfie)
   y datos fiscales básicos si vas a cobrar (no es necesario para publicar
   gratis; sí para las funciones de pago dentro de la app más adelante).
2. **Nombre reservado**: reserva el nombre `RESALEVAULT` en Partner Center
   (*App name*). Si ya está cogido, usa otro nombre visible
   (p. ej. `RESALEVAULT - Reseller Manager`) — esto **no** cambia el
   `identityName` del paquete.

> **Nada de esto lo puedo hacer yo**: son trámites personales con tu identidad.

---

## 2. Obtener tu `Publisher` real y sustituir el marcador

En Partner Center, abre los **detalles del producto** o la sección de identidad
de la app: ahí aparece el **`Publisher`** con formato `CN=XXXXXXXX-...`.

Edita `electron-builder.appx.yml` y sustituye **exactamente** esa cadena:

```yaml
appx:
  publisher: CN=TU-PUBLISHER-REAL       # copiado literal de Partner Center
  publisherDisplayName: RESALEVAULT
  identityName: RESALEVAULT             # solo si reservaste otro nombre de app
```

Luego regenera el paquete:

```powershell
npm run dist:appx
```

Verificado: tras generarlo, se puede **comprobar el `publisher` dentro del
`.appx`** sin abrir la app:

```powershell
# Copia el .appx a un .zip, extráelo y lee AppxManifest.xml:
$w = "$env:TEMP\rv-appx-check"
Remove-Item $w -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $w | Out-Null
Copy-Item "release\RESALEVAULT-Store-0.5.0.appx" "$w\p.zip"
Expand-Archive "$w\p.zip" "$w\x" -Force
([xml](Get-Content "$w\x\AppxManifest.xml" -Raw)).Package.Identity.Publisher
```

Debe imprimir tu `CN=…` real, **no** `CN=RESALEVAULT`.

---

## 3. Capturas de pantalla

Sigue `docs/release/CAPTURAS.md`. Resumen de requisitos oficiales:

- Formato **`.png`**, **≤ 50 MB** por imagen.
- **Desktop: 1366×768 o más** (admite hasta 3840×2160).
- Se recomiendan **4–8 capturas**; solo 1 es obligatoria.
- Sube las capturas **por idioma** (es-ES y en-US por separado), aunque sean las
  mismas imágenes.
- No añadas logos ni mensajes de marketing a las capturas; deja el tercio
  inferior despejado (la Store puede poner texto encima).

---

## 4. Montar los recursos gráficos (logos)

Obligatorio: el **logo de la Store** se toma del paquete si no subes otro.
Recomendados (mejoran la ficha):

| Recurso | Tamaño | Estado |
|---|---|---|
| Icono de app 1:1 | 300×300 px | se puede generar desde `build/icon.png` (1254×1254) |
| Super hero art 16:9 | 1920×1080 px | **sin texto**; opcional |
| Póster 2:3 | 720×1080 px | opcional para apps |
| Tráiler | 1920×1080, MP4/MOV | opcional |

Los iconos del paquete ya existen y están verificados; para el icono 300×300 de
la ficha basta redimensionar `build/icon.png` (no hace falta diseñar nada nuevo).
**No se incluyen** logotipos de terceros (Vinted, Wallapop, eBay…): solo se
nombran como canales, sin sus logos.

---

## 5. Rellenar el envío en Partner Center

Usa **literalmente** los textos de `docs/release/STORE_LISTING.md`:

1. **Precio y disponibilidad**: Gratis; mercados: al menos España y EE. UU.
2. **Propiedades**: categoría `Business`; público adulto; **Política de
   privacidad** = URL de tu `PRIVACY.md` publicado (ver §6).
3. **Edad / clasificación**: completa el cuestionario IARC (gratis). Respuestas
   coherentes con la app: sin contenido para adultos, sin juego, sin violencia.
4. **Paquetes**: sube `release/RESALEVAULT-Store-0.5.0.appx` (el **regenerado**
   con tu `publisher`).
5. **Ficha de la Store (Store listing)**: pega descripciones, palabras clave y
   sube las capturas y logos.
6. **Enviar a certificación**.

> La Store **re-firma** el paquete al aprobarlo; por eso se envía sin firmar.
> Esto está documentado por Microsoft; el resultado real se verá al enviar y se
> anotará aquí **cuando ocurra de verdad**.

---

## 6. Publicar la política de privacidad (gratis)

1. Sube el repositorio a GitHub (Ruta A, paso 1 de
   `docs/release/PUBLICACION_RUTA_A.md`).
2. La URL pública será:
   `
   https://github.com/16ray/RESALEVAULT/blob/master/PRIVACY.md
   `
3. Pégala en el campo **Privacy policy URL**.
4. **Términos de servicio (EULA)**: la Store tiene un campo para el acuerdo de
   licencia. `TERMS.md` (raíz del repositorio) es un **borrador**; revísalo,
   rellena las partes entre `⟨corchetes⟩` (nombre fiscal, contacto, reembolsos,
   ley aplicable) y publica la URL:
   `
   https://github.com/16ray/RESALEVAULT/blob/master/TERMS.md
   `
   El mismo documento es el `LicenseUrl` de los manifiestos de winget.

> Nota MSIX: dentro de un paquete de la Store, `%APPDATA%` queda
> **virtualizado** en el contenedor de la app. Los datos siguen siendo del
> usuario y locales, pero se guardan en la ubicación virtualizada de la app.
> Esto ya está reflejado en `PRIVACY.md`.

---

## 7. Qué puede salir mal (honesto)

| Riesgo | Qué hacer |
|---|---|
| **WACK** (Windows App Certification Kit) marca algo | Es lo normal en el primer envío; se lee el informe, se corrige y se reenvía. No se afirma que pase a la primera. |
| `publisher` no coincide con el de Partner Center | El paquete se rechaza al subirlo. Repite §2 y comprueba con el comando de verificación. |
| El nombre `RESALEVAULT` está reservado | Usa otro nombre visible; el `identityName` no tiene por qué cambiar. |
| Capturas de otra resolución | 1366×768 mínimo; re-captura a 1920×1080 si dudas. |
| Datos de ejemplo en capturas | Se ven como «Ejemplo …» a propósito; **no** son inventario real. Retíralos al terminar con «Eliminar datos de ejemplo». |
| Falsa expectativa de «firmado por Microsoft» | Solo la Store firma **después** de aprobar. No se afirma nada antes. |

---

## 8. Después del envío (registro)

Cuando la Store responda, anota aquí el resultado **real** (fecha, estado,
mensajes) y actualiza `docs/ESTADO.md`. Hasta entonces, el estado de esta ruta
es **«preparada, no enviada»**.
