/**
 * RESALEVAULT - Informacion "Acerca de".
 *
 * Reune dos datos que el usuario puede comprobar por si mismo:
 *  1. El texto completo de los avisos de terceros (THIRD-PARTY-NOTICES.md),
 *     que viaja con la aplicacion y se muestra SIN conexion.
 *  2. El hash SHA-256 del paquete de la aplicacion en uso (app.asar), para que
 *     cualquiera pueda contrastarlo con lo publicado. En desarrollo no existe
 *     ese paquete y se devuelve `null`: nunca se inventa un valor.
 */

import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppHashInfo, ThirdPartyNoticesInfo } from '@shared/types'

const NOTICES_FILENAME = 'THIRD-PARTY-NOTICES.md'

/**
 * Devuelve el contenido de los avisos de terceros o `null` si no se encuentra.
 * Nunca lanza: la pantalla "Acerca de" no debe romperse por un fichero ausente.
 */
export function readThirdPartyNotices(): ThirdPartyNoticesInfo | null {
  const bases = [app.getAppPath(), process.resourcesPath]
  for (const base of bases) {
    if (!base) continue
    const path = join(base, NOTICES_FILENAME)
    try {
      if (!existsSync(path)) continue
      const text = readFileSync(path, 'utf8')
      return { path, text, bytes: Buffer.byteLength(text, 'utf8') }
    } catch {
      // Candidato ilegible (permisos o fichero bloqueado): se prueba el siguiente.
    }
  }
  return null
}

/**
 * Hash SHA-256 del paquete `app.asar` realmente instalado. En desarrollo la
 * ruta es un directorio (no un paquete), por lo que se devuelve `null`.
 */
export function computeAppHash(): AppHashInfo | null {
  const target = app.getAppPath()
  try {
    if (!existsSync(target)) return null
    const bytes = readFileSync(target)
    const hash = createHash('sha256').update(bytes).digest('hex')
    return { algorithm: 'sha256', target, hash, bytes: bytes.byteLength }
  } catch {
    // Directorio (desarrollo) o paquete ilegible: no hay hash que mostrar.
    return null
  }
}
