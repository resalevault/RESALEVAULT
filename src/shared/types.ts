/**
 * RESALEVAULT - Tipos compartidos.
 *
 * Este archivo lo consumen los tres procesos (main, preload y renderer), por
 * lo que NO debe importar APIs de Node ni del DOM. Solo tipos y constantes.
 */

// ---------------------------------------------------------------------------
// Tipos basicos
// ---------------------------------------------------------------------------

/** Fecha ISO completa con hora: 2026-10-19T18:22:31.000Z */
export type ISODateTime = string

/** Fecha sin hora: 2026-10-19 */
export type ISODate = string

/**
 * Resultado de una operacion que cruza el puente IPC. Nunca lanzamos errores
 * a traves de IPC: devolvemos siempre una union discriminada para que el
 * renderer pueda decidir sin depender del texto del mensaje.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload }

export interface AppErrorPayload {
  code: ErrorCode
  /** Parametros para construir el mensaje traducido en el renderer. */
  params?: Record<string, string | number>
  /** Solo para diagnostico interno, nunca para mostrar al usuario final. */
  detail?: string
}

export const ERROR_CODES = [
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

export type ErrorCode = (typeof ERROR_CODES)[number]

// ---------------------------------------------------------------------------
// Enumeraciones de dominio
// ---------------------------------------------------------------------------

/** Estados configurables del ciclo de vida de un articulo. */
export const PRODUCT_STATUSES = [
  'to_prepare',
  'available',
  'reserved',
  'sold',
  'shipped',
  'returned',
  'archived'
] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

/** Estados que representan articulos ya vendidos (afectan a finanzas). */
export const SOLD_STATUSES: readonly ProductStatus[] = ['sold', 'shipped']

export const PRODUCT_CONDITIONS = [
  'unknown',
  'new',
  'like_new',
  'good',
  'used',
  'fair',
  'for_parts'
] as const
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number]

export const LOCATION_KINDS = ['warehouse', 'shelf', 'box', 'compartment'] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

/** Relacion jerarquica permitida entre ubicaciones. */
export const LOCATION_PARENT_KIND: Record<LocationKind, LocationKind | null> = {
  warehouse: null,
  shelf: 'warehouse',
  box: 'shelf',
  compartment: 'box'
}

