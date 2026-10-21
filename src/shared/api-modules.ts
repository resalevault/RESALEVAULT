/**
 * RESALEVAULT - Contrato IPC de los modulos de compras, pedidos, multimedia,
 * etiquetas, informes y CSV.
 *
 * Se mantiene separado de `api.ts` para que cada archivo siga siendo legible.
 * Las reglas son las mismas: metodos nombrados, sin `invoke` generico, y
 * `Result<T>` como unico formato de retorno.
 */

import type {
  AppSettings,
  MediaAsset,
  Page,
  Result
} from './types'
import type {
  AiConnection,
  AiConnectionTest,
  AiFlowEstimate,
  AiGenerateRequest,
  AiGenerateResult,
  AiModelInfo,
  AiProvider,
  AiUsageReport,
  CsvDuplicateStrategy,
  CsvExportResult,
  CsvImportReport,
  CsvImportResult,
  CsvPreview,
  Expense,
  ExpenseSummary,
  FileDialogResult,
  FinanceQuery,
  FinanceReport,
  InsightReport,
  IntelligenceThresholds,
  LabelOptions,
  LabelSheet,
  LicenseState,
  Order,
  OrderCreateInput,
  OrderFeeKind,
  OrderQuery,
  OrderStatus,
  OrderSummary,
  PickingOrder,
  Purchase,
  PurchaseCreateInput,
  PurchaseItemInput,
  ScanResolution,
  Supplier
} from './types-modules'
import type { CsvColumnMapping } from './types-modules'
import type { LinkTarget } from './links'
import type {
  BackupConfig,
  BackupCreateResult,
  BackupFileInfo,
  BackupManifest,
  BackupStatus,
  BackupVerifyResult
} from './types-backup'
import type {
  BrowserPopupNotice,
  Carrier,
  CarrierBrowserState,
  CarrierRegion,
  CarrierStrategy,
  TrackNowResult,
  Trackcode,
  TrackcodeDraft,
  TrackcodeQuery,
  TrackcodeStatus,
  TrackingEvent
} from './types-tracking'

