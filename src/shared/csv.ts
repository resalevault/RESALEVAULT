/**
 * RESALEVAULT - Lector y escritor de CSV.
 *
 * Implementado a mano (sin dependencias) siguiendo RFC 4180, porque importar
 * bien un CSV es mas dificil de lo que parece y conviene tenerlo bajo control y
 * con pruebas:
 *   - Campos entrecomillados con comas, punto y coma o tabuladores dentro.
 *   - Comillas escapadas duplicandolas ("").
 *   - Saltos de linea DENTRO de un campo entrecomillado.
 *   - Finales de linea CRLF, LF o CR.
 *   - Deteccion automatica del separador.
 *
 * Modulo PURO: no toca el sistema de archivos. El proceso principal lee y
 * escribe; aqui solo se transforma texto.
 */

import type { ProductCondition, ProductStatus } from './types'

export type CsvDelimiter = ',' | ';' | '\t' | '|'

export const CSV_DELIMITERS: CsvDelimiter[] = [',', ';', '\t', '|']

export interface CsvParseOptions {
  delimiter?: CsvDelimiter
  /** Numero maximo de filas a devolver (0 = sin limite). */
  limit?: number
}

export interface CsvFieldDefinition {
  field: string
  labelKey: string
  required: boolean
  /** Encabezados habituales que se asocian automaticamente a este campo. */
  aliases: string[]
}

/** Campos de RESALEVAULT que se pueden mapear desde un CSV. */
export const CSV_PRODUCT_FIELDS: CsvFieldDefinition[] = [
  {
    field: 'sku',
    labelKey: 'common.sku',
    required: false,
    aliases: ['sku', 'referencia', 'ref', 'codigo', 'code', 'id']
  },
  {
    field: 'name',
    labelKey: 'common.name',
    required: true,
    aliases: ['nombre', 'name', 'titulo', 'title', 'articulo', 'producto', 'item', 'descripcion corta']
  },
  {
    field: 'description',
    labelKey: 'common.description',
    required: false,
    aliases: ['descripcion', 'description', 'detalle', 'observaciones']
  },
  { field: 'category', labelKey: 'common.category', required: false, aliases: ['categoria', 'category', 'tipo'] },
  { field: 'brand', labelKey: 'common.brand', required: false, aliases: ['marca', 'brand', 'fabricante'] },
  { field: 'model', labelKey: 'common.model', required: false, aliases: ['modelo', 'model'] },
  { field: 'size', labelKey: 'common.size', required: false, aliases: ['talla', 'size', 'medida'] },
  { field: 'color', labelKey: 'common.color', required: false, aliases: ['color', 'colour'] },
  {
    field: 'condition',
    labelKey: 'common.condition',
    required: false,
    aliases: ['estado del articulo', 'condicion', 'condition', 'estado fisico']
  },
  {
    field: 'status',
    labelKey: 'common.status',
    required: false,
    aliases: ['estado', 'situacion', 'status', 'estado del producto']
  },
  {
    field: 'purchaseDate',
    labelKey: 'product.purchaseDate',
    required: false,
    aliases: ['fecha de compra', 'fecha compra', 'fecha adquisicion', 'purchase date', 'fecha']
  },
  {
    field: 'purchasePrice',
    labelKey: 'product.purchasePrice',
    required: false,
    aliases: ['precio de compra', 'precio compra', 'coste', 'cost', 'purchase price', 'compra']
  },
  {
    field: 'acquisitionFees',
    labelKey: 'product.acquisitionFees',
    required: false,
    aliases: ['gastos de adquisicion', 'gastos', 'gastos compra', 'envio compra', 'fees']
  },
  {
    field: 'expectedPrice',
    labelKey: 'product.expectedPrice',
    required: false,
    aliases: ['precio de venta', 'precio venta', 'precio previsto', 'pvp', 'precio', 'sale price', 'expected price']
  },
  {
    field: 'finalPrice',
    labelKey: 'product.finalPrice',
    required: false,
    aliases: ['precio final', 'precio vendido', 'final price', 'vendido por']
  },
  {
    field: 'location',
    labelKey: 'common.location',
    required: false,
    aliases: ['ubicacion', 'location', 'localizacion', 'posicion', 'caja', 'estanteria']
  },
  {
    field: 'privateNotes',
    labelKey: 'product.privateNotes',
    required: false,
    aliases: ['notas privadas', 'notas', 'notes', 'private notes', 'comentarios']
  },
  { field: 'tags', labelKey: 'common.tags', required: false, aliases: ['etiquetas', 'tags', 'labels'] }
]

/** Normaliza un encabezado para compararlo con los alias. */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Deduce la correspondencia entre las columnas del CSV y los campos de
 * RESALEVAULT. Es una SUGERENCIA: el usuario puede corregirla antes de importar.
 */
export function suggestMapping(headers: readonly string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const used = new Set<number>()
  const normalized = headers.map(normalizeHeader)

  // Primera pasada: coincidencia exacta con un alias.
  for (const definition of CSV_PRODUCT_FIELDS) {
    const index = normalized.findIndex(
      (header, position) => !used.has(position) && definition.aliases.includes(header)
    )
    if (index >= 0) {
      mapping[definition.field] = index
      used.add(index)
    }
  }

  // Segunda pasada: coincidencia parcial (el alias esta contenido en el
  // encabezado), para casos como "Precio de compra (EUR)".
  for (const definition of CSV_PRODUCT_FIELDS) {
    if (mapping[definition.field] !== undefined) continue
    const index = normalized.findIndex(
      (header, position) =>
        !used.has(position) &&
        header.length > 0 &&
        definition.aliases.some((alias) => alias.length >= 3 && header.includes(alias))
    )
    if (index >= 0) {
      mapping[definition.field] = index
      used.add(index)
    }
  }

  return mapping
}

