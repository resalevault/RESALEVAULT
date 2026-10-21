# RESALEVAULT — Cómo tomar las capturas para la Microsoft Store

Guía práctica para capturar capturas **reales** (no maquetas). Usa el juego de
**datos de ejemplo** que la propia app incluye, así no aparece tu inventario real
y todo se puede retirar después con un botón.

---

## 1. Requisitos de las capturas (oficiales de Microsoft)

| Requisito | Valor |
|---|---|
| Formato | **`.png`** |
| Tamaño máximo de fichero | 50 MB por imagen |
| **Desktop (PC)** | **1366×768 o mayor**; admite hasta 3840×2160 |
| Número | 1 obligatoria; **recomendadas 4–8** (máx. 10 de escritorio) |
| Orientación | Horizontal o vertical |
| Idioma | Se suben **por idioma** (es-ES y en-US por separado) |

Recomendaciones de composición: deja el **tercio inferior despejado** (la Store
puede poner texto encima) y **no añadas logos ni mensajes de marketing**.

---

## 2. Preparar la app con datos de ejemplo (seguro y reversible)

1. Abre la app (en desarrollo o el instalador; ver §5).
2. Ve a **Sistema → Ajustes**.
3. En la tarjeta **«Datos de demostración»**, pulsa **«Insertar datos de ejemplo»**.
   Verás: *«Se han insertado N artículos de ejemplo»*.
   - Los artículos llevan marca `Ejemplo …` y etiqueta `demo`, y se pueden
     borrar de una vez.
   - **No** se tocan tus datos reales (van marcados con `is_demo = 1`).
4. Cuando acabes: **«Eliminar datos de ejemplo»**. No queda rastro.

> Si prefieres no tocar tu base de datos ni la de desarrollo, instala la app en
> un perfil/VM limpio y usa ahí los datos de ejemplo.

---

## 3. Capturas recomendadas (6) — pantallas reales de la app

Orden sugerido (el orden importa: se muestran así en la ficha):

| # | Pantalla (ruta en la app) | Qué debe verse | Leyenda (≤200 car.) |
|---|---|---|---|
| 1 | **Principal → Panel** | Tarjetas de resumen: artículos, valor de inventario, beneficio del periodo | `Tu negocio de un vistazo: inventario, valor y beneficio.` |
| 2 | **Principal → Inventario** | Lista con artículos, estados y márgenes; buscador y filtros | `Todo tu inventario con estado, coste y margen por artículo.` |
| 3 | **Dinero → Analítica** | Gráficos de beneficio por periodo y categoría | `Informes de beneficio por periodo, canal y categoría.` |
| 4 | **Dinero → Pedidos** | Pedidos con líneas, importes y estado | `Pedidos y líneas con el beneficio calculado al céntimo.` |
| 5 | **Gestión → Preparación** | Cola de artículos por preparar / etiquetas | `Prepara y etiqueta tus artículos antes de publicarlos.` |
| 6 | **Sistema → Licencia y plan** | Comparativa Gratis / Pro / Business y botón **«Comprar licencia»** | `Funciones gratuitas para siempre; amplía con una licencia.` |

Notas:
- Si el Panel necesita datos para lucir, inserta primero los ejemplos (§2).
- La pantalla de **Licencia y plan** debe mostrar el plan **Gratis** (estado
  real) con el botón «Comprar licencia» visible.
- **No** captures `Shipping Tracker` con una web de terceros real (para no
  mostrar contenido ni marcas de otros).

---

## 4. Capturar a resolución válida (≥1366×768)

### Opción A — ventana de la app (recomendada)

1. Redimensiona la ventana de RESALEVAULT a al menos **1366×768** (mejor
   **1920×1080** para que quede nítida).
2. Usa la captura de región:
   - `Win` + `Shift` + `S` → recorta la **ventana** de la app.
   - O `Alt` + `Impr Pant` para la ventana activa al portapapeles.
3. Pega en Paint (o similar) y **guarda como `.png`**.

### Opción B — script de captura exacta (PowerShell)

Captura la ventana activa y la escala a 1920×1080, garantizando el mínimo:

```powershell
Add-Type -AssemblyName System.Drawing, System.Windows.Forms

$min = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($min.Width, $min.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($min.Location, [System.Drawing.Point]::Empty, $min.Size)
$g.Dispose()

$out = Join-Path $env:USERPROFILE "Desktop\capturas"
New-Item -ItemType Directory -Force $out | Out-Null
$file = Join-Path $out ("resalevault-" + (Get-Date -Format 'HHmmss') + ".png")
$bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"Guardado: $file"
```

> Si tu pantalla es menor de 1366×768, la captura no cumple el mínimo: usa una
> VM o sube la resolución de pantalla antes de capturar.

### Comprobar que cumplen el mínimo

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem "$env:USERPROFILE\Desktop\capturas\*.png" | ForEach-Object {
  $i = [System.Drawing.Image]::FromFile($_.FullName)
  $ok = if ($i.Width -ge 1366 -and $i.Height -ge 768) { 'OK' } else { 'RECHAZADA' }
  "{0,-40} {1}x{2}  {3}" -f $_.Name, $i.Width, $i.Height, $ok
  $i.Dispose()
}
```

Todas deben salir **OK**.

---

## 5. Desde dónde capturar

- **Desarrollo** (`npm run dev`) o **instalada**
  (`%LOCALAPPDATA%\Programs\RESALEVAULT\RESALEVAULT.exe`).
- Para la ficha de la Store conviene capturar la **versión instalada**, que es la
  que verá el usuario. En este equipo la instalación está bloqueada por política
  de firma (ver `docs/FIRMA.md` §9): hazlo en una **máquina limpia/VM** con el
  instalador de la entrega (`RESALEVAULT_RELEASE\Windows\RESALEVAULT-Setup-0.5.0.exe`).
- Si el icono del sistema aparece en la barra de tareas, cierra o recorta lo que
  no sea la app para no mostrar otras cosas.

---

## 6. Idiomas

La Store pide **capturas por idioma**. Como las pantallas cambian de texto con
el idioma, lo más honesto es:

1. Capturar en **español** (Ajustes → idioma Español).
2. Cambiar a **inglés** y repetir las mismas 6 pantallas.
3. Subir el juego español a la ficha **es-ES** y el inglés a la **en-US**.

Las leyendas por idioma están en `docs/release/STORE_LISTING.md`
(versión en inglés de las descripciones) — tradúcelas o usa las mismas.

---

## 7. Al terminar

1. **Elimina los datos de ejemplo** (Ajustes → «Eliminar datos de ejemplo»).
2. Guarda las 12 imágenes (6 es + 6 en) en una carpeta y nómbralas por orden:
   `01-panel.png`, `02-inventario.png`, … para subirlas en orden.
3. Súbelas en el paso **Store listing** del envío (`docs/release/ENVIO_STORE.md`).

**No se incluye ninguna captura inventada ni generada por IA**: todas provienen
de la app real ejecutándose.