export const CH_MODULES = {
  // Multimedia
  mediaImport: 'media:importFromDialog',
  mediaRemove: 'media:remove',
  mediaReorder: 'media:reorder',
  mediaSetCover: 'media:setCover',
  mediaStorageReport: 'media:storageReport',
  mediaCleanup: 'media:cleanupOrphans',
  mediaOpenExternal: 'media:openExternal',

  // Proveedores
  suppliersList: 'suppliers:list',
  suppliersCreate: 'suppliers:create',
  suppliersUpdate: 'suppliers:update',
  suppliersRemove: 'suppliers:remove',

  // Compras
  purchasesList: 'purchases:list',
  purchasesGet: 'purchases:get',
  purchasesPreview: 'purchases:previewAllocation',
  purchasesCreate: 'purchases:create',
  purchasesUpdate: 'purchases:update',
  purchasesRemove: 'purchases:remove',
  purchasesMaterialize: 'purchases:materialize',
  purchasesTotals: 'purchases:totals',

  // Gastos generales
  expensesList: 'expenses:list',
  expensesCreate: 'expenses:create',
  expensesUpdate: 'expenses:update',
  expensesRemove: 'expenses:remove',
  expensesSummary: 'expenses:summary',

  // Pedidos
  ordersList: 'orders:list',
  ordersGet: 'orders:get',
  ordersCreate: 'orders:create',
  ordersUpdate: 'orders:update',
  ordersSetStatus: 'orders:setStatus',
  ordersCancel: 'orders:cancel',
  ordersRemove: 'orders:remove',
  orderFeesAdd: 'orders:addFee',
  orderFeesUpdate: 'orders:updateFee',
  orderFeesRemove: 'orders:removeFee',
  orderReturnsAdd: 'orders:addReturn',
  orderReturnsRemove: 'orders:removeReturn',

  // Preparacion
  pickingQueue: 'picking:queue',
  pickingGet: 'picking:get',
  pickingMarkPicked: 'picking:markPicked',
  pickingMarkPacked: 'picking:markPacked',
  pickingReset: 'picking:resetCheck',
  pickingNote: 'picking:setNote',
  pickingScan: 'picking:scan',

  // Etiquetas
  labelsProducts: 'labels:products',
  labelsLocations: 'labels:locations',

  // Informes
  financeReport: 'finance:report',
  financeCrossCheck: 'finance:crossCheck',

  // CSV
  csvChooseImport: 'csv:chooseImportFile',
  csvPreview: 'csv:preview',
  csvAnalyze: 'csv:analyze',
  csvImport: 'csv:import',
  csvChooseExport: 'csv:chooseExportPath',
  csvExport: 'csv:export',

  // Inteligencia
  intelligenceReport: 'intelligence:report',
  intelligenceThresholdsGet: 'intelligence:thresholds',
  intelligenceThresholdsSet: 'intelligence:setThresholds',
  insightDismiss: 'intelligence:dismiss',
  insightRestore: 'intelligence:restore',

  // Licencias
  licenseState: 'license:state',
  licenseActivate: 'license:activate',
  licenseDeactivate: 'license:deactivate',
  licenseEvents: 'license:events',
  /** Enlaces externos permitidos (compra de licencia). Solo https de la lista. */
  linksTargets: 'links:targets',
  linksOpen: 'links:open',
  linksCopy: 'links:copy',

  // AI Studio
  aiConnections: 'ai:connections',
  aiConnectionCreate: 'ai:createConnection',
  aiConnectionUpdate: 'ai:updateConnection',
  aiConnectionRemove: 'ai:removeConnection',
  aiConnectionTest: 'ai:testConnection',
  aiModels: 'ai:models',
  aiRoutes: 'ai:routes',
  aiSetRoute: 'ai:setRoute',
  aiGenerate: 'ai:generate',
  aiUsage: 'ai:usage',
  aiPrices: 'ai:prices',
  aiSetPrice: 'ai:setPrice',
  aiEstimateFlow: 'ai:estimateFlow',

  // Copias de seguridad
  backupsStatus: 'backups:status',
  backupsCreate: 'backups:create',
  backupsList: 'backups:list',
  backupsVerify: 'backups:verify',
  backupsRestore: 'backups:restore',
  backupsCancelRestore: 'backups:cancelRestore',
  backupsSetConfig: 'backups:setConfig',
  backupsOpenFolder: 'backups:openFolder',

  // Shipping Tracker
  trackingCarriers: 'tracking:carriers',
  trackingCarrierCreate: 'tracking:createCarrier',
  trackingCarrierUpdate: 'tracking:updateCarrier',
  trackingCarrierRemove: 'tracking:removeCarrier',
  trackingList: 'tracking:list',
  trackingGet: 'tracking:get',
  trackingCreate: 'tracking:create',
  trackingUpdate: 'tracking:update',
  trackingSetStatus: 'tracking:setStatus',
  trackingArchive: 'tracking:archive',
  trackingRestore: 'tracking:restore',
  trackingRemove: 'tracking:remove',
  trackingEvents: 'tracking:events',
  trackingCheckDuplicate: 'tracking:checkDuplicate',
  trackingResolveUrl: 'tracking:resolveUrl',
  trackingTrackNow: 'tracking:trackNow',

  // Navegador integrado
  browserState: 'browser:state',
  browserOpen: 'browser:open',
  browserClose: 'browser:close',
  browserBack: 'browser:back',
  browserForward: 'browser:forward',
  browserReload: 'browser:reload',
  browserStop: 'browser:stop'
} as const

/** Eventos que el proceso principal emite al renderer para el navegador. */
export const EV_TRACKING = {
  browserStateChanged: 'event:browserStateChanged',
  browserPopupBlocked: 'event:browserPopupBlocked',
  browserDownloadBlocked: 'event:browserDownloadBlocked'
} as const

export interface MediaDomainApi {
  /** Abre el selector de archivos del sistema y los importa al articulo. */
  importFromDialog(productId: string): Promise<Result<MediaImportOutcome>>
  remove(mediaId: string): Promise<Result<{ affected: number }>>
  reorder(productId: string, orderedIds: string[]): Promise<Result<MediaAsset[]>>
  setCover(productId: string, mediaId: string): Promise<Result<MediaAsset[]>>
  storageReport(): Promise<Result<MediaStorageReportLike>>
  cleanupOrphans(): Promise<Result<{ removed: number; freedBytes: number }>>
  /** Abre un documento con la aplicacion predeterminada del sistema. */
  openExternal(mediaId: string): Promise<Result<null>>
}

export interface MediaImportOutcome {
  canceled: boolean
  imported: number
  rejected: Array<{ originalName: string; reason: string; detail?: string }>
}

