/**
 * RESALEVAULT - Etiquetas, codigos de barras y QR.
 *
 * Los codigos se generan en el PROCESO PRINCIPAL, no en la interfaz. Motivos:
 *  - El renderer no necesita ninguna libreria de codificacion.
 *  - El SVG generado llega ya hecho, asi que la vista previa y la impresion son
 *    exactamente lo mismo.
 *  - No se ejecuta ningun codigo de terceros dentro de la ventana.
 *
 * Se usa la simbologia que el usuario elija y, si el contenido no es valido
 * para ella (por ejemplo, un SKU no numerico en EAN-13), se avisa y se cae a
 * Code 128 en lugar de generar un codigo ilegible.
 */

import bwipjs from 'bwip-js/node'
import type {
  BarcodeSymbology,
  LabelItem,
  LabelOptions,
  LabelSheet
} from '@shared/types-modules'
import type { Database } from '../db/database'
import { appError } from '../errors'
import { toNumber, toStringValue } from '../db/support'

/** Identificador de simbologia que entiende bwip-js. */
const BCID: Record<BarcodeSymbology, string> = {
  code128: 'code128',
  qrcode: 'qrcode',
  code39: 'code39',
  ean13: 'ean13',
  datamatrix: 'datamatrix'
}

export interface BarcodeResult {
  svg: string
  /** Simbologia realmente usada, si hubo que sustituir la solicitada. */
  usedSymbology: BarcodeSymbology
  warning?: 'invalid_content_for_symbology'
}

/**
 * Genera el SVG de un codigo. Nunca lanza: si la codificacion falla, devuelve
 * un SVG vacio para que la etiqueta se imprima sin codigo en lugar de romper
 * toda la hoja.
 */
export function renderBarcode(text: string, symbology: BarcodeSymbology): BarcodeResult {
  const value = text.trim()
  let used = symbology
  let warning: BarcodeResult['warning']

  if (!value) return { svg: '', usedSymbology: used, warning: 'invalid_content_for_symbology' }

  if (used === 'ean13' && !/^\d{12,13}$/.test(value)) {
    // EAN-13 solo admite 12 o 13 digitos.
    used = 'code128'
    warning = 'invalid_content_for_symbology'
  }
  if (used === 'code39' && !/^[0-9A-Z\-. $/+%]+$/.test(value.toUpperCase())) {
    used = 'code128'
    warning = 'invalid_content_for_symbology'
  }

  try {
    const isLinear = used === 'code128' || used === 'code39' || used === 'ean13'
    const options: Record<string, unknown> = {
      bcid: BCID[used],
      text: value,
      scale: used === 'qrcode' || used === 'datamatrix' ? 2 : 3,
      includetext: false,
      backgroundcolor: 'FFFFFF'
    }
    if (isLinear) options.height = 11

    const svg = bwipjs.toSVG(options as unknown as Parameters<typeof bwipjs.toSVG>[0])
    return { svg, usedSymbology: used, warning }
  } catch {
    if (used !== 'code128') {
      // Reintento con la simbologia mas tolerante antes de rendirse.
      try {
        return {
          svg: bwipjs.toSVG({
            bcid: 'code128',
            text: value,
            scale: 3,
            height: 11,
            includetext: false,
            backgroundcolor: 'FFFFFF'
          } as unknown as Parameters<typeof bwipjs.toSVG>[0]),
          usedSymbology: 'code128',
          warning: 'invalid_content_for_symbology'
        }
      } catch {
        return { svg: '', usedSymbology: used, warning: 'invalid_content_for_symbology' }
      }
    }
    return { svg: '', usedSymbology: used, warning: 'invalid_content_for_symbology' }
  }
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  target: 'product',
  symbology: 'code128',
  widthMm: 50,
  heightMm: 30,
  columns: 3,
  showSku: true,
  showName: true,
  showLocation: true,
  showPrice: false,
  showPlatform: false,
  encode: 'sku',
  customPrefix: '',
  title: 'RESALEVAULT'
}

/** Limites de formato: evitan que un valor absurdo genere una hoja inutilizable. */
const LABEL_LIMITS = {
  minWidthMm: 20,
  maxWidthMm: 200,
  minHeightMm: 10,
  maxHeightMm: 200,
  maxColumns: 6,
  maxItems: 500
}

