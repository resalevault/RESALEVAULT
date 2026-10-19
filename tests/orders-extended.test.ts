import { describe, expect, it } from 'vitest'
import { AppError } from '@main/errors'
import { createTestContext, createWarehouse } from './helpers'

/**
 * Pedidos (parte 2): listado con filtros y orden, edicion, estados, comisiones,
 * devoluciones y preparacion. Todo esto toca dinero y estado de inventario.
 */
const MISSING = '00000000-0000-4000-8000-000000000000'

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio')
}

function seedOrder(
  ctx: ReturnType<typeof createTestContext>,
  options: { sku: string; soldAt: string; buyer?: string; price?: number; cost?: number }
): { productId: string; orderId: string } {
  const productId = ctx.repos.products.create({
    name: `Articulo ${options.sku}`,
    sku: options.sku,
    purchasePriceCents: options.cost ?? 500,
    expectedSalePriceCents: options.price ?? 2000,
    status: 'available'
  }).id
  const order = ctx.repos.orders.create({
    soldAt: options.soldAt,
    buyer: options.buyer ?? 'Comprador',
    items: [{ productId, unitPriceCents: options.price ?? 2000 }]
  })
  return { productId, orderId: order.id }
}

describe('pedidos: listado', () => {
  it('filtra por texto, estado, fecha y devoluciones, y ordena por beneficio', () => {
    const ctx = createTestContext()
    const january = seedOrder(ctx, { sku: 'SKU-JAN', soldAt: '2026-01-10', buyer: 'Ana' })
    const february = seedOrder(ctx, { sku: 'SKU-FEB', soldAt: '2026-02-10', buyer: 'Beto', price: 5000 })

    expect(ctx.repos.orders.list({ search: 'Ana' }).total).toBe(1)
    expect(ctx.repos.orders.list({ search: 'SKU-JAN' }).total).toBe(1)
    expect(ctx.repos.orders.list({ search: 'nadie' }).total).toBe(0)
    expect(ctx.repos.orders.list({ status: ['pending'] }).total).toBe(2)
    expect(ctx.repos.orders.list({ status: ['shipped'] }).total).toBe(0)
    expect(ctx.repos.orders.list({ from: '2026-02-01' }).total).toBe(1)
    expect(ctx.repos.orders.list({ to: '2026-01-31' }).total).toBe(1)
    expect(ctx.repos.orders.list({ onlyWithReturns: true }).total).toBe(0)

    expect(ctx.repos.orders.list({ sort: 'profit_desc' }).items[0]?.id).toBe(february.orderId)
    expect(ctx.repos.orders.list({ sort: 'profit_asc' }).items[0]?.id).toBe(january.orderId)
    expect(ctx.repos.orders.list({ sort: 'number_asc' }).items.length).toBe(2)
    expect(ctx.repos.orders.list({ sort: 'date_asc' }).items.length).toBe(2)

    const paged = ctx.repos.orders.list({ page: 1, pageSize: 1 })
    expect(paged.items.length).toBe(1)
    expect(paged.pageCount).toBe(2)
    ctx.close()
  })
})

describe('pedidos: edicion y estados', () => {
  it('update cambia los datos y avisa si el pedido no existe', () => {
    const ctx = createTestContext()
    const { orderId } = seedOrder(ctx, { sku: 'SKU-UPD', soldAt: '2026-01-10' })
    const updated = ctx.repos.orders.update(orderId, {
      buyer: 'Nuevo',
      shippingChargedCents: 700,
      shippingCostCents: 300,
      trackingNumber: 'ABC123',
      carrier: 'SEUR',
      notes: 'nota'
    })
    expect(updated.buyer).toBe('Nuevo')
    expect(updated.shippingChargedCents).toBe(700)
    expect(updated.shippingCostCents).toBe(300)
    expect(updated.trackingNumber).toBe('ABC123')
    expect(updated.carrier).toBe('SEUR')
    expect(updated.notes).toBe('nota')
    expect(codeOf(() => ctx.repos.orders.update(MISSING, { buyer: 'x' }))).toBe('not_found')
    ctx.close()
  })

  it('setStatus exige confirmacion para enviar y guarda las fechas de cada paso', () => {
    const ctx = createTestContext()
    const { orderId } = seedOrder(ctx, { sku: 'SKU-ST', soldAt: '2026-01-10' })

    expect(codeOf(() => ctx.repos.orders.setStatus(orderId, 'shipped'))).toBe('conflict')

    const preparing = ctx.repos.orders.setStatus(orderId, 'preparing')
    expect(preparing.status).toBe('preparing')
    expect(preparing.preparedAt).not.toBeNull()

    const shipped = ctx.repos.orders.setStatus(orderId, 'shipped', {
      confirm: true,
      trackingNumber: 'TRK1',
      carrier: 'SEUR'
    })
    expect(shipped.status).toBe('shipped')
    expect(shipped.shippedAt).not.toBeNull()
    expect(shipped.trackingNumber).toBe('TRK1')

    const delivered = ctx.repos.orders.setStatus(orderId, 'delivered', { confirm: true })
    expect(delivered.status).toBe('delivered')
    expect(delivered.deliveredAt).not.toBeNull()
    ctx.close()
  })

  it('cancelar dos veces no rompe ni duplica el efecto', () => {
    const ctx = createTestContext()
    const { orderId } = seedOrder(ctx, { sku: 'SKU-CAN', soldAt: '2026-01-10' })
    expect(ctx.repos.orders.cancel(orderId, 'prueba').status).toBe('cancelled')
    expect(ctx.repos.orders.cancel(orderId, 'prueba').status).toBe('cancelled')
    ctx.close()
  })
})

