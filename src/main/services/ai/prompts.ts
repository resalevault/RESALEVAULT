/**
 * RESALEVAULT - Construccion de prompts.
 *
 * Logica PURA y por tanto testeable sin red ni claves. Cada tarea tiene su
 * instruccion y su formato de salida.
 *
 * Reglas que se repiten en todos los prompts (y que importan):
 *  1. **No inventar caracteristicas** del producto: marca, talla, estado o
 *     material solo si aparecen en los datos.
 *  2. **No inventar precios de mercado.** En la sugerencia de precio se trabaja
 *     con el coste del articulo y el margen objetivo del usuario, y se dice que
 *     es una estimacion.
 *  3. **No prometer** resultados de venta ni usar lenguaje enganoso.
 *  4. Responder en el idioma indicado, sin adornos ni markdown.
 */

import type { AiTask } from '@shared/types-modules'
import type { ProductAttributes } from '@shared/types'

export interface PromptProduct {
  name: string
  description: string
  sku: string
  brand: string
  model: string
  size: string
  color: string
  condition: string
  categoryName: string | null
  attributes: ProductAttributes
  expectedSalePriceCents: number
  totalCostCents: number
  tags: string[]
}

export interface PromptOptions {
  instruction?: string
  /** Idioma de destino para traducciones y para el idioma de salida. */
  language?: string
  /** Margen objetivo en porcentaje, para la sugerencia de precio. */
  targetMarginPercent?: number
  /** Precio de venta actual, si existe. */
  currentPriceCents?: number
}

export interface BuiltPrompt {
  system: string
  user: string
  /** Formato de salida esperado, para que la interfaz sepa como interpretarlo. */
  output: 'text' | 'json'
}

const BASE_SYSTEM = [
  'Eres un asistente experto en venta de segunda mano y compraventa de articulos.',
  'Escribes de forma clara, concreta y honesta.',
  'Reglas obligatorias:',
  '1. No inventes caracteristicas que no esten en los datos (marca, talla, material, estado).',
  '2. No inventes precios de mercado ni cifras de ventas.',
  '3. No prometas resultados ni uses lenguaje enganoso.',
  '4. No incluyas markdown, comillas decorativas ni explicaciones sobre lo que haces.',
  '5. Si falta un dato importante, escribe el texto sin el en lugar de suponerlo.'
].join('\n')

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'espanol',
  en: 'ingles',
  fr: 'frances',
  de: 'aleman',
  it: 'italiano',
  pt: 'portugues'
}

export function languageName(code: string | undefined): string {
  if (!code) return 'espanol'
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code
}

/** Resumen legible del producto para incluir en el prompt. */
function describeProduct(product: PromptProduct): string {
  const lines: string[] = []
  lines.push(`Nombre actual: ${product.name || '(sin nombre)'}`)
  if (product.categoryName) lines.push(`Categoria: ${product.categoryName}`)
  if (product.brand) lines.push(`Marca: ${product.brand}`)
  if (product.model) lines.push(`Modelo: ${product.model}`)
  if (product.size) lines.push(`Talla o medida: ${product.size}`)
  if (product.color) lines.push(`Color: ${product.color}`)
  if (product.condition) lines.push(`Estado declarado: ${product.condition}`)
  if (product.description) lines.push(`Descripcion actual: ${product.description}`)

  const attributeEntries = Object.entries(product.attributes).filter(
    ([, value]) => value !== null && value !== ''
  )
  if (attributeEntries.length > 0) {
    lines.push(
      'Atributos: ' +
        attributeEntries.map(([key, value]) => `${key}=${String(value)}`).join(', ')
    )
  }

  if (product.tags.length > 0) lines.push(`Etiquetas: ${product.tags.join(', ')}`)
  if (product.expectedSalePriceCents > 0) {
    lines.push(`Precio de venta previsto: ${(product.expectedSalePriceCents / 100).toFixed(2)}`)
  }
  if (product.totalCostCents > 0) {
    lines.push(`Coste total del articulo: ${(product.totalCostCents / 100).toFixed(2)}`)
  }

  return lines.join('\n')
}