export class LabelService {
  constructor(private readonly db: Database) {}

  /** Normaliza las opciones recibidas y valida los rangos. */
  normalizeOptions(input: Partial<LabelOptions>): LabelOptions {
    const merged = { ...DEFAULT_LABEL_OPTIONS, ...input }
    return {
      ...merged,
      widthMm: clampNumber(merged.widthMm, LABEL_LIMITS.minWidthMm, LABEL_LIMITS.maxWidthMm, 50),
      heightMm: clampNumber(merged.heightMm, LABEL_LIMITS.minHeightMm, LABEL_LIMITS.maxHeightMm, 30),
      columns: Math.round(clampNumber(merged.columns, 1, LABEL_LIMITS.maxColumns, 3)),
      customPrefix: (merged.customPrefix ?? '').slice(0, 40),
      title: (merged.title ?? '').slice(0, 80)
    }
  }

  /** Construye la hoja de etiquetas de los articulos indicados. */
  buildProductSheet(productIds: readonly string[], optionsInput: Partial<LabelOptions>): LabelSheet {
    const options = this.normalizeOptions({ ...optionsInput, target: 'product' })

    if (productIds.length === 0) throw appError('invalid_input', { field: 'productIds' })
    if (productIds.length > LABEL_LIMITS.maxItems) {
      throw appError('invalid_input', { field: 'productIds', reason: 'too_many' })
    }

    const items: LabelItem[] = []

    for (const productId of productIds) {
      const row = this.db.get<{
        id: string
        sku: string
        name: string
        expected_sale_price_cents: number
        location_path: string | null
        platform_name: string | null
      }>(
        `SELECT p.id, p.sku, p.name, p.expected_sale_price_cents,
                l.path AS location_path,
                (SELECT pf.name FROM product_listings pl
                 JOIN platforms pf ON pf.id = pl.platform_id
                 WHERE pl.product_id = p.id ORDER BY pf.sort_order ASC LIMIT 1) AS platform_name
         FROM products p
         LEFT JOIN locations l ON l.id = p.location_id
         WHERE p.id = $id`,
        { $id: productId }
      )
      if (!row) throw appError('not_found', { entity: 'product' })

      const locationPath = toStringValue(row.location_path)
      const code =
        options.encode === 'location' && locationPath
          ? locationPath
          : options.encode === 'custom'
            ? `${options.customPrefix}${row.sku}`
            : toStringValue(row.sku)

      const barcode = renderBarcode(code, options.symbology)

      items.push({
        id: row.id,
        target: 'product',
        code,
        sku: toStringValue(row.sku),
        name: toStringValue(row.name),
        locationPath,
        priceCents: toNumber(row.expected_sale_price_cents),
        platform: toStringValue(row.platform_name),
        barcodeSvg: barcode.svg
      })
    }

    return { options, items }
  }

  /** Construye etiquetas para ubicaciones fisicas (cajas, estanterias...). */
  buildLocationSheet(locationIds: readonly string[], optionsInput: Partial<LabelOptions>): LabelSheet {
    const options = this.normalizeOptions({ ...optionsInput, target: 'location' })
    if (locationIds.length === 0) throw appError('invalid_input', { field: 'locationIds' })
    if (locationIds.length > LABEL_LIMITS.maxItems) {
      throw appError('invalid_input', { field: 'locationIds', reason: 'too_many' })
    }

    const items: LabelItem[] = locationIds.map((locationId) => {
      const row = this.db.get<{ id: string; code: string; name: string; path: string; product_count: number }>(
        `SELECT l.id, l.code, l.name, l.path,
                (SELECT COUNT(*) FROM products p WHERE p.location_id = l.id) AS product_count
         FROM locations l WHERE l.id = $id`,
        { $id: locationId }
      )
      if (!row) throw appError('not_found', { entity: 'location' })

      const barcode = renderBarcode(row.path, options.symbology)
      return {
        id: row.id,
        target: 'location' as const,
        code: row.path,
        sku: row.code,
        name: row.name,
        locationPath: row.path,
        priceCents: null,
        platform: '',
        barcodeSvg: barcode.svg
      }
    })

    return { options, items }
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}
