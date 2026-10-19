import { describe, expect, it } from 'vitest'
import { createTestContext } from './helpers'

/**
 * Repositorios de dinero: proveedores, compras (con reparto de costes) y gastos
 * generales. Lo importante: el coste que se escribe en el articulo, el reparto
 * exacto del extra y que nada se borre de mas.
 */
describe('repositorio de proveedores', () => {
  it('ensure crea una sola vez y reutiliza el mismo proveedor', () => {
    const ctx = createTestContext()
    const first = ctx.repos.suppliers.ensure('Mayorista SA')
    const second = ctx.repos.suppliers.ensure('  mayorista sa ')
    expect(second.id).toBe(first.id)
    expect(ctx.repos.suppliers.list().length).toBe(1)
    ctx.close()
  })

  it('ensure rechaza un nombre vacio', () => {
    const ctx = createTestContext()
    expect(() => ctx.repos.suppliers.ensure('   ')).toThrow()
    ctx.close()
  })

  it('create impide duplicados por nombre aunque cambie el uso de mayusculas', () => {
    const ctx = createTestContext()
    ctx.repos.suppliers.create({ name: 'Proveedor' })
    expect(() => ctx.repos.suppliers.create({ name: 'proveedor' })).toThrow()
    ctx.close()
  })

  it('update y remove trabajan y controlan la existencia', () => {
    const ctx = createTestContext()
    const missing = '00000000-0000-4000-8000-000000000000'
    const supplier = ctx.repos.suppliers.create({ name: 'Proveedor', contact: 'a@b.c' })
    const updated = ctx.repos.suppliers.update(supplier.id, { contact: 'x@y.z', notes: 'nota' })
    expect(updated.contact).toBe('x@y.z')
    expect(updated.notes).toBe('nota')
    expect(ctx.repos.suppliers.findById(supplier.id)?.name).toBe('Proveedor')
    expect(ctx.repos.suppliers.remove(supplier.id)).toEqual({ affected: 1 })
    expect(ctx.repos.suppliers.findById(supplier.id)).toBeNull()
    expect(() => ctx.repos.suppliers.update(missing, { name: 'x' })).toThrow()
    expect(() => ctx.repos.suppliers.remove(missing)).toThrow()
    ctx.close()
  })
})

