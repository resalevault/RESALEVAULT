/**
 * RESALEVAULT - Repositorio de articulos.
 *
 * Fórmulas aplicadas (documentadas tambien en docs/FORMULAS.md):
 *   totalCostCents       = purchase_price_cents + acquisition_fees_cents
 *   estimatedMarginCents = expected_sale_price_cents - totalCostCents
 *   realizedMarginCents  = final_sale_price_cents - totalCostCents   (solo si el
 *                          articulo esta en un estado de venta y tiene precio final)
 *   ageDays              = dias desde purchase_date (si no hay, desde created_at)
 *
 * Nota importante sobre `realizedMarginCents`: todavia NO descuenta comisiones
 * de plataforma, envio asumido por el vendedor ni otros gastos del pedido,
 * porque el modulo de pedidos pertenece a la Fase 3. La interfaz lo etiqueta
 * como "margen bruto" para no confundirlo con el beneficio neto.
 */

import type {
  BulkUpdatePreview,
  Page,
  Product,
  ProductAttributes,
  ProductBulkUpdateInput,
  ProductCondition,
  ProductCreateInput,
  ProductDetail,
  ProductQuery,
  ProductSort,
  ProductStatus,
  ProductSummary,
  ProductUpdateInput
} from '@shared/types'
import { SOLD_STATUSES } from '@shared/types'
import { DEFAULT_SKU_PATTERN, skuCandidates, validateSkuPattern } from '@shared/sku'
import type { Database, SqlParam } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import type { TagRepository } from './tags'
import {
  ACTOR_USER_ID,
  inClause,
  likePattern,
  newId,
  nowIso,
  toNumber,
  toNullableString,
  toStringValue
} from '../support'

export interface SkuConfig {
  pattern: string
  prefix: string
}

export type SkuConfigProvider = () => SkuConfig

export interface ProductRow {
  id: string
  sku: string
  name: string
  description: string
  category_id: string | null
  brand: string
  model: string
  size: string
  color: string
  condition: string
  status: string
  attributes: string
  purchase_date: string | null
  purchase_price_cents: number
  acquisition_fees_cents: number
  expected_sale_price_cents: number
  final_sale_price_cents: number | null
  location_id: string | null
  private_notes: string
  is_demo: number
  archived_at: string | null
  created_at: string
  updated_at: string
  category_name: string | null
  location_path: string | null
  photo_count: number
  cover_media_id: string | null
  listing_count: number
  age_days: number
}

const SELECT_BASE = `
  SELECT p.id, p.sku, p.name, p.description, p.category_id, p.brand, p.model, p.size, p.color,
         p.condition, p.status, p.attributes, p.purchase_date, p.purchase_price_cents,
         p.acquisition_fees_cents, p.expected_sale_price_cents, p.final_sale_price_cents,
         p.location_id, p.private_notes, p.is_demo, p.archived_at, p.created_at, p.updated_at,
         c.name AS category_name,
         l.path AS location_path,
         (SELECT COUNT(*) FROM product_media m WHERE m.product_id = p.id AND m.kind = 'photo') AS photo_count,
         (SELECT m.id FROM product_media m WHERE m.product_id = p.id AND m.is_cover = 1 LIMIT 1) AS cover_media_id,
         (SELECT COUNT(*) FROM product_listings pl WHERE pl.product_id = p.id) AS listing_count,
         CAST(julianday('now') - julianday(COALESCE(p.purchase_date, p.created_at)) AS INTEGER) AS age_days
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN locations l ON l.id = p.location_id
`

/** Ordenaciones permitidas. Nunca se interpola texto del usuario en el ORDER BY. */
const SORT_SQL: Record<ProductSort, string> = {
  updated_desc: 'p.updated_at DESC',
  created_desc: 'p.created_at DESC',
  name_asc: 'p.name COLLATE NOCASE ASC',
  sku_asc: 'p.sku COLLATE NOCASE ASC',
  cost_desc: '(p.purchase_price_cents + p.acquisition_fees_cents) DESC',
  expected_desc: 'p.expected_sale_price_cents DESC',
  age_desc: 'COALESCE(p.purchase_date, p.created_at) ASC',
  margin_asc: '(p.expected_sale_price_cents - p.purchase_price_cents - p.acquisition_fees_cents) ASC'
}

export function parseAttributes(raw: unknown): ProductAttributes {
  const text = toStringValue(raw, '')
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ProductAttributes
    }
    return {}
  } catch {
    return {}
  }
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: toStringValue(row.sku),
    name: toStringValue(row.name),
    description: toStringValue(row.description),
    categoryId: row.category_id,
    brand: toStringValue(row.brand),
    model: toStringValue(row.model),
    size: toStringValue(row.size),
    color: toStringValue(row.color),
    condition: row.condition as ProductCondition,
    status: row.status as ProductStatus,
    attributes: parseAttributes(row.attributes),
    purchaseDate: toNullableString(row.purchase_date),
    purchasePriceCents: toNumber(row.purchase_price_cents),
    acquisitionFeesCents: toNumber(row.acquisition_fees_cents),
    expectedSalePriceCents: toNumber(row.expected_sale_price_cents),
    finalSalePriceCents: row.final_sale_price_cents === null ? null : toNumber(row.final_sale_price_cents),
    locationId: row.location_id,
    privateNotes: toStringValue(row.private_notes),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
    archivedAt: toNullableString(row.archived_at)
  }
}

