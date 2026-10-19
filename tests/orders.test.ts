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

function seedProduct(ctx: ReturnType<typeof createTestContext>, options: { price: number; cost: number }): string {
  return ctx.repos.products.create({
    name: 'Articulo vendible',
    purchasePriceCents: options.cost,
    acquisitionFeesCents: 200,
    expectedSalePriceCents: options.price,
    status: 'available'
  }).id
}

describe('pedidos: alta y beneficio neto', () => {
  it('crea el pedido, congela el coste y calcula el beneficio NETO', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })

    const order = ctx.repos.orders.create({
      soldAt: daysAgoIso(1),
      shippingChargedCents: 500,
      shippingCostCents: 400,
      discountCents: 100,
      items: [{ productId, unitPriceCents: 3000 }],
      fees: [{ kind: 'commission', amountCents: 300 }]
    })

    expect(order.orderNumber).toMatch(/^RV-\d{4}-0001$/)
    expect(order.items[0]?.unitCostCents).toBe(1200)
    expect(order.financials.netRevenueCents).toBe(3400)
    expect(order.financials.netProfitCents).toBe(1500)
    expect(order.financials.marginPercent).toBeCloseTo((1500 / 3400) * 100, 6)

    // El articulo queda vendido con su precio final.
    const product = ctx.repos.products.get(productId).product
    expect(product.status).toBe('sold')
    expect(product.finalSalePriceCents).toBe(3000)
    ctx.close()
  })

  it('no permite vender dos veces el mismo articulo', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 2000, cost: 800 })

    ctx.repos.orders.create({ soldAt: daysAgoIso(2), items: [{ productId, unitPriceCents: 2000 }] })

    expect(
      codeOf(() =>
        ctx.repos.orders.create({ soldAt: daysAgoIso(1), items: [{ productId, unitPriceCents: 2200 }] })
      )
    ).toBe('conflict')
    ctx.close()
  })

  it('rechaza articulos archivados', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 1000, cost: 500 })
    ctx.repos.products.archive([productId])

    expect(
      codeOf(() => ctx.repos.orders.create({ soldAt: daysAgoIso(1), items: [{ productId, unitPriceCents: 1000 }] }))
    ).toBe('conflict')
    ctx.close()
  })

  it('rechaza el mismo articulo repetido en un pedido', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 1000, cost: 500 })

    expect(
      codeOf(() =>
        ctx.repos.orders.create({
          soldAt: daysAgoIso(1),
          items: [
            { productId, unitPriceCents: 1000 },
            { productId, unitPriceCents: 1000 }
          ]
        })
      )
    ).toBe('conflict')
    ctx.close()
  })

  it('mantiene el coste congelado aunque cambie el articulo despues', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })

    const order = ctx.repos.orders.create({
      soldAt: daysAgoIso(1),
      items: [{ productId, unitPriceCents: 3000 }]
    })
    expect(order.financials.goodsCostCents).toBe(1200)

    // Se corrige el coste del articulo despues de la venta.
    ctx.repos.products.update(productId, { purchasePriceCents: 5000, acquisitionFeesCents: 500 })

    const reloaded = ctx.repos.orders.get(order.id)
    expect(reloaded.financials.goodsCostCents).toBe(1200)
    ctx.close()
  })
})

