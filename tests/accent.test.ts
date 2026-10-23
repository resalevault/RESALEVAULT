import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCENT_CUSTOM,
  ACCENT_PRESETS,
  ACCENT_SWATCH,
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_STATE,
  DEFAULT_CUSTOM_HEX,
  accentInk,
  contrastRatio,
  isAccentPreset,
  isLowContrastOnDark,
  isLowContrastOnLight,
  isValidHex,
  normalizeHex,
  parseAccentState,
  relativeLuminance,
  serializeAccentState
} from '@shared/accent'

const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/app.css'), 'utf8')

/** Extrae el bloque de un preset concreto (sin la variante de tema claro). */
function darkPresetBlock(preset: string): string {
  const match = new RegExp(`(?:^|\\n)\\[data-accent='${preset}'\\]\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`No hay bloque para el preset ${preset}`)
  return match[1]
}

describe('paleta de acento: presets', () => {
  it('define entre 8 y 10 presets sin duplicados', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(ACCENT_PRESETS).size).toBe(ACCENT_PRESETS.length)
  })

  it('incluye el preset por defecto', () => {
    expect(ACCENT_PRESETS).toContain(DEFAULT_ACCENT)
  })

  it('tiene una muestra para cada preset y ninguna de mas', () => {
    expect(Object.keys(ACCENT_SWATCH).sort()).toEqual([...ACCENT_PRESETS].sort())
  })

  it('todas las muestras son HEX validos', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(isValidHex(ACCENT_SWATCH[preset])).toBe(true)
    }
  })

  it('la muestra coincide con --accent del CSS (no se desincronizan)', () => {
    for (const preset of ACCENT_PRESETS) {
      const block = darkPresetBlock(preset)
      const value = /--accent:\s*(#[0-9a-fA-F]{3,6})/.exec(block)
      expect(value, `--accent ausente en [data-accent='${preset}']`).not.toBeNull()
      expect(normalizeHex(value?.[1] ?? '')).toBe(normalizeHex(ACCENT_SWATCH[preset]))
    }
  })

  it('el tema claro no declara --accent (el acento es un eje independiente)', () => {
    const lightTheme = /(?:^|\n)\[data-theme='light'\]\s*\{([^}]*)\}/.exec(css)
    expect(lightTheme).not.toBeNull()
    expect(lightTheme?.[1]).not.toMatch(/--accent\s*:/)
  })

  it('cada preset tiene variante para modo claro', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(css).toContain(`[data-theme='light'][data-accent='${preset}']`)
    }
  })

  it('el modo personalizado existe en el CSS', () => {
    expect(css).toContain("[data-accent='custom']")
    expect(css).toContain('--accent-custom')
  })
})

describe('validacion de HEX', () => {
  it('acepta #rgb y #rrggbb', () => {
    expect(isValidHex('#abc')).toBe(true)
    expect(isValidHex('#C8FF3D')).toBe(true)
    expect(isValidHex('  #c8ff3d  ')).toBe(true)
  })

  it('rechaza formatos invalidos', () => {
    for (const value of ['', 'c8ff3d', '#c8ff3', '#c8ff3d00', '#ggg', 'red']) {
      expect(isValidHex(value), value).toBe(false)
    }
  })

  it('recorta espacios antes de validar', () => {
    expect(isValidHex('  #c8ff3d ')).toBe(true)
  })

  it('normaliza a minusculas y expande la forma corta', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('#C8FF3D')).toBe('#c8ff3d')
    expect(normalizeHex('  #C8FF3D ')).toBe('#c8ff3d')
  })

  it('devuelve null si el color no es valido', () => {
    expect(normalizeHex('naranja')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
  })
})

describe('contraste e tinta', () => {
  it('blanco contra negro da el maximo (21:1)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('un color contra si mismo da 1:1', () => {
    expect(contrastRatio('#c8ff3d', '#c8ff3d')).toBeCloseTo(1, 5)
  })

  it('la luminancia sigue el orden esperado', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#c8ff3d')).toBeGreaterThan(relativeLuminance('#7c3aed'))
  })

  it('elige tinta oscura sobre colores claros y blanca sobre oscuros', () => {
    expect(accentInk('#c8ff3d')).toBe('#0b0b0c')
    expect(accentInk('#e2b53f')).toBe('#0b0b0c')
    expect(accentInk('#7c3aed')).toBe('#ffffff')
    expect(accentInk('#1d4ed8')).toBe('#ffffff')
  })

  it('avisa de bajo contraste sobre fondo claro', () => {
    expect(isLowContrastOnLight('#c8ff3d')).toBe(true)
    expect(isLowContrastOnLight('#a16207')).toBe(false)
  })

  it('avisa de bajo contraste sobre fondo oscuro', () => {
    expect(isLowContrastOnDark('#111111')).toBe(true)
    expect(isLowContrastOnDark('#c8ff3d')).toBe(false)
  })
})

describe('estado persistido del acento', () => {
  it('sin datos usa el valor de fabrica', () => {
    expect(parseAccentState(null)).toEqual(DEFAULT_ACCENT_STATE)
    expect(parseAccentState('')).toEqual(DEFAULT_ACCENT_STATE)
  })

  it('tolera el formato antiguo (solo el identificador)', () => {
    expect(parseAccentState('blue')).toEqual({ choice: 'blue', customHex: DEFAULT_CUSTOM_HEX })
    expect(parseAccentState(ACCENT_CUSTOM)).toEqual({
      choice: ACCENT_CUSTOM,
      customHex: DEFAULT_CUSTOM_HEX
    })
  })

  it('ida y vuelta con JSON', () => {
    const state = { choice: 'custom' as const, customHex: '#12ab34' }
    expect(parseAccentState(serializeAccentState(state))).toEqual(state)
  })

  it('descarta un preset desconocido y un HEX invalido', () => {
    expect(parseAccentState(JSON.stringify({ choice: 'amber', customHex: 'x' }))).toEqual(
      DEFAULT_ACCENT_STATE
    )
  })

  it('tolera JSON corrupto', () => {
    expect(parseAccentState('{no es json')).toEqual(DEFAULT_ACCENT_STATE)
  })

  it('reconoce solo presets reales', () => {
    expect(isAccentPreset('green')).toBe(true)
    expect(isAccentPreset('amber')).toBe(false)
    expect(isAccentPreset(3)).toBe(false)
  })
})
