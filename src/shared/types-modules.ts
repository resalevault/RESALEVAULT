/**
 * RESALEVAULT - Tipos de los modulos de compras, pedidos, multimedia,
 * inteligencia, IA y licencias.
 *
 * Igual que `types.ts`, este archivo es agnostico del entorno: no importa APIs
 * de Node ni del DOM.
 */

import type { ISODate, ISODateTime, ProductStatus } from './types'

// ===========================================================================
// MULTIMEDIA
// ===========================================================================

/** Tipos de archivo realmente aceptados (comprobados por firma binaria). */
export const ALLOWED_MEDIA_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv'
] as const
export type AllowedMediaMime = (typeof ALLOWED_MEDIA_MIME)[number]

export const MEDIA_LIMITS = {
  /** 25 MB por archivo. */
  maxFileBytes: 25 * 1024 * 1024,
  maxPhotosPerProduct: 30,
  maxDocumentsPerProduct: 20,
  /** Lado mayor de la miniatura generada. */
  thumbnailSize: 480
} as const

export type MediaRejectionReason = 'unsupported' | 'too_large' | 'duplicate' | 'limit' | 'error'

export interface MediaImportRejection {
  originalName: string
  reason: MediaRejectionReason
  detail?: string
}

export interface MediaImportResult {
  imported: number
  assets: Array<{
    id: string
    productId: string
    kind: 'photo' | 'document'
    originalName: string
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
  }>
  rejected: MediaImportRejection[]
}

export interface MediaStorageReport {
  rootPath: string
  thumbnailsPath: string
  referencedFiles: number
  storedFiles: number
  orphanFiles: string[]
  missingFiles: string[]
  totalBytes: number
}

// ===========================================================================
// PROVEEDORES Y COMPRAS
// ===========================================================================

export interface Supplier {
  id: string
  name: string
  contact: string
  notes: string
  purchaseCount: number
  totalSpentCents: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export const ALLOCATION_METHODS = ['by_cost', 'equal', 'none'] as const
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number]

export interface PurchaseItem {
  id: string
  purchaseId: string
  productId: string | null
  productSku: string | null
  productName: string | null
  description: string
  quantity: number
  unitCostCents: number
  allocatedExtraCents: number
  lineCostCents: number
}