describe('pedidos: comisiones y devoluciones', () => {
  it('anade, actualiza y elimina comisiones', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })
    const order = ctx.repos.orders.create({ soldAt: daysAgoIso(1), items: [{ productId, unitPriceCents: 3000 }] })

    const withFee = ctx.repos.orders.addFee(order.id, { kind: 'commission', amountCents: 300 })
    expect(withFee.financials.feesCents).toBe(300)
    // 3000 - 1200 (coste) - 300 (comision) = 1500
    expect(withFee.financials.netProfitCents).toBe(1500)

    const feeId = withFee.fees[0]?.id as string
    const updated = ctx.repos.orders.updateFee(feeId, { amountCents: 100 })
    expect(updated.financials.feesCents).toBe(100)
    expect(updated.financials.netProfitCents).toBe(1700)

    const removed = ctx.repos.orders.removeFee(feeId)
    expect(removed.financials.feesCents).toBe(0)
    ctx.close()
  })

  it('registra la devolucion, devuelve el articulo y descuenta el reembolso', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })
    const order = ctx.repos.orders.create({
      soldAt: daysAgoIso(5),
      items: [{ productId, unitPriceCents: 3000 }],
      fees: [{ kind: 'commission', amountCents: 300 }]
    })

    const returned = ctx.repos.orders.addReturn({
      orderId: order.id,
      returnedAt: daysAgoIso(1),
      refundCents: 3000,
      feeRefundCents: 150,
      shippingLostCents: 200,
      restock: true
    })

    expect(returned.status).toBe('returned')
    expect(returned.returns).toHaveLength(1)
    // 3000 - 1200 - 300 - 3000 + 150 - 200
    expect(returned.financials.netProfitCents).toBe(-1550)

    const product = ctx.repos.products.get(productId).product
    expect(product.status).toBe('returned')
    expect(product.finalSalePriceCents).toBeNull()
    ctx.close()
  })

  it('al anular la devolucion devuelve el pedido y el articulo a su estado vendido', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })
    const order = ctx.repos.orders.create({ soldAt: daysAgoIso(5), items: [{ productId, unitPriceCents: 3000 }] })

    const returned = ctx.repos.orders.addReturn({
      orderId: order.id,
      returnedAt: daysAgoIso(1),
      refundCents: 3000
    })

    const restored = ctx.repos.orders.removeReturn(returned.returns[0]?.id as string)
    expect(restored.returns).toHaveLength(0)
    expect(restored.status).toBe('preparing')

    const product = ctx.repos.products.get(productId).product
    expect(product.status).toBe('sold')
    expect(product.finalSalePriceCents).toBe(3000)
    ctx.close()
  })

  it('cancelar devuelve los articulos al inventario', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 3000, cost: 1000 })
    const order = ctx.repos.orders.create({ soldAt: daysAgoIso(3), items: [{ productId, unitPriceCents: 3000 }] })

    const cancelled = ctx.repos.orders.cancel(order.id, 'El comprador se arrepiente')
    expect(cancelled.status).toBe('cancelled')

    const product = ctx.repos.products.get(productId).product
    expect(product.status).toBe('available')
    expect(product.finalSalePriceCents).toBeNull()

    // El historial del pedido se conserva.
    expect(cancelled.items).toHaveLength(1)
    ctx.close()
  })

  it('no elimina un pedido sin cancelarlo antes', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 1000, cost: 400 })
    const order = ctx.repos.orders.create({ soldAt: daysAgoIso(1), items: [{ productId, unitPriceCents: 1000 }] })

    expect(codeOf(() => ctx.repos.orders.remove(order.id))).toBe('conflict')
    ctx.repos.orders.cancel(order.id, 'prueba')
    expect(ctx.repos.orders.remove(order.id).affected).toBe(1)
    ctx.close()
  })

  it('exige confirmacion para marcar como enviado', () => {
    const ctx = createTestContext()
    const productId = seedProduct(ctx, { price: 1000, cost: 400 })
    const order = ctx.repos.orders.create({ soldAt: daysAgoIso(1), items: [{ productId, unitPriceCents: 1000 }] })

    expect(codeOf(() => ctx.repos.orders.setStatus(order.id, 'shipped'))).toBe('conflict')

    const shipped = ctx.repos.orders.setStatus(order.id, 'shipped', {
      confirm: true,
      trackingNumber: 'TRK123'
    })
    expect(shipped.status).toBe('shipped')
    expect(shipped.trackingNumber).toBe('TRK123')
    expect(shipped.shippedAt).not.toBeNull()
    expect(ctx.repos.products.get(productId).product.status).toBe('shipped')
    ctx.close()
  })
})

describe('pedidos: preparacion y escaneo', () => {
  it('agrupa por ubicacion y verifica el SKU escaneado', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: warehouse.id
    })
    const secondShelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST02',
      name: 'E2',
      parentId: warehouse.id
    })

    const a = ctx.repos.products.create({
      name: 'A',
      locationId: shelf.id,
      purchasePriceCents: 100,
      expectedSalePriceCents: 500,
      status: 'available'
    })
    const b = ctx.repos.products.create({
      name: 'B',
      locationId: secondShelf.id,
      purchasePriceCents: 100,
      expectedSalePriceCents: 500,
      status: 'available'
    })

    const order = ctx.repos.orders.create({
      soldAt: daysAgoIso(2),
      items: [
        { productId: a.id, unitPriceCents: 500 },
        { productId: b.id, unitPriceCents: 500 }
      ]
    })

    const picking = ctx.repos.orders.pickingFor(order.id)
    expect(picking.lines).toHaveLength(2)
    expect(picking.byLocation).toHaveLength(2)
    expect(picking.byLocation[0]?.locationPath).toBe('ALM01-EST01')
    expect(picking.byLocation[1]?.locationPath).toBe('ALM01-EST02')

    // Escanear un SKU que no corresponde a la linea no la marca.
    const wrong = ctx.repos.orders.markPicked(order.id, a.id, b.sku)
    expect(wrong.ok).toBe(false)
    expect(wrong.reason).toBe('sku_mismatch')

    const right = ctx.repos.orders.markPicked(order.id, a.id, a.sku)
    expect(right.ok).toBe(true)

    const afterPick = ctx.repos.orders.pickingFor(order.id)
    expect(afterPick.pickedCount).toBe(1)
    expect(afterPick.status).toBe('preparing')

    expect(ctx.repos.orders.markPacked(order.id, a.id).allPacked).toBe(false)
    expect(ctx.repos.orders.markPacked(order.id, b.id).allPacked).toBe(true)

    const packed = ctx.repos.orders.get(order.id)
    expect(packed.status).toBe('packed')
    ctx.close()
  })

  it('resuelve codigos de articulo y de ubicacion', () => {
    const ctx = createTestContext()
    const location = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM09', name: 'Almacen 9' })
    const product = ctx.repos.products.create({ name: 'Resoluble', sku: 'RV-TEST-1' })

    expect(ctx.repos.orders.resolveScan('RV-TEST-1')).toMatchObject({ kind: 'product', productId: product.id })
    expect(ctx.repos.orders.resolveScan('ALM09')).toMatchObject({ kind: 'location', locationPath: 'ALM09' })
    expect(ctx.repos.orders.resolveScan('NO-EXISTE')).toMatchObject({ kind: 'unknown' })
    void location
    ctx.close()
  })
})
