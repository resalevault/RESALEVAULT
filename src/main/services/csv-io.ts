/**
 * RESALEVAULT - Importacion y exportacion CSV.
 *
 * Reglas de seguridad y honestidad:
 *
 *  1. **Nunca se sobrescribe en silencio.** Antes de importar se devuelve un
 *     informe con los duplicados detectados y, en la importacion real, el
 *     usuario elige la estrategia (omitir, actualizar o crear de todos modos).
 *  2. **Vista previa antes de tocar la base de datos.** `dryRun` recorre todo el
 *     proceso sin escribir nada.
 *  3. **Nada de magia**: las columnas se mapean explicitamente; las categorias y
 *     ubicaciones que no existan NO se crean solas (se avisa y se deja el campo
 *     vacio), porque inventariar mal una ubicacion es peor que no tenerla.
 *  4. Tamano de archivo limitado: un CSV de 200 MB no debe congelar la app.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs'
import type {
  CsvDuplicate,
  CsvExportOptions,
  CsvExportResult,
  CsvImportOptions,
  CsvImportReport,
  CsvImportResult,
  CsvPreview,
  CsvValidationIssue
} from '@shared/types-modules'
import type { ISODate } from '@shared/types'
import {
  CSV_PRODUCT_FIELDS,
  detectDelimiter,
  parseCsv,
  parseCondition,
  parseLooseDate,
  parseStatus,
  serializeCsv,
  suggestMapping
} from '@shared/csv'
import { parseAmountToCents } from '@shared/format'
import { appError } from '../errors'
import type { Repositories } from '../db/context'
import type { SqlParam } from '../db/database'
import { inClause, slugify, todayIso, toNumber, toStringValue } from '../db/support'
import type { FinanceService } from './finance'

const MAX_FILE_BYTES = 80 * 1024 * 1024
const MAX_ROWS = 50_000

export interface ImportRowValues {
  row: number
  name: string
  sku: string | null
  description: string
  categoryId: string | null
  categoryName: string
  brand: string
  model: string
  size: string
  color: string
  condition: string | null
  status: string | null
  purchaseDate: string | null
  purchasePriceCents: number
  acquisitionFeesCents: number
  expectedSalePriceCents: number
  finalSalePriceCents: number | null
  locationId: string | null
  locationText: string
  privateNotes: string
  tags: string[]
}

export class CsvService {
  constructor(
    private readonly repos: Repositories,
    private readonly finance: FinanceService,
    private readonly locale: () => string
  ) {}

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  private readText(path: string): string {
    const stats = statSync(path)
    if (stats.size > MAX_FILE_BYTES) {
      throw appError('file_too_large', { sizeBytes: stats.size, maxBytes: MAX_FILE_BYTES })
    }
    // Los CSV de hojas de calculo suelen venir en UTF-8 con BOM; se respeta.
    return readFileSync(path, 'utf8')
  }

  preview(path: string): CsvPreview {
    const text = this.readText(path)
    const delimiter = detectDelimiter(text)
    const rows = parseCsv(text, { delimiter, limit: 60 })

    if (rows.length === 0) throw appError('invalid_input', { field: 'file', reason: 'empty' })

    const headers = rows[0] ?? []
    const totalRows = parseCsv(text, { delimiter }).length - 1

    return {
      headers,
      delimiter,
      totalRows: Math.max(0, totalRows),
      sampleRows: rows.slice(1, 9),
      suggestedMapping: suggestMapping(headers),
      targetFields: CSV_PRODUCT_FIELDS.map((definition) => ({
        field: definition.field,
        labelKey: definition.labelKey,
        required: definition.required
      }))
    }
  }

  // -------------------------------------------------------------------------
  // Interpretacion de filas
  // -------------------------------------------------------------------------

  /** Resuelve una categoria por nombre (o ruta "Ropa > Camisetas"). */
  private resolveCategory(raw: string): { id: string | null; name: string } {
    const value = raw.trim()
    if (!value) return { id: null, name: '' }

    const parts = value.split(/>|\/|::/).map((part) => part.trim()).filter(Boolean)
    const last = parts[parts.length - 1] ?? value

    const direct = this.repos.db.get<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE slug = $slug OR name = $name COLLATE NOCASE LIMIT 1',
      { $slug: slugify(last), $name: last }
    )
    if (direct) return { id: direct.id, name: direct.name }
    return { id: null, name: value }
  }

  private resolveLocation(raw: string): { id: string | null; text: string } {
    const value = raw.trim()
    if (!value) return { id: null, text: '' }
    const found = this.repos.db.get<{ id: string }>(
      'SELECT id FROM locations WHERE path = $value COLLATE NOCASE OR code = $value COLLATE NOCASE LIMIT 1',
      { $value: value }
    )
    return found ? { id: found.id, text: value } : { id: null, text: value }
  }

  /** Convierte una fila del CSV en valores tipados, anotando los problemas. */
  private interpretRow(
    cells: readonly string[],
    mapping: Record<string, number>,
    rowNumber: number,
    issues: CsvValidationIssue[]
  ): ImportRowValues {
    const locale = this.locale()
    const cell = (field: string): string => {
      const index = mapping[field]
      if (index === undefined || index < 0) return ''
      return (cells[index] ?? '').trim()
    }
    const money = (field: string): number => {
      const raw = cell(field)
      if (!raw) return 0
      const cents = parseAmountToCents(raw, locale)
      if (cents === null) {
        issues.push({ row: rowNumber, field, message: 'import.invalidAmount' })
        return 0
      }
      if (cents < 0) {
        issues.push({ row: rowNumber, field, message: 'import.negativeAmount' })
        return 0
      }
      return cents
    }

    const name = cell('name')
    if (!name) issues.push({ row: rowNumber, field: 'name', message: 'import.nameRequired' })

    const category = this.resolveCategory(cell('category'))
    if (category.name && !category.id) {
      issues.push({ row: rowNumber, field: 'category', message: 'import.categoryNotFound' })
    }

    const location = this.resolveLocation(cell('location'))
    if (location.text && !location.id) {
      issues.push({ row: rowNumber, field: 'location', message: 'import.locationNotFound' })
    }

    const purchaseDateRaw = cell('purchaseDate')
    const purchaseDate = purchaseDateRaw ? parseLooseDate(purchaseDateRaw) : null
    if (purchaseDateRaw && !purchaseDate) {
      issues.push({ row: rowNumber, field: 'purchaseDate', message: 'import.invalidDate' })
    }

    const statusRaw = cell('status')
    const conditionRaw = cell('condition')

    const sku = cell('sku').toUpperCase() || null
    const finalRaw = cell('finalPrice')
    const finalCents = finalRaw ? money('finalPrice') : null

    return {
      row: rowNumber,
      name,
      sku,
      description: cell('description'),
      categoryId: category.id,
      categoryName: category.name,
      brand: cell('brand'),
      model: cell('model'),
      size: cell('size'),
      color: cell('color'),
      condition: conditionRaw ? parseCondition(conditionRaw) : null,
      status: statusRaw ? parseStatus(statusRaw) : null,
      purchaseDate,
      purchasePriceCents: money('purchasePrice'),
      acquisitionFeesCents: money('acquisitionFees'),
      expectedSalePriceCents: money('expectedPrice'),
      finalSalePriceCents: finalCents,
      locationId: location.id,
      locationText: location.text,
      privateNotes: cell('privateNotes'),
      tags: cell('tags')
        .split(/[;,|]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    }
  }

  // -------------------------------------------------------------------------
  // Importacion
  // -------------------------------------------------------------------------

  /** Analiza sin escribir nada: validacion, duplicados y vista previa. */
  analyze(path: string, mapping: Record<string, number>): CsvImportReport {
    const text = this.readText(path)
    const rows = parseCsv(text, { delimiter: detectDelimiter(text) })
    if (rows.length === 0) throw appError('invalid_input', { field: 'file', reason: 'empty' })

    const dataRows = rows.slice(1)
    if (dataRows.length > MAX_ROWS) {
      throw appError('file_too_large', { rows: dataRows.length, maxRows: MAX_ROWS })
    }

    const issues: CsvValidationIssue[] = []
    const duplicates: CsvDuplicate[] = []
    const seenSku = new Set<string>()
    let valid = 0

    const preview: Array<Record<string, string>> = []

    dataRows.forEach((cells, index) => {
      const rowNumber = index + 2 // 1-based, contando el encabezado
      const values = this.interpretRow(cells, mapping, rowNumber, issues)
      if (!values.name) return
      valid += 1

      if (preview.length < 8) {
        preview.push({
          sku: values.sku ?? '',
          name: values.name,
          category: values.categoryId ?? values.categoryName,
          brand: values.brand,
          expected: (values.expectedSalePriceCents / 100).toFixed(2)
        })
      }

      // Duplicado dentro del propio archivo.
      if (values.sku) {
        const key = values.sku.toUpperCase()
        if (seenSku.has(key)) {
          issues.push({ row: rowNumber, field: 'sku', message: 'import.duplicateInFile' })
        } else {
          seenSku.add(key)
        }
      }

      const duplicate = this.findDuplicate(values)
      if (duplicate) duplicates.push({ row: rowNumber, ...duplicate })
    })

    return {
      parsed: dataRows.length,
      valid,
      invalid: issues.filter((issue) => issue.message === 'import.nameRequired').length,
      duplicates,
      issues: issues.slice(0, 500),
      preview
    }
  }

  /** Busca un registro existente que pueda ser el mismo articulo. */
  private findDuplicate(values: ImportRowValues): Omit<CsvDuplicate, 'row'> | null {
    if (values.sku) {
      const bySku = this.repos.db.get<{ id: string; sku: string; name: string }>(
        'SELECT id, sku, name FROM products WHERE sku = $sku COLLATE NOCASE LIMIT 1',
        { $sku: values.sku }
      )
      if (bySku) {
        return {
          reason: 'sku_exists',
          sku: values.sku,
          name: values.name,
          existingId: bySku.id,
          existingSku: bySku.sku,
          existingName: bySku.name,
          differences: this.differences(values, bySku.id)
        }
      }
    }

    // Coincidencia probable: mismo nombre normalizado y misma marca.
    const key = normalizeName(values.name)
    const candidates = this.repos.db.all<{ id: string; sku: string; name: string; brand: string }>(
      `SELECT id, sku, name, brand FROM products
       WHERE brand = $brand COLLATE NOCASE AND name LIKE $like LIMIT 5`,
      { $brand: values.brand, $like: `%${values.name.slice(0, Math.max(4, Math.floor(values.name.length / 2)))}%` }
    )

    for (const candidate of candidates) {
      if (normalizeName(candidate.name) === key) {
        return {
          reason: 'possible_match',
          sku: values.sku ?? '',
          name: values.name,
          existingId: candidate.id,
          existingSku: candidate.sku,
          existingName: candidate.name,
          differences: this.differences(values, candidate.id)
        }
      }
    }

    return null
  }

  private differences(values: ImportRowValues, existingId: string): CsvDuplicate['differences'] {
    const existing = this.repos.db.get<Record<string, unknown>>(
      `SELECT name, brand, size, color, purchase_price_cents, acquisition_fees_cents,
              expected_sale_price_cents, private_notes
       FROM products WHERE id = $id`,
      { $id: existingId }
    )
    if (!existing) return []

    const pairs: Array<[string, string, string]> = [
      ['name', values.name, toStringValue(existing.name)],
      ['brand', values.brand, toStringValue(existing.brand)],
      ['size', values.size, toStringValue(existing.size)],
      ['color', values.color, toStringValue(existing.color)],
      ['purchasePrice', (values.purchasePriceCents / 100).toFixed(2), (toNumber(existing.purchase_price_cents) / 100).toFixed(2)],
      ['expectedPrice', (values.expectedSalePriceCents / 100).toFixed(2), (toNumber(existing.expected_sale_price_cents) / 100).toFixed(2)]
    ]

    return pairs
      .filter(([, incoming, current]) => incoming !== current)
      .map(([field, incoming, current]) => ({ field, incoming, existing: current }))
  }

  importProducts(options: CsvImportOptions): CsvImportResult {
    const text = this.readText(options.path)
    const rows = parseCsv(text, { delimiter: detectDelimiter(text) })
    if (rows.length === 0) throw appError('invalid_input', { field: 'file', reason: 'empty' })

    const dataRows = rows.slice(1)
    if (dataRows.length > MAX_ROWS) {
      throw appError('file_too_large', { rows: dataRows.length, maxRows: MAX_ROWS })
    }

    const issues: CsvValidationIssue[] = []
    const result: CsvImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, issues }

    const tagCache = new Map<string, string>()

    dataRows.forEach((cells, index) => {
      const rowNumber = index + 2
      const values = this.interpretRow(cells, options.mapping, rowNumber, issues)

      if (!values.name) {
        result.failed += 1
        return
      }

      const duplicate = this.findDuplicate(values)

      // Duplicado por SKU: se aplica la estrategia elegida.
      if (duplicate && duplicate.reason === 'sku_exists') {
        if (options.duplicateStrategy === 'skip') {
          result.skipped += 1
          return
        }
        if (options.dryRun) {
          result.updated += 1
          return
        }
        try {
          const patch: Record<string, unknown> = {
            description: values.description || undefined,
            brand: values.brand || undefined,
            model: values.model || undefined,
            size: values.size || undefined,
            color: values.color || undefined,
            purchasePriceCents: values.purchasePriceCents,
            acquisitionFeesCents: values.acquisitionFeesCents,
            expectedSalePriceCents: values.expectedSalePriceCents,
            purchaseDate: values.purchaseDate
          }
          if (values.categoryId) patch.categoryId = values.categoryId
          if (values.locationId) patch.locationId = values.locationId
          if (values.condition) patch.condition = values.condition
          if (values.status) patch.status = values.status
          if (values.privateNotes) patch.privateNotes = values.privateNotes
          if (values.tags.length > 0) {
            patch.tags = values.tags.map((tag) => this.ensureTag(tag, tagCache))
          }
          this.repos.products.update(duplicate.existingId, patch)
          result.updated += 1
        } catch {
          result.failed += 1
        }
        return
      }

      // Coincidencia probable: NO se fusiona sola nunca. Se omite y se avisa.
      if (duplicate && duplicate.reason === 'possible_match') {
        issues.push({ row: rowNumber, field: 'name', message: 'import.possibleDuplicate' })
        result.skipped += 1
        return
      }

      if (options.dryRun) {
        result.created += 1
        return
      }

      try {
        this.repos.products.create({
          name: values.name,
          sku: values.sku ?? undefined,
          description: values.description,
          categoryId: values.categoryId,
          brand: values.brand,
          model: values.model,
          size: values.size,
          color: values.color,
          condition: (values.condition ?? 'unknown') as never,
          status: (values.status ?? 'to_prepare') as never,
          purchaseDate: values.purchaseDate,
          purchasePriceCents: values.purchasePriceCents,
          acquisitionFeesCents: values.acquisitionFeesCents,
          expectedSalePriceCents: values.expectedSalePriceCents,
          finalSalePriceCents: values.finalSalePriceCents,
          locationId: values.locationId,
          privateNotes: values.privateNotes,
          tags: values.tags.map((tag) => this.ensureTag(tag, tagCache))
        })
        result.created += 1
      } catch {
        // Un SKU repetido o un valor invalido no debe abortar toda la importacion.
        result.failed += 1
        issues.push({ row: rowNumber, field: 'sku', message: 'import.rowFailed' })
      }
    })

    return result
  }

  private ensureTag(name: string, cache: Map<string, string>): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const key = trimmed.toLowerCase()
    const cached = cache.get(key)
    if (cached) return cached
    const tag = this.repos.tags.ensure(trimmed)
    cache.set(key, tag.name)
    return tag.name
  }

  // -------------------------------------------------------------------------
  // Exportacion
  // -------------------------------------------------------------------------

  exportData(options: CsvExportOptions): CsvExportResult {
    const rows = this.buildExportRows(options)
    const text = serializeCsv(rows, { delimiter: (options.delimiter as ',' | ';') ?? ',', eol: '\r\n', bom: true })
    writeFileSync(options.path, text, 'utf8')
    return { path: options.path, rows: Math.max(0, rows.length - 1), bytes: Buffer.byteLength(text, 'utf8') }
  }

  private buildExportRows(options: CsvExportOptions): string[][] {
    const delimiter = (options.delimiter as ',' | ';') ?? ','
    void delimiter

    switch (options.format) {
      case 'products':
        return this.exportProducts(options.includeArchived ?? false)
      case 'orders':
        return this.exportOrders()
      case 'purchases':
        return this.exportPurchases()
      case 'expenses':
        return this.exportExpenses()
      case 'picking':
        return this.exportPicking()
      default:
        throw appError('invalid_input', { field: 'format' })
    }
  }

  private exportProducts(includeArchived: boolean): string[][] {
    const where = includeArchived ? '' : 'WHERE p.archived_at IS NULL'
    const rows = this.repos.db.all<Record<string, unknown>>(
      `SELECT p.sku, p.name, p.description, c.name AS category, p.brand, p.model, p.size, p.color,
              p.condition, p.status, p.purchase_date, p.purchase_price_cents, p.acquisition_fees_cents,
              p.expected_sale_price_cents, p.final_sale_price_cents, l.path AS location,
              p.private_notes, p.created_at, p.updated_at,
              (SELECT GROUP_CONCAT(t.name, '; ') FROM product_tags pt
                JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = p.id) AS tags
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN locations l ON l.id = p.location_id
       ${where}
       ORDER BY p.sku COLLATE NOCASE ASC`
    )

    return [
      [
        'sku',
        'nombre',
        'descripcion',
        'categoria',
        'marca',
        'modelo',
        'talla',
        'color',
        'estado_articulo',
        'estado',
        'fecha_compra',
        'precio_compra',
        'gastos_adquisicion',
        'precio_previsto',
        'precio_final',
        'ubicacion',
        'etiquetas',
        'notas_privadas',
        'creado',
        'modificado'
      ],
      ...rows.map((row) => [
        toStringValue(row.sku),
        toStringValue(row.name),
        toStringValue(row.description),
        toStringValue(row.category),
        toStringValue(row.brand),
        toStringValue(row.model),
        toStringValue(row.size),
        toStringValue(row.color),
        toStringValue(row.condition),
        toStringValue(row.status),
        toStringValue(row.purchase_date),
        cents(row.purchase_price_cents),
        cents(row.acquisition_fees_cents),
        cents(row.expected_sale_price_cents),
        row.final_sale_price_cents === null ? '' : cents(row.final_sale_price_cents),
        toStringValue(row.location),
        toStringValue(row.tags),
        toStringValue(row.private_notes),
        toStringValue(row.created_at),
        toStringValue(row.updated_at)
      ])
    ]
  }

  private exportOrders(): string[][] {
    const rows = this.repos.db.all<Record<string, unknown>>(
      `SELECT o.order_number, o.sold_at, pf.name AS platform, o.buyer, o.status,
              (SELECT GROUP_CONCAT(oi.sku, '; ') FROM order_items oi WHERE oi.order_id = o.id) AS skus,
              (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS units,
              (SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS goods,
              (SELECT COALESCE(SUM(oi.unit_cost_cents * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS cost,
              o.discount_cents, o.shipping_charged_cents, o.shipping_cost_cents, o.other_cents,
              (SELECT COALESCE(SUM(f.amount_cents), 0) FROM order_fees f WHERE f.order_id = o.id) AS fees,
              (SELECT COALESCE(SUM(r.refund_cents), 0) FROM order_returns r WHERE r.order_id = o.id) AS refunds,
              (SELECT COALESCE(SUM(r.fee_refund_cents), 0) FROM order_returns r WHERE r.order_id = o.id) AS fees_refunded,
              (SELECT COALESCE(SUM(r.shipping_lost_cents), 0) FROM order_returns r WHERE r.order_id = o.id) AS shipping_lost,
              o.tracking_number, o.carrier, o.notes
       FROM orders o
       LEFT JOIN platforms pf ON pf.id = o.platform_id
       ORDER BY o.sold_at DESC`
    )

    return [
      [
        'pedido',
        'fecha_venta',
        'plataforma',
        'comprador',
        'estado',
        'skus',
        'unidades',
        'ingreso_mercancia',
        'coste_mercancia',
        'descuento',
        'envio_cobrado',
        'envio_pagado',
        'otros_costes',
        'comisiones',
        'reembolsos',
        'comisiones_devueltas',
        'envio_perdido',
        'beneficio_neto',
        'seguimiento',
        'transportista',
        'notas'
      ],
      ...rows.map((row) => {
        const net =
          toNumber(row.goods) -
          toNumber(row.discount_cents) +
          toNumber(row.shipping_charged_cents) -
          toNumber(row.cost) -
          toNumber(row.fees) -
          toNumber(row.shipping_cost_cents) -
          toNumber(row.other_cents) -
          toNumber(row.refunds) +
          toNumber(row.fees_refunded) -
          toNumber(row.shipping_lost)
        return [
          toStringValue(row.order_number),
          toStringValue(row.sold_at),
          toStringValue(row.platform),
          toStringValue(row.buyer),
          toStringValue(row.status),
          toStringValue(row.skus),
          String(toNumber(row.units)),
          cents(row.goods),
          cents(row.cost),
          cents(row.discount_cents),
          cents(row.shipping_charged_cents),
          cents(row.shipping_cost_cents),
          cents(row.other_cents),
          cents(row.fees),
          cents(row.refunds),
          cents(row.fees_refunded),
          cents(row.shipping_lost),
          cents(net),
          toStringValue(row.tracking_number),
          toStringValue(row.carrier),
          toStringValue(row.notes)
        ]
      })
    ]
  }

  private exportPurchases(): string[][] {
    const rows = this.repos.db.all<Record<string, unknown>>(
      `SELECT p.purchased_at, p.reference, p.supplier_name, pi.description, pr.sku,
              pi.quantity, pi.unit_cost_cents, pi.allocated_extra_cents,
              p.shipping_cents, p.other_cents, p.discount_cents
       FROM purchases p
       JOIN purchase_items pi ON pi.purchase_id = p.id
       LEFT JOIN products pr ON pr.id = pi.product_id
       ORDER BY p.purchased_at DESC`
    )

    return [
      [
        'fecha_compra',
        'referencia',
        'proveedor',
        'descripcion',
        'sku',
        'cantidad',
        'coste_unitario',
        'gastos_asignados',
        'envio_compra',
        'otros_compra',
        'descuento_compra'
      ],
      ...rows.map((row) => [
        toStringValue(row.purchased_at),
        toStringValue(row.reference),
        toStringValue(row.supplier_name),
        toStringValue(row.description),
        toStringValue(row.sku),
        String(toNumber(row.quantity)),
        cents(row.unit_cost_cents),
        cents(row.allocated_extra_cents),
        cents(row.shipping_cents),
        cents(row.other_cents),
        cents(row.discount_cents)
      ])
    ]
  }

  private exportExpenses(): string[][] {
    const rows = this.repos.db.all<Record<string, unknown>>(
      `SELECT incurred_on, category, description, amount_cents, recurring, notes
       FROM expenses ORDER BY incurred_on DESC`
    )
    return [
      ['fecha', 'categoria', 'descripcion', 'importe', 'periodicidad', 'notas'],
      ...rows.map((row) => [
        toStringValue(row.incurred_on),
        toStringValue(row.category),
        toStringValue(row.description),
        cents(row.amount_cents),
        toStringValue(row.recurring),
        toStringValue(row.notes)
      ])
    ]
  }

  private exportPicking(): string[][] {
    const rows = this.repos.db.all<Record<string, unknown>>(
      `SELECT o.order_number, o.sold_at, o.status, oi.sku, oi.title, oi.quantity,
              l.path AS location, pc.picked_at, pc.packed_at
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN picking_checks pc ON pc.order_id = o.id AND pc.product_id = oi.product_id
       LEFT JOIN products pr ON pr.id = oi.product_id
       LEFT JOIN locations l ON l.id = pr.location_id
       WHERE o.status IN ('pending','preparing','packed')
       ORDER BY o.sold_at ASC, l.path COLLATE NOCASE ASC`
    )

    return [
      ['pedido', 'fecha_venta', 'estado', 'sku', 'articulo', 'cantidad', 'ubicacion', 'recogido', 'empaquetado'],
      ...rows.map((row) => [
        toStringValue(row.order_number),
        toStringValue(row.sold_at),
        toStringValue(row.status),
        toStringValue(row.sku),
        toStringValue(row.title),
        String(toNumber(row.quantity)),
        toStringValue(row.location),
        toStringValue(row.picked_at),
        toStringValue(row.packed_at)
      ])
    ]
  }

  /** Numeracion de pedidos pendientes, para la hoja de picking. */
  openOrdersCount(): number {
    const params: Record<string, SqlParam> = {}
    const clause = inClause('st', ['pending', 'preparing', 'packed'], params)
    return toNumber(this.repos.db.scalar<number>(`SELECT COUNT(*) AS v FROM orders WHERE status IN (${clause})`, params))
  }

  /** Rango de fechas del mes actual, para exportaciones rapidas. */
  currentMonth(): { from: ISODate; to: ISODate } {
    const today = todayIso()
    return { from: `${today.slice(0, 7)}-01`, to: today }
  }

  /** El servicio de informes se expone para las exportaciones financieras. */
  get financeService(): FinanceService {
    return this.finance
  }
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function cents(value: unknown): string {
  return (toNumber(value) / 100).toFixed(2)
}
