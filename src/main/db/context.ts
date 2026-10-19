/**
 * RESALEVAULT - Composicion de la capa de datos.
 *
 * `createRepositories` construye el grafo de repositorios y servicios sobre una
 * conexion concreta. Se usa tanto desde el proceso principal de Electron como
 * desde las pruebas automatizadas, que crean una base de datos en memoria.
 *
 * El orden de construccion importa: los pedidos dependen de los articulos, y
 * las compras tambien. Se construye de dentro hacia fuera.
 */

import type { LocaleCode } from '@shared/types'
import type { Database } from './database'
import { SettingsService } from '../services/settings'
import { AttributeRepository } from './repositories/attributes'
import { CategoryRepository } from './repositories/categories'
import { ExpenseRepository, PurchaseRepository, SupplierRepository } from './repositories/commerce'
import { ListingRepository } from './repositories/listings'
import { LocationRepository } from './repositories/locations'
import { OrderRepository } from './repositories/orders'
import { PlatformRepository } from './repositories/platforms'
import { ProductRepository } from './repositories/products'
import { TagRepository } from './repositories/tags'
import { TrackingRepository } from './repositories/tracking'

export interface Repositories {
  db: Database
  settings: SettingsService
  categories: CategoryRepository
  locations: LocationRepository
  tags: TagRepository
  platforms: PlatformRepository
  attributes: AttributeRepository
  products: ProductRepository
  listings: ListingRepository
  suppliers: SupplierRepository
  purchases: PurchaseRepository
  expenses: ExpenseRepository
  orders: OrderRepository
  tracking: TrackingRepository
}

export function createRepositories(db: Database, defaultLocale: LocaleCode = 'es'): Repositories {
  const settings = new SettingsService(db, defaultLocale)
  const tags = new TagRepository(db)

  // El generador de SKU lee su patron de los ajustes en cada llamada, de modo
  // que cambiar el patron en Ajustes surte efecto sin reiniciar la aplicacion.
  const products = new ProductRepository(db, tags, () => {
    const current = settings.get()
    return { pattern: current.skuPattern, prefix: current.skuPrefix }
  })

  return {
    db,
    settings,
    categories: new CategoryRepository(db),
    locations: new LocationRepository(db),
    tags,
    platforms: new PlatformRepository(db),
    attributes: new AttributeRepository(db),
    products,
    listings: new ListingRepository(db),
    suppliers: new SupplierRepository(db),
    purchases: new PurchaseRepository(db, products),
    expenses: new ExpenseRepository(db),
    orders: new OrderRepository(db, products),
    tracking: new TrackingRepository(db)
  }
}
