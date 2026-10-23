/**
 * RESALEVAULT - Paleta de acento.
 *
 * El acento es un eje INDEPENDIENTE del tema (claro/oscuro): el usuario elige
 * el color de accion y lo mantiene al cambiar de tema.
 *
 * Este modulo es PURO y sin dependencias de React: define los presets, valida
 * un HEX personalizado y calcula la tinta de contraste (texto legible sobre el
 * color). Asi se puede probar sin arrancar la interfaz.
 *
 * El CSS (src/renderer/src/app.css) declara los mismos identificadores en
 * [data-accent='...']. Hay una prueba que comprueba que no se desincronizan.
 */

/** Identificadores de preset soportados. */
export const ACCENT_PRESETS = [
  'green',
  'purple',
  'blue',
  'teal',
  'orange',
  'red',
  'pink',
  'gold',
  'gray'
] as const

export type AccentPreset = (typeof ACCENT_PRESETS)[number]

/** Valor especial: el usuario ha elegido un color HEX propio. */
export const ACCENT_CUSTOM = 'custom'

export type AccentChoice = AccentPreset | typeof ACCENT_CUSTOM

/** Preset por defecto: el verde acido de la identidad de RESALEVAULT. */
export const DEFAULT_ACCENT: AccentPreset = 'green'

/** Color HEX por defecto cuando el usuario pasa a "personalizado". */
export const DEFAULT_CUSTOM_HEX = '#c8ff3d'

/**
 * Muestra de cada preset, para pintar los circulos del selector. Coincide con
 * el valor de `--accent` de cada uno en el CSS (prueba en accent.test.ts).
 */
export const ACCENT_SWATCH: Record<AccentPreset, string> = {
  green: '#c8ff3d',
  purple: '#a855f7',
  blue: '#4d9bff',
  teal: '#2dd4bf',
  orange: '#ff9640',
  red: '#ff6b6b',
  pink: '#f472b6',
  gold: '#e2b53f',
  gray: '#c9cdd6'
}

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** ¿Es un HEX valido (#rgb o #rrggbb)? */
export function isValidHex(value: string): boolean {
  return HEX_PATTERN.test(value.trim())
}

/** Normaliza a #rrggbb en minusculas; devuelve null si no es valido. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim()
  if (!HEX_PATTERN.test(trimmed)) return null
  const body = trimmed.slice(1).toLowerCase()
  if (body.length === 3) {
    return '#' + body[0] + body[0] + body[1] + body[1] + body[2] + body[2]
  }
  return '#' + body
}

/** ¿Es un identificador de preset valido? */
export function isAccentPreset(value: unknown): value is AccentPreset {
  return typeof value === 'string' && (ACCENT_PRESETS as readonly string[]).includes(value)
}

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex)
  if (!normalized) return { r: 0, g: 0, b: 0 }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  }
}

/**
 * Luminancia relativa segun WCAG 2.1 (canales linealizados), en [0, 1].
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Razon de contraste WCAG entre dos colores (1 a 21).
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Tinta (texto) que se coloca SOBRE el color de acento: negro o blanco, el que
 * mas contraste ofrezca. Es el equivalente puro de `--accent-ink`.
 */
export function accentInk(hex: string): '#0b0b0c' | '#ffffff' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#0b0b0c') ? '#ffffff' : '#0b0b0c'
}

/**
 * ¿El color es demasiado claro para usarse como acento en modo claro (quedaria
 * casi invisible sobre fondo blanco)? Se usa solo para AVISAR, nunca para
 * impedir la eleccion del usuario.
 */
export function isLowContrastOnLight(hex: string): boolean {
  // 3:1 es el minimo WCAG para elementos de interfaz (no texto).
  return contrastRatio(hex, '#f4f4f1') < 3
}

/** ¿El color queda ilegible sobre fondo oscuro? Misma idea que arriba. */
export function isLowContrastOnDark(hex: string): boolean {
  return contrastRatio(hex, '#0b0b0c') < 3
}

/**
 * Estado persistido del acento. Se guarda en localStorage como JSON para poder
 * recordar POR SEPARADO el preset y el HEX personalizado (al volver al preset
 * no se pierde el HEX que el usuario habia escrito).
 */
export interface AccentState {
  choice: AccentChoice
  customHex: string
}

export const DEFAULT_ACCENT_STATE: AccentState = {
  choice: DEFAULT_ACCENT,
  customHex: DEFAULT_CUSTOM_HEX
}

/** Interpreta el valor guardado; tolera datos antiguos o corruptos. */
export function parseAccentState(raw: string | null): AccentState {
  if (!raw) return { ...DEFAULT_ACCENT_STATE }
  // Formato antiguo: solo el identificador del preset ('green').
  if (isAccentPreset(raw)) return { choice: raw, customHex: DEFAULT_CUSTOM_HEX }
  if (raw === ACCENT_CUSTOM) return { choice: ACCENT_CUSTOM, customHex: DEFAULT_CUSTOM_HEX }
  try {
    const parsed = JSON.parse(raw) as Partial<AccentState>
    const choice: AccentChoice =
      parsed.choice === ACCENT_CUSTOM
        ? ACCENT_CUSTOM
        : isAccentPreset(parsed.choice)
          ? parsed.choice
          : DEFAULT_ACCENT
    const customHex = normalizeHex(String(parsed.customHex ?? '')) ?? DEFAULT_CUSTOM_HEX
    return { choice, customHex }
  } catch {
    return { ...DEFAULT_ACCENT_STATE }
  }
}

/** Serializa el estado para localStorage. */
export function serializeAccentState(state: AccentState): string {
  return JSON.stringify(state)
}
