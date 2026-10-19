/**
 * RESALEVAULT - Prueba de humo dentro de Electron.
 *
 * Por que existe: las pruebas de `vitest` se ejecutan en Node, pero la
 * aplicacion real corre en Electron. Este script arranca Electron, abre una
 * base de datos REAL en disco, aplica las migraciones, ejercita los
 * repositorios y comprueba que los datos siguen ahi despues de cerrar y volver
 * a abrir. Es la verificacion de que la capa de datos funciona en el mismo
 * runtime en el que se ejecuta el producto.
 *
 * No toca los datos del usuario: trabaja en una carpeta temporal que ademas
 * limpia al terminar.
 *
 * Uso:  npm run smoke
 */

import { app } from 'electron'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrivateKey, sign } from 'node:crypto'
import { Database } from '@main/db/database'
import { createRepositories, type Repositories } from '@main/db/context'
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@main/db/migrations'
import { getSchemaVersion, runMigrations } from '@main/db/migrator'
import { buildDashboardSummary } from '@main/db/repositories/dashboard'
import { FinanceService } from '@main/services/finance'
import { IntelligenceService } from '@main/services/intelligence'
import { LabelService } from '@main/services/labels'
import { LicenseService, verifyLicenseCode } from '@main/services/license'
import { todayIso } from '@main/db/support'

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1
    process.stdout.write(`  ok   ${label}\n`)
  } else {
    failures.push(label + (detail ? ` -> ${detail}` : ''))
    process.stdout.write(`  FAIL ${label}${detail ? ` -> ${detail}` : ''}\n`)
  }
}

function section(title: string): void {
  process.stdout.write(`\n${title}\n${'-'.repeat(title.length)}\n`)
}

