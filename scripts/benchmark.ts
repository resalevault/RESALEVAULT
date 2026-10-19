/**
 * RESALEVAULT - Banco de pruebas de rendimiento.
 *
 * Mide con datos REALES (50.000 articulos + 1.000 pedidos) sobre una base de
 * datos en disco, usando la MISMA capa de datos que la aplicacion. No hay
 * numeros inventados: cada cifra se mide con `performance.now()`.
 *
 * Se ejecuta en Node (no en Electron) porque la capa de datos no depende de
 * Electron. Asi el banco es rapido y se puede repetir en CI.
 *
 * Uso:  npm run bench
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from '@main/db/database'
import { createRepositories, type Repositories } from '@main/db/context'
import { MIGRATIONS } from '@main/db/migrations'
import { runMigrations } from '@main/db/migrator'
import { buildDashboardSummary } from '@main/db/repositories/dashboard'
import { FinanceService } from '@main/services/finance'
import { CsvService } from '@main/services/csv-io'
import { BackupService } from '@main/services/backup/service'
import { IntelligenceService } from '@main/services/intelligence'

const PRODUCTS = 50_000
const ORDERS = 1_000
const CATEGORIES = [
  'cat-ropa-camisetas',
  'cat-ropa-sudaderas',
  'cat-tecnologia-moviles',
  'cat-coleccionables-cartas',
  'cat-hogar-decoracion'
]
const STATUSES = ['available', 'available', 'available', 'to_prepare', 'reserved', 'sold']

interface Measurement {
  label: string
  ms: number
  detail?: string
}

const results: Measurement[] = []

function measure(label: string, fn: () => void, detail?: string): void {
  const start = performance.now()
  fn()
  const ms = performance.now() - start
  results.push({ label, ms, detail })
  process.stdout.write(`  ${label.padEnd(44)} ${ms.toFixed(1).padStart(9)} ms  ${detail ?? ''}\n`)
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0) + ' MB'
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

function seed(db: Database, repos: Repositories): void {
  const now = new Date().toISOString()

  process.stdout.write(`\nSembrando ${PRODUCTS.toLocaleString('es-ES')} articulos...\n`)
  const seedStart = performance.now()

  db.transaction(() => {
    for (let index = 0; index < PRODUCTS; index += 1) {
      const status = STATUSES[index % STATUSES.length] as string
      const cost = 500 + (index % 200) * 25
      const expected = Math.round(cost * (1.4 + (index % 10) / 20))
      const id = `p-${index}`
      db.run(
        `INSERT INTO products (id, sku, name, description, category_id, brand, condition, status,
            attributes, purchase_date, purchase_price_cents, acquisition_fees_cents,
            expected_sale_price_cents, private_notes, is_demo, created_at, updated_at)
         VALUES ($id, $sku, $name, $description, $category, $brand, 'good', $status,
            '{}', $purchaseDate, $cost, 100, $expected, '', 0, $at, $at)`,
        {
          $id: id,
          $sku: `RV-${String(index).padStart(6, '0')}`,
          $name: `Articulo de prueba ${index}`,
          $description: 'Descripcion de prueba para medir busquedas y listados.',
          $category: CATEGORIES[index % CATEGORIES.length] as string,
          $brand: `Marca${index % 40}`,
          $status: status,
          $purchaseDate: isoDaysAgo(index % 400),
          $cost: cost,
          $expected: expected,
          $at: now
        }
      )
    }
  })

  process.stdout.write(`  sembrado en ${((performance.now() - seedStart) / 1000).toFixed(1)} s\n`)

  // Pedidos sobre articulos distintos (uno por pedido, sin reutilizar).
  process.stdout.write(`Sembrando ${ORDERS.toLocaleString('es-ES')} pedidos...\n`)
  db.transaction(() => {
    for (let index = 0; index < ORDERS; index += 1) {
      const orderId = `o-${index}`
      const productIndex = index * 40
      const price = 5000 + (index % 50) * 100
      const cost = 2000 + (index % 30) * 50
      const soldAt = isoDaysAgo(index % 300)

      db.run(
        `INSERT INTO orders (id, order_number, sold_at, status, shipping_charged_cents,
            shipping_cost_cents, discount_cents, other_cents, notes, is_demo, created_at, updated_at)
         VALUES ($id, $number, $soldAt, 'shipped', 400, 350, 0, 0, '', 0, $at, $at)`,
        { $id: orderId, $number: `RV-BENCH-${index}`, $soldAt: soldAt, $at: now }
      )
      db.run(
        `INSERT INTO order_items (id, order_id, product_id, sku, title, quantity,
            unit_price_cents, unit_cost_cents, created_at)
         VALUES ($id, $order, $product, $sku, $title, 1, $price, $cost, $at)`,
        {
          $id: `oi-${index}`,
          $order: orderId,
          $product: `p-${productIndex}`,
          $sku: `RV-${String(productIndex).padStart(6, '0')}`,
          $title: `Articulo vendido ${index}`,
          $price: price,
          $cost: cost,
          $at: now
        }
      )
      db.run(
        `INSERT INTO order_fees (id, order_id, kind, label, amount_cents, created_at)
         VALUES ($id, $order, 'commission', 'Comision', $amount, $at)`,
        { $id: `of-${index}`, $order: orderId, $amount: Math.round(price * 0.1), $at: now }
      )
    }
  })
  void repos
}

function main(): void {
  const workDir = mkdtempSync(join(tmpdir(), 'resalevault-bench-'))
  const dbFile = join(workDir, 'bench.sqlite')

  process.stdout.write('\nRESALEVAULT - banco de pruebas\n')
  process.stdout.write('==============================\n')

  // -------------------------------------------------------------------------
  process.stdout.write('\n[1] Apertura y migraciones\n')
  // -------------------------------------------------------------------------
  let db!: Database
  measure('abrir base de datos nueva + migrar', () => {
    db = new Database({ file: dbFile })
    runMigrations(db, MIGRATIONS)
  })

  const repos = createRepositories(db, 'es')
  seed(db, repos)

  measure('integridad (PRAGMA integrity_check)', () => {
    const value = db.scalar<string>('PRAGMA integrity_check')
    if (value !== 'ok') throw new Error('integridad: ' + String(value))
  })
  measure('optimizar indices (PRAGMA optimize)', () => {
    db.exec('PRAGMA optimize')
  })

  // -------------------------------------------------------------------------
  process.stdout.write('\n[2] Consultas de inventario\n')
  // -------------------------------------------------------------------------
  measure('listar pagina 1 (50)', () => {
    repos.products.list({ page: 1, pageSize: 50 })
  })
  measure('listar pagina 500 (50)', () => {
    repos.products.list({ page: 500, pageSize: 50 })
  })
  measure('busqueda por texto ("Articulo de prueba 1234")', () => {
    repos.products.list({ search: 'Articulo de prueba 1234', pageSize: 50 })
  })
  measure('busqueda por SKU exacto', () => {
    repos.products.list({ search: 'RV-012345', pageSize: 50 })
  })
  measure('filtrar por categoria (con descendientes)', () => {
    repos.products.list({ categoryIds: ['cat-ropa'], pageSize: 50 })
  })
  measure('filtrar por estado + ordenar por coste', () => {
    repos.products.list({ status: ['available'], sort: 'cost_desc', pageSize: 50 })
  })
  measure('filtrar por antiguedad (>=90 dias)', () => {
    repos.products.list({ minAgeDays: 90, pageSize: 50 })
  })
  measure('agregado de capital (aggregate)', () => {
    repos.products.aggregate({ status: ['available'] })
  })

  // -------------------------------------------------------------------------
  process.stdout.write('\n[3] Escritura\n')
  // -------------------------------------------------------------------------
  measure('crear 100 articulos (con historial)', () => {
    for (let index = 0; index < 100; index += 1) {
      repos.products.create({
        name: `Nuevo ${index}`,
        purchasePriceCents: 1000,
        expectedSalePriceCents: 3000
      })
    }
  }, 'incluye SKU, historial y actividad')

  const ids = repos.products.list({ pageSize: 100 }).items.map((item) => item.id)
  measure('editar 100 articulos', () => {
    for (const id of ids) repos.products.update(id, { brand: 'Editada' })
  })
  measure('edicion masiva de 100 articulos', () => {
    repos.products.bulkUpdate({ ids, status: 'reserved' })
  })
  measure('archivar 100 articulos', () => {
    repos.products.archive(ids)
  })

  // -------------------------------------------------------------------------
  process.stdout.write('\n[4] Panel, informes e inteligencia\n')
  // -------------------------------------------------------------------------
  measure('panel de resumen', () => {
    buildDashboardSummary(db, { staleThresholds: [30, 60, 90] })
  })
  measure('informe financiero completo', () => {
    new FinanceService(db, [30, 60, 90]).report({})
  })
  measure('inteligencia (12 reglas)', () => {
    new IntelligenceService(db).report()
  })

  // -------------------------------------------------------------------------
  process.stdout.write('\n[5] Exportacion y copias de seguridad\n')
  // -------------------------------------------------------------------------
  const finance = new FinanceService(db, [30, 60, 90])
  const csv = new CsvService(repos, finance, () => 'es')
  const csvPath = join(workDir, 'export.csv')

  measure('exportar 50.000 articulos a CSV', () => {
    csv.exportData({ path: csvPath, format: 'products', delimiter: ';' })
  })
  process.stdout.write(`  ${'(tamano del CSV)'.padEnd(44)} ${String(mb(statSync(csvPath).size)).padStart(9)}\n`)

  const backupsDir = join(workDir, 'backups')
  const mediaDir = join(workDir, 'media')
  const backups = new BackupService(db, {
    appVersion: '0.5.0-bench',
    dataDir: workDir,
    mediaDir,
    backupsDir,
    databaseFile: dbFile
  })

  let backupPath = ''
  measure('crear copia de seguridad (ZIP)', () => {
    backupPath = backups.create().path
  }, mb(statSync(dbFile).size) + ' de base')
  measure('verificar copia (CRC + integrity_check)', () => {
    const verification = backups.verify(backupPath)
    if (!verification.ok) throw new Error('copia no valida: ' + String(verification.reason))
  })
  measure('preparar restauracion (validar y extraer)', () => {
    const preparation = backups.prepareRestore(backupPath)
    if (!preparation.ok) throw new Error('restauracion no valida')
  })
  backups.cancelRestore()

  // -------------------------------------------------------------------------
  process.stdout.write('\n[6] Memoria\n')
  // -------------------------------------------------------------------------
  const memory = process.memoryUsage()
  process.stdout.write(`  RSS: ${mb(memory.rss)} · heap usado: ${mb(memory.heapUsed)}\n`)

  const dbSize = statSync(dbFile).size
  process.stdout.write(`  Tamano de la base: ${mb(dbSize)}\n`)
  process.stdout.write(`  Articulos: ${PRODUCTS.toLocaleString('es-ES')} · pedidos: ${ORDERS}\n`)

  // -------------------------------------------------------------------------
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3)
  process.stdout.write('\n[7] Operaciones mas lentas\n')
  for (const entry of slowest) {
    process.stdout.write(`  ${entry.label.padEnd(44)} ${entry.ms.toFixed(1).padStart(9)} ms\n`)
  }

  db.close()
  rmSync(workDir, { recursive: true, force: true })
  process.stdout.write('\nListo.\n')
}

main()
