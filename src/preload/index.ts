/**
 * RESALEVAULT - Puente entre el proceso principal y la interfaz.
 *
 * Este archivo es la UNICA superficie que el renderer puede ver del sistema.
 * Se ejecuta con `sandbox: true` y `contextIsolation: true`, de modo que:
 *  - No tiene acceso a `require`, `fs`, `process` ni a la base de datos.
 *  - Solo expone los metodos declarados a continuacion, cada uno asociado a un
 *    canal concreto. No existe un `invoke` generico que el renderer pueda usar
 *    para llamar a canales arbitrarios.
 *  - Los resultados cruzan como `Result<T>` (nunca excepciones).
 */

import { contextBridge, ipcRenderer } from 'electron'
import { CH, EV, type ResaleVaultApi } from '@shared/api'
import { CH_MODULES, EV_TRACKING } from '@shared/api-modules'

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>
}

/** Suscripcion a un evento del proceso principal, con funcion de baja. */
function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: ResaleVaultApi = {
  app: {
    getInfo: () => invoke(CH.appInfo),
    getSettings: () => invoke(CH.appSettings),
    updateSettings: (patch) => invoke(CH.appUpdateSettings, patch),
    getDatabaseHealth: () => invoke(CH.appDatabaseHealth),
    seedDemoData: () => invoke(CH.appSeedDemo),
    clearDemoData: () => invoke(CH.appClearDemo),
    openDataFolder: () => invoke(CH.appOpenDataFolder),
  getThirdPartyNotices: () => invoke(CH.appThirdPartyNotices),
  computeAppHash: () => invoke(CH.appComputeHash),
    onDataChanged: (listener) => {
      const handler = (_event: unknown, entity: string): void => listener(String(entity))
      ipcRenderer.on(EV.dataChanged, handler)
      return () => {
        ipcRenderer.removeListener(EV.dataChanged, handler)
      }
    }
  },

  window: {
    minimize: () => invoke(CH.windowMinimize),
    toggleMaximize: () => invoke(CH.windowToggleMaximize),
    close: () => invoke(CH.windowClose),
    isMaximized: () => invoke(CH.windowIsMaximized),
    onMaximizedChanged: (listener) => {
      const handler = (_event: unknown, value: boolean): void => listener(Boolean(value))
      ipcRenderer.on(EV.windowMaximizedChanged, handler)
      return () => {
        ipcRenderer.removeListener(EV.windowMaximizedChanged, handler)
      }
    }
  },

  products: {
    list: (query) => invoke(CH.productsList, query),
    get: (id) => invoke(CH.productsGet, id),
    create: (input) => invoke(CH.productsCreate, input),
    update: (id, patch) => invoke(CH.productsUpdate, { id, patch }),
    archive: (ids) => invoke(CH.productsArchive, ids),
    restore: (ids) => invoke(CH.productsRestore, ids),
    remove: (ids) => invoke(CH.productsDelete, ids),
    bulkPreview: (input) => invoke(CH.productsBulkPreview, input),
    bulkUpdate: (input) => invoke(CH.productsBulkUpdate, input),
    suggestSku: (categoryId) => invoke(CH.productsSuggestSku, { categoryId: categoryId ?? null }),
    checkSku: (sku, exceptId) => invoke(CH.productsCheckSku, { sku, exceptId: exceptId ?? null })
  },

  categories: {
    list: () => invoke(CH.categoriesList),
    create: (input) => invoke(CH.categoriesCreate, input),
    update: (id, patch) => invoke(CH.categoriesUpdate, { id, patch }),
    remove: (id) => invoke(CH.categoriesDelete, id)
  },

  locations: {
    list: () => invoke(CH.locationsList),
    create: (input) => invoke(CH.locationsCreate, input),
    update: (id, patch) => invoke(CH.locationsUpdate, { id, patch }),
    remove: (id) => invoke(CH.locationsDelete, id),
    move: (id, newParentId) => invoke(CH.locationsMove, { id, newParentId: newParentId ?? null })
  },

  tags: {
    list: () => invoke(CH.tagsList),
    create: (input) => invoke(CH.tagsCreate, input),
    remove: (id) => invoke(CH.tagsDelete, id)
  },

  platforms: {
    list: () => invoke(CH.platformsList),
    create: (input) => invoke(CH.platformsCreate, input),
    update: (id, patch) => invoke(CH.platformsUpdate, { id, patch })
  },

  attributes: {
    list: () => invoke(CH.attributesList),
    create: (input) => invoke(CH.attributesCreate, input),
    update: (id, patch) => invoke(CH.attributesUpdate, { id, patch }),
    remove: (id) => invoke(CH.attributesDelete, id)
  },

  listings: {
    list: (productId) => invoke(CH.listingsList, productId),
    create: (input) => invoke(CH.listingsCreate, input),
    update: (id, patch) => invoke(CH.listingsUpdate, { id, patch }),
    remove: (id) => invoke(CH.listingsDelete, id)
  },

  dashboard: {
    summary: () => invoke(CH.dashboardSummary)
  },

  // ---------------------------------------------------------------------------
  // Modulos de negocio (Fases 2 a 4)
  // ---------------------------------------------------------------------------

  media: {
    importFromDialog: (productId) => invoke(CH_MODULES.mediaImport, { productId }),
    remove: (mediaId) => invoke(CH_MODULES.mediaRemove, mediaId),
    reorder: (productId, orderedIds) => invoke(CH_MODULES.mediaReorder, { productId, orderedIds }),
    setCover: (productId, mediaId) => invoke(CH_MODULES.mediaSetCover, { productId, mediaId }),
    storageReport: () => invoke(CH_MODULES.mediaStorageReport),
    cleanupOrphans: () => invoke(CH_MODULES.mediaCleanup),
    openExternal: (mediaId) => invoke(CH_MODULES.mediaOpenExternal, mediaId)
  },

  suppliers: {
    list: () => invoke(CH_MODULES.suppliersList),
    create: (input) => invoke(CH_MODULES.suppliersCreate, input),
    update: (id, patch) => invoke(CH_MODULES.suppliersUpdate, { id, patch }),
    remove: (id) => invoke(CH_MODULES.suppliersRemove, id)
  },

  purchases: {
    list: (query) => invoke(CH_MODULES.purchasesList, query ?? {}),
    get: (id) => invoke(CH_MODULES.purchasesGet, id),
    previewAllocation: (input) => invoke(CH_MODULES.purchasesPreview, input),
    create: (input) => invoke(CH_MODULES.purchasesCreate, input),
    update: (id, patch) => invoke(CH_MODULES.purchasesUpdate, { id, patch }),
    remove: (id) => invoke(CH_MODULES.purchasesRemove, id),
    materialize: (purchaseId, itemIds, categoryId) =>
      invoke(CH_MODULES.purchasesMaterialize, { purchaseId, itemIds, categoryId: categoryId ?? null }),
    totals: (from, to) => invoke(CH_MODULES.purchasesTotals, { from, to })
  },

  expenses: {
    list: (query) => invoke(CH_MODULES.expensesList, query ?? {}),
    create: (input) => invoke(CH_MODULES.expensesCreate, input),
    update: (id, patch) => invoke(CH_MODULES.expensesUpdate, { id, patch }),
    remove: (id) => invoke(CH_MODULES.expensesRemove, id),
    summary: (from, to) => invoke(CH_MODULES.expensesSummary, { from, to })
  },

  orders: {
    list: (query) => invoke(CH_MODULES.ordersList, query ?? {}),
    get: (id) => invoke(CH_MODULES.ordersGet, id),
    create: (input) => invoke(CH_MODULES.ordersCreate, input),
    update: (id, patch) => invoke(CH_MODULES.ordersUpdate, { id, patch }),
    setStatus: (id, status, options) =>
      invoke(CH_MODULES.ordersSetStatus, {
        id,
        status,
        confirm: options?.confirm ?? false,
        trackingNumber: options?.trackingNumber,
        carrier: options?.carrier
      }),
    cancel: (id, reason) => invoke(CH_MODULES.ordersCancel, { id, reason }),
    remove: (id) => invoke(CH_MODULES.ordersRemove, id),
    addFee: (orderId, fee) => invoke(CH_MODULES.orderFeesAdd, { orderId, ...fee }),
    updateFee: (feeId, patch) => invoke(CH_MODULES.orderFeesUpdate, { feeId, patch }),
    removeFee: (feeId) => invoke(CH_MODULES.orderFeesRemove, feeId),
    addReturn: (input) => invoke(CH_MODULES.orderReturnsAdd, input),
    removeReturn: (returnId) => invoke(CH_MODULES.orderReturnsRemove, returnId)
  },

  picking: {
    queue: () => invoke(CH_MODULES.pickingQueue),
    get: (orderId) => invoke(CH_MODULES.pickingGet, orderId),
    markPicked: (orderId, productId, scannedSku) =>
      invoke(CH_MODULES.pickingMarkPicked, { orderId, productId, scannedSku }),
    markPacked: (orderId, productId) => invoke(CH_MODULES.pickingMarkPacked, { orderId, productId }),
    resetCheck: (orderId, productId) => invoke(CH_MODULES.pickingReset, { orderId, productId }),
    setNote: (orderId, productId, note) => invoke(CH_MODULES.pickingNote, { orderId, productId, note }),
    scan: (code) => invoke(CH_MODULES.pickingScan, { code })
  },

  labels: {
    products: (productIds, options) => invoke(CH_MODULES.labelsProducts, { productIds, options: options ?? {} }),
    locations: (locationIds, options) =>
      invoke(CH_MODULES.labelsLocations, { locationIds, options: options ?? {} })
  },

  finance: {
    report: (query) => invoke(CH_MODULES.financeReport, query ?? {}),
    crossCheck: (orderId) => invoke(CH_MODULES.financeCrossCheck, orderId)
  },

  csv: {
    chooseImportFile: () => invoke(CH_MODULES.csvChooseImport),
    preview: (path) => invoke(CH_MODULES.csvPreview, path),
    analyze: (path, mapping) => invoke(CH_MODULES.csvAnalyze, { path, mapping }),
    import: (options) => invoke(CH_MODULES.csvImport, options),
    chooseExportPath: (format, suggestedName) =>
      invoke(CH_MODULES.csvChooseExport, { format, suggestedName }),
    export: (options) => invoke(CH_MODULES.csvExport, options)
  },

  intelligence: {
    report: () => invoke(CH_MODULES.intelligenceReport),
    thresholds: () => invoke(CH_MODULES.intelligenceThresholdsGet),
    setThresholds: (patch) => invoke(CH_MODULES.intelligenceThresholdsSet, patch),
    dismiss: (input) => invoke(CH_MODULES.insightDismiss, input),
    restore: (key) => invoke(CH_MODULES.insightRestore, key)
  },

  license: {
    state: () => invoke(CH_MODULES.licenseState),
    activate: (input) => invoke(CH_MODULES.licenseActivate, input),
    deactivate: () => invoke(CH_MODULES.licenseDeactivate),
    events: () => invoke(CH_MODULES.licenseEvents)
  },

  links: {
    targets: () => invoke(CH_MODULES.linksTargets),
    open: (target) => invoke(CH_MODULES.linksOpen, target),
    copy: (target) => invoke(CH_MODULES.linksCopy, target)
  },

  ai: {
    connections: () => invoke(CH_MODULES.aiConnections),    createConnection: (input) => invoke(CH_MODULES.aiConnectionCreate, input),
    updateConnection: (id, patch) => invoke(CH_MODULES.aiConnectionUpdate, { id, patch }),
    removeConnection: (id) => invoke(CH_MODULES.aiConnectionRemove, id),
    testConnection: (id) => invoke(CH_MODULES.aiConnectionTest, id),
    models: (id) => invoke(CH_MODULES.aiModels, id),
    routes: () => invoke(CH_MODULES.aiRoutes),
    setRoute: (task, connectionId, model) =>
      invoke(CH_MODULES.aiSetRoute, { task, connectionId: connectionId ?? null, model }),
    generate: (input) => invoke(CH_MODULES.aiGenerate, input),
    usage: () => invoke(CH_MODULES.aiUsage),
    prices: () => invoke(CH_MODULES.aiPrices),
    setPrice: (input) => invoke(CH_MODULES.aiSetPrice, input),
    estimateFlow: (input) => invoke(CH_MODULES.aiEstimateFlow, input)
  },

  backups: {
    status: () => invoke(CH_MODULES.backupsStatus),
    create: () => invoke(CH_MODULES.backupsCreate),
    list: () => invoke(CH_MODULES.backupsList),
    verify: (path) => invoke(CH_MODULES.backupsVerify, path),
    restore: (path) => invoke(CH_MODULES.backupsRestore, path),
    cancelRestore: () => invoke(CH_MODULES.backupsCancelRestore),
    setConfig: (patch) => invoke(CH_MODULES.backupsSetConfig, patch),
    openFolder: () => invoke(CH_MODULES.backupsOpenFolder)
  },

  tracking: {
    carriers: (query) => invoke(CH_MODULES.trackingCarriers, query ?? {}),
    createCarrier: (input) => invoke(CH_MODULES.trackingCarrierCreate, input),
    updateCarrier: (id, patch) => invoke(CH_MODULES.trackingCarrierUpdate, { id, patch }),
    removeCarrier: (id) => invoke(CH_MODULES.trackingCarrierRemove, id),
    list: (query) => invoke(CH_MODULES.trackingList, query ?? {}),
    get: (id) => invoke(CH_MODULES.trackingGet, id),
    create: (input) => invoke(CH_MODULES.trackingCreate, input),
    update: (id, patch) => invoke(CH_MODULES.trackingUpdate, { id, patch }),
    setStatus: (id, status) => invoke(CH_MODULES.trackingSetStatus, { id, status }),
    archive: (ids) => invoke(CH_MODULES.trackingArchive, ids),
    restore: (ids) => invoke(CH_MODULES.trackingRestore, ids),
    remove: (ids) => invoke(CH_MODULES.trackingRemove, ids),
    events: (trackcodeId) => invoke(CH_MODULES.trackingEvents, trackcodeId),
    checkDuplicate: (code, carrierId, exceptId) =>
      invoke(CH_MODULES.trackingCheckDuplicate, { code, carrierId, exceptId: exceptId ?? null }),
    resolveUrl: (carrierId, code) => invoke(CH_MODULES.trackingResolveUrl, { carrierId, code }),
    trackNow: (id) => invoke(CH_MODULES.trackingTrackNow, { id })
  },

  browser: {
    state: () => invoke(CH_MODULES.browserState),
    open: (input) => invoke(CH_MODULES.browserOpen, input),
    close: () => invoke(CH_MODULES.browserClose),
    back: () => invoke(CH_MODULES.browserBack),
    forward: () => invoke(CH_MODULES.browserForward),
    reload: () => invoke(CH_MODULES.browserReload),
    stop: () => invoke(CH_MODULES.browserStop),
    onStateChanged: (listener) => subscribe(EV_TRACKING.browserStateChanged, listener),
    onPopupBlocked: (listener) => subscribe(EV_TRACKING.browserPopupBlocked, listener),
    onDownloadBlocked: (listener) => subscribe(EV_TRACKING.browserDownloadBlocked, listener)
  }
}

contextBridge.exposeInMainWorld('resalevault', api)
