/**
 * RESALEVAULT - Cliente de la API del sistema.
 *
 * El preload devuelve `Result<T>`. Aqui se convierte en una promesa que se
 * resuelve con el dato o se rechaza con un `AppError` que lleva CODIGO, no
 * texto: la interfaz decide como traducirlo.
 */

import type { AppErrorPayload, ErrorCode, Result } from '@shared/types'
import type { ResaleVaultApi } from '@shared/api'
import type { CarrierBrowserState } from '@shared/types-tracking'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly params: Record<string, string | number> | undefined
  readonly detail: string | undefined

  constructor(payload: AppErrorPayload) {
    super(payload.code)
    this.name = 'AppError'
    this.code = payload.code
    this.params = payload.params
    this.detail = payload.detail
  }

  is(code: ErrorCode): boolean {
    return this.code === code
  }
}

async function unwrap<T>(input: Promise<Result<T>>): Promise<T> {
  const result = await input
  if (result.ok) return result.data
  throw new AppError(result.error)
}

/**
 * Convierte un metodo del preload, que devuelve `Result<T>`, en uno que
 * devuelve directamente `T` (o lanza `AppError`). El tipo de retorno se
 * calcula a partir de la firma original, de modo que el resto de la interfaz
 * trabaja con datos "limpios" y no con la union `Result`.
 */
type Unwrapped<T> = T extends (...args: infer A) => Promise<Result<infer R>>
  ? (...args: A) => Promise<R>
  : never

function bind<T extends (...args: never[]) => Promise<Result<unknown>>>(fn: T): Unwrapped<T> {
  return ((...args: unknown[]) =>
    unwrap(
      (fn as unknown as (...a: unknown[]) => Promise<Result<unknown>>)(...args)
    )) as Unwrapped<T>
}

/**
 * El puente se resuelve de forma perezosa: si el preload no se ha cargado, la
 * interfaz puede mostrar un error comprensible en lugar de romperse al importar
 * el modulo.
 */
export function isBridgeAvailable(): boolean {
  return typeof (window as { resalevault?: unknown }).resalevault === 'object'
}

function getBridge(): ResaleVaultApi {
  const bridge = (window as { resalevault?: ResaleVaultApi }).resalevault
  if (!bridge) throw new Error('preload_bridge_missing')
  return bridge
}

const bridge: ResaleVaultApi = new Proxy({} as ResaleVaultApi, {
  get: (_target, property) => getBridge()[property as keyof ResaleVaultApi]
})