describe('repositorio de compras', () => {
  it('create reparte el extra, vincula al proveedor y escribe el coste en el articulo', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-P' })
    const purchase = ctx.repos.purchases.create({
      reference: 'F-1',
      supplierName: 'Mayorista',
      purchasedAt: '2026-01-15',
      shippingCents: 500,
      otherCents: 100,
      allocationMethod: 'by_cost',
      items: [{ productId: product.id, description: 'Camiseta', quantity: 2, unitCostCents: 1000 }]
    })
    expect(purchase.items.length).toBe(1)
    expect(purchase.itemsCostCents).toBe(2000)
    expect(purchase.extraCostCents).toBe(600)
    expect(purchase.totalCostCents).toBe(2600)
    expect(purchase.supplierName).toBe('Mayorista')
    expect(purchase.supplierId).not.toBeNull()

    const stored = ctx.db.get<Record<string, unknown>>(
      'SELECT purchase_price_cents, acquisition_fees_cents FROM products WHERE id = $id',
      { $id: product.id }
    )
    expect(stored?.purchase_price_cents).toBe(1000)
    expect(stored?.acquisition_fees_cents).toBe(600)
    ctx.close()
  })

  it('create exige fecha y al menos una linea', () => {
    const ctx = createTestContext()
    expect(() =>
      ctx.repos.purchases.create({ purchasedAt: '', items: [{ quantity: 1, unitCostCents: 100 }] })
    ).toThrow()
    expect(() => ctx.repos.purchases.create({ purchasedAt: '2026-01-15', items: [] })).toThrow()
    ctx.close()
  })

  it('create rechaza un articulo inexistente', () => {
    const ctx = createTestContext()
    expect(() =>
      ctx.repos.purchases.create({
        purchasedAt: '2026-01-15',
        items: [
          { productId: '00000000-0000-4000-8000-000000000000', quantity: 1, unitCostCents: 100 }
        ]
      })
    ).toThrow()
    ctx.close()
  })

  it('update y remove informan de los articulos vinculados', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-Q' })
    const purchase = ctx.repos.purchases.create({
      purchasedAt: '2026-01-15',
      items: [{ productId: product.id, quantity: 1, unitCostCents: 500 }]
    })
    const updated = ctx.repos.purchases.update(purchase.id, {
      reference: 'R-2',
      notes: 'nota',
      purchasedAt: '2026-02-01'
    })
    expect(updated.reference).toBe('R-2')
    expect(updated.notes).toBe('nota')
    expect(updated.purchasedAt).toBe('2026-02-01')

    const removed = ctx.repos.purchases.remove(purchase.id)
    expect(removed.affected).toBe(1)
    expect(removed.linkedProducts).toEqual([product.id])
    expect(() => ctx.repos.purchases.get(purchase.id)).toThrow()
    ctx.close()
  })

  it('materialize convierte las lineas sin articulo en articulos reales', () => {
    const ctx = createTestContext()
    const purchase = ctx.repos.purchases.create({
      purchasedAt: '2026-01-15',
      items: [{ description: 'Lote camisetas', quantity: 3, unitCostCents: 800 }]
    })
    const itemId = purchase.items[0]?.id ?? ''
    const result = ctx.repos.purchases.materialize(purchase.id, [itemId])
    expect(result.created).toBe(1)
    const reloaded = ctx.repos.purchases.get(purchase.id)
    expect(reloaded.items[0]?.productId).toBe(result.productIds[0])
    // Una linea ya materializada no se puede volver a materializar.
    expect(() => ctx.repos.purchases.materialize(purchase.id, [itemId])).toThrow()
    ctx.close()
  })

  it('totals suma lineas y gastos extra del periodo', () => {
    const ctx = createTestContext()
    ctx.repos.purchases.create({
      purchasedAt: '2026-01-10',
      shippingCents: 300,
      items: [{ quantity: 2, unitCostCents: 1000 }]
    })
    ctx.repos.purchases.create({ purchasedAt: '2026-03-10', items: [{ quantity: 1, unitCostCents: 500 }] })

    const all = ctx.repos.purchases.totals()
    expect(all.count).toBe(2)
    expect(all.itemsCents).toBe(2500)
    expect(all.extraCents).toBe(300)
    expect(all.totalCents).toBe(2800)

    const january = ctx.repos.purchases.totals('2026-01-01', '2026-01-31')
    expect(january.count).toBe(1)
    expect(january.totalCents).toBe(2300)
    ctx.close()
  })

  it('list filtra por texto y fecha, y previewAllocation reparte el extra', () => {
    const ctx = createTestContext()
    ctx.repos.purchases.create({
      reference: 'ALFA',
      purchasedAt: '2026-01-10',
      shippingCents: 300,
      allocationMethod: 'equal',
      items: [
        { description: 'uno', quantity: 1, unitCostCents: 1000 },
        { description: 'dos', quantity: 1, unitCostCents: 3000 }
      ]
    })
    expect(ctx.repos.purchases.list({ search: 'ALFA' }).length).toBe(1)
    expect(ctx.repos.purchases.list({ search: 'no-existe' }).length).toBe(0)
    expect(ctx.repos.purchases.list({ from: '2026-02-01' }).length).toBe(0)

    const preview = ctx.repos.purchases.previewAllocation({
      allocationMethod: 'equal',
      shippingCents: 500,
      items: [
        { quantity: 1, unitCostCents: 1000 },
        { quantity: 1, unitCostCents: 1000 }
      ]
    })
    expect(preview.extraCents).toBe(500)
    expect(preview.allocatedTotalCents).toBe(500)
    expect(preview.lines[0]?.allocatedExtraCents).toBe(250)
    ctx.close()
  })
})

