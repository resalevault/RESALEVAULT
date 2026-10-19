import { describe, expect, it } from 'vitest'
import { FinanceService } from '@main/services/finance'
import { createTestContext, daysAgoIso } from './helpers'

function seed() {
  const ctx = createTestContext()

  const a = ctx.repos.products.create({
    name: 'Camiseta',
    categoryId: 'cat-ropa-camisetas',
    purchasePriceCents: 1000,
    acquisitionFeesCents: 200,
    expectedSalePriceCents: 3000,
    status: 'available'
  })
  const b = ctx.repos.products.create({
    name: 'Sudadera',
    categoryId: 'cat-ropa-sudaderas',
    purchasePriceCents: 2000,
    acquisitionFeesCents: 0,
    expectedSalePriceCents: 5000,
    status: 'available'
  })
  const c = ctx.repos.products.create({
    name: 'Movil',
    categoryId: 'cat-tecnologia-moviles',
    purchasePriceCents: 9000,
    expectedSalePriceCents: 15000,
    status: 'available'
  })

  const order1 = ctx.repos.orders.create({
    soldAt: '2026-01-15',
    shippingChargedCents: 500,
    shippingCostCents: 400,
    discountCents: 100,
    items: [{ productId: a.id, unitPriceCents: 3000 }],
    fees: [{ kind: 'commission', amountCents: 300 }]
  })

  const order2 = ctx.repos.orders.create({
    soldAt: '2026-02-10',
    buyer: 'Cliente',
    items: [{ productId: b.id, unitPriceCents: 5000, quantity: 1 }],
    fees: [{ kind: 'payment', amountCents: 150 }]
  })

  // Un movil que se devuelve.
  const order3 = ctx.repos.orders.create({
    soldAt: '2026-02-20',
    items: [{ productId: c.id, unitPriceCents: 15000 }],
    fees: [{ kind: 'commission', amountCents: 1500 }]
  })
  ctx.repos.orders.addReturn({
    orderId: order3.id,
    returnedAt: '2026-02-25',
    refundCents: 15000,
    feeRefundCents: 700,
    shippingLostCents: 500,
    restock: true
  })

  ctx.repos.expenses.create({ category: 'packaging', amountCents: 800, incurredOn: '2026-01-20' })
  ctx.repos.expenses.create({ category: 'subscriptions', amountCents: 1200, incurredOn: '2026-02-01' })

  return { ctx, order1, order2, order3 }
}

describe('informes financieros', () => {
  it('el calculo agregado en SQL coincide al centimo con el detalle en TypeScript', () => {
    const { ctx, order1, order2, order3 } = seed()
    const finance = new FinanceService(ctx.db, [30, 60, 90])

    for (const order of [order1, order2, order3]) {
      const check = finance.crossCheckOrder(order.id)
      expect(check.sqlCents, `pedido ${order.orderNumber}`).toBe(check.typescriptCents)
      expect(check.match).toBe(true)
    }

    ctx.close()
  })

  it('agrega ingresos, costes y beneficio NETO del periodo', () => {
    const { ctx } = seed()
    const report = new FinanceService(ctx.db, [30, 60, 90]).report({ from: '2026-01-01', to: '2026-12-31' })

    expect(report.orders.count).toBe(3)
    expect(report.orders.units).toBe(3)

    // Pedido 1: neto 3400 - 1200 - 300 - 400 = 1500
    // Pedido 2: neto 5000 - 2000 - 150 = 2850
    // Pedido 3 (devuelto): 15000 - 9000 - 1500 - 15000 + 700 - 500 = -10300
    expect(report.orders.netProfitCents).toBe(1500 + 2850 - 10300)
    expect(report.orders.goodsRevenueCents).toBe(3000 + 5000 + 15000)
    expect(report.orders.goodsCostCents).toBe(1200 + 2000 + 9000)
    expect(report.orders.feesCents).toBe(300 + 150 + 1500)
    expect(report.orders.refundsCents).toBe(15000)
    expect(report.orders.feesRefundedCents).toBe(700)
    expect(report.orders.shippingLostCents).toBe(500)

    // Gastos generales: 800 + 1200.
    expect(report.expenses.totalCents).toBe(2000)
    // Beneficio del negocio = pedidos - gastos generales.
    expect(report.business.netProfitCents).toBe(1500 + 2850 - 10300 - 2000)
    ctx.close()
  })

  it('filtra por periodo', () => {
    const { ctx } = seed()
    const finance = new FinanceService(ctx.db, [30, 60, 90])

    const january = finance.report({ from: '2026-01-01', to: '2026-01-31' })
    expect(january.orders.count).toBe(1)
    expect(january.expenses.totalCents).toBe(800)

    const february = finance.report({ from: '2026-02-01', to: '2026-02-28' })
    expect(february.orders.count).toBe(2)
    expect(february.expenses.totalCents).toBe(1200)
    ctx.close()
  })

  it('desglosa por mes y por categoria sin repartir costes inventados', () => {
    const { ctx } = seed()
    const report = new FinanceService(ctx.db, [30]).report()

    expect(report.byMonth.map((entry) => entry.month)).toEqual(['2026-01', '2026-02'])

    const clothing = report.byCategory.find((entry) => entry.name === 'Ropa')
    expect(clothing?.units).toBe(2)
    // Por categoria solo se publica el resultado DIRECTO de la mercancia.
    expect(clothing?.goodsRevenueCents).toBe(3000 + 5000)
    expect(clothing?.goodsCostCents).toBe(1200 + 2000)
    expect(clothing?.grossProfitCents).toBe(4800)

    const technology = report.byCategory.find((entry) => entry.name === 'Tecnologia')
    expect(technology?.goodsRevenueCents).toBe(15000)
    ctx.close()
  })

  it('calcula la tasa de devoluciones', () => {
    const { ctx } = seed()
    const report = new FinanceService(ctx.db, [30]).report()
    // 1 pedido con devolucion de 3.
    expect(report.returnsRatePercent).toBeCloseTo((1 / 3) * 100, 6)
    ctx.close()
  })

  it('el inventario y las franjas de antiguedad usan solo lo no vendido', () => {
    const { ctx } = seed()
    const extra = ctx.repos.products.create({
      name: 'Antiguo',
      purchaseDate: daysAgoIso(200),
      purchasePriceCents: 4000,
      expectedSalePriceCents: 9000,
      status: 'available'
    })
    void extra

    const report = new FinanceService(ctx.db, [30, 60, 90]).report()
    // El movil devuelto VUELVE al inventario (estado `returned`), asi que cuenta.
    // Solo los estados sold/shipped se excluyen del capital inmovilizado.
    expect(report.inventory.units).toBe(2)
    expect(report.inventory.capitalCents).toBe(9000 + 4000)
    expect(report.inventory.staleBuckets.find((bucket) => bucket.bucket === '90+')?.count).toBe(1)
    ctx.close()
  })

  it('un periodo sin datos devuelve ceros coherentes y no rompe', () => {
    const ctx = createTestContext()
    const report = new FinanceService(ctx.db, [30, 60, 90]).report()

    expect(report.orders.count).toBe(0)
    expect(report.orders.netProfitCents).toBe(0)
    expect(report.orders.marginPercent).toBeNull()
    expect(report.returnsRatePercent).toBeNull()
    expect(report.byPlatform).toEqual([])
    expect(report.business.netProfitCents).toBe(0)
    ctx.close()
  })
})
