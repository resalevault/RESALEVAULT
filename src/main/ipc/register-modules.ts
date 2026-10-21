/**
 * RESALEVAULT - Registro IPC de los modulos: multimedia, compras, gastos,
 * pedidos, preparacion, etiquetas, informes y CSV.
 *
 * Usa la MISMA fabrica de manejadores que el nucleo (`guard.ts`), de modo que
 * todos los canales comparten validacion, control de origen y formato de error.
 */

import { BrowserWindow, app, dialog, shell } from 'electron'
import { ALLOWED_MEDIA_MIME } from '@shared/types-modules'
import { ALLOWED_LINKS } from '@shared/links'
import { CH_MODULES } from '@shared/api-modules'
import { appError } from '../errors'
import { createHandle, type IpcBaseContext } from './guard'
import type { Repositories } from '../db/context'
import type { AppPaths } from '../services/paths'
import type { MediaService } from '../services/media'
import type { LabelService } from '../services/labels'
import type { FinanceService } from '../services/finance'
import type { CsvService } from '../services/csv-io'
import type { IntelligenceService } from '../services/intelligence'
import type { LicenseService } from '../services/license'
import type { LinkService } from '../services/links'
import type { AiService } from '../services/ai/service'
import type { BackupService } from '../services/backup/service'
import {
  zAiConnectionCreate,
  zAiConnectionUpdate,
  zAiEstimateFlow,
  zAiGenerate,
  zAiPrice,
  zAiRoute,
  zBackupConfig,
  zBackupPath,
  zCsvAnalyze,
  zCsvExport,
  zCsvExportDialog,
  zCsvImport,
  zExpenseCreate,
  zExpenseQuery,
  zExpenseUpdatePayload,
  zFinanceQuery,
  zInsightDismiss,
  zIntelligenceThresholds,
  zLabelLocations,
  zLabelProducts,
  zLicenseActivate,
  zLinkTarget,
  zMediaImport,
  zMediaRemove,
  zMediaReorder,
  zMediaSetCover,
  zOrderCancel,
  zOrderCreate,
  zOrderFeeCreate,
  zOrderFeeUpdate,
  zOrderQuery,
  zOrderReturnCreate,
  zOrderStatus,
  zOrderUpdatePayload,
  zPickingMark,
  zPickingNote,
  zPurchaseDraft,
  zPurchaseMaterialize,
  zPurchaseQuery,
  zPurchaseUpdatePayload,
  zScanCode,
  zSupplierCreate,
  zSupplierUpdatePayload
} from '@shared/schemas-modules'
import { zId } from '@shared/schemas'

/**
 * Los esquemas de fecha opcional convierten la cadena vacia en `null`. Los
 * repositorios usan `undefined` para "sin filtro", asi que aqui se eliminan las
 * claves nulas en lugar de propagarlas.
 */
type DateFixed<T> = Omit<T, 'from' | 'to'> & { from?: string; to?: string }

function noNullDates<T extends Record<string, unknown>>(query: T): DateFixed<T> {
  const clone: Record<string, unknown> = { ...query }
  if (clone.from === null || clone.from === undefined) delete clone.from
  if (clone.to === null || clone.to === undefined) delete clone.to
  return clone as DateFixed<T>
}

export interface ModuleContext extends IpcBaseContext {
  repos: Repositories
  paths: AppPaths
  media: MediaService
  labels: LabelService
  finance: FinanceService
  csv: CsvService
  intelligence: IntelligenceService
  license: LicenseService
  links: LinkService
  ai: AiService
  backups: BackupService
}