describe('pedidos: comisiones y devoluciones (guardas)', () => {
  it('avisa cuando el identificador no existe', () => {
    const ctx = createTestContext()
    expect(codeOf(() => ctx.repos.orders.addFee(MISSING, { kind: 'commission', amountCents: 100 }))).toBe('not_found')
    expect(codeOf(() => ctx.repos.orders.updateFee(MISSING, { amountCents: 1 }))).toBe('not_found')
    expect(codeOf(() => ctx.repos.orders.removeFee(MISSING))).toBe('not_found')
    expect(codeOf(() => ctx.repos.orders.removeReturn(MISSING))).toBe('not_found')
    ctx.close()
  })

  it('addReturn valida la fecha y el importe antes de escribir', () => {
    const ctx = createTestContext()
    const { orderId } = seedOrder(ctx, { sku: 'SKU-RET', soldAt: '2026-01-10' })
    expect(codeOf(() => ctx.repos.orders.addReturn({ orderId, returnedAt: '10/01/2026', refundCents: 100 }))).toBe(
      'invalid_input'
    )
    expect(codeOf(() => ctx.repos.orders.addReturn({ orderId, returnedAt: '2026-01-20', refundCents: -1 }))).toBe(
      'invalid_input'
    )
    ctx.close()
  })
})

describe('pedidos: preparacion y escaneo', () => {
  it('pickingQueue incluye los pedidos abiertos y pickingFor avisa si no existe', () => {
    const ctx = createTestContext()
    const { orderId } = seedOrder(ctx, { sku: 'SKU-PICK', soldAt: '2026-01-10' })
    expect(ctx.repos.orders.pickingQueue().some((entry) => entry.orderId === orderId)).toBe(true)
    expect(ctx.repos.orders.pickingFor(orderId).lines.length).toBe(1)
    expect(codeOf(() => ctx.repos.orders.pickingFor(MISSING))).toBe('not_found')
    ctx.close()
  })

  it('markPicked comprueba el SKU y no marca si no coincide', () => {
    const ctx = createTestContext()
    const { orderId, productId } = seedOrder(ctx, { sku: 'SKU-SCAN', soldAt: '2026-01-10' })

    const mismatch = ctx.repos.orders.markPicked(orderId, productId, 'OTRO')
    expect(mismatch.ok).toBe(false)
    expect(mismatch.reason).toBe('sku_mismatch')

    const otherProduct = ctx.repos.products.create({ name: 'Otro', sku: 'SKU-OTRO' }).id
    expect(ctx.repos.orders.markPicked(orderId, otherProduct, 'SKU-OTRO')).toEqual({
      ok: false,
      reason: 'not_in_order'
    })

    expect(ctx.repos.orders.markPicked(orderId, productId, '')).toEqual({ ok: true })
    expect(ctx.repos.orders.get(orderId).status).toBe('preparing')
    expect(ctx.repos.orders.checksFor(orderId).length).toBe(1)

    expect(Number(ctx.repos.orders.resetCheck(orderId, productId).affected)).toBe(1)
    expect(Number(ctx.repos.orders.resetCheck(orderId, productId).affected)).toBe(0)

    ctx.repos.orders.setCheckNote(orderId, productId, 'revisar')
    expect(ctx.repos.orders.checksFor(orderId)[0]?.note).toBe('revisar')
    ctx.close()
  })

  it('markPacked marca el pedido como empaquetado cuando no queda nada pendiente', () => {
    const ctx = createTestContext()
    const { orderId, productId } = seedOrder(ctx, { sku: 'SKU-PACK', soldAt: '2026-01-10' })
    const result = ctx.repos.orders.markPacked(orderId, productId)
    expect(result.ok).toBe(true)
    expect(result.allPacked).toBe(true)
    expect(ctx.repos.orders.get(orderId).status).toBe('packed')
    ctx.close()
  })

  it('resolveScan distingue articulo, ubicacion y desconocido', () => {
    const ctx = createTestContext()
    createWarehouse(ctx, 'ALM09')
    const { productId } = seedOrder(ctx, { sku: 'SKU-RS', soldAt: '2026-01-10' })
    expect(ctx.repos.orders.resolveScan('').kind).toBe('unknown')
    expect(ctx.repos.orders.resolveScan('nada-de-nada').kind).toBe('unknown')
    expect(ctx.repos.orders.resolveScan('ALM09').kind).toBe('location')
    const product = ctx.repos.orders.resolveScan('SKU-RS')
    expect(product.kind).toBe('product')
    expect(product.productId).toBe(productId)
    ctx.close()
  })
})
