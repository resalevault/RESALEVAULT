/**
 * RESALEVAULT - Registro de manejadores IPC.
 *
 * Reglas de seguridad aplicadas en TODAS las operaciones:
 *  1. Solo la ventana principal de la aplicacion puede invocar estos canales
 *     (`assertTrustedSender`). Una ventana ajena o un iframe no pueden llamar.
 *  2. Cada canal tiene su propio esquema de validacion zod. El renderer no
 *     puede inyectar SQL ni valores fuera de rango aunque este comprometido.
 *  3. Las consultas usan parametros con nombre; jamas se concatena texto del
 *     usuario en la sentencia SQL.
 *  4. Los errores se devuelven como codigo, no como excepcion.
 */

import { BrowserWindow, app, ipcMain, shell } from 'electron'
import type { AppInfo } from '@shared/types'
import { CH } from '@shared/api'
import {
  zAttributeCreate,
  zAttributeUpdatePayload,
  zBulkUpdate,
  zCategoryCreate,
  zCategoryUpdatePayload,
  zCheckSkuPayload,
  zId,
  zIdList,
  zListingCreate,
  zListingUpdatePayload,
  zLocationCreate,
  zLocationMovePayload,
  zLocationUpdatePayload,
  zPlatformCreate,
  zPlatformUpdatePayload,
  zProductCreate,
  zProductQuery,
  zProductUpdatePayload,
  zSettingsPatch,
  zSuggestSkuPayload,
  zTagCreate
} from '@shared/schemas'
import { appError } from '../errors'
import { createHandle, type IpcBaseContext } from './guard'
import type { Repositories } from '../db/context'
import { buildDashboardSummary } from '../db/repositories/dashboard'
import { clearDemoData, seedDemoData } from '../services/demo-data'
import { readDatabaseHealth } from '../services/bootstrap'
import type { AppPaths } from '../services/paths'

export interface IpcContext extends IpcBaseContext {
  repos: Repositories
  paths: AppPaths
  version: string
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { repos, logger } = ctx

  // La validacion, el control de origen y el formato de error viven en
  // `guard.ts`, compartidos con el registro de los modulos.
  const handle = createHandle(ctx)

  // -------------------------------------------------------------------------
  // Aplicacion
  // -------------------------------------------------------------------------

  handle<undefined, AppInfo>(CH.appInfo, null, () => {
    const sqliteVersion = repos.db.scalar<string>('SELECT sqlite_version() AS v') ?? 'desconocida'
    return {
      name: 'RESALEVAULT',
      version: ctx.version,
      electronVersion: process.versions.electron ?? '',
      chromeVersion: process.versions.chrome ?? '',
      nodeVersion: process.versions.node ?? '',
      sqliteVersion,
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      userDataPath: ctx.paths.userData,
      databasePath: ctx.paths.database,
      isDev: !app.isPackaged
    }
  })

  handle(CH.appSettings, null, () => repos.settings.get())

  handle(CH.appUpdateSettings, zSettingsPatch, (patch) => {
    const updated = repos.settings.update(patch)
    logger.info('Ajustes actualizados', { keys: Object.keys(patch) })
    return updated
  }, { mutates: true, entity: 'settings' })

  handle(CH.appDatabaseHealth, null, () => readDatabaseHealth(repos.db, ctx.paths.database))

  handle(CH.appSeedDemo, null, () => seedDemoData(repos), { mutates: true, entity: 'products' })

  handle(CH.appClearDemo, null, () => clearDemoData(repos), { mutates: true, entity: 'products' })

  handle(CH.appOpenDataFolder, null, async () => {
    const error = await shell.openPath(ctx.paths.userData)
    if (error) throw appError('storage_error', undefined, error)
    return null
  })

  // -------------------------------------------------------------------------
  // Ventana
  // -------------------------------------------------------------------------

  handle(CH.windowMinimize, null, (_input, event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
    return null
  })

  handle(CH.windowToggleMaximize, null, (_input, event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })

  handle(CH.windowClose, null, (_input, event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return null
  })