export interface MediaStorageReportLike {
  rootPath: string
  thumbnailsPath: string
  referencedFiles: number
  storedFiles: number
  orphanFiles: string[]
  missingFiles: string[]
  totalBytes: number
}

export interface SuppliersApi {
  list(): Promise<Result<Supplier[]>>
  create(input: { name: string; contact?: string; notes?: string }): Promise<Result<Supplier>>
  update(
    id: string,
    patch: { name?: string; contact?: string; notes?: string }
  ): Promise<Result<Supplier>>
  remove(id: string): Promise<Result<{ affected: number }>>
}

export interface PurchasesApi {
  list(query?: { search?: string; from?: string; to?: string; limit?: number }): Promise<Result<Purchase[]>>
  get(id: string): Promise<Result<Purchase>>
  /** Reparto de costes calculado sin guardar nada. */
  previewAllocation(input: Partial<PurchaseCreateInput>): Promise<Result<PurchaseAllocationPreview>>
  create(input: PurchaseCreateInput): Promise<Result<Purchase>>
  update(id: string, patch: { reference?: string; notes?: string; purchasedAt?: string }): Promise<Result<Purchase>>
  remove(id: string): Promise<Result<{ affected: number; linkedProducts: string[] }>>
  /** Convierte lineas de lote en articulos reales. */
  materialize(
    purchaseId: string,
    itemIds: string[],
    categoryId?: string | null
  ): Promise<Result<{ created: number; productIds: string[] }>>
  totals(from?: string, to?: string): Promise<
    Result<{ count: number; totalCents: number; itemsCents: number; extraCents: number }>
  >
}

export interface PurchaseAllocationPreview {
  method: string
  extraCents: number
  lines: Array<{
    index: number
    description: string
    productId: string | null
    quantity: number
    unitCostCents: number
    allocatedExtraCents: number
    effectiveUnitCostCents: number
  }>
  allocatedTotalCents: number
  unallocatedCents: number
}

export interface ExpensesApi {
  list(query?: {
    from?: string
    to?: string
    category?: string
    search?: string
    limit?: number
  }): Promise<Result<Expense[]>>
  create(input: {
    category: string
    description?: string
    amountCents: number
    incurredOn: string
    recurring?: string
    notes?: string
  }): Promise<Result<Expense>>
  update(id: string, patch: Record<string, unknown>): Promise<Result<Expense>>
  remove(id: string): Promise<Result<{ affected: number }>>
  summary(from?: string, to?: string): Promise<Result<ExpenseSummary>>
}

export interface OrdersApi {
  list(query?: OrderQuery): Promise<Result<Page<OrderSummary>>>
  get(id: string): Promise<Result<Order>>
  create(input: OrderCreateInput): Promise<Result<Order>>
  update(id: string, patch: Record<string, unknown>): Promise<Result<Order>>
  /** `confirm` es obligatorio para marcar como enviado o entregado. */
  setStatus(
    id: string,
    status: OrderStatus,
    options?: { confirm?: boolean; trackingNumber?: string; carrier?: string }
  ): Promise<Result<Order>>
  cancel(id: string, reason: string): Promise<Result<Order>>
  remove(id: string): Promise<Result<{ affected: number }>>
  addFee(
    orderId: string,
    fee: { kind: OrderFeeKind; label?: string; amountCents: number }
  ): Promise<Result<Order>>
  updateFee(
    feeId: string,
    patch: { kind?: OrderFeeKind; label?: string; amountCents?: number }
  ): Promise<Result<Order>>
  removeFee(feeId: string): Promise<Result<Order>>
  addReturn(input: {
    orderId: string
    returnedAt: string
    reason?: string
    refundCents: number
    feeRefundCents?: number
    shippingLostCents?: number
    restock?: boolean
    notes?: string
  }): Promise<Result<Order>>
  removeReturn(returnId: string): Promise<Result<Order>>
}

export interface PickingApi {
  queue(): Promise<Result<PickingOrder[]>>
  get(orderId: string): Promise<Result<PickingOrder>>
  /** Marca recogido. Si el SKU no coincide, devuelve el motivo. */
  markPicked(
    orderId: string,
    productId: string,
    scannedSku?: string
  ): Promise<Result<{ ok: boolean; reason?: string; expectedSku?: string }>>
  markPacked(orderId: string, productId: string): Promise<Result<{ ok: boolean; allPacked: boolean }>>
  resetCheck(orderId: string, productId: string): Promise<Result<{ affected: number }>>
  setNote(orderId: string, productId: string, note: string): Promise<Result<null>>
  /** Resuelve un codigo escaneado con lector USB o de camara. */
  scan(code: string): Promise<Result<ScanResolution>>
}