export function registerModuleHandlers(ctx: ModuleContext): void {
  const handle = createHandle(ctx)
  const { repos } = ctx

  // -------------------------------------------------------------------------
  // Multimedia
  // -------------------------------------------------------------------------

  handle(CH_MODULES.mediaImport, zMediaImport, async ({ productId }, event) => {
    // Cuota de archivos del plan (el limite por articulo lo aplica MediaService).
    ctx.license.assertUploadQuota(1)
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(parent as BrowserWindow, {
      title: 'Anadir archivos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Imagenes y documentos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt', 'csv'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, imported: 0, rejected: [] }
    }

    const imported = ctx.media.importFiles(productId, result.filePaths)
    return {
      canceled: false,
      imported: imported.imported,
      rejected: imported.rejected.map((entry) => ({
        originalName: entry.originalName,
        reason: entry.reason,
        detail: entry.detail
      }))
    }
  }, { mutates: true, entity: 'products' })

  handle(CH_MODULES.mediaRemove, zMediaRemove, (mediaId) => ctx.media.remove(mediaId), {
    mutates: true,
    entity: 'products'
  })

  handle(CH_MODULES.mediaReorder, zMediaReorder, ({ productId, orderedIds }) =>
    ctx.media.reorder(productId, orderedIds), { mutates: true, entity: 'products' })

  handle(CH_MODULES.mediaSetCover, zMediaSetCover, ({ productId, mediaId }) =>
    ctx.media.setCover(productId, mediaId), { mutates: true, entity: 'products' })

  handle(CH_MODULES.mediaStorageReport, null, () => ctx.media.storageReport())

  handle(CH_MODULES.mediaCleanup, null, () => ctx.media.cleanupOrphans(), {
    mutates: true,
    entity: 'products'
  })

  handle(CH_MODULES.mediaOpenExternal, zMediaRemove, async (mediaId) => {
    const row = repos.db.get<{ file_name: string; mime_type: string }>(
      'SELECT file_name, mime_type FROM product_media WHERE id = $id',
      { $id: mediaId }
    )
    if (!row) throw appError('not_found', { entity: 'media' })
    // La ruta se resuelve y se valida: nunca se abre nada fuera de la carpeta.
    const absolute = ctx.media.resolveStoredPath(row.file_name)
    const error = await shell.openPath(absolute)
    if (error) throw appError('storage_error', undefined, error)
    return null
  })

  // -------------------------------------------------------------------------
  // Proveedores
  // -------------------------------------------------------------------------

  handle(CH_MODULES.suppliersList, null, () => repos.suppliers.list())
  handle(CH_MODULES.suppliersCreate, zSupplierCreate, (input) => repos.suppliers.create(input), {
    mutates: true,
    entity: 'suppliers'
  })
  handle(CH_MODULES.suppliersUpdate, zSupplierUpdatePayload, ({ id, patch }) =>
    repos.suppliers.update(id, patch), { mutates: true, entity: 'suppliers' })
  handle(CH_MODULES.suppliersRemove, zId, (id) => repos.suppliers.remove(id), {
    mutates: true,
    entity: 'suppliers'
  })

  // -------------------------------------------------------------------------
  // Compras
  // -------------------------------------------------------------------------

  handle(CH_MODULES.purchasesList, zPurchaseQuery, (query) => repos.purchases.list(noNullDates(query)))
  handle(CH_MODULES.purchasesGet, zId, (id) => repos.purchases.get(id))
  handle(CH_MODULES.purchasesPreview, zPurchaseDraft.partial(), (input) =>
    repos.purchases.previewAllocation({
      allocationMethod: input.allocationMethod ?? 'by_cost',
      shippingCents: input.shippingCents,
      otherCents: input.otherCents,
      discountCents: input.discountCents,
      items: input.items ?? []
    })
  )
  handle(CH_MODULES.purchasesCreate, zPurchaseDraft, (input) => repos.purchases.create(input), {
    mutates: true,
    entity: 'purchases'
  })
  handle(CH_MODULES.purchasesUpdate, zPurchaseUpdatePayload, ({ id, patch }) =>
    repos.purchases.update(id, patch), { mutates: true, entity: 'purchases' })
  handle(CH_MODULES.purchasesRemove, zId, (id) => repos.purchases.remove(id), {
    mutates: true,
    entity: 'purchases'
  })
  handle(CH_MODULES.purchasesMaterialize, zPurchaseMaterialize, ({ purchaseId, itemIds, categoryId }) =>
    repos.purchases.materialize(purchaseId, itemIds, { categoryId: categoryId ?? null }), {
    mutates: true,
    entity: 'products'
  })
  handle(CH_MODULES.purchasesTotals, null, () => repos.purchases.totals())

  // -------------------------------------------------------------------------
  // Gastos generales
  // -------------------------------------------------------------------------

  handle(CH_MODULES.expensesList, zExpenseQuery, (query) => repos.expenses.list(noNullDates(query)))
  handle(CH_MODULES.expensesCreate, zExpenseCreate, (input) => repos.expenses.create(input), {
    mutates: true,
    entity: 'expenses'
  })
  handle(CH_MODULES.expensesUpdate, zExpenseUpdatePayload, ({ id, patch }) =>
    repos.expenses.update(id, patch), { mutates: true, entity: 'expenses' })
  handle(CH_MODULES.expensesRemove, zId, (id) => repos.expenses.remove(id), {
    mutates: true,
    entity: 'expenses'
  })
  handle(CH_MODULES.expensesSummary, null, () => repos.expenses.summary())

  // -------------------------------------------------------------------------
  // Pedidos
  // -------------------------------------------------------------------------

  handle(CH_MODULES.ordersList, zOrderQuery, (query) => repos.orders.list(noNullDates(query)))
  handle(CH_MODULES.ordersGet, zId, (id) => repos.orders.get(id))
  handle(CH_MODULES.ordersCreate, zOrderCreate, (input) => repos.orders.create(input), {
    mutates: true,
    entity: 'orders'
  })
  handle(CH_MODULES.ordersUpdate, zOrderUpdatePayload, ({ id, patch }) => repos.orders.update(id, patch), {
    mutates: true,
    entity: 'orders'
  })
  handle(CH_MODULES.ordersSetStatus, zOrderStatus, ({ id, status, confirm, trackingNumber, carrier }) =>
    repos.orders.setStatus(id, status, { confirm, trackingNumber, carrier }), {
    mutates: true,
    entity: 'orders'
  })
  handle(CH_MODULES.ordersCancel, zOrderCancel, ({ id, reason }) => repos.orders.cancel(id, reason), {
    mutates: true,
    entity: 'orders'
  })
  handle(CH_MODULES.ordersRemove, zId, (id) => repos.orders.remove(id), {
    mutates: true,
    entity: 'orders'
  })

  handle(CH_MODULES.orderFeesAdd, zOrderFeeCreate, ({ orderId, kind, label, amountCents }) =>
    repos.orders.addFee(orderId, { kind, label, amountCents }), { mutates: true, entity: 'orders' })
  handle(CH_MODULES.orderFeesUpdate, zOrderFeeUpdate, ({ feeId, patch }) =>
    repos.orders.updateFee(feeId, patch), { mutates: true, entity: 'orders' })
  handle(CH_MODULES.orderFeesRemove, zId, (feeId) => repos.orders.removeFee(feeId), {
    mutates: true,
    entity: 'orders'
  })

  handle(CH_MODULES.orderReturnsAdd, zOrderReturnCreate, (input) => repos.orders.addReturn(input), {
    mutates: true,
    entity: 'orders'
  })
  handle(CH_MODULES.orderReturnsRemove, zId, (returnId) => repos.orders.removeReturn(returnId), {
    mutates: true,
    entity: 'orders'
  })

  // -------------------------------------------------------------------------
  // Preparacion de pedidos
  // -------------------------------------------------------------------------

  handle(CH_MODULES.pickingQueue, null, () => repos.orders.pickingQueue())
  handle(CH_MODULES.pickingGet, zId, (orderId) => repos.orders.pickingFor(orderId))
  handle(CH_MODULES.pickingMarkPicked, zPickingMark, ({ orderId, productId, scannedSku }) =>
    repos.orders.markPicked(orderId, productId, scannedSku ?? ''), { mutates: true, entity: 'orders' })
  handle(CH_MODULES.pickingMarkPacked, zPickingMark, ({ orderId, productId }) =>
    repos.orders.markPacked(orderId, productId), { mutates: true, entity: 'orders' })
  handle(CH_MODULES.pickingReset, zPickingMark, ({ orderId, productId }) =>
    repos.orders.resetCheck(orderId, productId), { mutates: true, entity: 'orders' })
  handle(CH_MODULES.pickingNote, zPickingNote, ({ orderId, productId, note }) => {
    repos.orders.setCheckNote(orderId, productId, note)
    return null
  }, { mutates: true, entity: 'orders' })
  handle(CH_MODULES.pickingScan, zScanCode, ({ code }) => repos.orders.resolveScan(code))

  // -------------------------------------------------------------------------
  // Etiquetas
  // -------------------------------------------------------------------------

  handle(CH_MODULES.labelsProducts, zLabelProducts, ({ productIds, options }) => {
    ctx.license.assertFeature('barcodes')
    return ctx.labels.buildProductSheet(productIds, options)
  })
  handle(CH_MODULES.labelsLocations, zLabelLocations, ({ locationIds, options }) => {
    ctx.license.assertFeature('barcodes')
    return ctx.labels.buildLocationSheet(locationIds, options)
  })

  // -------------------------------------------------------------------------
  // Informes
  // -------------------------------------------------------------------------

  handle(CH_MODULES.financeReport, zFinanceQuery, (query) => {
    ctx.license.assertFeature('analytics')
    return ctx.finance.report(noNullDates(query ?? {}))
  })
  handle(CH_MODULES.financeCrossCheck, zId, (orderId) => ctx.finance.crossCheckOrder(orderId))

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------

  handle(CH_MODULES.csvChooseImport, null, async (_input, event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(parent as BrowserWindow, {
      title: 'Seleccionar archivo CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  })

  handle(CH_MODULES.csvPreview, zId, (path) => ctx.csv.preview(path))

  handle(CH_MODULES.csvAnalyze, zCsvAnalyze, ({ path, mapping }) => ctx.csv.analyze(path, mapping))

  handle(CH_MODULES.csvImport, zCsvImport, (options) => {
    ctx.license.assertFeature('csvImport')
    return ctx.csv.importProducts({
      path: options.path,
      mapping: options.mapping,
      duplicateStrategy: options.duplicateStrategy,
      dryRun: options.dryRun
    })
  }, { mutates: true, entity: 'products' })

  handle(CH_MODULES.csvChooseExport, zCsvExportDialog, async ({ format, suggestedName }, event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showSaveDialog(parent as BrowserWindow, {
      title: 'Guardar exportacion',
      defaultPath: suggestedName ?? `resalevault-${format}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    return { canceled: false, path: result.filePath }
  })

  handle(CH_MODULES.csvExport, zCsvExport, (options) =>
    ctx.csv.exportData({
      path: options.path,
      format: options.format,
      delimiter: options.delimiter ?? ',',
      includeArchived: options.includeArchived ?? false
    })
  )

  // -------------------------------------------------------------------------
  // Inteligencia (reglas locales; sin IA)
  // -------------------------------------------------------------------------

  handle(CH_MODULES.intelligenceReport, null, () => {
    ctx.license.assertFeature('intelligence')
    return ctx.intelligence.report()
  })
  handle(CH_MODULES.intelligenceThresholdsGet, null, () => ctx.intelligence.getThresholds())
  handle(CH_MODULES.intelligenceThresholdsSet, zIntelligenceThresholds, (patch) =>
    ctx.intelligence.setThresholds(patch), { mutates: true, entity: 'settings' })
  handle(CH_MODULES.insightDismiss, zInsightDismiss, (input) => {
    ctx.intelligence.dismiss(input)
    return null
  }, { mutates: true, entity: 'settings' })
  handle(CH_MODULES.insightRestore, zId, (key) => {
    ctx.intelligence.restore(key)
    return null
  }, { mutates: true, entity: 'settings' })

  // -------------------------------------------------------------------------
  // Licencias
  // -------------------------------------------------------------------------

  handle(CH_MODULES.licenseState, null, () => ctx.license.state())
  handle(CH_MODULES.licenseActivate, zLicenseActivate, (input) => ctx.license.activate(input), {
    mutates: true,
    entity: 'license'
  })
  handle(CH_MODULES.licenseDeactivate, null, () => ctx.license.deactivate(), {
    mutates: true,
    entity: 'license'
  })
  handle(CH_MODULES.licenseEvents, null, () => ctx.license.events())

  // -------------------------------------------------------------------------
  // Enlaces externos (lista blanca)
  // -------------------------------------------------------------------------

  handle(CH_MODULES.linksTargets, null, () => ({
    discordInvite: ALLOWED_LINKS.discord_invite.url
  }))
  handle(CH_MODULES.linksOpen, zLinkTarget, (target) => ctx.links.open(target))
  handle(CH_MODULES.linksCopy, zLinkTarget, (target) => ctx.links.copy(target))

  // -------------------------------------------------------------------------
  // AI Studio (BYOK)
  // -------------------------------------------------------------------------

  handle(CH_MODULES.aiConnections, null, () => ctx.ai.listConnections())

  handle(CH_MODULES.aiConnectionCreate, zAiConnectionCreate, (input) =>
    ctx.ai.createConnection(input), { mutates: true, entity: 'ai' })

  handle(CH_MODULES.aiConnectionUpdate, zAiConnectionUpdate, ({ id, patch }) =>
    ctx.ai.updateConnection(id, patch), { mutates: true, entity: 'ai' })

  handle(CH_MODULES.aiConnectionRemove, zId, (id) => ctx.ai.removeConnection(id), {
    mutates: true,
    entity: 'ai'
  })

  handle(CH_MODULES.aiConnectionTest, zId, (id) => ctx.ai.testConnection(id))
  handle(CH_MODULES.aiModels, zId, (id) => ctx.ai.listModels(id))
  handle(CH_MODULES.aiRoutes, null, () => ctx.ai.routes())

  handle(CH_MODULES.aiSetRoute, zAiRoute, ({ task, connectionId, model }) => {
    ctx.ai.setRoute(task, connectionId, model ?? '')
    return null
  }, { mutates: true, entity: 'ai' })

  handle(CH_MODULES.aiGenerate, zAiGenerate, async (input) => {
    // El limite se comprueba AQUI, no en la interfaz: un limite que solo se
    // comprueba en el cliente no es un limite.
    const state = ctx.license.state()
    if (!state.limits.aiStudio) {
      throw appError('license_required', { feature: 'aiStudio', plan: state.plan })
    }
    if (
      state.limits.aiMonthlyCalls !== -1 &&
      state.usage.aiCallsThisMonth >= state.limits.aiMonthlyCalls
    ) {
      throw appError('plan_limit_reached', {
        resource: 'aiMonthlyCalls',
        limit: state.limits.aiMonthlyCalls,
        plan: state.plan
      })
    }
    return ctx.ai.generate(input)
  }, { mutates: true, entity: 'ai' })

  handle(CH_MODULES.aiUsage, null, () => ctx.ai.usage())
  handle(CH_MODULES.aiPrices, null, () => ctx.ai.prices())
  handle(CH_MODULES.aiSetPrice, zAiPrice, (input) => {
    ctx.ai.setPrice(input)
    return null
  }, { mutates: true, entity: 'ai' })
  handle(CH_MODULES.aiEstimateFlow, zAiEstimateFlow, (input) => ctx.ai.estimateFlow(input))

  // -------------------------------------------------------------------------
  // Copias de seguridad y restauracion
  // -------------------------------------------------------------------------

  handle(CH_MODULES.backupsStatus, null, () => ctx.backups.status())
  handle(CH_MODULES.backupsCreate, null, () => ctx.backups.create(), { mutates: true, entity: 'backups' })
  handle(CH_MODULES.backupsList, null, () => ctx.backups.list())
  handle(CH_MODULES.backupsVerify, zBackupPath, (path) => ctx.backups.verify(path))

  handle(CH_MODULES.backupsRestore, zBackupPath, (path) => {
    const preparation = ctx.backups.prepareRestore(path)
    if (!preparation.ok || !preparation.manifest) {
      throw appError('storage_error', { reason: preparation.reason ?? 'verify_failed' })
    }

    // La restauracion se aplica al arrancar, cuando la base no esta abierta.
    // Se da un margen para que el renderer reciba la respuesta y muestre el
    // aviso antes de que el proceso se reinicie.
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 1200)

    return { ok: true, manifest: preparation.manifest }
  }, { mutates: true, entity: 'backups' })

  handle(CH_MODULES.backupsCancelRestore, null, () => {
    ctx.backups.cancelRestore()
    return null
  }, { mutates: true, entity: 'backups' })

  handle(CH_MODULES.backupsSetConfig, zBackupConfig, (patch) => {
    ctx.backups.setConfig(patch)
    return ctx.backups.status()
  }, { mutates: true, entity: 'settings' })

  handle(CH_MODULES.backupsOpenFolder, null, async () => {
    const error = await shell.openPath(ctx.backups.destination())
    if (error) throw appError('storage_error', undefined, error)
    return null
  })

  ctx.logger.info('Manejadores de modulos registrados', {
    channels: Object.keys(CH_MODULES).length,
    mediaTypes: ALLOWED_MEDIA_MIME.length
  })
}