describe('repositorio de gastos', () => {
  it('create valida el importe y el formato de fecha', () => {
    const ctx = createTestContext()
    expect(() =>
      ctx.repos.expenses.create({ category: 'packaging', amountCents: -1, incurredOn: '2026-01-01' })
    ).toThrow()
    expect(() =>
      ctx.repos.expenses.create({ category: 'packaging', amountCents: 100, incurredOn: '01/01/2026' })
    ).toThrow()
    ctx.close()
  })

  it('create, list con filtros, update y remove', () => {
    const ctx = createTestContext()
    const missing = '00000000-0000-4000-8000-000000000000'
    const febrero = ctx.repos.expenses.create({
      category: 'shipping',
      description: 'Envio',
      amountCents: 450,
      incurredOn: '2026-02-10'
    })
    ctx.repos.expenses.create({ category: 'packaging', description: 'Cajas', amountCents: 1000, incurredOn: '2026-01-05' })

    expect(ctx.repos.expenses.list().length).toBe(2)
    expect(ctx.repos.expenses.list({ category: 'shipping' }).length).toBe(1)
    expect(ctx.repos.expenses.list({ search: 'Cajas' }).length).toBe(1)
    expect(ctx.repos.expenses.list({ from: '2026-02-01' }).length).toBe(1)
    expect(ctx.repos.expenses.list({ to: '2026-01-31' }).length).toBe(1)

    const updated = ctx.repos.expenses.update(febrero.id, {
      amountCents: 500,
      description: 'Envio urgente',
      recurring: 'monthly'
    })
    expect(updated.amountCents).toBe(500)
    expect(updated.description).toBe('Envio urgente')
    expect(updated.recurring).toBe('monthly')

    expect(ctx.repos.expenses.remove(febrero.id)).toEqual({ affected: 1 })
    expect(ctx.repos.expenses.list().length).toBe(1)
    expect(() => ctx.repos.expenses.update(missing, { amountCents: 1 })).toThrow()
    expect(() => ctx.repos.expenses.remove(missing)).toThrow()
    ctx.close()
  })

  it('summary y totalBetween agrupan por categoria y por mes', () => {
    const ctx = createTestContext()
    ctx.repos.expenses.create({ category: 'shipping', amountCents: 450, incurredOn: '2026-02-10' })
    ctx.repos.expenses.create({ category: 'shipping', amountCents: 550, incurredOn: '2026-02-20' })
    ctx.repos.expenses.create({ category: 'packaging', amountCents: 1000, incurredOn: '2026-01-05' })

    const summary = ctx.repos.expenses.summary()
    expect(summary.totalCents).toBe(2000)
    const shipping = summary.byCategory.find((entry) => entry.category === 'shipping')
    expect(shipping?.totalCents).toBe(1000)
    expect(shipping?.count).toBe(2)
    expect(summary.byMonth.find((entry) => entry.month === '2026-02')?.totalCents).toBe(1000)

    expect(ctx.repos.expenses.totalBetween('2026-02-01', '2026-02-28')).toBe(1000)
    expect(ctx.repos.expenses.totalBetween()).toBe(2000)
    ctx.close()
  })

  it('removeDemo borra solo los gastos de demostracion', () => {
    const ctx = createTestContext()
    ctx.repos.expenses.create({ category: 'other', amountCents: 100, incurredOn: '2026-01-01' })
    ctx.db.run(
      `INSERT INTO expenses (id, category, description, amount_cents, incurred_on, recurring, notes, is_demo, created_at, updated_at)
       VALUES ($id, 'other', 'demo', 999, '2026-01-01', 'none', '', 1, $at, $at)`,
      { $id: '00000000-0000-4000-8000-0000000000aa', $at: '2026-01-01T00:00:00.000Z' }
    )
    expect(Number(ctx.repos.expenses.removeDemo())).toBe(1)
    expect(ctx.repos.expenses.list().length).toBe(1)
    ctx.close()
  })
})