export interface LabelsApi {
  products(productIds: string[], options: Partial<LabelOptions>): Promise<Result<LabelSheet>>
  locations(locationIds: string[], options: Partial<LabelOptions>): Promise<Result<LabelSheet>>
}

export interface FinanceApi {
  report(query?: FinanceQuery): Promise<Result<FinanceReport>>
  crossCheck(orderId: string): Promise<Result<{ sqlCents: number; typescriptCents: number; match: boolean }>>
}

export interface CsvApi {
  chooseImportFile(): Promise<Result<FileDialogResult>>
  preview(path: string): Promise<Result<CsvPreview>>
  analyze(path: string, mapping: CsvColumnMapping): Promise<Result<CsvImportReport>>
  import(options: {
    path: string
    mapping: CsvColumnMapping
    duplicateStrategy: CsvDuplicateStrategy
    dryRun: boolean
  }): Promise<Result<CsvImportResult>>
  chooseExportPath(
    format: string,
    suggestedName?: string
  ): Promise<Result<FileDialogResult>>
  export(options: {
    path: string
    format: string
    delimiter?: string
    includeArchived?: boolean
  }): Promise<Result<CsvExportResult>>
}

/** Piezas de la API que se anaden a la interfaz principal. */
export interface IntelligenceApi {
  report(): Promise<Result<InsightReport>>
  thresholds(): Promise<Result<IntelligenceThresholds>>
  setThresholds(patch: Partial<IntelligenceThresholds>): Promise<Result<IntelligenceThresholds>>
  dismiss(input: { key: string; ruleId: string; subject?: string; days?: number }): Promise<Result<null>>
  restore(key: string): Promise<Result<null>>
}

export interface LicenseApi {
  state(): Promise<Result<LicenseState>>
  activate(input: { code: string; holder?: string }): Promise<Result<LicenseState>>
  deactivate(): Promise<Result<LicenseState>>
  events(): Promise<Result<Array<{ at: string; event: string; detail: string }>>>
}

/**
 * Enlaces externos. El proceso principal SOLO acepta los destinos de una lista
 * blanca (`@shared/links`); el renderer no puede abrir ni copiar una URL
 * arbitraria.
 */
export interface LinksApi {
  /** Constantes de destino, para que la interfaz no las escriba a mano. */
  targets(): Promise<Result<{ discordInvite: string }>>
  /** Abre el enlace en el navegador predeterminado del sistema. */
  open(target: LinkTarget): Promise<Result<{ opened: boolean }>>
  /** Copia el enlace al portapapeles (alternativa si no se puede abrir). */
  copy(target: LinkTarget): Promise<Result<{ copied: boolean; url: string }>>
}

export interface AiStudioApi {
  connections(): Promise<Result<AiConnection[]>>
  createConnection(input: {
    provider: AiProvider
    label?: string
    secret: string
    baseUrl?: string
    defaultModel?: string
  }): Promise<Result<AiConnection>>
  updateConnection(
    id: string,
    patch: {
      label?: string
      defaultModel?: string
      baseUrl?: string
      active?: boolean
      secret?: string
    }
  ): Promise<Result<AiConnection>>
  removeConnection(id: string): Promise<Result<{ affected: number }>>
  /** Prueba real contra el proveedor: consulta su lista de modelos. */
  testConnection(id: string): Promise<Result<AiConnectionTest>>
  models(id: string): Promise<Result<AiModelInfo[]>>
  routes(): Promise<Result<Record<string, { connectionId: string | null; model: string }>>>
  setRoute(task: string, connectionId: string | null, model?: string): Promise<Result<null>>
  generate(input: AiGenerateRequest): Promise<Result<AiGenerateResult>>
  usage(): Promise<Result<AiUsageReport>>
  prices(): Promise<Result<AiPriceRow[]>>
  setPrice(input: {
    provider: AiProvider
    model: string
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  }): Promise<Result<null>>
  estimateFlow(input: {
    products: number
    steps: number
    averageInputTokens: number
    averageOutputTokens: number
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  }): Promise<Result<AiFlowEstimate>>
}

