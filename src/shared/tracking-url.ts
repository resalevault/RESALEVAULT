/**
 * RESALEVAULT - Construccion de la URL de seguimiento.
 *
 * Funcion PURA y por tanto testeable. Es el corazon de "Track Now".
 *
 * Reglas:
 *  1. Si el transportista admite el codigo en la URL (`strategy: 'url'` y la
 *     plantilla contiene `{code}`), se sustituye **codificado** (`encodeURIComponent`).
 *     Asi un codigo con espacios o barras no rompe la URL.
 *  2. Si no, se devuelve la pagina oficial de seguimiento y se marca
 *     `filledByUrl: false`: la interfaz copia el codigo y avisa de que hay que
 *     pegarlo.
 *  3. **Solo se permiten URLs https.** Cualquier otra cosa se rechaza en lugar
 *     de abrirse, para no acabar en `file:` o `javascript:`.
 */

import type { Carrier, CarrierStrategy } from './types-tracking'

export interface TrackUrlInput {
  strategy: CarrierStrategy
  trackUrl: string
  urlTemplate: string
}

export interface TrackUrlOutput {
  url: string
  filledByUrl: boolean
}

/** Comprueba que una URL es https y absoluta. */
export function isSafeTrackingUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Construye la URL final. Devuelve `null` si la URL del transportista no es
 * https: es preferible no abrir nada a abrir algo inseguro.
 */
export function buildTrackUrl(carrier: TrackUrlInput, code: string): TrackUrlOutput | null {
  const trimmedCode = code.trim()
  const template = carrier.urlTemplate.trim()

  if (carrier.strategy === 'url' && template.includes('{code}') && trimmedCode.length > 0) {
    const url = template.replace(/\{code\}/g, encodeURIComponent(trimmedCode))
    if (!isSafeTrackingUrl(url)) return null
    return { url, filledByUrl: true }
  }

  if (!isSafeTrackingUrl(carrier.trackUrl)) return null
  return { url: carrier.trackUrl, filledByUrl: false }
}

/** Variante que acepta una fila de la base de datos. */
export function buildTrackUrlForCarrier(carrier: Carrier, code: string): TrackUrlOutput | null {
  return buildTrackUrl(carrier, code)
}

/**
 * Normaliza un codigo de seguimiento introducido a mano.
 * Se conservan letras, numeros y guiones; se eliminan espacios y se pasa a
 * mayusculas (los transportistas no distinguen mayusculas, pero asi se evitan
 * duplicados falsos).
 */
export function normalizeTrackingCode(code: string): string {
  return code
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toUpperCase()
}

/** Descarta codigos evidentemente invalidos. */
export function isValidTrackingCode(code: string): boolean {
  const normalized = normalizeTrackingCode(code)
  return normalized.length >= 4 && normalized.length <= 60
}
