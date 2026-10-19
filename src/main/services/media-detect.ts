/**
 * RESALEVAULT - Deteccion del tipo REAL de archivo y validacion de rutas.
 *
 * Vive en `shared` porque es logica PURA: no depende de Electron y por tanto se
 * puede probar directamente. La regla de negocio es clara: **no se cree la
 * extension**. Un `.jpg` que en realidad es un ejecutable se rechaza.
 */

import { extname, resolve, sep } from 'node:path'
import { ALLOWED_MEDIA_MIME, type AllowedMediaMime } from '@shared/types-modules'

/** Extension canonica por tipo detectado. */
export const MIME_EXTENSION: Record<AllowedMediaMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv'
}

export const EXTENSION_MIME: Record<string, AllowedMediaMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv'
}

/**
 * Identifica el tipo real leyendo la firma binaria.
 * Devuelve `null` si no es uno de los tipos admitidos.
 */
export function detectMimeType(buffer: Uint8Array): AllowedMediaMime | null {
  if (buffer.length < 4) return null

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  const ascii4 = Buffer.from(buffer.subarray(0, 4)).toString('latin1')
  if (ascii4 === 'GIF8') return 'image/gif'
  if (ascii4 === 'RIFF' && Buffer.from(buffer.subarray(8, 12)).toString('latin1') === 'WEBP') {
    return 'image/webp'
  }
  if (ascii4 === '%PDF') return 'application/pdf'

  // Texto y CSV no tienen firma binaria: se comprueba que sea texto legible.
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192))
  let printable = 0
  for (const byte of sample) {
    if (byte === 0) return null
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 160) {
      printable += 1
    }
  }
  if (sample.length > 0 && printable / sample.length > 0.9) {
    return looksLikeCsv(sample) ? 'text/csv' : 'text/plain'
  }

  return null
}

/** Heuristica: varias filas con separador apuntan a un CSV. */
function looksLikeCsv(sample: Uint8Array): boolean {
  const head = Buffer.from(sample).toString('utf8')
  const lines = head.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 5)
  if (lines.length < 2) return false
  const withSeparator = lines.filter((line) => line.includes(',') || line.includes(';')).length
  return withSeparator >= 2
}

/** MIME a partir de la extension. Solo para servir el archivo, no para validarlo. */
export function mimeForExtension(path: string): string {
  const extension = extname(path).replace('.', '').toLowerCase()
  return EXTENSION_MIME[extension] ?? 'application/octet-stream'
}

/**
 * Comprueba que una ruta resuelta este DENTRO de una carpeta permitida.
 * Es la defensa contra rutas con `..\..\`.
 */
export function isInsideDirectory(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  if (resolvedCandidate === resolvedRoot) return true
  return resolvedCandidate.startsWith(resolvedRoot + sep)
}

/** Comprueba que un tipo detectado esta en la lista de admitidos. */
export function isAllowedMime(mime: string | null): mime is AllowedMediaMime {
  if (!mime) return false
  return (ALLOWED_MEDIA_MIME as readonly string[]).includes(mime)
}
