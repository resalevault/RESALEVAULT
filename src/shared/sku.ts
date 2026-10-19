/**
 * RESALEVAULT - Generacion de SKU.
 *
 * Un SKU es el identificador legible y unico de un articulo. Se genera
 * automaticamente pero el usuario puede editarlo, por lo que la unicidad SIEMPRE
 * se valida tambien en la base de datos (indice UNIQUE COLLATE NOCASE) y no
 * solo en la interfaz.
 *
 * Tokens admitidos en el patron:
 *   {PREFIX}  Prefijo configurable (ajustes), p. ej. RV
 *   {CAT}     3 primeras letras de la categoria (o GEN si no hay categoria)
 *   {YYYY}    Anyo de adquisicion
 *   {YY}      Anyo a dos digitos
 *   {MM}      Mes a dos digitos
 *   {DD}      Dia a dos digitos
 *   {SEQ}     Numero de secuencia (sin relleno)
 *   {SEQ:n}   Numero de secuencia rellenado con ceros a n digitos
 */

export const SKU_TOKENS = ['PREFIX', 'CAT', 'YYYY', 'YY', 'MM', 'DD', 'SEQ'] as const
export type SkuToken = (typeof SKU_TOKENS)[number]

export const DEFAULT_SKU_PATTERN = '{PREFIX}-{CAT}-{YY}{MM}-{SEQ:4}'
export const MAX_SEQ_PADDING = 10
export const MAX_SKU_LENGTH = 48

export interface SkuContext {
  prefix: string
  categoryName: string | null
  date: Date
  sequence: number
}

export interface SkuPatternValidation {
  ok: boolean
  unknownTokens: string[]
  hasSequence: boolean
}

/** Crea una expresion regular nueva por llamada: es `g` y tiene estado propio. */
function tokenRegex(): RegExp {
  return new RegExp(/\{([A-Z]+)(?::(\d+))?\}/.source, 'g')
}

/** Comprueba un patron y detecta tokens desconocidos o malformados. */
export function validateSkuPattern(pattern: string): SkuPatternValidation {
  const unknownTokens: string[] = []
  let hasSequence = false
  const regex = tokenRegex()

  let match: RegExpExecArray | null
  while ((match = regex.exec(pattern)) !== null) {
    const token = match[1]
    if (!token || !(SKU_TOKENS as readonly string[]).includes(token)) {
      unknownTokens.push(match[0])
      continue
    }
    if (token === 'SEQ') {
      hasSequence = true
      const padding = match[2] ? Number(match[2]) : 0
      if (match[2] && (!Number.isInteger(padding) || padding < 1 || padding > MAX_SEQ_PADDING)) {
        unknownTokens.push(match[0])
      }
    } else if (match[2]) {
      // Solo SEQ admite el modificador :n
      unknownTokens.push(match[0])
    }
  }

  // Llaves sueltas o mal cerradas que no forman un token.
  const leftovers = pattern.replace(tokenRegex(), '')
  const strayBraces = leftovers.match(/[{}]/g)
  if (strayBraces) unknownTokens.push(...strayBraces)
  if (pattern.replace(tokenRegex(), '').trim() === '' && pattern.trim() === '') {
    unknownTokens.push(pattern)
  }

  return { ok: unknownTokens.length === 0, unknownTokens, hasSequence }
}

/** Convierte un nombre de categoria en un fragmento de SKU estable. */
export function categoryToSkuPart(categoryName: string | null, length = 3): string {
  if (!categoryName) return 'GEN'
  const clean = categoryName
    .normalize('NFD')
    // Elimina los diacriticos (marcas de acento) tras la descomposicion NFD.
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (clean.length === 0) return 'GEN'
  return clean.slice(0, length).padEnd(length, 'X')
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Aplica el patron y devuelve el SKU final (sin validar unicidad). */
export function renderSkuPattern(pattern: string, ctx: SkuContext): string {
  const year = ctx.date.getFullYear()
  const month = ctx.date.getMonth() + 1
  const day = ctx.date.getDate()

  const rendered = pattern.replace(tokenRegex(), (_full, rawToken: string, rawPadding?: string) => {
    switch (rawToken) {
      case 'PREFIX':
        return ctx.prefix
      case 'CAT':
        return categoryToSkuPart(ctx.categoryName)
      case 'YYYY':
        return String(year)
      case 'YY':
        return pad(year % 100, 2)
      case 'MM':
        return pad(month, 2)
      case 'DD':
        return pad(day, 2)
      case 'SEQ':
        return rawPadding ? pad(ctx.sequence, Number(rawPadding)) : String(ctx.sequence)
      default:
        return rawToken
    }
  })

  // Normalizacion defensiva: mayusculas, sin espacios, sin guiones duplicados.
  return rendered
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SKU_LENGTH)
}

/**
 * Genera candidatos de SKU incrementando la secuencia. Devolver un iterador
 * permite al repositorio comprobar la unicidad contra la base de datos sin
 * fijar aqui el limite de intentos.
 */
export function* skuCandidates(pattern: string, ctx: Omit<SkuContext, 'sequence'>, startAt = 1): Generator<string> {
  let sequence = startAt
  for (;;) {
    yield renderSkuPattern(pattern, { ...ctx, sequence })
    sequence += 1
  }
}
