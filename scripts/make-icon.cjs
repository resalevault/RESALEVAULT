/**
 * RESALEVAULT - Generacion del icono de la aplicacion.
 *
 * Dibuja el monograma RV en HTML/SVG y lo rasteriza a PNG usando el propio
 * motor de render de Electron. Asi no hace falta ninguna dependencia de imagen
 * (ni nativa, ni servicio externo): el icono se regenera con un comando y queda
 * versionado en `build/`.
 *
 * Uso:  npm run icon
 */

const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 512

/** Monograma RV con la identidad: verde acido sobre negro carbon. */
const HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; width: ${SIZE}px; height: ${SIZE}px; background: transparent; }
      .badge {
        width: ${SIZE}px; height: ${SIZE}px;
        background: linear-gradient(150deg, #141417 0%, #0b0b0c 60%, #08080a 100%);
        position: relative;
        display: grid;
        place-items: center;
        font-family: 'Segoe UI Variable Display', 'Segoe UI', Arial, sans-serif;
      }
      .grid {
        position: absolute; inset: 0;
        background-image:
          linear-gradient(rgba(200,255,61,0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(200,255,61,0.055) 1px, transparent 1px);
        background-size: 32px 32px;
        background-position: 0 0;
      }
      .frame {
        position: absolute; inset: 30px;
        border: 3px solid rgba(200,255,61,0.22);
        border-radius: 62px;
      }
      .mark {
        position: relative;
        display: flex;
        align-items: baseline;
        gap: 4px;
        color: #c8ff3d;
        font-weight: 800;
        font-size: 250px;
        letter-spacing: -0.085em;
        line-height: 1;
        text-shadow: 0 0 70px rgba(200,255,61,0.35);
      }
      .rule {
        position: absolute; left: 30px; right: 30px; bottom: 118px;
        height: 6px; background: #c8ff3d; border-radius: 3px;
      }
      .sub {
        position: absolute; left: 0; right: 0; bottom: 66px;
        text-align: center;
        font-size: 25px; font-weight: 700; letter-spacing: 0.42em;
        color: rgba(242,242,238,0.72);
        padding-left: 0.42em;
      }
    </style>
  </head>
  <body>
    <div class="badge">
      <div class="grid"></div>
      <div class="frame"></div>
      <div class="mark"><span>R</span><span>V</span></div>
      <div class="rule"></div>
      <div class="sub">RESALEVAULT</div>
    </div>
  </body>
</html>`

app.whenReady().then(async () => {
  const outDir = join(process.cwd(), 'build')
  mkdirSync(outDir, { recursive: true })

  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false, contextIsolation: true, nodeIntegration: false }
  })

  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML))
  // Se deja un instante para que el motor pinte el degradado y el texto.
  await new Promise((resolve) => setTimeout(resolve, 700))

  const captured = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  // `capturePage` devuelve la imagen a la escala del monitor (por ejemplo
  // 640x640 en una pantalla al 125 %). Se normaliza a 512x512 para que el
  // resultado sea siempre el mismo independientemente del equipo.
  const size = captured.getSize()
  const image =
    size.width !== SIZE || size.height !== SIZE
      ? captured.resize({ width: SIZE, height: SIZE, quality: 'best' })
      : captured
  const png = image.toPNG()

  if (png.length === 0) {
    process.stderr.write('No se ha podido capturar el icono\n')
    app.exit(1)
    return
  }

  const target = join(outDir, 'icon.png')
  writeFileSync(target, png)
  const finalSize = image.getSize()
  process.stdout.write(
    `Icono generado: ${target} (${finalSize.width}x${finalSize.height}, ${png.length} bytes)\n`
  )

  window.destroy()
  app.exit(0)
})
