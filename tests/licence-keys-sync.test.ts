import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LICENSE_FORMAT_VERSION as APP_VERSION, LICENSE_PUBLIC_KEY_BASE64 as APP_KEY } from '@shared/license-keys'
import { PLAN_LIMITS } from '@shared/plans'
import {
  ALLOWED_KINDS as FN_KINDS,
  ALLOWED_PLANS as FN_PLANS,
  LICENSE_FORMAT_VERSION as FN_VERSION,
  LICENSE_PUBLIC_KEY_BASE64 as FN_KEY
} from '../supabase/functions/licence/keys'

/**
 * La Edge Function no puede importar `src/shared` (Supabase sube solo su
 * carpeta), asi que duplica dos constantes. Esta prueba impide que la copia se
 * desincronice en silencio: si divergen, la app rechazaria los codigos que el
 * servidor considera validos.
 */
describe('constantes compartidas con el backend', () => {
  it('la clave publica y la version son identicas a las de la app', () => {
    expect(FN_KEY).toBe(APP_KEY)
    expect(FN_VERSION).toBe(APP_VERSION)
  })

  it('los planes permitidos coinciden con los limites definidos en la app', () => {
    expect([...FN_PLANS]).toEqual(Object.keys(PLAN_LIMITS))
  })

  it('los tipos de licencia coinciden con los del generador', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'generate-license.mjs'), 'utf8')
    const match = /const ALLOWED_KINDS = \[([^\]]+)\]/.exec(source)
    expect(match).not.toBeNull()
    const kinds = (match?.[1] ?? '')
      .split(',')
      .map((value) => value.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
    expect([...FN_KINDS]).toEqual(kinds)
  })
})
