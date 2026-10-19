/**
 * RESALEVAULT - Utilidades compartidas por las pruebas.
 *
 * Las pruebas se ejecutan con Node directamente (no con Electron) porque la
 * capa de datos no depende de Electron: eso permite que la suite sea rapida y
 * que se pueda ejecutar en un servidor de integracion continua.
 */

import { Database } from '@main/db/database'
import { createRepositories, type Repositories } from '@main/db/context'
import { MIGRATIONS } from '@main/db/migrations'
import { runMigrations } from '@main/db/migrator'
import type { LocaleCode } from '@shared/types'

export interface TestContext {
  db: Database
  repos: Repositories
  close: () => void
}

/** Crea una base de datos en memoria con el esquema completo aplicado. */
export function createTestContext(locale: LocaleCode = 'es'): TestContext {
  const db = new Database({ file: ':memory:', wal: false })
  runMigrations(db, MIGRATIONS)
  const repos = createRepositories(db, locale)
  return {
    db,
    repos,
    close: () => db.close()
  }
}

/** Fecha ISO (YYYY-MM-DD) desplazada N dias hacia atras desde hoy. */
export function daysAgoIso(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Crea una ubicacion minima de almacen para las pruebas. */
export function createWarehouse(ctx: TestContext, code = 'ALM01', name = 'Almacen principal'): string {
  return ctx.repos.locations.create({ kind: 'warehouse', code, name }).id
}
