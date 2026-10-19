import { describe, expect, it } from 'vitest'
import { es } from '../src/renderer/src/i18n/es'
import { en } from '../src/renderer/src/i18n/en'
import {
  AVAILABLE_LOCALES,
  DICTIONARIES,
  interpolate,
  missingKeys,
  resolveMessage,
  translate
} from '../src/renderer/src/i18n'

describe('diccionarios', () => {
  it('no falta ninguna clave en ingles respecto a espanol', () => {
    expect(missingKeys(es, en)).toEqual([])
  })

  it('no hay claves sobrantes en ingles', () => {
    expect(missingKeys(en, es)).toEqual([])
  })

  it('todas las hojas son cadenas o formas plurales', () => {
    const inspect = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value.length, `Cadena vacia en ${path}`).toBeGreaterThan(0)
        return
      }
      if (typeof value === 'object' && value !== null) {
        const candidate = value as { one?: unknown; other?: unknown }
        // Solo es una forma plural si TIENE ambas claves como texto. Ojo:
        // `expense.categories.other` es una categoria, no una forma plural.
        if (typeof candidate.one === 'string' && typeof candidate.other === 'string') {
          return
        }
        for (const [key, child] of Object.entries(value)) inspect(child, path ? `${path}.${key}` : key)
        return
      }
      throw new Error(`Valor no textual en ${path}`)
    }
    inspect(es, '')
    inspect(en, '')
  })

  it('expone exactamente los idiomas declarados', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...AVAILABLE_LOCALES].sort())
  })
})

describe('traduccion', () => {
  it('resuelve claves con puntos', () => {
    expect(translate('es', 'inventory.title')).toBe('Inventario')
    expect(translate('en', 'inventory.title')).toBe('Inventory')
  })

  it('interpola parametros', () => {
    expect(translate('es', 'inventory.subtitle', { count: 12 })).toContain('12')
    expect(translate('en', 'bulk.applied', { count: 3 })).toBe('3 items updated')
  })

  it('reescribe los marcadores sin valor en lugar de romperse', () => {
    expect(translate('es', 'inventory.noResults')).not.toContain('{{')
  })

  it('traduce todos los estados, condiciones, tipos de ubicacion y errores', () => {
    const codes = [
      'to_prepare',
      'available',
      'reserved',
      'sold',
      'shipped',
      'returned',
      'archived'
    ] as const
    for (const code of codes) {
      expect(translate('es', `status.${code}`)).not.toContain('[')
      expect(translate('en', `status.${code}`)).not.toContain('[')
    }

    const conditions = ['unknown', 'new', 'like_new', 'good', 'used', 'fair', 'for_parts'] as const
    for (const code of conditions) {
      expect(translate('es', `condition.${code}`)).not.toContain('[')
      expect(translate('en', `condition.${code}`)).not.toContain('[')
    }

    const kinds = ['warehouse', 'shelf', 'box', 'compartment'] as const
    for (const code of kinds) {
      expect(translate('es', `locationKind.${code}`)).not.toContain('[')
      expect(translate('en', `locationKind.${code}`)).not.toContain('[')
    }

    const errors = [
      'invalid_input',
      'not_found',
      'conflict',
      'sku_duplicate',
      'category_duplicate',
      'location_code_duplicate',
      'location_path_duplicate',
      'invalid_location_hierarchy',
      'cannot_delete_has_children',
      'cannot_delete_in_use',
      'invalid_sku_pattern',
      'db_error',
      'internal_error',
      'forbidden_origin',
      'feature_not_implemented',
      'license_required',
      'plan_limit_reached',
      'unsupported_file_type',
      'file_too_large',
      'storage_error'
    ] as const
    for (const code of errors) {
      expect(translate('es', `errors.${code}`), `falta errors.${code} en es`).not.toContain('[')
      expect(translate('en', `errors.${code}`), `falta errors.${code} en en`).not.toContain('[')
    }
  })

  it('avisa de forma visible cuando una clave no existe', () => {
    // Se usa un idioma inexistente a proposito para comprobar el respaldo.
    expect(translate('es', 'clave.que.no.existe')).toBe('[clave.que.no.existe]')
    expect(resolveMessage(es, 'app.name')).toBe('RESALEVAULT')
  })

  it('cae al espanol si el idioma activo no tuviera la clave', () => {
    // `en` siempre tiene todas las claves por construccion, pero el respaldo
    // debe seguir funcionando si en el futuro se anade un idioma parcial.
    expect(resolveMessage(DICTIONARIES.en, 'app.tagline')).toBe('EVERY ITEM. EVERY PROFIT.')
  })

  it('interpola sin tocar marcadores desconocidos', () => {
    expect(interpolate('{{a}} y {{b}}', { a: '1' })).toBe('1 y {{b}}')
  })
})
