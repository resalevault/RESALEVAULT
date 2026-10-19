/**
 * RESALEVAULT - Formato y conversion de importes y fechas.
 *
 * Decision de diseno: TODO el dinero se almacena y se transporta como enteros
 * en centimos (integer cents). Los numeros en coma flotante producen errores
 * de redondeo acumulativos (0.1 + 0.2 !== 0.3) que en contabilidad son
 * inaceptables. La conversion a texto ocurre solo al pintar la interfaz.
 */

export const MIN_SAFE_CENTS = Number.MIN_SAFE_INTEGER
export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER

export interface MoneyFormatOptions {
  locale: string
  currency: string
  /** Numero de decimales a mostrar. Por defecto, 2. */
  decimals?: number
  /** Si es true y el importe es negativo, se muestra entre parentesis (contabilidad). */
  accounting?: boolean
}

/** Convierte centimos a un numero decimal. Solo para presentacion/calculo. */
export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100
}

/** Convierte un importe decimal a centimos redondeando al centimo mas cercano. */
export function amountToCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  // Fuera del rango util se usa la via rapida: a partir de 1e12 el margen de
  // error del binario es irrelevante frente a la magnitud.
  if (Math.abs(amount) >= 1e12) return Math.round(amount * 100)

  // Se redondea sobre la REPRESENTACION DECIMAL del numero, no sobre el
  // binario. Asi 4.005 -> 401 centimos y no 400, que es lo que espera quien
  // escribe ese importe. El redondeo se hace con aritmetica entera.
  const sign = amount < 0 ? -1 : 1
  const [integerPart, decimalPart = ''] = Math.abs(amount).toFixed(10).split('.')
  const decimals = (decimalPart + '0000000000').slice(0, 10)
  const hundredths = decimals.slice(0, 2)
  const nextDigit = decimals.charAt(2)

  let cents = Number(integerPart) * 100 + Number(hundredths)
  if (Number(nextDigit) >= 5) cents += 1
  return sign * cents
}

/**
 * Interpreta el texto introducido por el usuario y devuelve centimos.
 *
 * Reglas (documentadas porque el parseo de importes es una fuente clasica de
 * errores contables):
 *  - Se ignoran espacios, simbolos de moneda y separadores de millar.
 *  - Si aparecen '.' y ',' juntos, el ULTIMO en aparecer es el separador
 *    decimal y el otro se considera separador de millar.
 *  - Si solo aparece un separador y va seguido de exactamente 3 digitos al
 *    final y no es el separador decimal del idioma, se trata como millar.
 *  - En cualquier otro caso se usa el separador decimal del idioma activo.
 *
 * Devuelve `null` si el texto no representa un importe valido (incluido texto
 * vacio), para que la interfaz pueda distinguir "vacio" de "cero".
 */
export function parseAmountToCents(raw: string, locale: string): number | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-')

  // Solo digitos y separadores.
  const cleaned = trimmed.replace(/[^\d.,]/g, '')
  if (cleaned === '') return null

  const decimalSeparatorForLocale = locale.toLowerCase().startsWith('en') ? '.' : ','

  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')

  let normalized: string

  if (lastDot !== -1 && lastComma !== -1) {
    // Ambos presentes: el ultimo manda como decimal.
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = cleaned.replace(/,/g, '')
    }
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ','
    const index = lastDot !== -1 ? lastDot : lastComma
    const digitsAfter = cleaned.length - index - 1
    const occurrences = cleaned.split(sep).length - 1

    if (sep === decimalSeparatorForLocale) {
      // Es el separador decimal del idioma: si aparece varias veces, la ultima
      // es la decimal y el resto son millares (1.234.567,89 -> imposible aqui
      // porque solo hay un tipo de separador; 1.234.567 seria millares).
      if (occurrences > 1) {
        normalized = cleaned.replace(new RegExp('\\' + sep, 'g'), '')
      } else if (digitsAfter === 3 && index === cleaned.length - 4 && cleaned.length > 4) {
        // 1.234 -> millar, 1234 -> entero
        normalized = cleaned.replace(sep, '')
      } else {
        normalized = sep === ',' ? cleaned.replace(',', '.') : cleaned
      }
    } else {
      // Separador ajeno al idioma: se trata como separador de millar.
      normalized = cleaned.replace(new RegExp('\\' + sep, 'g'), '')
    }
  } else {
    normalized = cleaned
  }

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '' || normalized === '.') return null

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  const cents = amountToCents(value)
  return negative ? -Math.abs(cents) : cents
}

/** Formatea centimos para mostrarlos en la interfaz. */
export function formatCents(cents: number, options: MoneyFormatOptions): string {
  const { locale, currency, decimals = 2, accounting = false } = options
  const value = centsToAmount(cents)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  if (accounting && cents < 0) {
    return '(' + formatter.format(Math.abs(value)) + ')'
  }
  return formatter.format(value)
}

/** Formatea un porcentaje ya calculado (p. ej. 32.5 -> "32,5 %"). */
export function formatPercent(value: number, locale: string, decimals = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value / 100)
}

/** Formatea un entero con separadores de millar del idioma activo. */
export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

/** Formatea una fecha ISO (YYYY-MM-DD) o marca de tiempo completa. */
export function formatDate(value: string | null, locale: string): string {
  if (!value) return ''
  const date = new Date(value.length === 10 ? value + 'T00:00:00' : value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function formatDateTime(value: string | null, locale: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

/**
 * Margen porcentual sobre el precio de venta.
 * Formula: margen% = (precioVenta - coste) / precioVenta * 100
 * Devuelve `null` cuando no es calculable (precio de venta <= 0).
 */
export function marginPercent(revenueCents: number, costCents: number): number | null {
  if (!Number.isFinite(revenueCents) || revenueCents <= 0) return null
  return ((revenueCents - costCents) / revenueCents) * 100
}

/** Dias transcurridos entre una fecha y hoy (siempre >= 0). */
export function daysBetween(fromIso: string, now: Date = new Date()): number {
  const from = new Date(fromIso.length === 10 ? fromIso + 'T00:00:00' : fromIso)
  if (Number.isNaN(from.getTime())) return 0
  const ms = now.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}
