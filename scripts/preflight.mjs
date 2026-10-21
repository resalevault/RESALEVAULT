/**
 * RESALEVAULT - Comprobacion previa del entorno de desarrollo.
 *
 * Detecta un problema real y facil de confundir: que el binario de Electron no
 * este descargado en `node_modules/electron/dist`.
 *
 * Por que puede faltar: a partir de npm 11.19 los scripts de ciclo de vida de
 * las DEPENDENCIAS estan bloqueados por defecto (campo `allowScripts`). Electron
 * 44 ya no declara un `install`, asi que su descarga no ocurre sola. El proyecto
 * lo resuelve con un `postinstall` propio (`install-electron`), que si se
 * ejecuta. Pero si alguien instala con una version antigua de npm, o usa
 * `--ignore-scripts`, el binario no aparece y los comandos que lanzan Electron
 * (`dev`, `smoke`, `smoke:ui`, `doctor`, `bench`) fallan de forma poco clara.
 *
 * Este script comprueba el binario y, si falta, explica el motivo y la solucion
 * en lugar de dejar un error criptico. No descarga nada por su cuenta.
 *
 * Uso:  node scripts/preflight.mjs     (o `npm run preflight`)
 * Salida: 0 si todo esta bien; 1 si falta el binario (con instrucciones).
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Resuelve la ruta del paquete `electron` instalado, sin depender del CWD.
 * Devuelve `null` si el paquete no esta instalado.
 */
export function resolveElectronDir(resolve = (spec) => createRequire(import.meta.url).resolve(spec)) {
  try {
    return dirname(resolve('electron/package.json'))
  } catch {
    return null
  }
}

/**
 * Comprueba el binario de Electron dentro de un directorio de paquete.
 *
 * Es puro respecto al sistema de archivos (solo lee) y no imprime nada, para
 * poder probarlo con dobles. Devuelve:
 *   { ok: true, version }          si el binario existe
 *   { ok: false, reason, message } si falta el paquete o el binario
 *
 * `exists` y `read` son inyectables para las pruebas.
 */
export function checkElectron(
  electronDir,
  {
    exists = existsSync,
    read = (path) => readFileSync(path, 'utf8'),
    joinPath = join,
  } = {}
) {
  if (!electronDir) {
    return {
      ok: false,
      reason: 'no-package',
      message: [
        'PREFLIGHT: no se encuentra el paquete "electron" en node_modules.',
        '',
        'Solucion:',
        '  npm ci            # instalacion reproducible (recomendado)',
        '  # o bien:',
        '  npm install'
      ].join('\n')
    }
  }

  const pathTxt = joinPath(electronDir, 'path.txt')
  const versionFile = joinPath(electronDir, 'dist', 'version')

  let binary = null
  if (exists(pathTxt)) {
    const rel = read(pathTxt).trim()
    if (rel) binary = joinPath(electronDir, 'dist', rel)
  }

  if (!binary || !exists(binary)) {
    return {
      ok: false,
      reason: 'no-binary',
      message: [
        'PREFLIGHT: falta el binario de Electron (no esta descargado).',
        '',
        'Motivo habitual: npm >= 11.19 bloquea por defecto los scripts de las',
        'dependencias. Electron 44 no trae un "install" que se ejecute solo, asi',
        'que su descarga depende del "postinstall" del proyecto. Si instalaste con',
        'una version antigua de npm o con --ignore-scripts, no se ejecuto.',
        '',
        'Solucion (cualquiera de estas):',
        '  npm run postinstall     # descarga solo el binario de Electron',
        '  # o reinstala limpiamente:',
        '  npm ci',
        '',
        'No hace falta desactivar ninguna proteccion de Windows.'
      ].join('\n')
    }
  }

  const version = exists(versionFile) ? read(versionFile).trim() : 'desconocida'
  return { ok: true, version }
}

function main() {
  const result = checkElectron(resolveElectronDir())
  if (result.ok) {
    process.stdout.write('PREFLIGHT: Electron listo (' + result.version + ')\n')
    return
  }
  process.stderr.write('\n' + result.message + '\n\n')
  process.exitCode = 1
}

// Solo actua como CLI cuando se ejecuta directamente (no al importarlo en tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