  handle(CH.windowIsMaximized, null, (_input, event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  // -------------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------------

  handle(CH.dashboardSummary, null, () => {
    const settings = repos.settings.get()
    return buildDashboardSummary(repos.db, { staleThresholds: settings.staleThresholds })
  })

  // -------------------------------------------------------------------------
  // Articulos
  // -------------------------------------------------------------------------

  handle(CH.productsList, zProductQuery, (query) => repos.products.list(query))
  handle(CH.productsGet, zId, (id) => repos.products.get(id))
  handle(CH.productsCreate, zProductCreate, (input) => repos.products.create(input), {
    mutates: true,
    entity: 'products'
  })
  handle(CH.productsUpdate, zProductUpdatePayload, ({ id, patch }) => repos.products.update(id, patch), {
    mutates: true,
    entity: 'products'
  })

  handle(CH.productsArchive, zIdList, (ids) => repos.products.archive(ids), {
    mutates: true,
    entity: 'products'
  })
  handle(CH.productsRestore, zIdList, (ids) => repos.products.restore(ids), {
    mutates: true,
    entity: 'products'
  })
  handle(CH.productsDelete, zIdList, (ids) => repos.products.remove(ids), {
    mutates: true,
    entity: 'products'
  })
  handle(CH.productsBulkPreview, zBulkUpdate, (input) => repos.products.bulkPreview(input))
  handle(CH.productsBulkUpdate, zBulkUpdate, (input) => repos.products.bulkUpdate(input), {
    mutates: true,
    entity: 'products'
  })

  handle(CH.productsSuggestSku, zSuggestSkuPayload, ({ categoryId }) =>
    repos.products.suggestSku(categoryId ?? null)
  )

  handle(CH.productsCheckSku, zCheckSkuPayload, ({ sku, exceptId }) =>
    repos.products.checkSku(sku, exceptId ?? null)
  )

  // -------------------------------------------------------------------------
  // Catalogos
  // -------------------------------------------------------------------------

  handle(CH.categoriesList, null, () => repos.categories.list())
  handle(CH.categoriesCreate, zCategoryCreate, (input) => repos.categories.create(input), {
    mutates: true,
    entity: 'categories'
  })
  handle(CH.categoriesUpdate, zCategoryUpdatePayload, ({ id, patch }) => repos.categories.update(id, patch), {
    mutates: true,
    entity: 'categories'
  })
  handle(CH.categoriesDelete, zId, (id) => repos.categories.remove(id), {
    mutates: true,
    entity: 'categories'
  })

  handle(CH.locationsList, null, () => repos.locations.list())
  handle(CH.locationsCreate, zLocationCreate, (input) => repos.locations.create(input), {
    mutates: true,
    entity: 'locations'
  })
  handle(CH.locationsUpdate, zLocationUpdatePayload, ({ id, patch }) => repos.locations.update(id, patch), {
    mutates: true,
    entity: 'locations'
  })
  handle(CH.locationsDelete, zId, (id) => repos.locations.remove(id), {
    mutates: true,
    entity: 'locations'
  })
  handle(CH.locationsMove, zLocationMovePayload, ({ id, newParentId }) =>
    repos.locations.move(id, newParentId ?? null), {
    mutates: true,
    entity: 'locations'
  })

  handle(CH.tagsList, null, () => repos.tags.list())
  handle(CH.tagsCreate, zTagCreate, (input) => repos.tags.create(input), {
    mutates: true,
    entity: 'tags'
  })
  handle(CH.tagsDelete, zId, (id) => repos.tags.remove(id), { mutates: true, entity: 'tags' })

  handle(CH.platformsList, null, () => repos.platforms.list())
  handle(CH.platformsCreate, zPlatformCreate, (input) => repos.platforms.create(input), {
    mutates: true,
    entity: 'platforms'
  })
  handle(CH.platformsUpdate, zPlatformUpdatePayload, ({ id, patch }) => repos.platforms.update(id, patch), {
    mutates: true,
    entity: 'platforms'
  })

  handle(CH.attributesList, null, () => repos.attributes.list())
  handle(CH.attributesCreate, zAttributeCreate, (input) => repos.attributes.create(input), {
    mutates: true,
    entity: 'attributes'
  })
  handle(CH.attributesUpdate, zAttributeUpdatePayload, ({ id, patch }) => repos.attributes.update(id, patch), {
    mutates: true,
    entity: 'attributes'
  })
  handle(CH.attributesDelete, zId, (id) => repos.attributes.remove(id), {
    mutates: true,
    entity: 'attributes'
  })

  handle(CH.listingsList, zId, (productId) => repos.listings.listForProduct(productId))
  handle(CH.listingsCreate, zListingCreate, (input) => repos.listings.create(input), {
    mutates: true,
    entity: 'listings'
  })
  handle(CH.listingsUpdate, zListingUpdatePayload, ({ id, patch }) => repos.listings.update(id, patch), {
    mutates: true,
    entity: 'listings'
  })
  handle(CH.listingsDelete, zId, (id) => repos.listings.remove(id), {
    mutates: true,
    entity: 'listings'
  })

  logger.info('Manejadores IPC registrados', { channels: Object.keys(CH).length })
}

export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(CH)) {
    ipcMain.removeHandler(channel)
  }
}
