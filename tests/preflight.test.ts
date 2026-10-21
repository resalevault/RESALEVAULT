import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkElectron, resolveElectronDir } from '../scripts/preflight.mjs'
import type { PreflightFailure } from '../scripts/preflight.mjs'

/**
 * Capa pura del preflight: no toca el disco de verdad, usa dobles.
 * Comprueba que detecta bien los tres casos: paquete ausente, binario ausente
 * y todo correcto; y que el mensaje de error es util y no pide desactivar
 * protecciones de Windows.
 */

/** Exige que el resultado sea un fallo y lo devuelve con el tipo ya estrechado. */
function asFailure(result: ReturnType<typeof checkElectron>): PreflightFailure {
  if (result.ok) throw new Error('se esperaba un fallo del preflight, pero dio ok')
  return result
}

describe('checkElectron', () => {
  // Se usa path.join para que las rutas coincidan con las del script en
  // cualquier plataforma (Windows usa separadores propios).
  const dir = join('C:', 'proj', 'node_modules', 'electron')
  const pathTxt = join(dir, 'path.txt')
  const versionFile = join(dir, 'dist', 'version')
  const binary = join(dir, 'dist', 'electron.exe')

  it('falla si el paquete electron no esta instalado', () => {
    const r = asFailure(checkElectron(null))
    expect(r.reason).toBe('no-package')
    expect(r.message).toContain('npm ci')
  })

  it('falla si falta path.txt (la descarga no se ejecuto)', () => {
    const r = asFailure(checkElectron(dir, { exists: () => false, read: () => '' }))
    expect(r.reason).toBe('no-binary')
  })

  it('falla si path.txt apunta a un binario inexistente', () => {
    const r = asFailure(
      checkElectron(dir, {
        exists: (p) => p === pathTxt,
        read: () => 'electron.exe'
      })
    )
    expect(r.reason).toBe('no-binary')
    // El mensaje debe explicar la causa real y la solucion.
    expect(r.message).toContain('npm run postinstall')
    expect(r.message).toContain('npm >= 11.19')
    // Y dejar claro que NO hay que tocar las protecciones de Windows.
    expect(r.message).toContain('No hace falta desactivar ninguna proteccion de Windows.')
  })

  it('averigua el binario a partir de path.txt y lee la version', () => {
    const r = checkElectron(dir, {
      exists: (p) => p === pathTxt || p === binary || p === versionFile,
      read: (p) => (p === pathTxt ? 'electron.exe' : '44.9.1')
    })
    if (!r.ok) throw new Error('se esperaba ok')
    expect(r.version).toBe('44.9.1')
  })

  it('informa version desconocida si no hay fichero de version', () => {
    const r = checkElectron(dir, {
      exists: (p) => p === pathTxt || p === binary,
      read: () => 'electron.exe'
    })
    if (!r.ok) throw new Error('se esperaba ok')
    expect(r.version).toBe('desconocida')
  })

  it('no considera valido path.txt vacio', () => {
    const r = asFailure(
      checkElectron(dir, {
        exists: (p) => p === pathTxt,
        read: () => '   '
      })
    )
    expect(r.reason).toBe('no-binary')
  })
})

describe('resolveElectronDir', () => {
  it('devuelve el directorio del paquete cuando existe', () => {
    const resolved = resolveElectronDir(() => join('C:', 'x', 'node_modules', 'electron', 'package.json'))
    expect(resolved).toBe(join('C:', 'x', 'node_modules', 'electron'))
  })

  it('devuelve null si la resolucion lanza (paquete ausente)', () => {
    const resolved = resolveElectronDir(() => {
      throw new Error('MODULE_NOT_FOUND')
    })
    expect(resolved).toBeNull()
  })
})