export const api = {
  app: {
    getInfo: bind(() => bridge.app.getInfo()),
    getSettings: bind(() => bridge.app.getSettings()),
    updateSettings: bind((patch: Parameters<typeof bridge.app.updateSettings>[0]) =>
      bridge.app.updateSettings(patch)
    ),
    getDatabaseHealth: bind(() => bridge.app.getDatabaseHealth()),
    seedDemoData: bind(() => bridge.app.seedDemoData()),
    clearDemoData: bind(() => bridge.app.clearDemoData()),
    openDataFolder: bind(() => bridge.app.openDataFolder()),
    getThirdPartyNotices: bind(() => bridge.app.getThirdPartyNotices()),
    computeAppHash: bind(() => bridge.app.computeAppHash()),
    onDataChanged: (listener: (entity: string) => void) => getBridge().app.onDataChanged(listener)
  },

  window: {
    minimize: bind(() => bridge.window.minimize()),
    toggleMaximize: bind(() => bridge.window.toggleMaximize()),
    close: bind(() => bridge.window.close()),
    isMaximized: bind(() => bridge.window.isMaximized()),
    onMaximizedChanged: (listener: (maximized: boolean) => void) =>
      getBridge().window.onMaximizedChanged(listener)
  },

  products: {
    list: bind((query: Parameters<typeof bridge.products.list>[0]) => bridge.products.list(query)),
    get: bind((id: string) => bridge.products.get(id)),
    create: bind((input: Parameters<typeof bridge.products.create>[0]) => bridge.products.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.products.update>[1]) =>
      bridge.products.update(id, patch)
    ),
    archive: bind((ids: string[]) => bridge.products.archive(ids)),
    restore: bind((ids: string[]) => bridge.products.restore(ids)),
    remove: bind((ids: string[]) => bridge.products.remove(ids)),
    bulkPreview: bind((input: Parameters<typeof bridge.products.bulkPreview>[0]) =>
      bridge.products.bulkPreview(input)
    ),
    bulkUpdate: bind((input: Parameters<typeof bridge.products.bulkUpdate>[0]) =>
      bridge.products.bulkUpdate(input)
    ),
    suggestSku: bind((categoryId?: string | null) => bridge.products.suggestSku(categoryId ?? null)),
    checkSku: bind((sku: string, exceptId?: string | null) =>
      bridge.products.checkSku(sku, exceptId ?? null)
    )
  },

  categories: {
    list: bind(() => bridge.categories.list()),
    create: bind((input: Parameters<typeof bridge.categories.create>[0]) =>
      bridge.categories.create(input)
    ),
    update: bind((id: string, patch: Parameters<typeof bridge.categories.update>[1]) =>
      bridge.categories.update(id, patch)
    ),
    remove: bind((id: string) => bridge.categories.remove(id))
  },

  locations: {
    list: bind(() => bridge.locations.list()),
    create: bind((input: Parameters<typeof bridge.locations.create>[0]) => bridge.locations.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.locations.update>[1]) =>
      bridge.locations.update(id, patch)
    ),
    remove: bind((id: string) => bridge.locations.remove(id)),
    move: bind((id: string, newParentId: string | null) => bridge.locations.move(id, newParentId))
  },

  tags: {
    list: bind(() => bridge.tags.list()),
    create: bind((input: Parameters<typeof bridge.tags.create>[0]) => bridge.tags.create(input)),
    remove: bind((id: string) => bridge.tags.remove(id))
  },

  platforms: {
    list: bind(() => bridge.platforms.list()),
    create: bind((input: Parameters<typeof bridge.platforms.create>[0]) => bridge.platforms.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.platforms.update>[1]) =>
      bridge.platforms.update(id, patch)
    )
  },

  attributes: {
    list: bind(() => bridge.attributes.list()),
    create: bind((input: Parameters<typeof bridge.attributes.create>[0]) =>
      bridge.attributes.create(input)
    ),
    update: bind((id: string, patch: Parameters<typeof bridge.attributes.update>[1]) =>
      bridge.attributes.update(id, patch)
    ),
    remove: bind((id: string) => bridge.attributes.remove(id))
  },

  listings: {
    list: bind((productId: string) => bridge.listings.list(productId)),
    create: bind((input: Parameters<typeof bridge.listings.create>[0]) => bridge.listings.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.listings.update>[1]) =>
      bridge.listings.update(id, patch)
    ),
    remove: bind((id: string) => bridge.listings.remove(id))
  },

  dashboard: {
    summary: bind(() => bridge.dashboard.summary())
  },

  // ---------------------------------------------------------------------------
  // Modulos de negocio
  // ---------------------------------------------------------------------------

  media: {
    importFromDialog: bind((productId: string) => bridge.media.importFromDialog(productId)),
    remove: bind((mediaId: string) => bridge.media.remove(mediaId)),
    reorder: bind((productId: string, orderedIds: string[]) => bridge.media.reorder(productId, orderedIds)),
    setCover: bind((productId: string, mediaId: string) => bridge.media.setCover(productId, mediaId)),
    storageReport: bind(() => bridge.media.storageReport()),
    cleanupOrphans: bind(() => bridge.media.cleanupOrphans()),
    openExternal: bind((mediaId: string) => bridge.media.openExternal(mediaId))
  },

  suppliers: {
    list: bind(() => bridge.suppliers.list()),
    create: bind((input: Parameters<typeof bridge.suppliers.create>[0]) => bridge.suppliers.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.suppliers.update>[1]) =>
      bridge.suppliers.update(id, patch)
    ),
    remove: bind((id: string) => bridge.suppliers.remove(id))
  },

  purchases: {
    list: bind((query?: Parameters<typeof bridge.purchases.list>[0]) => bridge.purchases.list(query)),
    get: bind((id: string) => bridge.purchases.get(id)),
    previewAllocation: bind((input: Parameters<typeof bridge.purchases.previewAllocation>[0]) =>
      bridge.purchases.previewAllocation(input)
    ),
    create: bind((input: Parameters<typeof bridge.purchases.create>[0]) => bridge.purchases.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.purchases.update>[1]) =>
      bridge.purchases.update(id, patch)
    ),
    remove: bind((id: string) => bridge.purchases.remove(id)),
    materialize: bind((purchaseId: string, itemIds: string[], categoryId?: string | null) =>
      bridge.purchases.materialize(purchaseId, itemIds, categoryId ?? null)
    ),
    totals: bind((from?: string, to?: string) => bridge.purchases.totals(from, to))
  },

  expenses: {
    list: bind((query?: Parameters<typeof bridge.expenses.list>[0]) => bridge.expenses.list(query)),
    create: bind((input: Parameters<typeof bridge.expenses.create>[0]) => bridge.expenses.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.expenses.update>[1]) =>
      bridge.expenses.update(id, patch)
    ),
    remove: bind((id: string) => bridge.expenses.remove(id)),
    summary: bind((from?: string, to?: string) => bridge.expenses.summary(from, to))
  },

  orders: {
    list: bind((query?: Parameters<typeof bridge.orders.list>[0]) => bridge.orders.list(query)),
    get: bind((id: string) => bridge.orders.get(id)),
    create: bind((input: Parameters<typeof bridge.orders.create>[0]) => bridge.orders.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.orders.update>[1]) =>
      bridge.orders.update(id, patch)
    ),
    setStatus: bind((id: string, status: Parameters<typeof bridge.orders.setStatus>[1], options?: Parameters<typeof bridge.orders.setStatus>[2]) =>
      bridge.orders.setStatus(id, status, options)
    ),
    cancel: bind((id: string, reason: string) => bridge.orders.cancel(id, reason)),
    remove: bind((id: string) => bridge.orders.remove(id)),
    addFee: bind((orderId: string, fee: Parameters<typeof bridge.orders.addFee>[1]) =>
      bridge.orders.addFee(orderId, fee)
    ),
    updateFee: bind((feeId: string, patch: Parameters<typeof bridge.orders.updateFee>[1]) =>
      bridge.orders.updateFee(feeId, patch)
    ),
    removeFee: bind((feeId: string) => bridge.orders.removeFee(feeId)),
    addReturn: bind((input: Parameters<typeof bridge.orders.addReturn>[0]) => bridge.orders.addReturn(input)),
    removeReturn: bind((returnId: string) => bridge.orders.removeReturn(returnId))
  },

  picking: {
    queue: bind(() => bridge.picking.queue()),
    get: bind((orderId: string) => bridge.picking.get(orderId)),
    markPicked: bind((orderId: string, productId: string, scannedSku?: string) =>
      bridge.picking.markPicked(orderId, productId, scannedSku)
    ),
    markPacked: bind((orderId: string, productId: string) => bridge.picking.markPacked(orderId, productId)),
    resetCheck: bind((orderId: string, productId: string) => bridge.picking.resetCheck(orderId, productId)),
    setNote: bind((orderId: string, productId: string, note: string) =>
      bridge.picking.setNote(orderId, productId, note)
    ),
    scan: bind((code: string) => bridge.picking.scan(code))
  },

  labels: {
    products: bind((productIds: string[], options: Parameters<typeof bridge.labels.products>[1]) =>
      bridge.labels.products(productIds, options)
    ),
    locations: bind((locationIds: string[], options: Parameters<typeof bridge.labels.locations>[1]) =>
      bridge.labels.locations(locationIds, options)
    )
  },

  finance: {
    report: bind((query?: Parameters<typeof bridge.finance.report>[0]) => bridge.finance.report(query)),
    crossCheck: bind((orderId: string) => bridge.finance.crossCheck(orderId))
  },

  csv: {
    chooseImportFile: bind(() => bridge.csv.chooseImportFile()),
    preview: bind((path: string) => bridge.csv.preview(path)),
    analyze: bind((path: string, mapping: Parameters<typeof bridge.csv.analyze>[1]) =>
      bridge.csv.analyze(path, mapping)
    ),
    import: bind((options: Parameters<typeof bridge.csv.import>[0]) => bridge.csv.import(options)),
    chooseExportPath: bind((format: string, suggestedName?: string) =>
      bridge.csv.chooseExportPath(format, suggestedName)
    ),
    export: bind((options: Parameters<typeof bridge.csv.export>[0]) => bridge.csv.export(options))
  },

  intelligence: {
    report: bind(() => bridge.intelligence.report()),
    thresholds: bind(() => bridge.intelligence.thresholds()),
    setThresholds: bind((patch: Parameters<typeof bridge.intelligence.setThresholds>[0]) =>
      bridge.intelligence.setThresholds(patch)
    ),
    dismiss: bind((input: Parameters<typeof bridge.intelligence.dismiss>[0]) =>
      bridge.intelligence.dismiss(input)
    ),
    restore: bind((key: string) => bridge.intelligence.restore(key))
  },

  license: {
    state: bind(() => bridge.license.state()),
    activate: bind((input: Parameters<typeof bridge.license.activate>[0]) => bridge.license.activate(input)),
    deactivate: bind(() => bridge.license.deactivate()),
    events: bind(() => bridge.license.events())
  },

  links: {
    targets: bind(() => bridge.links.targets()),
    open: bind((target: Parameters<typeof bridge.links.open>[0]) => bridge.links.open(target)),
    copy: bind((target: Parameters<typeof bridge.links.copy>[0]) => bridge.links.copy(target))
  },

  ai: {
    connections: bind(() => bridge.ai.connections()),
    createConnection: bind((input: Parameters<typeof bridge.ai.createConnection>[0]) =>
      bridge.ai.createConnection(input)
    ),
    updateConnection: bind((id: string, patch: Parameters<typeof bridge.ai.updateConnection>[1]) =>
      bridge.ai.updateConnection(id, patch)
    ),
    removeConnection: bind((id: string) => bridge.ai.removeConnection(id)),
    testConnection: bind((id: string) => bridge.ai.testConnection(id)),
    models: bind((id: string) => bridge.ai.models(id)),
    routes: bind(() => bridge.ai.routes()),
    setRoute: bind((task: string, connectionId: string | null, model?: string) =>
      bridge.ai.setRoute(task, connectionId, model)
    ),
    generate: bind((input: Parameters<typeof bridge.ai.generate>[0]) => bridge.ai.generate(input)),
    usage: bind(() => bridge.ai.usage()),
    prices: bind(() => bridge.ai.prices()),
    setPrice: bind((input: Parameters<typeof bridge.ai.setPrice>[0]) => bridge.ai.setPrice(input)),
    estimateFlow: bind((input: Parameters<typeof bridge.ai.estimateFlow>[0]) =>
      bridge.ai.estimateFlow(input)
    )
  },

  backups: {
    status: bind(() => bridge.backups.status()),
    create: bind(() => bridge.backups.create()),
    list: bind(() => bridge.backups.list()),
    verify: bind((path: string) => bridge.backups.verify(path)),
    restore: bind((path: string) => bridge.backups.restore(path)),
    cancelRestore: bind(() => bridge.backups.cancelRestore()),
    setConfig: bind((patch: Parameters<typeof bridge.backups.setConfig>[0]) =>
      bridge.backups.setConfig(patch)
    ),
    openFolder: bind(() => bridge.backups.openFolder())
  },

  tracking: {
    carriers: bind((query?: Parameters<typeof bridge.tracking.carriers>[0]) =>
      bridge.tracking.carriers(query)
    ),
    createCarrier: bind((input: Parameters<typeof bridge.tracking.createCarrier>[0]) =>
      bridge.tracking.createCarrier(input)
    ),
    updateCarrier: bind((id: string, patch: Parameters<typeof bridge.tracking.updateCarrier>[1]) =>
      bridge.tracking.updateCarrier(id, patch)
    ),
    removeCarrier: bind((id: string) => bridge.tracking.removeCarrier(id)),
    list: bind((query?: Parameters<typeof bridge.tracking.list>[0]) => bridge.tracking.list(query)),
    get: bind((id: string) => bridge.tracking.get(id)),
    create: bind((input: Parameters<typeof bridge.tracking.create>[0]) => bridge.tracking.create(input)),
    update: bind((id: string, patch: Parameters<typeof bridge.tracking.update>[1]) =>
      bridge.tracking.update(id, patch)
    ),
    setStatus: bind((id: string, status: Parameters<typeof bridge.tracking.setStatus>[1]) =>
      bridge.tracking.setStatus(id, status)
    ),
    archive: bind((ids: string[]) => bridge.tracking.archive(ids)),
    restore: bind((ids: string[]) => bridge.tracking.restore(ids)),
    remove: bind((ids: string[]) => bridge.tracking.remove(ids)),
    events: bind((trackcodeId: string) => bridge.tracking.events(trackcodeId)),
    checkDuplicate: bind((code: string, carrierId: string, exceptId?: string | null) =>
      bridge.tracking.checkDuplicate(code, carrierId, exceptId ?? null)
    ),
    resolveUrl: bind((carrierId: string, code: string) => bridge.tracking.resolveUrl(carrierId, code)),
    trackNow: bind((id: string) => bridge.tracking.trackNow(id))
  },

  browser: {
    state: bind(() => bridge.browser.state()),
    open: bind((input: Parameters<typeof bridge.browser.open>[0]) => bridge.browser.open(input)),
    close: bind(() => bridge.browser.close()),
    back: bind(() => bridge.browser.back()),
    forward: bind(() => bridge.browser.forward()),
    reload: bind(() => bridge.browser.reload()),
    stop: bind(() => bridge.browser.stop()),
    onStateChanged: (listener: (state: CarrierBrowserState) => void) =>
      bridge.browser.onStateChanged(listener),
    onPopupBlocked: (listener: Parameters<typeof bridge.browser.onPopupBlocked>[0]) =>
      bridge.browser.onPopupBlocked(listener),
    onDownloadBlocked: (listener: Parameters<typeof bridge.browser.onDownloadBlocked>[0]) =>
      bridge.browser.onDownloadBlocked(listener)
  }
}

export type Api = typeof api