function isSoldStatus(status: ProductStatus): boolean {
  return SOLD_STATUSES.includes(status)
}

function mapSummary(row: ProductRow, tags: string[]): ProductSummary {
  const totalCost = toNumber(row.purchase_price_cents) + toNumber(row.acquisition_fees_cents)
  const expected = toNumber(row.expected_sale_price_cents)
  const finalPrice = row.final_sale_price_cents === null ? null : toNumber(row.final_sale_price_cents)
  const sold = isSoldStatus(row.status as ProductStatus)

  return {
    id: row.id,
    sku: toStringValue(row.sku),
    name: toStringValue(row.name),
    status: row.status as ProductStatus,
    condition: row.condition as ProductCondition,
    categoryId: row.category_id,
    categoryName: toNullableString(row.category_name),
    locationId: row.location_id,
    locationPath: toNullableString(row.location_path),
    brand: toStringValue(row.brand),
    size: toStringValue(row.size),
    color: toStringValue(row.color),
    purchasePriceCents: toNumber(row.purchase_price_cents),
    acquisitionFeesCents: toNumber(row.acquisition_fees_cents),
    expectedSalePriceCents: expected,
    finalSalePriceCents: finalPrice,
    totalCostCents: totalCost,
    estimatedMarginCents: expected - totalCost,
    realizedMarginCents: sold && finalPrice !== null ? finalPrice - totalCost : null,
    ageDays: Math.max(0, toNumber(row.age_days)),
    coverMediaId: toNullableString(row.cover_media_id),
    photoCount: toNumber(row.photo_count),
    listingCount: toNumber(row.listing_count),
    tags,
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
    archivedAt: toNullableString(row.archived_at)
  }
}

interface FilterResult {
  where: string
  params: Record<string, SqlParam>
}

function buildFilters(query: ProductQuery, db: Database): FilterResult {
  const clauses: string[] = []
  const params: Record<string, SqlParam> = {}

  if (query.onlyArchived) {
    clauses.push('p.archived_at IS NOT NULL')
  } else if (!query.includeArchived) {
    clauses.push('p.archived_at IS NULL')
  }

  const search = query.search?.trim()
  if (search) {
    const pattern = likePattern(search)
    params.$q = pattern
    clauses.push(
      `(p.name LIKE $q ESCAPE '\\' OR p.sku LIKE $q ESCAPE '\\' OR p.brand LIKE $q ESCAPE '\\'
        OR p.model LIKE $q ESCAPE '\\' OR p.description LIKE $q ESCAPE '\\'
        OR p.private_notes LIKE $q ESCAPE '\\')`
    )
  }

  if (query.status && query.status.length > 0) {
    clauses.push(`p.status IN (${inClause('st', query.status, params)})`)
  }

  if (query.conditions && query.conditions.length > 0) {
    clauses.push(`p.condition IN (${inClause('cd', query.conditions, params)})`)
  }

  // Las categorias y ubicaciones se expanden a sus descendientes: filtrar por
  // "Ropa" debe incluir "Camisetas", y por un almacen debe incluir sus cajas.
  if (query.categoryIds && query.categoryIds.length > 0) {
    const expanded = expandCategoryIds(db, query.categoryIds)
    clauses.push(`p.category_id IN (${inClause('cat', expanded, params)})`)
  }

  if (query.locationIds && query.locationIds.length > 0) {
    const expanded = expandLocationIds(db, query.locationIds)
    clauses.push(`p.location_id IN (${inClause('loc', expanded, params)})`)
  }

  if (query.platformIds && query.platformIds.length > 0) {
    clauses.push(
      `EXISTS (SELECT 1 FROM product_listings pl WHERE pl.product_id = p.id
               AND pl.platform_id IN (${inClause('pf', query.platformIds, params)}))`
    )
  }

  if (query.tagIds && query.tagIds.length > 0) {
    clauses.push(
      `EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id
               AND pt.tag_id IN (${inClause('tg', query.tagIds, params)}))`
    )
  }

  if (typeof query.minAgeDays === 'number') {
    params.$minAge = query.minAgeDays
    clauses.push('CAST(julianday(\'now\') - julianday(COALESCE(p.purchase_date, p.created_at)) AS INTEGER) >= $minAge')
  }

  if (typeof query.maxAgeDays === 'number') {
    params.$maxAge = query.maxAgeDays
    clauses.push('CAST(julianday(\'now\') - julianday(COALESCE(p.purchase_date, p.created_at)) AS INTEGER) <= $maxAge')
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  }
}

/** Expande una lista de categorias con todos sus descendientes. */
export function expandCategoryIds(db: Database, ids: readonly string[]): string[] {
  const result = new Set<string>(ids)
  const all = db.all<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM categories'
  )
  let grew = true
  while (grew) {
    grew = false
    for (const row of all) {
      if (row.parent_id && result.has(row.parent_id) && !result.has(row.id)) {
        result.add(row.id)
        grew = true
      }
    }
  }
  return [...result]
}

/** Expande una lista de ubicaciones con todos sus descendientes. */
export function expandLocationIds(db: Database, ids: readonly string[]): string[] {
  const result = new Set<string>(ids)
  const all = db.all<{ id: string; parent_id: string | null }>('SELECT id, parent_id FROM locations')
  let grew = true
  while (grew) {
    grew = false
    for (const row of all) {
      if (row.parent_id && result.has(row.parent_id) && !result.has(row.id)) {
        result.add(row.id)
        grew = true
      }
    }
  }
  return [...result]
}

function formatChangeValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.endsWith('Cents') && typeof value === 'number') {
    // Se entrega una cadena decimal neutra; el renderer le anade el simbolo y
    // los separadores del idioma activo.
    return (value / 100).toFixed(2)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export class ProductRepository {
  constructor(
    private readonly db: Database,
    private readonly tags: TagRepository,
    private readonly skuConfig: SkuConfigProvider
  ) {}

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  list(query: ProductQuery = {}): Page<ProductSummary> {
    const page = Math.max(1, Math.floor(query.page ?? 1))
    const pageSize = Math.max(1, Math.min(500, Math.floor(query.pageSize ?? 50)))
    const sort = query.sort && SORT_SQL[query.sort] ? query.sort : 'updated_desc'

    const { where, params } = buildFilters(query, this.db)

    const total = toNumber(
      this.db.scalar<number>(`SELECT COUNT(*) AS v FROM products p ${where}`, params)
    )

    const rows = this.db.all<ProductRow>(
      `${SELECT_BASE} ${where} ORDER BY ${SORT_SQL[sort]} LIMIT $limit OFFSET $offset`,
      { ...params, $limit: pageSize, $offset: (page - 1) * pageSize }
    )

    const tagMap = this.tagsForProducts(rows.map((row) => row.id))
    const items = rows.map((row) => mapSummary(row, tagMap.get(row.id) ?? []))

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    }
  }

  /** Vista agregada usada por el panel y por los indicadores de stock estancado. */
  aggregate(query: ProductQuery = {}): {
    count: number
    capitalCents: number
    expectedCents: number
  } {
    const { where, params } = buildFilters(query, this.db)
    const row = this.db.get<{ n: number; capital: number; expected: number }>(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(p.purchase_price_cents + p.acquisition_fees_cents), 0) AS capital,
              COALESCE(SUM(p.expected_sale_price_cents), 0) AS expected
       FROM products p ${where}`,
      params
    )
    return {
      count: toNumber(row?.n),
      capitalCents: toNumber(row?.capital),
      expectedCents: toNumber(row?.expected)
    }
  }

  get(id: string): ProductDetail {
    const row = this.db.get<ProductRow>(`${SELECT_BASE} WHERE p.id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'product' })

    const tagRows = this.db.all<{ id: string; name: string; color: string }>(
      `SELECT t.id, t.name, t.color FROM product_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.product_id = $id
       ORDER BY t.name COLLATE NOCASE ASC`,
      { $id: id }
    )

    return {
      product: mapProduct(row),
      media: this.db.all(
        `SELECT id, product_id AS productId, kind, file_name AS fileName, original_name AS originalName,
                mime_type AS mimeType, size_bytes AS sizeBytes, sha256, width, height,
                sort_order AS sortOrder, is_cover AS isCover, created_at AS createdAt
         FROM product_media WHERE product_id = $id ORDER BY sort_order ASC, created_at ASC`,
        { $id: id }
      ).map((m) => {
        const media = m as Record<string, unknown>
        return {
          id: String(media.id),
          productId: String(media.productId),
          kind: String(media.kind) as 'photo' | 'document',
          fileName: String(media.fileName),
          originalName: String(media.originalName),
          mimeType: String(media.mimeType),
          sizeBytes: toNumber(media.sizeBytes),
          sha256: String(media.sha256),
          width: media.width === null ? null : toNumber(media.width),
          height: media.height === null ? null : toNumber(media.height),
          sortOrder: toNumber(media.sortOrder),
          isCover: toNumber(media.isCover) === 1,
          createdAt: String(media.createdAt)
        }
      }),
      listings: this.db
        .all<Record<string, unknown>>(
          `SELECT pl.id, pl.product_id AS productId, pl.platform_id AS platformId, pf.code AS platformCode,
                  pf.name AS platformName, pl.external_id AS externalId, pl.url,
                  pl.listed_price_cents AS listedPriceCents, pl.status, pl.listed_at AS listedAt,
                  pl.notes, pl.created_at AS createdAt, pl.updated_at AS updatedAt
           FROM product_listings pl
           JOIN platforms pf ON pf.id = pl.platform_id
           WHERE pl.product_id = $id
           ORDER BY pf.sort_order ASC`,
          { $id: id }
        )
        .map((l) => {
          const listing = l as Record<string, unknown>
          return {
            id: String(listing.id),
            productId: String(listing.productId),
            platformId: String(listing.platformId),
            platformCode: String(listing.platformCode),
            platformName: String(listing.platformName),
            externalId: toStringValue(listing.externalId),
            url: toStringValue(listing.url),
            listedPriceCents:
              listing.listedPriceCents === null ? null : toNumber(listing.listedPriceCents),
            status: String(listing.status) as ProductDetail['listings'][number]['status'],
            listedAt: toNullableString(listing.listedAt),
            notes: toStringValue(listing.notes),
            createdAt: String(listing.createdAt),
            updatedAt: String(listing.updatedAt)
          }
        }),
      tags: tagRows.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        productCount: 0
      })),
      history: this.db
        .all<Record<string, unknown>>(
          `SELECT id, product_id AS productId, at, action, field, old_value AS oldValue,
                  new_value AS newValue, note
           FROM product_history WHERE product_id = $id ORDER BY at DESC LIMIT 200`,
          { $id: id }
        )
        .map((h) => {
          const entry = h as Record<string, unknown>
          return {
            id: String(entry.id),
            productId: String(entry.productId),
            at: String(entry.at),
            action: String(entry.action),
            field: toNullableString(entry.field),
            oldValue: toNullableString(entry.oldValue),
            newValue: toNullableString(entry.newValue),
            note: toNullableString(entry.note)
          }
        })
    }
  }

  /** Metadatos de los articulos que se van a eliminar (para borrar sus archivos). */
  collectMediaFileNames(ids: readonly string[]): string[] {
    if (ids.length === 0) return []
    const params: Record<string, SqlParam> = {}
    const clause = inClause('mid', ids, params)
    return this.db
      .all<{ file_name: string }>(
        `SELECT file_name FROM product_media WHERE product_id IN (${clause})`,
        params
      )
      .map((row) => row.file_name)
  }

  // -------------------------------------------------------------------------
  // SKU
  // -------------------------------------------------------------------------

  skuExists(sku: string, exceptId: string | null = null): boolean {
    return (
      toNumber(
        this.db.scalar<number>(
          `SELECT COUNT(*) AS v FROM products
           WHERE sku = $sku COLLATE NOCASE AND ($except IS NULL OR id <> $except)`,
          { $sku: sku, $except: exceptId }
        )
      ) > 0
    )
  }

  checkSku(sku: string, exceptId: string | null = null): { available: boolean } {
    return { available: !this.skuExists(sku, exceptId) }
  }

  /** Sugiere un SKU libre para una categoria, sin persistir nada. */
  suggestSku(categoryId: string | null = null): string {
    return this.generateSku(categoryId, false)
  }

  private nextSequence(): number {
    return (
      toNumber(this.db.scalar<number>("SELECT value FROM counters WHERE key = 'sku_seq'")) + 1
    )
  }

  private rememberSequence(value: number): void {
    this.db.run(
      `INSERT INTO counters (key, value) VALUES ('sku_seq', $value)
       ON CONFLICT(key) DO UPDATE SET value = MAX(value, $value)`,
      { $value: value }
    )
  }

  private generateSku(categoryId: string | null, consumeSequence = true): string {
    const config = this.skuConfig()
    const validation = validateSkuPattern(config.pattern)
    // Si el patron configurado es invalido o no contiene secuencia, se usa el
    // patron por defecto en lugar de generar SKU duplicados.
    const pattern = validation.ok && validation.hasSequence ? config.pattern : DEFAULT_SKU_PATTERN
    const prefix = config.prefix && config.prefix.length > 0 ? config.prefix : 'RV'

    const categoryName = categoryId
      ? (this.db.scalar<string>('SELECT name FROM categories WHERE id = $id', { $id: categoryId }) ?? null)
      : null

    const start = this.nextSequence()
    const candidates = skuCandidates(pattern, { prefix, categoryName, date: new Date() }, start)

    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const next = candidates.next()
      const candidate = next.done ? '' : next.value
      if (!candidate) break
      if (!this.skuExists(candidate, null)) {
        if (consumeSequence) this.rememberSequence(start + attempt)
        return candidate
      }
    }

    throw appError('db_error', { detail: 'no_se_pudo_generar_sku_libre' })
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  create(input: ProductCreateInput, options: { isDemo?: boolean } = {}): Product {
    const name = input.name?.trim()
    if (!name) throw appError('invalid_input', { field: 'name' })

    const id = newId()
    const at = nowIso()

    this.db.transaction(() => {
      const sku = input.sku?.trim()
        ? this.normalizeSku(input.sku)
        : this.generateSku(input.categoryId ?? null)

      if (input.sku?.trim() && this.skuExists(sku, null)) {
        throw appError('sku_duplicate', { sku })
      }

      this.db.run(
        `INSERT INTO products (
           id, sku, name, description, category_id, brand, model, size, color, condition, status,
           attributes, purchase_date, purchase_price_cents, acquisition_fees_cents,
           expected_sale_price_cents, final_sale_price_cents, location_id, private_notes,
           is_demo, archived_at, created_at, updated_at, created_by
         ) VALUES (
           $id, $sku, $name, $description, $category, $brand, $model, $size, $color, $condition, $status,
           $attributes, $purchaseDate, $purchasePrice, $fees,
           $expectedPrice, $finalPrice, $location, $privateNotes,
           $isDemo, NULL, $at, $at, $user
         )`,
        {
          $id: id,
          $sku: sku,
          $name: name,
          $description: input.description ?? '',
          $category: input.categoryId ?? null,
          $brand: input.brand ?? '',
          $model: input.model ?? '',
          $size: input.size ?? '',
          $color: input.color ?? '',
          $condition: input.condition ?? 'unknown',
          $status: input.status ?? 'to_prepare',
          $attributes: JSON.stringify(input.attributes ?? {}),
          $purchaseDate: input.purchaseDate ?? null,
          $purchasePrice: input.purchasePriceCents ?? 0,
          $fees: input.acquisitionFeesCents ?? 0,
          $expectedPrice: input.expectedSalePriceCents ?? 0,
          $finalPrice: input.finalSalePriceCents ?? null,
          $location: input.locationId ?? null,
          $privateNotes: input.privateNotes ?? '',
          $isDemo: options.isDemo ? 1 : 0,
          $at: at,
          $user: ACTOR_USER_ID
        }
      )

      if (input.tags && input.tags.length > 0) {
        const tagIds = input.tags.map((tagName) => this.tags.ensure(tagName).id)
        this.tags.setTagsForProduct(id, tagIds)
      }

      this.writeHistory(id, 'created', null, null, null, null)
      logActivity(this.db, {
        entity: 'product',
        entityId: id,
        action: 'created',
        summary: `Articulo creado: ${sku} ${name}`
      })
    })

    return this.getProductOrThrow(id)
  }

  update(id: string, patch: ProductUpdateInput): Product {
    this.db.transaction(() => {
      const current = this.getProductRow(id)
      if (!current) throw appError('not_found', { entity: 'product' })

      const nextSku = patch.sku !== undefined ? this.normalizeSku(patch.sku) : current.sku
      if (nextSku !== current.sku && this.skuExists(nextSku, id)) {
        throw appError('sku_duplicate', { sku: nextSku })
      }

      // Campos escalares que se actualizan de forma directa.
      const columnMap: Array<{ input: keyof ProductUpdateInput; column: string; current: unknown }> = [
        { input: 'name', column: 'name', current: current.name },
        { input: 'description', column: 'description', current: current.description },
        { input: 'brand', column: 'brand', current: current.brand },
        { input: 'model', column: 'model', current: current.model },
        { input: 'size', column: 'size', current: current.size },
        { input: 'color', column: 'color', current: current.color },
        { input: 'condition', column: 'condition', current: current.condition },
        { input: 'status', column: 'status', current: current.status },
        { input: 'purchaseDate', column: 'purchase_date', current: current.purchase_date },
        { input: 'purchasePriceCents', column: 'purchase_price_cents', current: current.purchase_price_cents },
        {
          input: 'acquisitionFeesCents',
          column: 'acquisition_fees_cents',
          current: current.acquisition_fees_cents
        },
        {
          input: 'expectedSalePriceCents',
          column: 'expected_sale_price_cents',
          current: current.expected_sale_price_cents
        },
        {
          input: 'finalSalePriceCents',
          column: 'final_sale_price_cents',
          current: current.final_sale_price_cents
        },
        { input: 'privateNotes', column: 'private_notes', current: current.private_notes }
      ]

      const assignments: string[] = []
      const params: Record<string, SqlParam> = { $id: id, $at: nowIso() }

      for (const entry of columnMap) {
        const value = patch[entry.input]
        if (value === undefined) continue
        const normalized = entry.input === 'name' && typeof value === 'string' ? value.trim() : value
        if (normalized === entry.current) continue
        assignments.push(`${entry.column} = $f_${entry.column}`)
        params[`$f_${entry.column}`] = normalized as SqlParam
        this.writeHistory(id, 'updated', entry.column, entry.current, normalized, null)
      }

      if (patch.categoryId !== undefined && patch.categoryId !== current.category_id) {
        assignments.push('category_id = $f_category_id')
        params.$f_category_id = patch.categoryId
        this.writeHistory(id, 'updated', 'category_id', current.category_id, patch.categoryId, null)
      }

      if (patch.locationId !== undefined && patch.locationId !== current.location_id) {
        assignments.push('location_id = $f_location_id')
        params.$f_location_id = patch.locationId
        this.writeHistory(id, 'updated', 'location_id', current.location_id, patch.locationId, null)
      }

      if (patch.attributes !== undefined) {
        const serialized = JSON.stringify(patch.attributes)
        if (serialized !== current.attributes) {
          assignments.push('attributes = $f_attributes')
          params.$f_attributes = serialized
          this.writeHistory(id, 'updated', 'attributes', current.attributes, serialized, null)
        }
      }

      // Si se corrige el SKU se registra en el historial (trazabilidad).
      if (nextSku !== current.sku) {
        assignments.push('sku = $f_sku')
        params.$f_sku = nextSku
        this.writeHistory(id, 'updated', 'sku', current.sku, nextSku, null)
      }

      if (assignments.length > 0) {
        this.db.run(
          `UPDATE products SET ${assignments.join(', ')}, updated_at = $at WHERE id = $id`,
          params
        )
        logActivity(this.db, {
          entity: 'product',
          entityId: id,
          action: 'updated',
          summary: `Articulo actualizado: ${nextSku}`,
          details: { fields: assignments.length }
        })
      }

      if (patch.tags !== undefined) {
        const tagIds = patch.tags.map((tagName) => this.tags.ensure(tagName).id)
        this.tags.setTagsForProduct(id, tagIds)
      }
    })

    return this.getProductOrThrow(id)
  }

  /** Archiva articulos guardando el estado anterior para poder restaurarlo. */
  archive(ids: readonly string[]): { affected: number } {
    let affected = 0
    this.db.transaction(() => {
      for (const id of ids) {
        const row = this.getProductRow(id)
        if (!row || row.archived_at) continue
        const at = nowIso()
        this.writeHistory(id, 'archived', 'status', row.status, 'archived', 'estado anterior: ' + row.status)
        this.db.run(
          "UPDATE products SET archived_at = $at, status = 'archived', updated_at = $at WHERE id = $id",
          { $id: id, $at: at }
        )
        logActivity(this.db, {
          entity: 'product',
          entityId: id,
          action: 'archived',
          summary: `Articulo archivado: ${row.sku}`
        })
        affected += 1
      }
    })
    return { affected }
  }

  /** Restaura articulos archivados devolviendoles su estado previo si existe. */
  restore(ids: readonly string[]): { affected: number } {
    let affected = 0
    this.db.transaction(() => {
      for (const id of ids) {
        const row = this.getProductRow(id)
        if (!row || !row.archived_at) continue

        const previous = this.db.scalar<string>(
          `SELECT note FROM product_history
           WHERE product_id = $id AND action = 'archived'
           ORDER BY at DESC LIMIT 1`,
          { $id: id }
        )
        const restoredStatus = previous?.startsWith('estado anterior: ')
          ? previous.replace('estado anterior: ', '')
          : 'available'

        const at = nowIso()
        this.db.run(
          'UPDATE products SET archived_at = NULL, status = $status, updated_at = $at WHERE id = $id',
          { $id: id, $status: restoredStatus, $at: at }
        )
        this.writeHistory(id, 'restored', 'status', 'archived', restoredStatus, null)
        logActivity(this.db, {
          entity: 'product',
          entityId: id,
          action: 'restored',
          summary: `Articulo restaurado: ${row.sku}`
        })
        affected += 1
      }
    })
    return { affected }
  }

  /**
   * Elimina definitivamente articulos. Solo se permite sobre articulos ya
   * archivados: es una salvaguarda deliberada contra perdidas accidentales.
   */
  remove(ids: readonly string[]): { affected: number } {
    const notArchived: string[] = []
    for (const id of ids) {
      const row = this.getProductRow(id)
      if (row && !row.archived_at) notArchived.push(row.sku)
    }
    if (notArchived.length > 0) {
      throw appError('conflict', {
        reason: 'must_archive_first',
        count: notArchived.length,
        skus: notArchived.slice(0, 5).join(', ')
      })
    }

    let affected = 0
    this.db.transaction(() => {
      const params: Record<string, SqlParam> = {}
      const clause = inClause('del', ids, params)
      const row = this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM products WHERE id IN (${clause})`,
        params
      )
      affected = toNumber(row?.n)
      // ON DELETE CASCADE limpia etiquetas, multimedia, anuncios e historial.
      this.db.run(`DELETE FROM products WHERE id IN (${clause})`, params)
      logActivity(this.db, {
        entity: 'product',
        entityId: null,
        action: 'deleted',
        summary: `Articulos eliminados definitivamente: ${affected}`,
        details: { ids }
      })
    })
    return { affected }
  }

  /**
   * Fija el coste de adquisicion de un articulo. Lo usa el modulo de compras.
   *
   * Por que existe este metodo y no una escritura directa: el coste de un
   * articulo es dinero, y todo cambio de dinero debe quedar en el historial y
   * en el registro de actividad. Ademas, el modulo de compras NO debe conocer
   * las columnas de `products`: si manana cambia el esquema, solo cambia aqui.
   */
  setAcquisitionCost(
    productId: string,
    cost: {
      purchasePriceCents: number
      acquisitionFeesCents: number
      purchaseDate?: string | null
      /** Texto libre para el historial ("compra ALM-2026-001"). */
      source: string
    }
  ): void {
    this.db.transaction(() => {
      const current = this.getProductRow(productId)
      if (!current) throw appError('not_found', { entity: 'product' })

      const assignments: string[] = []
      const params: Record<string, SqlParam> = { $id: productId, $at: nowIso() }

      if (current.purchase_price_cents !== cost.purchasePriceCents) {
        assignments.push('purchase_price_cents = $price')
        params.$price = cost.purchasePriceCents
        this.writeHistory(
          productId,
          'purchase_cost',
          'purchase_price_cents',
          current.purchase_price_cents,
          cost.purchasePriceCents,
          cost.source
        )
      }

      if (current.acquisition_fees_cents !== cost.acquisitionFeesCents) {
        assignments.push('acquisition_fees_cents = $fees')
        params.$fees = cost.acquisitionFeesCents
        this.writeHistory(
          productId,
          'purchase_cost',
          'acquisition_fees_cents',
          current.acquisition_fees_cents,
          cost.acquisitionFeesCents,
          cost.source
        )
      }

      if (cost.purchaseDate !== undefined && cost.purchaseDate !== current.purchase_date) {
        assignments.push('purchase_date = $date')
        params.$date = cost.purchaseDate
        this.writeHistory(productId, 'purchase_cost', 'purchase_date', current.purchase_date, cost.purchaseDate, cost.source)
      }

      if (assignments.length === 0) return

      this.db.run(
        `UPDATE products SET ${assignments.join(', ')}, updated_at = $at WHERE id = $id`,
        params
      )
    })
  }

  /** Estado y datos minimos para saber si un articulo puede venderse. */
  getSellability(ids: readonly string[]): Array<{
    id: string
    sku: string
    name: string
    status: ProductStatus
    archivedAt: string | null
    totalCostCents: number
  }> {
    if (ids.length === 0) return []
    const params: Record<string, SqlParam> = {}
    const clause = inClause('sid', ids, params)
    return this.db
      .all<{
        id: string
        sku: string
        name: string
        status: string
        archived_at: string | null
        purchase_price_cents: number
        acquisition_fees_cents: number
      }>(
        `SELECT id, sku, name, status, archived_at, purchase_price_cents, acquisition_fees_cents
         FROM products WHERE id IN (${clause})`,
        params
      )
      .map((row) => ({
        id: row.id,
        sku: toStringValue(row.sku),
        name: toStringValue(row.name),
        status: row.status as ProductStatus,
        archivedAt: toNullableString(row.archived_at),
        totalCostCents: toNumber(row.purchase_price_cents) + toNumber(row.acquisition_fees_cents)
      }))
  }

  /**
   * Marca un articulo como vendido con un precio final, o lo devuelve al
   * inventario. Lo usa el modulo de pedidos.
   */
  applySaleState(
    productId: string,
    sale: { status: ProductStatus; finalSalePriceCents: number | null; note: string }
  ): void {
    this.db.transaction(() => {
      const current = this.getProductRow(productId)
      if (!current) throw appError('not_found', { entity: 'product' })

      this.db.run(
        'UPDATE products SET status = $status, final_sale_price_cents = $price, updated_at = $at WHERE id = $id',
        {
          $id: productId,
          $status: sale.status,
          $price: sale.finalSalePriceCents,
          $at: nowIso()
        }
      )

      if (current.status !== sale.status) {
        this.writeHistory(productId, 'sale', 'status', current.status, sale.status, sale.note)
      }
      if (current.final_sale_price_cents !== sale.finalSalePriceCents) {
        this.writeHistory(
          productId,
          'sale',
          'final_sale_price_cents',
          current.final_sale_price_cents,
          sale.finalSalePriceCents,
          sale.note
        )
      }
    })
  }

  // -------------------------------------------------------------------------
  // Edicion masiva
  // -------------------------------------------------------------------------

  bulkPreview(input: ProductBulkUpdateInput): BulkUpdatePreview {
    const rows = input.ids
      .map((id) => this.getProductRow(id))
      .filter((row): row is ProductRow => row !== null)

    const changes: BulkUpdatePreview['changes'] = []
    let totalFields = 0
    let affected = 0
    const limit = 200

    for (const row of rows) {
      const fields = this.computeBulkChanges(row, input)
      if (fields.length === 0) continue
      affected += 1
      totalFields += fields.length
      if (changes.length < limit) {
        changes.push({ id: row.id, sku: row.sku, name: row.name, fields })
      }
    }

    return {
      affected,
      totalFields,
      requested: rows.length,
      truncated: affected > changes.length,
      changes
    }
  }

  bulkUpdate(input: ProductBulkUpdateInput): { affected: number } {
    const now = nowIso()
    let affected = 0

    this.db.transaction(() => {
      const addTagIds = (input.addTags ?? []).map((name) => this.tags.ensure(name).id)
      const removeTagIds = (input.removeTags ?? []).map((name) => this.tags.ensure(name).id)

      for (const id of input.ids) {
        const row = this.getProductRow(id)
        if (!row) continue

        const fields = this.computeBulkChanges(row, input)
        if (fields.length === 0) continue

        const assignments: string[] = []
        const params: Record<string, SqlParam> = { $id: id, $at: now }

        if (input.status !== undefined && input.status !== row.status) {
          assignments.push('status = $status')
          params.$status = input.status
          this.writeHistory(id, 'bulk_update', 'status', row.status, input.status, null)
        }
        if (input.condition !== undefined && input.condition !== row.condition) {
          assignments.push('condition = $condition')
          params.$condition = input.condition
          this.writeHistory(id, 'bulk_update', 'condition', row.condition, input.condition, null)
        }
        if (input.categoryId !== undefined && input.categoryId !== row.category_id) {
          assignments.push('category_id = $category')
          params.$category = input.categoryId
          this.writeHistory(id, 'bulk_update', 'category_id', row.category_id, input.categoryId, null)
        }
        if (input.locationId !== undefined && input.locationId !== row.location_id) {
          assignments.push('location_id = $location')
          params.$location = input.locationId
          this.writeHistory(id, 'bulk_update', 'location_id', row.location_id, input.locationId, null)
        }
        if (input.priceAdjustment) {
          const nextPrice = this.applyPriceAdjustment(row.expected_sale_price_cents, input.priceAdjustment)
          if (nextPrice !== row.expected_sale_price_cents) {
            assignments.push('expected_sale_price_cents = $price')
            params.$price = nextPrice
            this.writeHistory(id, 'price_change', 'expected_sale_price_cents', row.expected_sale_price_cents, nextPrice, null)
          }
        }
        if (input.appendPrivateNote && input.appendPrivateNote.trim()) {
          const note = `${row.private_notes}\n[${now.slice(0, 10)}] ${input.appendPrivateNote.trim()}`.trim()
          assignments.push('private_notes = $notes')
          params.$notes = note
        }

        if (assignments.length > 0) {
          this.db.run(
            `UPDATE products SET ${assignments.join(', ')}, updated_at = $at WHERE id = $id`,
            params
          )
          affected += 1
        }

        if (addTagIds.length > 0) this.tags.addTagsToProducts([id], addTagIds)
        if (removeTagIds.length > 0) this.tags.removeTagsFromProducts([id], removeTagIds)
      }

      if (affected > 0) {
        logActivity(this.db, {
          entity: 'product',
          entityId: null,
          action: 'bulk_update',
          summary: `Edicion masiva aplicada a ${affected} articulo(s)`,
          details: { ids: input.ids.length }
        })
      }
    })

    return { affected }
  }

  private computeBulkChanges(    row: ProductRow,
    input: ProductBulkUpdateInput
  ): BulkUpdatePreview['changes'][number]['fields'] {
    const fields: BulkUpdatePreview['changes'][number]['fields'] = []
    if (input.status !== undefined && input.status !== row.status) {
      fields.push({ field: 'status', before: row.status, after: input.status })
    }
    if (input.condition !== undefined && input.condition !== row.condition) {
      fields.push({ field: 'condition', before: row.condition, after: input.condition })
    }
    if (input.categoryId !== undefined && input.categoryId !== row.category_id) {
      fields.push({
        field: 'category_id',
        before: this.categoryLabel(row.category_id),
        after: this.categoryLabel(input.categoryId)
      })
    }
    if (input.locationId !== undefined && input.locationId !== row.location_id) {
      fields.push({
        field: 'location_id',
        before: this.locationLabel(row.location_id),
        after: this.locationLabel(input.locationId)
      })
    }
    if (input.priceAdjustment) {
      const nextPrice = this.applyPriceAdjustment(row.expected_sale_price_cents, input.priceAdjustment)
      if (nextPrice !== row.expected_sale_price_cents) {
        fields.push({
          field: 'expected_sale_price_cents',
          before: formatChangeValue('expected_sale_price_cents', row.expected_sale_price_cents),
          after: formatChangeValue('expected_sale_price_cents', nextPrice)
        })
      }
    }
    if (input.addTags && input.addTags.length > 0) {
      fields.push({ field: 'tags', before: '', after: '+' + input.addTags.join(', ') })
    }
    if (input.removeTags && input.removeTags.length > 0) {
      fields.push({ field: 'tags', before: '', after: '-' + input.removeTags.join(', ') })
    }
    if (input.appendPrivateNote && input.appendPrivateNote.trim()) {
      fields.push({ field: 'private_notes', before: '', after: input.appendPrivateNote.trim() })
    }
    return fields
  }

  /**
   * Ajuste de precio.
   *  - set:     fija el precio al valor indicado (en centimos)
   *  - delta:   suma el valor (en centimos), nunca por debajo de 0
   *  - percent: aplica el porcentaje indicado y redondea al centimo
   */
  private applyPriceAdjustment(
    currentCents: number,
    adjustment: { mode: 'set' | 'percent' | 'delta'; value: number }
  ): number {
    switch (adjustment.mode) {
      case 'set':
        return Math.max(0, Math.round(adjustment.value))
      case 'delta':
        return Math.max(0, Math.round(currentCents + adjustment.value))
      case 'percent':
        return Math.max(0, Math.round(currentCents * (1 + adjustment.value / 100)))
      default:
        return currentCents
    }
  }

  private categoryLabel(id: string | null): string {
    if (!id) return ''
    return this.db.scalar<string>('SELECT name FROM categories WHERE id = $id', { $id: id }) ?? ''
  }

  private locationLabel(id: string | null): string {
    if (!id) return ''
    return this.db.scalar<string>('SELECT path FROM locations WHERE id = $id', { $id: id }) ?? ''
  }

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  private normalizeSku(value: string): string {
    const sku = value.trim().toUpperCase().replace(/\s+/g, '-')
    if (!sku) throw appError('invalid_input', { field: 'sku' })
    return sku
  }

  getProductRow(id: string): ProductRow | null {
    return this.db.get<ProductRow>(`${SELECT_BASE} WHERE p.id = $id`, { $id: id }) ?? null
  }

  private getProductOrThrow(id: string): Product {
    const row = this.db.get<ProductRow>(`${SELECT_BASE} WHERE p.id = $id`, { $id: id })
    if (!row) throw appError('db_error', { detail: 'product_not_persisted' })
    return mapProduct(row)
  }

  private tagsForProducts(ids: readonly string[]): Map<string, string[]> {
    const map = new Map<string, string[]>()
    if (ids.length === 0) return map
    const params: Record<string, SqlParam> = {}
    const clause = inClause('tid', ids, params)
    const rows = this.db.all<{ product_id: string; name: string }>(
      `SELECT pt.product_id, t.name FROM product_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.product_id IN (${clause})
       ORDER BY t.name COLLATE NOCASE ASC`,
      params
    )
    for (const row of rows) {
      const list = map.get(row.product_id)
      if (list) list.push(row.name)
      else map.set(row.product_id, [row.name])
    }
    return map
  }

  private writeHistory(
    productId: string,
    action: string,
    field: string | null,
    oldValue: unknown,
    newValue: unknown,
    note: string | null
  ): void {
    this.db.run(
      `INSERT INTO product_history (id, product_id, at, action, field, old_value, new_value, note, user_id)
       VALUES ($id, $product, $at, $action, $field, $old, $new, $note, $user)`,
      {
        $id: newId(),
        $product: productId,
        $at: nowIso(),
        $action: action,
        $field: field,
        $old: oldValue === null || oldValue === undefined ? null : String(oldValue),
        $new: newValue === null || newValue === undefined ? null : String(newValue),
        $note: note,
        $user: ACTOR_USER_ID
      }
    )
  }
}