export interface Purchase {
  id: string
  reference: string
  supplierId: string | null
  supplierName: string
  purchasedAt: ISODate
  shippingCents: number
  otherCents: number
  discountCents: number
  allocationMethod: AllocationMethod
  notes: string
  isDemo: boolean
  items: PurchaseItem[]
  /** Suma de las lineas. */
  itemsCostCents: number
  /** Envio + otros − descuento. Es lo que se reparte entre los articulos. */
  extraCostCents: number
  /** Total desembolsado: lineas + envio + otros − descuento. */
  totalCostCents: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface PurchaseItemInput {
  productId?: string | null
  description?: string
  quantity: number
  unitCostCents: number
}

export interface PurchaseCreateInput {
  reference?: string
  supplierId?: string | null
  supplierName?: string
  purchasedAt: ISODate
  shippingCents?: number
  otherCents?: number
  discountCents?: number
  allocationMethod?: AllocationMethod
  notes?: string
  items: PurchaseItemInput[]
}

/**
 * Reparto de costes de una compra. Documentado porque es dinero:
 *  - `by_cost`: cada articulo recibe `extra * (suCoste / costeTotal)`.
 *  - `equal`:   `extra / numeroDeArticulos`, con el resto al primero.
 *  - `none`:    el extra no se reparte (queda solo en la compra).
 * El redondeo se hace en centimos y el residuo se asigna a la ultima linea,
 * de modo que la suma de lo repartido es EXACTAMENTE el extra.
 */
export interface AllocationPreview {
  method: AllocationMethod
  extraCents: number
  lines: Array<{
    index: number
    description: string
    unitCostCents: number
    quantity: number
    allocatedExtraCents: number
    effectiveUnitCostCents: number
  }>
  allocatedTotalCents: number
  unallocatedCents: number
}

// ===========================================================================
// GASTOS GENERALES
// ===========================================================================

export const EXPENSE_CATEGORIES = [
  'packaging',
  'shipping',
  'platform_fees',
  'subscriptions',
  'storage',
  'transport',
  'marketing',
  'taxes',
  'equipment',
  'other'
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_RECURRENCE = ['none', 'monthly', 'yearly'] as const
export type ExpenseRecurrence = (typeof EXPENSE_RECURRENCE)[number]

export interface Expense {
  id: string
  category: ExpenseCategory
  description: string
  amountCents: number
  incurredOn: ISODate
  recurring: ExpenseRecurrence
  notes: string
  isDemo: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ExpenseSummary {
  totalCents: number
  byCategory: Array<{ category: ExpenseCategory; totalCents: number; count: number }>
  byMonth: Array<{ month: string; totalCents: number }>
}

// ===========================================================================
// PEDIDOS
// ===========================================================================

export const ORDER_STATUSES = [
  'pending',
  'preparing',
  'packed',
  'shipped',
  'delivered',
  'returned',
  'cancelled'
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Estados en los que el pedido sigue esperando trabajo en el almacen. */
export const ORDER_OPEN_STATUSES: readonly OrderStatus[] = ['pending', 'preparing', 'packed']

export const ORDER_FEE_KINDS = ['commission', 'payment', 'promotion', 'shipping', 'other'] as const
export type OrderFeeKind = (typeof ORDER_FEE_KINDS)[number]

export interface OrderItem {
  id: string
  orderId: string
  productId: string | null
  sku: string
  title: string
  quantity: number
  unitPriceCents: number
  unitCostCents: number
  lineRevenueCents: number
  lineCostCents: number
}

export interface OrderFee {
  id: string
  orderId: string
  kind: OrderFeeKind
  label: string
  amountCents: number
}

export interface OrderReturn {
  id: string
  orderId: string
  returnedAt: ISODate
  reason: string
  refundCents: number
  feeRefundCents: number
  shippingLostCents: number
  restock: boolean
  notes: string
}

/**
 * Cuenta de resultados de un pedido. Todas las formulas estan documentadas en
 * docs/FORMULAS.md y se calculan en el proceso principal, nunca en la interfaz.
 *
 *   goodsRevenueCents  = SUM(unitPrice * quantity)
 *   netRevenueCents    = goodsRevenue - discount + shippingCharged
 *   goodsCostCents     = SUM(unitCost * quantity)
 *   feesCents          = SUM(order_fees.amount)
 *   refundsCents       = SUM(order_returns.refund)
 *   feesRefundedCents  = SUM(order_returns.feeRefund)
 *   shippingLostCents  = SUM(order_returns.shippingLost)
 *   netProfitCents     = netRevenue - goodsCost - fees - shippingCost - other
 *                        - refunds + feesRefunded - shippingLost
 *   marginPercent      = netProfit / netRevenue * 100
 */
export interface OrderFinancials {
  goodsRevenueCents: number
  discountCents: number
  shippingChargedCents: number
  netRevenueCents: number
  goodsCostCents: number
  feesCents: number
  shippingCostCents: number
  otherCostCents: number
  refundsCents: number
  feesRefundedCents: number
  shippingLostCents: number
  netProfitCents: number
  marginPercent: number | null
  unitsSold: number
}

export interface Order {
  id: string
  orderNumber: string
  platformId: string | null
  platformName: string | null
  soldAt: ISODate
  buyer: string
  status: OrderStatus
  shippingChargedCents: number
  shippingCostCents: number
  discountCents: number
  otherCents: number
  paymentReference: string
  trackingNumber: string
  carrier: string
  notes: string
  preparedAt: ISODateTime | null
  shippedAt: ISODateTime | null
  deliveredAt: ISODateTime | null
  isDemo: boolean
  items: OrderItem[]
  fees: OrderFee[]
  returns: OrderReturn[]
  financials: OrderFinancials
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface OrderSummary {
  id: string
  orderNumber: string
  platformId: string | null
  platformName: string | null
  soldAt: ISODate
  buyer: string
  status: OrderStatus
  itemCount: number
  units: number
  netRevenueCents: number
  netProfitCents: number
  marginPercent: number | null
  trackingNumber: string
  hasReturn: boolean
  createdAt: ISODateTime
}

export interface OrderCreateInput {
  platformId?: string | null
  soldAt: ISODate
  buyer?: string
  status?: OrderStatus
  shippingChargedCents?: number
  shippingCostCents?: number
  discountCents?: number
  otherCents?: number
  paymentReference?: string
  trackingNumber?: string
  carrier?: string
  notes?: string
  /** Articulos del pedido, con su precio de venta. */
  items: Array<{ productId: string; unitPriceCents: number; quantity?: number }>
  /** Comisiones y cargos. Se pueden anadir despues. */
  fees?: Array<{ kind: OrderFeeKind; label?: string; amountCents: number }>
}

export interface OrderQuery {
  search?: string
  status?: OrderStatus[]
  platformIds?: string[]
  from?: ISODate
  to?: ISODate
  onlyWithReturns?: boolean
  sort?: 'date_desc' | 'date_asc' | 'profit_desc' | 'profit_asc' | 'number_asc'
  page?: number
  pageSize?: number
}

export interface OrderReturnInput {
  orderId: string
  returnedAt: ISODate
  reason?: string
  refundCents: number
  feeRefundCents?: number
  shippingLostCents?: number
  restock?: boolean
  notes?: string
}

// ===========================================================================
// PREPARACION DE PEDIDOS
// ===========================================================================

export interface PickingCheck {
  orderId: string
  productId: string
  pickedAt: ISODateTime | null
  packedAt: ISODateTime | null
  scannedSku: string
  note: string
}

export interface PickingLine {
  productId: string
  sku: string
  title: string
  quantity: number
  locationId: string | null
  locationPath: string | null
  check: PickingCheck | null
}

export interface PickingOrder {
  orderId: string
  orderNumber: string
  soldAt: ISODate
  status: OrderStatus
  platformName: string | null
  buyer: string
  units: number
  trackingNumber: string
  lines: PickingLine[]
  /** Lineas agrupadas por ubicacion, para reducir desplazamientos. */
  byLocation: Array<{ locationPath: string; lines: PickingLine[] }>
  pickedCount: number
  packedCount: number
}

// ===========================================================================
// ETIQUETAS, CODIGOS DE BARRAS Y ESCANEO
// ===========================================================================

export const BARCODE_SYMBOLOGIES = ['code128', 'qrcode', 'code39', 'ean13', 'datamatrix'] as const
export type BarcodeSymbology = (typeof BARCODE_SYMBOLOGIES)[number]

/** Tipos de etiqueta imprimible. */
export const LABEL_TARGETS = ['product', 'location'] as const
export type LabelTarget = (typeof LABEL_TARGETS)[number]

export interface LabelOptions {
  target: LabelTarget
  symbology: BarcodeSymbology
  /** Ancho y alto de cada etiqueta en milimetros. */
  widthMm: number
  heightMm: number
  columns: number
  showSku: boolean
  showName: boolean
  showLocation: boolean
  showPrice: boolean
  showPlatform: boolean
  /** Codigo a codificar: por defecto, el SKU o la ruta de la ubicacion. */
  encode?: 'sku' | 'location' | 'custom'
  customPrefix?: string
  title: string
}

export interface LabelItem {
  id: string
  target: LabelTarget
  code: string
  sku: string
  name: string
  locationPath: string
  priceCents: number | null
  platform: string
  /** SVG del codigo de barras/QR generado en el proceso principal. */
  barcodeSvg: string
}

export interface LabelSheet {
  options: LabelOptions
  items: LabelItem[]
}

export interface ScanResolution {
  kind: 'product' | 'location' | 'unknown'
  code: string
  productId?: string
  productName?: string
  productStatus?: ProductStatus
  locationPath?: string
}

// ===========================================================================
// IMPORTACION Y EXPORTACION
// ===========================================================================

export interface CsvColumnMapping {
  /** Campo de RESALEVAULT -> indice de columna del CSV. */
  [field: string]: number
}

export interface CsvPreview {
  headers: string[]
  delimiter: string
  totalRows: number
  sampleRows: string[][]
  suggestedMapping: CsvColumnMapping
  /** Campos de RESALEVAULT disponibles para mapear. */
  targetFields: Array<{ field: string; labelKey: string; required: boolean }>
}

export interface CsvDuplicate {
  row: number
  reason: 'sku_exists' | 'possible_match'
  sku: string
  name: string
  existingId: string
  existingSku: string
  existingName: string
  /** Campos que difieren respecto al registro existente. */
  differences: Array<{ field: string; incoming: string; existing: string }>
}

export interface CsvValidationIssue {
  row: number
  field: string
  message: string
}

export interface CsvImportReport {
  parsed: number
  valid: number
  invalid: number
  duplicates: CsvDuplicate[]
  issues: CsvValidationIssue[]
  preview: Array<Record<string, string>>
}

export type CsvDuplicateStrategy = 'skip' | 'update' | 'create_anyway'

export interface CsvImportOptions {
  path: string
  mapping: CsvColumnMapping
  duplicateStrategy: CsvDuplicateStrategy
  dryRun: boolean
}

export interface CsvImportResult {
  created: number
  updated: number
  skipped: number
  failed: number
  issues: CsvValidationIssue[]
}

export interface CsvExportOptions {
  path: string
  format: 'products' | 'orders' | 'purchases' | 'expenses' | 'picking'
  delimiter: string
  includeArchived?: boolean
}

export interface FileDialogResult {
  canceled: boolean
  path?: string
}

// ===========================================================================
// INTELIGENCIA
// ===========================================================================

export const INSIGHT_SEVERITIES = ['critical', 'warning', 'info'] as const
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number]

export interface Insight {
  /** Clave estable: regla + sujeto, para poder descartarla. */
  key: string
  ruleId: string
  severity: InsightSeverity
  titleKey: string
  /** Datos EXACTOS en los que se basa la recomendacion. */
  facts: Array<{ labelKey: string; value: string }>
  /** Acciones sugeridas. Nunca se aplican solas. */
  actions: Array<{ kind: 'open_product' | 'open_order' | 'open_settings' | 'review_price'; target?: string }>
  /** Articulos o pedidos implicados. */
  subjectIds: string[]
  /** Si es true, la recomendacion se basa en umbrales configurables. */
  configurable: boolean
}

export interface InsightReport {
  generatedAt: ISODateTime
  rulesRun: number
  insights: Insight[]
  counts: Record<InsightSeverity, number>
  /** Reglas desactivadas por el usuario o sin datos suficientes. */
  skipped: string[]
  thresholds: IntelligenceThresholds
}

export interface IntelligenceThresholds {
  staleDays: number
  lowMarginPercent: number
  maxCapitalSharePercent: number
  pendingPrepDays: number
  pendingOrderDays: number
  returnsRatePercent: number
  expenseGrowthPercent: number
  enabled: boolean
}

// ===========================================================================
// AI STUDIO
// ===========================================================================

export const AI_PROVIDERS = ['gemini', 'openai', 'anthropic'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const AI_TASKS = [
  'title',
  'description',
  'translation',
  'classification',
  'attributes',
  'keywords',
  'review',
  'price_suggestion'
] as const
export type AiTask = (typeof AI_TASKS)[number]

export interface AiConnection {
  id: string
  provider: AiProvider
  label: string
  /** Ultimos caracteres de la clave, solo para identificarla. */
  secretHint: string
  baseUrl: string
  defaultModel: string
  active: boolean
  hasSecret: boolean
  lastOkAt: ISODateTime | null
  lastError: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface AiModelInfo {
  id: string
  displayName: string
  /** Si el proveedor informa de limites, se muestran; si no, quedan vacios. */
  inputTokenLimit: number | null
  outputTokenLimit: number | null
}

export interface AiConnectionTest {
  ok: boolean
  modelCount: number
  models: AiModelInfo[]
  latencyMs: number
  /** Mensaje normalizado, no el volcado del proveedor. */
  errorCode?: AiErrorCode
  errorDetail?: string
}

export const AI_ERROR_CODES = [
  'missing_key',
  'invalid_key',
  'rate_limited',
  'quota_exceeded',
  'model_not_found',
  'network_error',
  'timeout',
  'provider_error',
  'unsupported_file',
  'too_large',
  'not_configured',
  'disabled_by_user',
  'encryption_unavailable'
] as const
export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export interface AiUsageEntry {
  id: string
  at: ISODateTime
  provider: string
  model: string
  task: AiTask | string
  inputTokens: number
  outputTokens: number
  costMicros: number
  ok: boolean
  error: string | null
  subject: string
}

export interface AiUsageReport {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostMicros: number
  byProvider: Array<{ provider: string; calls: number; costMicros: number }>
  byTask: Array<{ task: string; calls: number; costMicros: number }>
  recent: AiUsageEntry[]
}

export interface AiGenerateRequest {
  task: AiTask
  productId?: string
  /** Texto de entrada del usuario (tema, idioma destino...). */
  instruction?: string
  language?: string
  /** Imagenes en base64 (sin cabecera data:) para analisis de fotografia. */
  images?: Array<{ mimeType: string; base64: string }>
  /** Fuerza un modelo concreto en lugar de la ruta configurada. */
  model?: string
  connectionId?: string
}

export interface AiGenerateResult {
  task: AiTask
  provider: AiProvider
  model: string
  text: string
  /** Valores estructurados cuando la tarea los produce (atributos, palabras clave). */
  structured?: Record<string, string>
  inputTokens: number
  outputTokens: number
  costMicros: number
  latencyMs: number
  /** Aviso obligatorio: es una estimacion, no un precio de mercado verificado. */
  disclaimerKey?: string
}

export interface AiFlowStep {
  task: AiTask
  connectionId: string
  model: string
  instruction?: string
}

export interface AiFlow {
  id: string
  name: string
  steps: AiFlowStep[]
  enabled: boolean
}

export interface AiFlowEstimate {
  steps: number
  products: number
  estimatedCalls: number
  estimatedInputTokens: number
  estimatedCostMicros: number
  requiresConfirmation: boolean
}

// ===========================================================================
// LICENCIAS Y PLANES
// ===========================================================================

export const LICENSE_PLANS = ['free', 'pro', 'business'] as const
export type LicensePlan = (typeof LICENSE_PLANS)[number]

export const LICENSE_KINDS = ['perpetual', 'subscription', 'founder'] as const
export type LicenseKind = (typeof LICENSE_KINDS)[number]

export type LicenseStatus = 'inactive' | 'active' | 'expired' | 'revoked'

/** Limites por plan. Fuente unica de verdad: `shared/plans.ts`. */
export interface PlanLimits {
  maxProducts: number
  maxUploads: number
  bulkEdit: boolean
  media: boolean
  purchases: boolean
  orders: boolean
  analytics: boolean
  csvImport: boolean
  barcodes: boolean
  intelligence: boolean
  aiStudio: boolean
  aiMonthlyCalls: number
  multiUser: boolean
  sync: boolean
}

export interface LicenseState {
  plan: LicensePlan
  kind: LicenseKind | null
  status: LicenseStatus
  licenseId: string | null
  holder: string
  activatedAt: ISODateTime | null
  expiresAt: ISODateTime | null
  seats: number
  deviceId: string
  limits: PlanLimits
  /** Uso actual frente a los limites, para avisar antes de bloquear. */
  usage: {
    products: number
    uploads: number
    aiCallsThisMonth: number
  }
  /** Si es false, la firma no se pudo verificar y el plan cae a Free. */
  signatureValid: boolean
  notes: string
  /**
   * Estado de la comprobacion ONLINE (puestos y revocaciones). Es informativo:
   * una licencia con firma valida sigue funcionando sin conexion. `unknown`
   * cuando aun no se ha intentado o no toca.
   */
  online: {
    state: 'unknown' | 'verified' | 'offline' | 'rejected'
    /** Motivo del ultimo rechazo del servidor, si lo hubo. */
    reason: string
    /** Fecha de la ultima comprobacion correcta, si la hubo. */
    lastCheckAt: ISODateTime | null
  }
}

export interface LicenseActivationInput {
  /** Codigo de activacion (payload + firma) o licencia ya volcada. */
  code: string
  holder?: string
}

export interface FounderQuota {
  plan: 'pro' | 'business'
  limit: number
  issued: number
  remaining: number
}

// ===========================================================================
// INFORMES FINANCIEROS
// ===========================================================================

export interface PeriodRange {
  from: ISODate | null
  to: ISODate | null
}

/**
 * Cuenta de resultados del periodo. Cada bloque esta separado a proposito:
 * mezclar ingresos, costes de mercancia, gastos generales y capital inmovilizado
 * es la forma mas rapida de mostrar cifras que enganan.
 */
export interface FinanceReport {
  period: PeriodRange

  orders: {
    count: number
    units: number
    goodsRevenueCents: number
    discountCents: number
    shippingChargedCents: number
    netRevenueCents: number
    goodsCostCents: number
    feesCents: number
    shippingCostCents: number
    otherCostCents: number
    refundsCents: number
    feesRefundedCents: number
    shippingLostCents: number
    /** netRevenue − goodsCost */
    grossProfitCents: number
    /** grossProfit − comisiones − envios − otros − devoluciones netas */
    netProfitCents: number
    marginPercent: number | null
    averageOrderCents: number
    averageProfitCents: number
  }

  /** Gastos GENERALES del negocio (no incluye el coste de las compras). */
  expenses: {
    totalCents: number
    byCategory: Array<{ category: string; totalCents: number }>
  }

  /** Compras del periodo: son coste de adquisicion, NO gasto general. */
  purchases: {
    count: number
    totalCents: number
    itemsCents: number
    extraCents: number
  }

  /** Beneficio neto del negocio = pedidos + gastos generales. */
  business: {
    netProfitCents: number
    marginPercent: number | null
  }

  inventory: {
    units: number
    capitalCents: number
    retailCents: number
    potentialCents: number
    averageAgeDays: number | null
    turnsPerYear: number | null
    staleBuckets: Array<{ bucket: string; count: number; capitalCents: number }>
  }

  byPlatform: Array<{
    platformId: string | null
    name: string
    orders: number
    units: number
    netRevenueCents: number
    netProfitCents: number
    marginPercent: number | null
  }>

  byMonth: Array<{
    month: string
    orders: number
    units: number
    netRevenueCents: number
    netProfitCents: number
    expensesCents: number
  }>

  /**
   * Por categoria y por estado del articulo solo se publica el resultado
   * DIRECTO de la mercancia (ingreso de las lineas y su coste). Las comisiones y
   * los envios no se reparten por categoria: hacerlo seria un reparto inventado.
   * Por eso aqui no aparece "beneficio neto".
   */
  byCategory: Array<{
    categoryId: string | null
    name: string
    units: number
    goodsRevenueCents: number
    goodsCostCents: number
    grossProfitCents: number
    marginPercent: number | null
  }>

  byCondition: Array<{
    condition: string
    units: number
    goodsRevenueCents: number
    goodsCostCents: number
    grossProfitCents: number
    marginPercent: number | null
  }>

  /** Igual que las categorias: resultado directo de la mercancia. */
  topProducts: Array<{
    productId: string
    sku: string
    title: string
    units: number
    goodsRevenueCents: number
    goodsCostCents: number
    grossProfitCents: number
    marginPercent: number | null
  }>

  worstProducts: FinanceReport['topProducts']

  /** Tasa de devoluciones sobre pedidos del periodo. */
  returnsRatePercent: number | null
}

export interface FinanceQuery {
  from?: ISODate
  to?: ISODate
  platformIds?: string[]
}

/** Resultado de una exportacion a CSV. */
export interface CsvExportResult {
  path: string
  rows: number
  bytes: number
}
