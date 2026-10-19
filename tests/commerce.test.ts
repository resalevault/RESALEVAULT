import { describe, expect, it } from 'vitest'
import { AppError } from '@main/errors'
import { createTestContext, daysAgoIso } from './helpers'

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio')
}

describe('compras', () => {
  it('reparte el envio entre los articulos y escribe su coste', () => {
    const ctx = createTestContext()
    const a = ctx.repos.products.create({ name: 'A', purchasePriceCents: 0 })
    const b = ctx.repos.products.create({ name: 'B', purchasePriceCents: 0 })

    const purchase = ctx.repos.purchases.create({
      reference: 'ALB-1',
      supplierName: 'Proveedor Demo',
      purchasedAt: daysAgoIso(10),
      shippingCents: 300,
      allocationMethod: 'by_cost',
      items: [
        { productId: a.id, quantity: 1, unitCostCents: 1000 },
        { productId: b.id, quantity: 1, unitCostCents: 2000 }
      ]
    })

    expect(purchase.itemsCostCents).toBe(3000)
    expect(purchase.extraCostCents).toBe(300)
    expect(purchase.totalCostCents).toBe(3300)

    // Reparto 1000:2000 sobre 300 -> 100 y 200.
    const productA = ctx.repos.products.get(a.id).product
    const productB = ctx.repos.products.get(b.id).product
    expect(productA.purchasePriceCents).toBe(1000)
    expect(productA.acquisitionFeesCents).toBe(100)
    expect(productB.purchasePriceCents).toBe(2000)
    expect(productB.acquisitionFeesCents).toBe(200)
    expect(productA.purchaseDate).toBe(daysAgoIso(10))

    // El historial refleja el cambio de coste.
    const history = ctx.repos.products.get(a.id).history
    expect(history.some((entry) => entry.action === 'purchase_cost')).toBe(true)

    ctx.close()
  })

  it('crea el proveedor si solo se da el nombre', () => {
    const ctx = createTestContext()
    ctx.repos.purchases.create({
      supplierName: 'Mayorista Norte',
      purchasedAt: daysAgoIso(1),
      items: [{ description: 'Lote', quantity: 5, unitCostCents: 200 }]
    })

    const suppliers = ctx.repos.suppliers.list()
    expect(suppliers).toHaveLength(1)
    expect(suppliers[0]?.name).toBe('Mayorista Norte')
    expect(suppliers[0]?.purchaseCount).toBe(1)
    ctx.close()
  })

  it('permite comprar un lote sin vincular y materializarlo despues', () => {
    const ctx = createTestContext()
    const purchase = ctx.repos.purchases.create({
      reference: 'LOTE-9',
      purchasedAt: daysAgoIso(3),
      shippingCents: 200,
      items: [
        { description: 'Camiseta lote', quantity: 2, unitCostCents: 500 },
        { description: 'Pantalon lote', quantity: 1, unitCostCents: 800 }
      ]
    })

    expect(purchase.items.every((item) => item.productId === null)).toBe(true)
    expect(ctx.repos.products.list().total).toBe(0)

    const result = ctx.repos.purchases.materialize(
      purchase.id,
      purchase.items.map((item) => item.id)
    )

    expect(result.created).toBe(2)
    expect(ctx.repos.products.list().total).toBe(2)

    // El coste de los articulos creados sale del lote.
    const created = ctx.repos.products.list({ sort: 'name_asc' })
    expect(created.items.some((item) => item.totalCostCents >= 500)).toBe(true)

    ctx.close()
  })

  it('rechaza compras sin lineas o sin fecha', () => {
    const ctx = createTestContext()
    expect(codeOf(() => ctx.repos.purchases.create({ purchasedAt: daysAgoIso(1), items: [] }))).toBe('invalid_input')
    expect(codeOf(() => ctx.repos.purchases.create({ purchasedAt: '', items: [{ quantity: 1, unitCostCents: 100 }] }))).toBe(
      'invalid_input'
    )
    ctx.close()
  })

  it('calcula la vista previa sin guardar nada', () => {
    const ctx = createTestContext()
    const preview = ctx.repos.purchases.previewAllocation({
      allocationMethod: 'equal',
      shippingCents: 100,
      items: [
        { quantity: 1, unitCostCents: 500 },
        { quantity: 1, unitCostCents: 900 }
      ]
    })

    expect(preview.lines.map((line) => line.allocatedExtraCents)).toEqual([50, 50])
    expect(ctx.repos.purchases.list()).toHaveLength(0)
    ctx.close()
  })

  it('elimina la compra pero conserva el coste del articulo', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'X' })
    const purchase = ctx.repos.purchases.create({
      purchasedAt: daysAgoIso(2),
      items: [{ productId: product.id, quantity: 1, unitCostCents: 777 }]
    })

    expect(ctx.repos.products.get(product.id).product.purchasePriceCents).toBe(777)
    const removed = ctx.repos.purchases.remove(purchase.id)
    expect(removed.affected).toBe(1)
    // El coste vigente del articulo NO se revierte: sigue siendo 777.
    expect(ctx.repos.products.get(product.id).product.purchasePriceCents).toBe(777)
    ctx.close()
  })
})

describe('gastos generales', () => {
  it('registra gastos y los agrupa por categoria y mes', () => {
    const ctx = createTestContext()
    ctx.repos.expenses.create({
      category: 'packaging',
      amountCents: 1500,
      incurredOn: '2026-01-10',
      description: 'Cajas'
    })
    ctx.repos.expenses.create({
      category: 'packaging',
      amountCents: 500,
      incurredOn: '2026-01-20'
    })
    ctx.repos.expenses.create({
      category: 'subscriptions',
      amountCents: 2000,
      incurredOn: '2026-02-01'
    })

    const summary = ctx.repos.expenses.summary()
    expect(summary.totalCents).toBe(4000)
    // Hay empate a 2000 entre dos categorias: se comprueba el contenido, no el orden.
    const packaging = summary.byCategory.find((entry) => entry.category === 'packaging')
    expect(packaging).toEqual({ category: 'packaging', totalCents: 2000, count: 2 })
    const subscriptions = summary.byCategory.find((entry) => entry.category === 'subscriptions')
    expect(subscriptions).toEqual({ category: 'subscriptions', totalCents: 2000, count: 1 })
    expect(summary.byMonth).toEqual([
      { month: '2026-01', totalCents: 2000 },
      { month: '2026-02', totalCents: 2000 }
    ])

    expect(ctx.repos.expenses.totalBetween('2026-01-01', '2026-01-31')).toBe(2000)
    ctx.close()
  })

  it('rechaza importes negativos', () => {
    const ctx = createTestContext()
    expect(
      codeOf(() =>
        ctx.repos.expenses.create({ category: 'other', amountCents: -100, incurredOn: '2026-01-01' })
      )
    ).toBe('invalid_input')
    ctx.close()
  })
})
