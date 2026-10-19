import { describe, expect, it } from 'vitest'
import { buildAgeBuckets, buildDashboardSummary } from '@main/db/repositories/dashboard'
import { createTestContext, daysAgoIso } from './helpers'

describe('franjas de antiguedad', () => {
  it('construye franjas contiguas y sin huecos', () => {
    const buckets = buildAgeBuckets([30, 60, 90])
    expect(buckets.map((b) => b.label)).toEqual(['0-30', '30-60', '60-90', '90+'])
    expect(buckets.map((b) => b.whereSql)).toEqual([
      'age < 30 AND age >= 0',
      'age < 60 AND age >= 30',
      'age < 90 AND age >= 60',
      'age >= 90'
    ])
  })

  it('normaliza umbrales desordenados, repetidos o invalidos', () => {
    expect(buildAgeBuckets([90, 30, 30, 60]).map((b) => b.label)).toEqual([
      '0-30',
      '30-60',
      '60-90',
      '90+'
    ])
    expect(buildAgeBuckets([0, -5, Number.NaN])).toEqual([])
    expect(buildAgeBuckets([45]).map((b) => b.label)).toEqual(['0-45', '45+'])
  })
})

describe('resumen del panel', () => {
  it('calcula capital, ventas y beneficios con valores conocidos', () => {
    const ctx = createTestContext()

    // Disponible: coste 1200, precio previsto 3000
    ctx.repos.products.create({
      name: 'Disponible',
      status: 'available',
      purchaseDate: daysAgoIso(10),
      purchasePriceCents: 1000,
      acquisitionFeesCents: 200,
      expectedSalePriceCents: 3000
    })

    // Vendido: coste 5500, precio final 9000
    ctx.repos.products.create({
      name: 'Vendido',
      status: 'sold',
      purchasePriceCents: 5000,
      acquisitionFeesCents: 500,
      expectedSalePriceCents: 9500,
      finalSalePriceCents: 9000
    })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30, 60, 90] })

    expect(summary.totalItems).toBe(2)
    expect(summary.availableItems).toBe(1)
    expect(summary.soldItems).toBe(1)

    expect(summary.capitalInvestedCents).toBe(1200)
    expect(summary.inventoryRetailCents).toBe(3000)
    expect(summary.grossSalesCents).toBe(9000)
    expect(summary.realizedProfitCents).toBe(3500)
    expect(summary.potentialProfitCents).toBe(1800)

    ctx.close()
  })

  it('excluye los articulos archivados del capital invertido', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({
      name: 'Archivado',
      status: 'available',
      purchasePriceCents: 4000,
      expectedSalePriceCents: 9000
    })

    expect(buildDashboardSummary(ctx.db, { staleThresholds: [30] }).capitalInvestedCents).toBe(4000)

    ctx.repos.products.archive([product.id])
    const after = buildDashboardSummary(ctx.db, { staleThresholds: [30] })
    expect(after.capitalInvestedCents).toBe(0)
    expect(after.archivedItems).toBe(1)

    ctx.close()
  })

  it('cuenta articulos reservados y pendientes de preparar', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'P1', status: 'to_prepare' })
    ctx.repos.products.create({ name: 'P2', status: 'to_prepare' })
    ctx.repos.products.create({ name: 'R1', status: 'reserved' })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30, 60, 90] })
    expect(summary.toPrepareItems).toBe(2)
    expect(summary.reservedItems).toBe(1)
    ctx.close()
  })

  it('clasifica el inventario por antiguedad y acumula el capital', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({
      name: 'Reciente',
      status: 'available',
      purchaseDate: daysAgoIso(5),
      purchasePriceCents: 1000
    })
    ctx.repos.products.create({
      name: 'Medio',
      status: 'available',
      purchaseDate: daysAgoIso(45),
      purchasePriceCents: 2000
    })
    ctx.repos.products.create({
      name: 'Antiguo',
      status: 'available',
      purchaseDate: daysAgoIso(200),
      purchasePriceCents: 4000
    })
    // Un articulo vendido no cuenta como stock estancado.
    ctx.repos.products.create({
      name: 'Vendido antiguo',
      status: 'sold',
      purchaseDate: daysAgoIso(300),
      purchasePriceCents: 9999,
      finalSalePriceCents: 12000
    })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30, 60, 90] })
    const byBucket = new Map(summary.stolenByAge.map((b) => [b.bucket, b]))

    expect(byBucket.get('0-30')?.count).toBe(1)
    expect(byBucket.get('0-30')?.capitalCents).toBe(1000)
    expect(byBucket.get('30-60')?.count).toBe(1)
    expect(byBucket.get('30-60')?.capitalCents).toBe(2000)
    expect(byBucket.get('60-90')?.count).toBe(0)
    expect(byBucket.get('90+')?.count).toBe(1)
    expect(byBucket.get('90+')?.capitalCents).toBe(4000)

    ctx.close()
  })

  it('agrupa el inventario por categoria raiz', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'A', categoryId: 'cat-ropa-camisetas', purchasePriceCents: 1000 })
    ctx.repos.products.create({ name: 'B', categoryId: 'cat-ropa-sudaderas', purchasePriceCents: 2000 })
    ctx.repos.products.create({ name: 'C', categoryId: 'cat-tecnologia-moviles', purchasePriceCents: 5000 })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30] })
    // Camisetas y Sudaderas se agrupan bajo "Ropa": es lo util en el panel.
    const top = summary.topCategories[0]
    expect(top?.name).toBe('Ropa')
    expect(top?.count).toBe(2)
    expect(top?.capitalCents).toBe(3000)
    expect(summary.topCategories.map((c) => c.name)).toEqual(['Ropa', 'Tecnologia'])
    ctx.close()
  })

  it('agrupa bajo un nombre vacio los articulos sin categoria', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'Sin categoria', purchasePriceCents: 500 })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30] })
    expect(summary.topCategories).toHaveLength(1)
    expect(summary.topCategories[0]?.categoryId).toBeNull()
    expect(summary.topCategories[0]?.count).toBe(1)
    ctx.close()
  })

  it('registra la actividad reciente de las operaciones', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'Con actividad' })

    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30] })
    expect(summary.recentActivity.length).toBeGreaterThan(0)
    expect(summary.recentActivity[0]?.entity).toBe('product')
    ctx.close()
  })

  it('devuelve un panel vacio coherente cuando no hay datos', () => {
    const ctx = createTestContext()
    const summary = buildDashboardSummary(ctx.db, { staleThresholds: [30, 60, 90] })

    expect(summary.totalItems).toBe(0)
    expect(summary.capitalInvestedCents).toBe(0)
    expect(summary.realizedProfitCents).toBe(0)
    expect(summary.stolenByAge.every((b) => b.count === 0)).toBe(true)
    expect(summary.topCategories).toEqual([])
    ctx.close()
  })
})