export const LISTING_STATUSES = ['draft', 'active', 'paused', 'sold', 'ended'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const MEDIA_KINDS = ['photo', 'document'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const ATTRIBUTE_TYPES = ['text', 'number', 'boolean', 'date', 'select'] as const
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Organization {
  id: string
  name: string
  createdAt: ISODateTime
}

export type UserRole = 'owner' | 'manager' | 'operator' | 'viewer'

export interface User {
  id: string
  organizationId: string
  displayName: string
  role: UserRole
  createdAt: ISODateTime
}

export interface Category {
  id: string
  parentId: string | null
  name: string
  slug: string
  sortOrder: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** Numero de articulos activos en esta categoria (sin contar subcategorias). */
  productCount: number
}

export interface Location {
  id: string
  parentId: string | null
  kind: LocationKind
  /** Codigo corto unico, p. ej. ALM01, EST03, CAJA12. */
  code: string
  name: string
  /** Ruta completa derivada, p. ej. ALM01-EST03-CAJA12. */
  path: string
  depth: number
  sortOrder: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** articulos asignados directamente a esta ubicacion. */
  productCount: number
}

export interface Tag {
  id: string
  name: string
  color: string
  productCount: number
}

export interface Platform {
  id: string
  code: string
  name: string
  sortOrder: number
  active: boolean
  isBuiltin: boolean
}

export interface AttributeDefinition {
  id: string
  key: string
  name: string
  type: AttributeType
  options: string[]
  sortOrder: number
}

export interface MediaAsset {
  id: string
  productId: string
  kind: MediaKind
  /** Nombre del archivo dentro del almacen de datos de la app. */
  fileName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  width: number | null
  height: number | null
  sortOrder: number
  isCover: boolean
  createdAt: ISODateTime
}

export interface Listing {
  id: string
  productId: string
  platformId: string
  platformCode: string
  platformName: string
  externalId: string
  url: string
  listedPriceCents: number | null
  status: ListingStatus
  listedAt: ISODate | null
  notes: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface HistoryEntry {
  id: string
  productId: string
  at: ISODateTime
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  note: string | null
}

export interface ActivityEntry {
  id: string
  at: ISODateTime
  entity: string
  entityId: string | null
  action: string
  summary: string
}

/** Atributos personalizados: mapa clave -> valor serializable. */
export type ProductAttributes = Record<string, string | number | boolean | null>

export interface Product {
  id: string
  sku: string
  name: string
  description: string
  categoryId: string | null
  brand: string
  model: string
  size: string
  color: string
  condition: ProductCondition
  status: ProductStatus
  attributes: ProductAttributes
  purchaseDate: ISODate | null
  purchasePriceCents: number
  acquisitionFeesCents: number
  expectedSalePriceCents: number
  finalSalePriceCents: number | null
  locationId: string | null
  privateNotes: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  archivedAt: ISODateTime | null
}

/**
 * Vista de un articulo para listados. Incluye campos derivados cuyo calculo
 * esta documentado en docs/FORMULAS.md:
 *   totalCostCents     = purchasePriceCents + acquisitionFeesCents
 *   estimatedMarginCents = expectedSalePriceCents - totalCostCents
 *   realizedMarginCents  = finalSalePriceCents - totalCostCents  (solo si vendido)
 *   ageDays            = dias desde purchaseDate (o desde createdAt si no hay)
 */
export interface ProductSummary {
  id: string
  sku: string
  name: string
  status: ProductStatus
  condition: ProductCondition
  categoryId: string | null
  categoryName: string | null
  locationId: string | null
  locationPath: string | null
  brand: string
  size: string
  color: string
  purchasePriceCents: number
  acquisitionFeesCents: number
  expectedSalePriceCents: number
  finalSalePriceCents: number | null
  totalCostCents: number
  estimatedMarginCents: number
  realizedMarginCents: number | null
  ageDays: number
  coverMediaId: string | null
  photoCount: number
  listingCount: number
  tags: string[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
  archivedAt: ISODateTime | null
}

export interface ProductDetail {
  product: Product
  media: MediaAsset[]
  listings: Listing[]
  tags: Tag[]
  history: HistoryEntry[]
}

// ---------------------------------------------------------------------------
// Consultas y entradas
// ---------------------------------------------------------------------------

export const PRODUCT_SORTS = [
  'updated_desc',
  'created_desc',
  'name_asc',
  'sku_asc',
  'cost_desc',
  'expected_desc',
  'age_desc',
  'margin_asc'
] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export interface ProductQuery {
  search?: string
  status?: ProductStatus[]
  conditions?: ProductCondition[]
  categoryIds?: string[]
  locationIds?: string[]
  platformIds?: string[]
  tagIds?: string[]
  /** Articulos con antiguedad >= N dias (stock estancado). */
  minAgeDays?: number
  maxAgeDays?: number
  includeArchived?: boolean
  onlyArchived?: boolean
  sort?: ProductSort
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface ProductCreateInput {
  name: string
  sku?: string
  description?: string
  categoryId?: string | null
  brand?: string
  model?: string
  size?: string
  color?: string
  condition?: ProductCondition
  status?: ProductStatus
  attributes?: ProductAttributes
  purchaseDate?: ISODate | null
  purchasePriceCents?: number
  acquisitionFeesCents?: number
  expectedSalePriceCents?: number
  finalSalePriceCents?: number | null
  locationId?: string | null
  privateNotes?: string
  tags?: string[]
}

export type ProductUpdateInput = Partial<ProductCreateInput>

/** Campos que la edicion masiva puede modificar. */
export interface ProductBulkUpdateInput {
  ids: string[]
  status?: ProductStatus
  categoryId?: string | null
  locationId?: string | null
  condition?: ProductCondition
  /** Ajuste de precio: fijo o porcentual, con redondeo a centimo. */
  priceAdjustment?: { mode: 'set' | 'percent' | 'delta'; value: number }
  addTags?: string[]
  removeTags?: string[]
  appendPrivateNote?: string
}

export interface BulkFieldChange {
  field: string
  before: string
  after: string
}

export interface BulkUpdatePreview {
  /** Articulos que realmente cambiaran (los que ya tenian el valor no cuentan). */
  affected: number
  /** Numero total de campos que se modificaran. */
  totalFields: number
  /** Articulos incluidos en la peticion. */
  requested: number
  /** Si es true, `changes` solo muestra los primeros 200 articulos. */
  truncated: boolean
  changes: Array<{ id: string; sku: string; name: string; fields: BulkFieldChange[] }>
}

// ---------------------------------------------------------------------------
// Ajustes de la aplicacion
// ---------------------------------------------------------------------------

export type ThemeMode = 'dark' | 'light'
export type LocaleCode = 'es' | 'en'

export interface AppSettings {
  locale: LocaleCode
  theme: ThemeMode
  currency: string
  /** Patron de generacion automatica de SKU. Ver shared/sku.ts */
  skuPattern: string
  skuPrefix: string
  /** Dias para considerar un articulo como stock estancado (ordenados). */
  staleThresholds: number[]
  /** Margen objetivo sobre el precio de venta, en porcentaje. */
  targetMarginPercent: number
  /** Beneficio minimo aceptable por operacion, en centimos. */
  minProfitCents: number
  /** Comision de plataforma por defecto, en porcentaje (para la calculadora). */
  defaultFeePercent: number
  /** Envio asumido por defecto, en centimos (para la calculadora). */
  defaultShippingCents: number
  /** Ultima version de esquema de base de datos vista por la app. */
  schemaVersion?: number
}

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  sqliteVersion: string
  platform: string
  arch: string
  locale: string
  userDataPath: string
  databasePath: string
  isDev: boolean
}

export interface ThirdPartyNoticesInfo {
  path: string
  text: string
  bytes: number
}

export interface AppHashInfo {
  algorithm: 'sha256'
  target: string
  hash: string
  bytes: number
}

export interface DatabaseHealth {
  ok: boolean
  schemaVersion: number
  foreignKeys: boolean
  journalMode: string
  integrityCheck: string
  fileSizeBytes: number
}

export interface DashboardSummary {
  totalItems: number
  availableItems: number
  reservedItems: number
  toPrepareItems: number
  soldItems: number
  archivedItems: number
  /** Capital inmovilizado: coste total de los articulos NO vendidos ni archivados. */
  capitalInvestedCents: number
  /** Valor estimado del inventario disponible a precio de venta previsto. */
  inventoryRetailCents: number
  /** Ingresos registrados por precio final de venta de articulos vendidos. */
  grossSalesCents: number
  /** Beneficio realizado = suma(finalSalePrice - totalCost) de vendidos. */
  realizedProfitCents: number
  /** Beneficio potencial del inventario no vendido. */
  potentialProfitCents: number
  stolenByAge: Array<{ bucket: string; count: number; capitalCents: number }>
  topCategories: Array<{ categoryId: string | null; name: string; count: number; capitalCents: number }>
  recentActivity: ActivityEntry[]
}