function run(): void {
  const workDir = mkdtempSync(join(tmpdir(), 'resalevault-smoke-'))
  const dbFile = join(workDir, 'resalevault.sqlite')

  process.stdout.write('\nRESALEVAULT - prueba de humo en Electron\n')
  process.stdout.write('=====================================\n')

  // -------------------------------------------------------------------------
  section('Apertura y migraciones')
  // -------------------------------------------------------------------------
  let db = new Database({ file: dbFile })
  const report = runMigrations(db, MIGRATIONS)
  check('se aplican todas las migraciones', report.applied.length === MIGRATIONS.length, JSON.stringify(report))
  check('el esquema queda en la ultima version', getSchemaVersion(db) === LATEST_SCHEMA_VERSION)
  check('journal_mode es WAL', String(db.pragma('journal_mode')).toLowerCase() === 'wal')
  check('las claves foraneas estan activas', Number(db.pragma('foreign_keys')) === 1)
  check('la comprobacion de integridad pasa', db.scalar('PRAGMA integrity_check') === 'ok')

  let repos: Repositories = createRepositories(db, 'es')

  // -------------------------------------------------------------------------
  section('Datos base')
  // -------------------------------------------------------------------------
  check('hay 7 estados de producto', repos.db.scalar<number>('SELECT COUNT(*) AS v FROM product_statuses') === 7)
  check('hay al menos 12 plataformas', repos.platforms.list().length >= 12)
  check('hay categorias sembradas', repos.categories.list().length > 10)

  // -------------------------------------------------------------------------
  section('Ubicaciones jerarquicas')
  // -------------------------------------------------------------------------
  const warehouse = repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
  const shelf = repos.locations.create({
    kind: 'shelf',
    code: 'EST03',
    name: 'Estanteria 3',
    parentId: warehouse.id
  })
  const box = repos.locations.create({
    kind: 'box',
    code: 'CAJA12',
    name: 'Caja 12',
    parentId: shelf.id
  })
  check('la ruta completa se construye bien', box.path === 'ALM01-EST03-CAJA12', box.path)
  check('la profundidad se calcula bien', box.depth === 2)

  let hierarchyRejected = false
  try {
    repos.locations.create({ kind: 'box', code: 'MAL', name: 'Invalida', parentId: warehouse.id })
  } catch {
    hierarchyRejected = true
  }
  check('se rechaza una jerarquia invalida', hierarchyRejected)

  // -------------------------------------------------------------------------
  section('Articulos')
  // -------------------------------------------------------------------------
  const first = repos.products.create({
    name: 'Camiseta de prueba',
    categoryId: 'cat-ropa-camisetas',
    brand: 'MarcaDemo',
    condition: 'good',
    locationId: box.id,
    purchasePriceCents: 1000,
    acquisitionFeesCents: 200,
    expectedSalePriceCents: 3000,
    tags: ['smoke', 'lote-1']
  })
  check('el SKU automatico usa el patron configurado', /^RV-CAM-\d{4}-0001$/.test(first.sku), first.sku)

  const second = repos.products.create({
    name: 'Movil de prueba',
    categoryId: 'cat-tecnologia-moviles',
    purchasePriceCents: 9000,
    expectedSalePriceCents: 15000
  })
  check('el segundo SKU incrementa la secuencia', second.sku.endsWith('-0002'), second.sku)

  let duplicateRejected = false
  try {
    repos.products.create({ name: 'Duplicado', sku: first.sku })
  } catch {
    duplicateRejected = true
  }
  check('se rechaza un SKU duplicado', duplicateRejected)

  const listed = repos.products.list({ pageSize: 10, sort: 'name_asc' })
  check('el listado devuelve los dos articulos', listed.total === 2, String(listed.total))
  check('el total de coste se calcula', listed.items[0]!.totalCostCents === 1200 || listed.items[1]!.totalCostCents === 1200)

  const search = repos.products.list({ search: 'camiseta' })
  check('la busqueda por texto encuentra el articulo', search.total === 1)

  const byCategory = repos.products.list({ categoryIds: ['cat-tecnologia'] })
  check('el filtro por categoria incluye subcategorias', byCategory.total === 1)

  const byLocation = repos.products.list({ locationIds: [warehouse.id] })
  check('el filtro por almacen incluye sus cajas', byLocation.total === 1)

  const detail = repos.products.get(first.id)
  check('las etiquetas se guardan', detail.tags.length === 2, String(detail.tags.length))
  check('el historial registra la creacion', detail.history.some((entry) => entry.action === 'created'))

  // -------------------------------------------------------------------------
  section('Actualizacion, historial y edicion masiva')
  // -------------------------------------------------------------------------
  repos.products.update(first.id, { expectedSalePriceCents: 3500, status: 'available' })
  const afterUpdate = repos.products.get(first.id)
  check('el cambio de precio persiste', afterUpdate.product.expectedSalePriceCents === 3500)
  check(
    'el historial registra el cambio de precio',
    afterUpdate.history.some((entry) => entry.field === 'expected_sale_price_cents')
  )

  const preview = repos.products.bulkPreview({
    ids: [first.id, second.id],
    status: 'reserved',
    priceAdjustment: { mode: 'percent', value: 10 }
  })
  check('la vista previa cuenta los articulos afectados', preview.affected === 2, String(preview.affected))

  const bulk = repos.products.bulkUpdate({
    ids: [first.id, second.id],
    status: 'reserved',
    priceAdjustment: { mode: 'percent', value: 10 }
  })
  check('la edicion masiva se aplica', bulk.affected === 2)
  check(
    'el precio se ha ajustado un 10 por ciento',
    repos.products.get(first.id).product.expectedSalePriceCents === 3850,
    String(repos.products.get(first.id).product.expectedSalePriceCents)
  )

  // -------------------------------------------------------------------------
  section('Panel y formulas')
  // -------------------------------------------------------------------------
  const summary = buildDashboardSummary(db, { staleThresholds: [30, 60, 90] })
  check('el capital invertido suma los costes del inventario no vendido', summary.capitalInvestedCents === 1200 + 9000, String(summary.capitalInvestedCents))
  check('el valor previsto suma los precios previstos', summary.inventoryRetailCents === 3850 + 16500, String(summary.inventoryRetailCents))
  check('hay dos articulos reservados', summary.reservedItems === 2)
  check('no hay ventas todavia', summary.grossSalesCents === 0)

  // Se simula una venta real para comprobar el calculo del beneficio bruto.
  repos.products.update(second.id, { status: 'sold', finalSalePriceCents: 15500 })
  const sold = buildDashboardSummary(db, { staleThresholds: [30] })
  check('las ventas brutas recogen el precio final', sold.grossSalesCents === 15500, String(sold.grossSalesCents))
  check(
    'el beneficio bruto es precio final menos coste',
    sold.realizedProfitCents === 15500 - 9000,
    String(sold.realizedProfitCents)
  )

  // -------------------------------------------------------------------------
  section('Archivado y eliminacion')
  // -------------------------------------------------------------------------
  repos.products.archive([first.id])
  check('el articulo archivado sale del listado', repos.products.list().total === 1)
  check('el filtro de archivados lo encuentra', repos.products.list({ onlyArchived: true }).total === 1)

  let deleteRejected = false
  try {
    repos.products.remove([second.id])
  } catch {
    deleteRejected = true
  }
  check('no se puede eliminar sin archivar antes', deleteRejected)

  repos.products.restore([first.id])
  check('la restauracion recupera el estado anterior', repos.products.get(first.id).product.status === 'reserved')

  // -------------------------------------------------------------------------
  section('Compras y reparto de costes')
  // -------------------------------------------------------------------------
  const purchaseProduct = repos.products.create({
    name: 'Articulo de compra',
    purchasePriceCents: 0,
    expectedSalePriceCents: 4000,
    status: 'available'
  })

  const purchase = repos.purchases.create({
    reference: 'COMPRA-1',
    supplierName: 'Proveedor de prueba',
    purchasedAt: todayIso(new Date()),
    shippingCents: 300,
    allocationMethod: 'by_cost',
    items: [{ productId: purchaseProduct.id, quantity: 1, unitCostCents: 1000 }]
  })

  check('la compra suma lineas y gastos', purchase.totalCostCents === 1300, String(purchase.totalCostCents))
  const afterPurchase = repos.products.get(purchaseProduct.id).product
  check('el coste del articulo recibe el precio', afterPurchase.purchasePriceCents === 1000)
  check('el envio se reparte al articulo', afterPurchase.acquisitionFeesCents === 300)
  check(
    'el historial registra el cambio de coste',
    repos.products.get(purchaseProduct.id).history.some((entry) => entry.action === 'purchase_cost')
  )

  // -------------------------------------------------------------------------
  section('Pedidos y beneficio NETO')
  // -------------------------------------------------------------------------
  const order = repos.orders.create({
    soldAt: todayIso(new Date()),
    shippingChargedCents: 500,
    shippingCostCents: 400,
    discountCents: 100,
    items: [{ productId: purchaseProduct.id, unitPriceCents: 4000 }],
    fees: [{ kind: 'commission', amountCents: 400 }]
  })

  // ingreso neto = 4000 - 100 + 500 = 4400
  // beneficio neto = 4400 - 1300 (coste con envio) - 400 (comision) - 400 (envio) = 2300
  check('el ingreso neto del pedido es correcto', order.financials.netRevenueCents === 4400, String(order.financials.netRevenueCents))
  check('el beneficio es NETO (descuenta todo)', order.financials.netProfitCents === 2300, String(order.financials.netProfitCents))
  check('el articulo queda vendido', repos.products.get(purchaseProduct.id).product.status === 'sold')

  let doubleSellRejected = false
  try {
    repos.orders.create({
      soldAt: todayIso(new Date()),
      items: [{ productId: purchaseProduct.id, unitPriceCents: 5000 }]
    })
  } catch {
    doubleSellRejected = true
  }
  check('no se puede vender dos veces el mismo articulo', doubleSellRejected)

  const returned = repos.orders.addReturn({
    orderId: order.id,
    returnedAt: todayIso(new Date()),
    refundCents: 4000,
    feeRefundCents: 200,
    shippingLostCents: 300
  })
  check('la devolucion cambia el estado del pedido', returned.status === 'returned')
  check(
    'la devolucion descuenta el reembolso',
    returned.financials.netProfitCents === 2300 - 4000 + 200 - 300,
    String(returned.financials.netProfitCents)
  )
  check('el articulo vuelve al inventario', repos.products.get(purchaseProduct.id).product.status === 'returned')

  // -------------------------------------------------------------------------
  section('Informes financieros')
  // -------------------------------------------------------------------------
  const finance = new FinanceService(db, [30, 60, 90])
  const crossCheck = finance.crossCheckOrder(order.id)
  check('el calculo SQL y el de TypeScript coinciden', crossCheck.match, JSON.stringify(crossCheck))

  const financeReport = finance.report({})
  check('el informe cuenta los pedidos', financeReport.orders.count >= 1)
  check('el informe calcula el beneficio neto', financeReport.orders.netProfitCents !== 0)
  check('el informe incluye gastos generales', financeReport.expenses.totalCents >= 0)

  // -------------------------------------------------------------------------
  section('Etiquetas, inteligencia y licencias')
  // -------------------------------------------------------------------------
  const labels = new LabelService(db)
  const sheet = labels.buildProductSheet([first.id], { symbology: 'qrcode' })
  check('se genera el SVG del codigo QR', sheet.items[0]?.barcodeSvg.includes('<svg') === true)
  const linearSheet = labels.buildProductSheet([first.id], { symbology: 'code128' })
  check('se genera el codigo de barras 128', linearSheet.items[0]?.barcodeSvg.includes('<svg') === true)

  const intelligence = new IntelligenceService(db)
  const insights = intelligence.report()
  check('intelligence evalua reglas y devuelve alertas', insights.rulesRun > 0)
  check(
    'cada alerta declara los datos en los que se basa',
    insights.insights.every((entry) => entry.facts.length > 0)
  )
  intelligence.setThresholds({ staleDays: 45 })
  check('los umbrales se guardan', intelligence.getThresholds().staleDays === 45)

  const licenseService = new LicenseService(db)
  const freeState = licenseService.state()
  check('sin licencia el plan es Free', freeState.plan === 'free')
  check('los limites del plan Free se aplican', freeState.limits.maxProducts === 150)
  check('el identificador de equipo es estable', licenseService.deviceId() === licenseService.deviceId())

  // Firma de una licencia de prueba con la clave PRIVADA del proyecto (que no
  // se empaqueta) y verificacion con la PUBLICA que lleva la aplicacion.
  const privateKeyFile = join(process.cwd(), 'tools', 'keys', 'license-private.pem')
  if (existsSync(privateKeyFile)) {
    const payload = {
      v: 1,
      id: 'lic_smoke',
      plan: 'pro',
      kind: 'founder',
      holder: 'Prueba',
      issuedAt: new Date().toISOString(),
      expiresAt: null,
      seats: 1
    }
    const raw = Buffer.from(JSON.stringify(payload), 'utf8')
    const signature = sign(null, raw, createPrivateKey(readFileSync(privateKeyFile, 'utf8')))
    const toUrl = (buffer: Buffer): string =>
      buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const code = `${toUrl(raw)}.${toUrl(signature)}`

    check('la clave publica de la app valida una licencia firmada', verifyLicenseCode(code).ok)
    const activated = licenseService.activate({ code })
    check('la licencia se activa y sube el plan', activated.plan === 'pro', activated.plan)
    check('el plan Pro desbloquea analitica', licenseService.can('analytics'))

    const deactivated = licenseService.deactivate()
    check('al desactivar se vuelve a Free', deactivated.plan === 'free')
  }

  // -------------------------------------------------------------------------
  section('Persistencia: cerrar y volver a abrir')
  // -------------------------------------------------------------------------
  const skuBefore = repos.products.get(first.id).product.sku
  db.close()
  check('el archivo de base de datos existe', existsSync(dbFile))
  check('el archivo tiene contenido', statSync(dbFile).size > 0)

  db = new Database({ file: dbFile })
  const reopenReport = runMigrations(db, MIGRATIONS)
  repos = createRepositories(db, 'es')
  check('no se vuelven a aplicar migraciones', reopenReport.applied.length === 0)
  check('los datos siguen ahi tras reabrir', repos.products.list({ includeArchived: true }).total === 3, String(repos.products.list({ includeArchived: true }).total))
  check('el SKU se conserva', repos.products.get(first.id).product.sku === skuBefore)
  check(
    'el historial se conserva',
    repos.products.get(first.id).history.length > 0,
    String(repos.products.get(first.id).history.length)
  )
  check('la actividad se conserva', Number(repos.db.scalar<number>('SELECT COUNT(*) AS v FROM activity_log') ?? 0) > 0)

  db.close()

  // Limpieza.
  rmSync(workDir, { recursive: true, force: true })

  // -------------------------------------------------------------------------
  // Se escribe de forma SINCRONA: `app.exit()` termina el proceso de inmediato
  // y una escritura asincrona por tuberia podria perderse.
  writeSync(
    1,
    `\nResultado: ${passed} comprobaciones correctas, ${failures.length} fallidas\n` +
      (failures.length > 0
        ? failures.map((failure) => `  - ${failure}\n`).join('')
        : 'TODO CORRECTO\n') +
      '\n'
  )

  app.exit(failures.length === 0 ? 0 : 1)
}

app.whenReady().then(() => {
  try {
    run()
  } catch (error) {
    process.stderr.write(`\nERROR NO CONTROLADO: ${(error as Error).stack ?? String(error)}\n`)
    app.exit(1)
  }
})