export interface AiPriceRow {
  provider: string
  model: string
  inputPerMillionMicros: number
  outputPerMillionMicros: number
}

export interface BackupsApi {
  status(): Promise<Result<BackupStatus>>
  create(): Promise<Result<BackupCreateResult>>
  list(): Promise<Result<BackupFileInfo[]>>
  verify(path: string): Promise<Result<BackupVerifyResult>>
  /** Prepara la copia y reinicia la aplicacion para aplicarla. */
  restore(path: string): Promise<Result<{ ok: boolean; manifest: BackupManifest | null }>>
  cancelRestore(): Promise<Result<null>>
  setConfig(patch: Partial<BackupConfig>): Promise<Result<BackupStatus>>
  openFolder(): Promise<Result<null>>
}

export interface TrackingApi {
  carriers(query?: {
    search?: string
    region?: CarrierRegion | 'ALL'
    includeDisabled?: boolean
  }): Promise<Result<Carrier[]>>
  createCarrier(input: {
    id?: string
    name: string
    region: CarrierRegion
    country?: string
    trackUrl: string
    urlTemplate?: string
    strategy?: CarrierStrategy
    notes?: string
  }): Promise<Result<Carrier>>
  updateCarrier(
    id: string,
    patch: Partial<{
      name: string
      region: CarrierRegion
      country: string
      trackUrl: string
      urlTemplate: string
      strategy: CarrierStrategy
      notes: string
      enabled: boolean
    }>
  ): Promise<Result<Carrier>>
  removeCarrier(id: string): Promise<Result<{ affected: number }>>

  list(query?: TrackcodeQuery): Promise<Result<Page<Trackcode>>>
  get(id: string): Promise<Result<Trackcode>>
  create(input: TrackcodeDraft): Promise<Result<Trackcode>>
  update(
    id: string,
    patch: Partial<Omit<TrackcodeDraft, 'code' | 'carrierId'>> & {
      code?: string
      carrierId?: string
    }
  ): Promise<Result<Trackcode>>
  setStatus(id: string, status: TrackcodeStatus): Promise<Result<Trackcode>>
  archive(ids: string[]): Promise<Result<{ affected: number }>>
  restore(ids: string[]): Promise<Result<{ affected: number }>>
  remove(ids: string[]): Promise<Result<{ affected: number }>>
  events(trackcodeId: string): Promise<Result<TrackingEvent[]>>
  checkDuplicate(
    code: string,
    carrierId: string,
    exceptId?: string | null
  ): Promise<Result<{ duplicate: Trackcode | null }>>
  /** Construye la URL sin abrir nada (util para "copiar enlace" y pruebas). */
  resolveUrl(carrierId: string, code: string): Promise<Result<{ url: string; filledByUrl: boolean }>>
  /** Abre el seguimiento en el navegador integrado. */
  trackNow(id: string): Promise<Result<TrackNowResult>>
}

export interface BrowserApi {
  state(): Promise<Result<CarrierBrowserState>>
  open(input: { url: string; carrierId: string; carrierName: string }): Promise<Result<CarrierBrowserState>>
  close(): Promise<Result<CarrierBrowserState>>
  back(): Promise<Result<CarrierBrowserState>>
  forward(): Promise<Result<CarrierBrowserState>>
  reload(): Promise<Result<CarrierBrowserState>>
  stop(): Promise<Result<CarrierBrowserState>>
  onStateChanged(listener: (state: CarrierBrowserState) => void): () => void
  onPopupBlocked(listener: (notice: BrowserPopupNotice) => void): () => void
  onDownloadBlocked(listener: (filename: string) => void): () => void
}

/** Piezas de la API que se anaden a la interfaz principal. */
export interface ResaleVaultModuleApi {
  media: MediaDomainApi
  suppliers: SuppliersApi
  purchases: PurchasesApi
  expenses: ExpensesApi
  orders: OrdersApi
  picking: PickingApi
  labels: LabelsApi
  finance: FinanceApi
  csv: CsvApi
  intelligence: IntelligenceApi
  license: LicenseApi
  links: LinksApi
  ai: AiStudioApi
  backups: BackupsApi
  tracking: TrackingApi
  browser: BrowserApi
}

/** Reexportado para que la interfaz pueda tipar los ajustes al vuelo. */
export type SettingsLike = AppSettings
export type PurchaseItemInputLike = PurchaseItemInput
