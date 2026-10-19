/**
 * RESALEVAULT - Contrato del puente IPC.
 *
 * Principio de minimo privilegio: el renderer NO dispone de un `invoke`
 * generico. Solo puede llamar a los metodos declarados aqui, cada uno con su
 * propio canal y su propio esquema de validacion en el proceso principal.
 *
 * Todas las operaciones devuelven `Result<T>`: nunca se lanza una excepcion a
 * traves del puente porque los errores de Electron pierden informacion
 * estructurada al serializarse.
 */

import type {
  AppInfo,
  AppSettings,
  AttributeDefinition,
  BulkUpdatePreview,
  Category,
  DashboardSummary,
  DatabaseHealth,
  Listing,
  Location,
  Page,
  Platform,
  Product,
  ProductBulkUpdateInput,
  ProductCreateInput,
  ProductDetail,
  ProductQuery,
  ProductSummary,
  ProductUpdateInput,
  Result,
  Tag
} from './types'
import type { ResaleVaultModuleApi } from './api-modules'

/** Nombres de canal. Centralizados para evitar cadenas sueltas. */
export const CH = {
  appInfo: 'app:info',
  appSettings: 'app:settings',
  appUpdateSettings: 'app:updateSettings',
  appDatabaseHealth: 'app:databaseHealth',
  appSeedDemo: 'app:seedDemoData',
  appClearDemo: 'app:clearDemoData',
  appOpenDataFolder: 'app:openDataFolder',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggleMaximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:isMaximized',

  dashboardSummary: 'dashboard:summary',

  productsList: 'products:list',
  productsGet: 'products:get',
  productsCreate: 'products:create',
  productsUpdate: 'products:update',
  productsArchive: 'products:archive',
  productsRestore: 'products:restore',
  productsDelete: 'products:delete',
  productsBulkPreview: 'products:bulkPreview',
  productsBulkUpdate: 'products:bulkUpdate',
  productsSuggestSku: 'products:suggestSku',
  productsCheckSku: 'products:checkSku',

  categoriesList: 'categories:list',
  categoriesCreate: 'categories:create',
  categoriesUpdate: 'categories:update',
  categoriesDelete: 'categories:delete',

  locationsList: 'locations:list',
  locationsCreate: 'locations:create',
  locationsUpdate: 'locations:update',
  locationsDelete: 'locations:delete',
  locationsMove: 'locations:move',

  tagsList: 'tags:list',
  tagsCreate: 'tags:create',
  tagsDelete: 'tags:delete',

  platformsList: 'platforms:list',
  platformsCreate: 'platforms:create',
  platformsUpdate: 'platforms:update',

  attributesList: 'attributes:list',
  attributesCreate: 'attributes:create',
  attributesUpdate: 'attributes:update',
  attributesDelete: 'attributes:delete',

  listingsList: 'listings:list',
  listingsCreate: 'listings:create',
  listingsUpdate: 'listings:update',
  listingsDelete: 'listings:delete'
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]

/** Eventos que el proceso principal emite hacia la interfaz. */
export const EV = {
  windowMaximizedChanged: 'event:windowMaximizedChanged',
  dataChanged: 'event:dataChanged'
} as const

// ---------------------------------------------------------------------------
// Firmas de cada operacion
// ---------------------------------------------------------------------------

export interface ResaleVaultAppApi {
  getInfo(): Promise<Result<AppInfo>>
  getSettings(): Promise<Result<AppSettings>>
  updateSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings>>
  getDatabaseHealth(): Promise<Result<DatabaseHealth>>
  seedDemoData(): Promise<Result<{ created: number }>>
  clearDemoData(): Promise<Result<{ deleted: number }>>
  openDataFolder(): Promise<Result<null>>
  /** Se dispara cuando el proceso principal modifica datos. */
  onDataChanged(listener: (entity: string) => void): () => void
}

export interface ResaleVaultWindowApi {
  minimize(): Promise<Result<null>>
  toggleMaximize(): Promise<Result<boolean>>
  close(): Promise<Result<null>>
  isMaximized(): Promise<Result<boolean>>
  onMaximizedChanged(listener: (maximized: boolean) => void): () => void
}