export function buildPrompt(task: AiTask, product: PromptProduct, options: PromptOptions = {}): BuiltPrompt {
  const language = languageName(options.language)
  const extra = options.instruction?.trim()
  const extraBlock = extra ? `\nIndicaciones adicionales del usuario: ${extra}` : ''
  const data = describeProduct(product)

  switch (task) {
    case 'title':
      return {
        system: BASE_SYSTEM,
        output: 'text',
        user:
          `Escribe UN titulo de venta en ${language} para este articulo.\n` +
          'Entre 40 y 80 caracteres. Sin emojis. Sin inventar datos.\n' +
          'Incluye marca, tipo de prenda u objeto y talla si estan disponibles.\n' +
          'Devuelve solo el titulo, en una linea.\n\n' +
          `Datos del articulo:\n${data}${extraBlock}`
      }

    case 'description':
      return {
        system: BASE_SYSTEM,
        output: 'text',
        user:
          `Escribe una descripcion de venta en ${language} para este articulo.\n` +
          'Entre 3 y 6 frases cortas. Menciona el estado real tal y como aparece en los datos.\n' +
          'Si el estado es usado, dilo con naturalidad. No exageres.\n' +
          'No incluyas el precio. Devuelve solo el texto.\n\n' +
          `Datos del articulo:\n${data}${extraBlock}`
      }

    case 'translation':
      return {
        system: BASE_SYSTEM,
        output: 'text',
        user:
          `Traduce al ${language} el siguiente texto de un anuncio de segunda mano.\n` +
          'Manten el sentido y el tono. No anadas ni quites informacion.\n' +
          'Devuelve solo la traduccion.\n\n' +
          `Texto:\n${product.description || product.name}${extraBlock}`
      }

    case 'classification':
      return {
        system: BASE_SYSTEM,
        output: 'json',
        user:
          'Clasifica este articulo. Devuelve SOLO un objeto JSON valido, sin texto alrededor, ' +
          'con esta forma exacta:\n' +
          '{"category":"...","subcategory":"...","confidence":0.0}\n' +
          'Usa nombres genericos y cortos. Si no puedes deducirlo de los datos, usa cadena vacia.\n\n' +
          `Datos del articulo:\n${data}${extraBlock}`
      }

    case 'attributes':
      return {
        system: BASE_SYSTEM,
        output: 'json',
        user:
          'Extrae atributos utiles para la venta. Devuelve SOLO un objeto JSON, sin texto alrededor, ' +
          'con pares clave-valor en minusculas y sin inventar nada:\n' +
          '{"material":"...","temporada":"...","estilo":"..."}\n' +
          'Omite cualquier atributo del que no tengas informacion.\n\n' +
          `Datos del articulo:\n${data}${extraBlock}`
      }

    case 'keywords':
      return {
        system: BASE_SYSTEM,
        output: 'json',
        user:
          'Propón palabras clave de busqueda para este anuncio. Devuelve SOLO un objeto JSON:\n' +
          '{"keywords":["...","..."]}\n' +
          'Entre 5 y 12 palabras, en ' +
          language +
          '. Sin repetir la marca mas de una vez y sin inventar caracteristicas.\n\n' +
          `Datos del articulo:\n${data}${extraBlock}`
      }

    case 'review':
      return {
        system: BASE_SYSTEM,
        output: 'json',
        user:
          'Revisa esta descripcion de venta y detecta problemas. Devuelve SOLO un objeto JSON:\n' +
          '{"issues":[{"kind":"invented|unclear|misleading|missing","detail":"..."}],"suggested":"..."}\n' +
          'Si no hay problemas, devuelve "issues": [].\n' +
          'Senala especialmente cualquier caracteristica que parezca inventada.\n\n' +
          `Descripcion original:\n${product.description || '(vacia)'}\n\n` +
          `Datos conocidos del articulo:\n${data}${extraBlock}`
      }

    case 'price_suggestion': {
      const cost = (product.totalCostCents / 100).toFixed(2)
      const current =
        options.currentPriceCents && options.currentPriceCents > 0
          ? (options.currentPriceCents / 100).toFixed(2)
          : 'no definido'
      const margin = options.targetMarginPercent ?? 25

      return {
        system: BASE_SYSTEM,
        output: 'json',
        user:
          'Propón un precio de venta razonado para este articulo usando SOLO los datos disponibles.\n' +
          'NO tienes acceso a precios de mercado, asi que razona sobre el coste y el margen objetivo.\n' +
          'Devuelve SOLO un objeto JSON:\n' +
          '{"suggestedPrice":0,"minPrice":0,"reasoning":"..."}\n' +
          'Los precios en la misma unidad monetaria que los datos. No inventes comparaciones con otros vendedores.\n\n' +
          `Coste total: ${cost}\n` +
          `Margen objetivo: ${margin} %\n` +
          `Precio previsto actual: ${current}\n` +
          `Datos del articulo:\n${data}${extraBlock}`
        }
    }

    default:
      return { system: BASE_SYSTEM, output: 'text', user: data }
  }
}

/**
 * Interpreta la respuesta del modelo.
 *
 * Los modelos a veces envuelven el JSON en bloques de codigo o anaden texto.
 * Aqui se extrae el JSON de forma tolerante; si no se puede, se devuelve el
 * texto tal cual en lugar de fallar.
 */
export function parseStructured(
  text: string,
  output: BuiltPrompt['output']
): { text: string; structured?: Record<string, string> } {
  const trimmed = text.trim()
  if (output !== 'json') return { text: trimmed }

  const candidate = extractJson(trimmed)
  if (!candidate) return { text: trimmed }

  try {
    const parsed = JSON.parse(candidate) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const structured: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === null || value === undefined) continue
        structured[key] = typeof value === 'string' ? value : JSON.stringify(value)
      }
      return { text: trimmed, structured }
    }
  } catch {
    // Se devuelve el texto sin estructurar.
  }

  return { text: trimmed }
}

/** Extrae el primer objeto JSON equilibrado del texto. */
export function extractJson(text: string): string | null {
  // Se eliminan los bloques de codigo si los hubiera.
  const withoutFence = text.replace(/```(?:json)?/gi, '').trim()

  const start = withoutFence.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < withoutFence.length; index += 1) {
    const char = withoutFence[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return withoutFence.slice(start, index + 1)
    }
  }

  return null
}

/** Estima los tokens de entrada de un prompt (aproximacion: ~4 caracteres/token). */
export function estimateInputTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