/** Detecta el separador mas probable contando fuera de comillas. */
export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 8192)
  const counts = new Map<CsvDelimiter, number>(CSV_DELIMITERS.map((d) => [d, 0]))

  let inQuotes = false
  let sampleEnded = false

  for (let index = 0; index < sample.length; index += 1) {
    const char = sample[index]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (inQuotes) continue
    if (char === '\n') {
      // Con la primera linea suele bastar; dos lineas dan mas confianza.
      if (sampleEnded) break
      sampleEnded = true
      continue
    }
    if (char && CSV_DELIMITERS.includes(char as CsvDelimiter)) {
      const key = char as CsvDelimiter
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  let best: CsvDelimiter = ','
  let bestCount = -1
  for (const delimiter of CSV_DELIMITERS) {
    const count = counts.get(delimiter) ?? 0
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/**
 * Analiza el texto CSV y devuelve la matriz de celdas.
 *
 * Implementacion con maquina de estados: recorre caracter a caracter, de modo
 * que un salto de linea dentro de comillas no rompe la fila.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): string[][] {
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const limit = options.limit ?? 0

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0

  // Se elimina la marca de orden de bytes (BOM) que anaden algunos programas.
  if (text.charCodeAt(0) === 0xfeff) index = 1

  const pushField = (): void => {
    row.push(field)
    field = ''
  }

  const pushRow = (): void => {
    pushField()
    // Se descartan las filas totalmente vacias (habituales al final del archivo).
    const isEmpty = row.length === 1 && (row[0] ?? '').trim() === ''
    if (!isEmpty) rows.push(row)
    row = []
  }

  while (index < text.length) {
    const char = text[index] as string

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true
      index += 1
      continue
    }

    if (char === delimiter) {
      pushField()
      index += 1
      continue
    }

    if (char === '\r') {
      pushRow()
      if (limit > 0 && rows.length >= limit) return rows
      index += text[index + 1] === '\n' ? 2 : 1
      continue
    }

    if (char === '\n') {
      pushRow()
      if (limit > 0 && rows.length >= limit) return rows
      index += 1
      continue
    }

    field += char
    index += 1
  }

  if (field.length > 0 || row.length > 0) pushRow()

  return limit > 0 ? rows.slice(0, limit) : rows
}

/** Escapa un valor para poder escribirlo en CSV. */
export function escapeCsvValue(value: string, delimiter: CsvDelimiter): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.trim() !== value

  if (!needsQuotes) return value
  return '"' + value.replace(/"/g, '""') + '"'
}

export interface CsvSerializeOptions {
  delimiter?: CsvDelimiter
  /** Final de linea. Excel en Windows espera CRLF. */
  eol?: '\r\n' | '\n'
  /** Anade la marca de orden de bytes para que Excel abra los acentos bien. */
  bom?: boolean
}

export function serializeCsv(rows: readonly (readonly string[])[], options: CsvSerializeOptions = {}): string {
  const delimiter = options.delimiter ?? ','
  const eol = options.eol ?? '\r\n'
  const body = rows.map((row) => row.map((cell) => escapeCsvValue(cell ?? '', delimiter)).join(delimiter)).join(eol)
  return (options.bom ? '\ufeff' : '') + body + eol
}

// ---------------------------------------------------------------------------
// Ayudas de conversion
// ---------------------------------------------------------------------------

/** Interpreta las fechas que aparecen en hojas de calculo habituales. */
export function parseLooseDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // ISO ya correcta.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // dd/mm/aaaa o dd-mm-aaaa
  let match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(trimmed)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    let year = Number(match[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
    return null
  }

  // aaaa/mm/dd
  match = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(trimmed)
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`
  }

  return null
}

/** Resultado de interpretar la columna de estado del articulo. */
export function parseStatus(value: string): ProductStatus | null {
  const key = normalizeHeader(value)
  if (!key) return null
  const table: Record<string, ProductStatus> = {
    'pendiente de preparar': 'to_prepare',
    pendiente: 'to_prepare',
    'to prepare': 'to_prepare',
    preparar: 'to_prepare',
    disponible: 'available',
    available: 'available',
    'en venta': 'available',
    reservado: 'reserved',
    reserved: 'reserved',
    vendido: 'sold',
    sold: 'sold',
    enviado: 'shipped',
    shipped: 'shipped',
    devuelto: 'returned',
    returned: 'returned',
    archivado: 'archived',
    archived: 'archived'
  }
  return table[key] ?? null
}

export function parseCondition(value: string): ProductCondition | null {
  const key = normalizeHeader(value)
  if (!key) return null
  const table: Record<string, ProductCondition> = {
    nuevo: 'new',
    new: 'new',
    'como nuevo': 'like_new',
    'like new': 'like_new',
    'buen estado': 'good',
    good: 'good',
    usado: 'used',
    used: 'used',
    'con senales de uso': 'fair',
    fair: 'fair',
    'para piezas': 'for_parts',
    'for parts': 'for_parts',
    'sin especificar': 'unknown',
    unknown: 'unknown'
  }
  return table[key] ?? null
}