export interface ResaleVaultProductsApi {
  list(query: ProductQuery): Promise<Result<Page<ProductSummary>>>
  get(id: string): Promise<Result<ProductDetail>>
  create(input: ProductCreateInput): Promise<Result<Product>>
  update(id: string, patch: ProductUpdateInput): Promise<Result<Product>>
  archive(ids: string[]): Promise<Result<{ affected: number }>>
  restore(ids: string[]): Promise<Result<{ affected: number }>>
  remove(ids: string[]): Promise<Result<{ affected: number }>>
  bulkPreview(input: ProductBulkUpdateInput): Promise<Result<BulkUpdatePreview>>
  bulkUpdate(input: ProductBulkUpdateInput): Promise<Result<{ affected: number }>>
  suggestSku(categoryId?: string | null): Promise<Result<string>>
  checkSku(sku: string, exceptId?: string | null): Promise<Result<{ available: boolean }>>
}

export interface ResaleVaultCategoriesApi {
  list(): Promise<Result<Category[]>>
  create(input: { name: string; parentId?: string | null }): Promise<Result<Category>>
  update(id: string, patch: { name?: string; parentId?: string | null; sortOrder?: number }): Promise<Result<Category>>
  remove(id: string): Promise<Result<{ affected: number }>>
}

export interface ResaleVaultLocationsApi {
  list(): Promise<Result<Location[]>>
  create(input: {
    kind: Location['kind']
    code: string
    name: string
    parentId?: string | null
  }): Promise<Result<Location>>
  update(id: string, patch: { code?: string; name?: string; sortOrder?: number }): Promise<Result<Location>>
  remove(id: string): Promise<Result<{ affected: number }>>
  move(id: string, newParentId: string | null): Promise<Result<Location>>
}

export interface ResaleVaultTagsApi {
  list(): Promise<Result<Tag[]>>
  create(input: { name: string; color?: string }): Promise<Result<Tag>>
  remove(id: string): Promise<Result<{ affected: number }>>
}

export interface ResaleVaultPlatformsApi {
  list(): Promise<Result<Platform[]>>
  create(input: { code: string; name: string }): Promise<Result<Platform>>
  update(id: string, patch: { name?: string; active?: boolean; sortOrder?: number }): Promise<Result<Platform>>
}

export interface ResaleVaultAttributesApi {
  list(): Promise<Result<AttributeDefinition[]>>
  create(input: {
    key: string
    name: string
    type: AttributeDefinition['type']
    options?: string[]
  }): Promise<Result<AttributeDefinition>>
  update(
    id: string,
    patch: Partial<Pick<AttributeDefinition, 'name' | 'type' | 'options' | 'sortOrder'>>
  ): Promise<Result<AttributeDefinition>>
  remove(id: string): Promise<Result<{ affected: number }>>
}

export interface ResaleVaultListingsApi {
  list(productId: string): Promise<Result<Listing[]>>
  create(input: {
    productId: string
    platformId: string
    externalId?: string
    url?: string
    listedPriceCents?: number | null
    status?: Listing['status']
    listedAt?: string | null
    notes?: string
  }): Promise<Result<Listing>>
  update(
    id: string,
    patch: Partial<{
      externalId: string
      url: string
      listedPriceCents: number | null
      status: Listing['status']
      listedAt: string | null
      notes: string
    }>
  ): Promise<Result<Listing>>
  remove(id: string): Promise<Result<{ affected: number }>>
}

export interface ResaleVaultDashboardApi {
  summary(): Promise<Result<DashboardSummary>>
}

/** API completa expuesta en `window.resalevault`. */
export interface ResaleVaultApi extends ResaleVaultModuleApi {
  app: ResaleVaultAppApi
  window: ResaleVaultWindowApi
  products: ResaleVaultProductsApi
  categories: ResaleVaultCategoriesApi
  locations: ResaleVaultLocationsApi
  tags: ResaleVaultTagsApi
  platforms: ResaleVaultPlatformsApi
  attributes: ResaleVaultAttributesApi
  listings: ResaleVaultListingsApi
  dashboard: ResaleVaultDashboardApi
}

/** Rutas de navegacion de la aplicacion. */
export const ROUTES = [
  'dashboard',
  'inventory',
  'purchases',
  'orders',
  'picking',
  'shipping',
  'ai-studio',
  'intelligence',
  'analytics',
  'categories',
  'locations',
  'import-export',
  'shipping-tracker',
  'settings',
  'license'
] as const

export type RouteName = (typeof ROUTES)[number]

/** Fase del plan en la que esta prevista cada seccion todavia no implementada. */
export const ROUTE_PHASE: Partial<Record<RouteName, number>> = {}
