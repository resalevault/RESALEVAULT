import { describe, expect, it } from 'vitest'
import {
  allocateExtraCost,
  computeOrderFinancials,
  evaluatePurchase,
  feeFromPercent,
  inventoryTurns,
  weightedAverageAgeDays
} from '@shared/finance-extended'

describe('resultado de un pedido (beneficio NETO)', () => {
  it('descuenta comisiones, envio asumido y otros cargos', () => {
    const result = computeOrderFinancials({
      items: [{ unitPriceCents: 3000, unitCostCents: 1200, quantity: 1 }],
      discountCents: 100,
      shippingChargedCents: 500,
      shippingCostCents: 400,
      fees: [{ amountCents: 300 }]
    })

    expect(result.goodsRevenueCents).toBe(3000)
    expect(result.netRevenueCents).toBe(3400) // 3000 - 100 + 500
    expect(result.goodsCostCents).toBe(1200)
    expect(result.netProfitCents).toBe(1500) // 3400 - 1200 - 300 - 400
    expect(result.marginPercent).toBeCloseTo((1500 / 3400) * 100, 6)
  })

  it('no confunde el envio cobrado con el envio pagado', () => {
    const conEnvioCobrado = computeOrderFinancials({
      items: [{ unitPriceCents: 1000, unitCostCents: 500, quantity: 1 }],
      shippingChargedCents: 500
    })
    const sinEnvioCobrado = computeOrderFinancials({
      items: [{ unitPriceCents: 1000, unitCostCents: 500, quantity: 1 }],
      shippingCostCents: 500
    })

    expect(conEnvioCobrado.netProfitCents).toBe(1000)
    expect(sinEnvioCobrado.netProfitCents).toBe(0)
  })

  it('aplica varias lineas y cantidades', () => {
    const result = computeOrderFinancials({
      items: [
        { unitPriceCents: 1000, unitCostCents: 400, quantity: 2 },
        { unitPriceCents: 500, unitCostCents: 100, quantity: 1 }
      ]
    })

    expect(result.goodsRevenueCents).toBe(2500)
    expect(result.goodsCostCents).toBe(900)
    expect(result.unitsSold).toBe(3)
    expect(result.netProfitCents).toBe(1600)
  })

  it('descuenta devoluciones y suma comisiones devueltas', () => {
    const result = computeOrderFinancials({
      items: [{ unitPriceCents: 3000, unitCostCents: 1000, quantity: 1 }],
      fees: [{ amountCents: 300 }],
      returns: [{ refundCents: 3000, feeRefundCents: 150, shippingLostCents: 200 }]
    })

    // 3000 - 1000 - 300 - 3000 + 150 - 200
    expect(result.netProfitCents).toBe(-1350)
    expect(result.refundsCents).toBe(3000)
    expect(result.feesRefundedCents).toBe(150)
    expect(result.shippingLostCents).toBe(200)
  })

  it('devuelve margen nulo cuando no hay ingreso', () => {
    const result = computeOrderFinancials({ items: [] })
    expect(result.netRevenueCents).toBe(0)
    expect(result.marginPercent).toBeNull()
  })

  it('calcula comisiones porcentuales con fijo', () => {
    expect(feeFromPercent(10000, 10)).toBe(1000)
    expect(feeFromPercent(10000, 10, 250)).toBe(1250)
    expect(feeFromPercent(1999, 7.5)).toBe(150)
  })
})

describe('reparto de costes de una compra', () => {
  const lines = [
    { unitCostCents: 1000, quantity: 1 },
    { unitCostCents: 3000, quantity: 1 }
  ]

  it('reparte proporcionalmente al coste y cuadra al centimo', () => {
    const result = allocateExtraCost(400, lines, 'by_cost')
    expect(result.allocations).toEqual([100, 300])
    expect(result.allocatedTotalCents).toBe(400)
  })

  it('reparte a partes iguales', () => {
    const result = allocateExtraCost(400, lines, 'equal')
    expect(result.allocations).toEqual([200, 200])
  })

  it('asigna el residuo del redondeo a la ultima linea', () => {
    const result = allocateExtraCost(100, [
      { unitCostCents: 1, quantity: 1 },
      { unitCostCents: 1, quantity: 1 },
      { unitCostCents: 1, quantity: 1 }
    ], 'equal')

    // 100/3 = 33.33 -> 33, 33, 34. La suma debe ser exactamente 100.
    expect(result.allocations.reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(result.allocations[2]).toBe(34)
  })

  it('no reparte nada si el metodo es none', () => {
    const result = allocateExtraCost(400, lines, 'none')
    expect(result.allocations).toEqual([0, 0])
    expect(result.unallocatedCents).toBe(400)
  })

  it('reparte en negativo cuando el descuento supera los gastos', () => {
    const result = allocateExtraCost(-100, lines, 'by_cost')
    expect(result.allocations.reduce((sum, value) => sum + value, 0)).toBe(-100)
  })

  it('reparte a partes iguales cuando no hay costes que usar como peso', () => {
    const result = allocateExtraCost(300, [
      { unitCostCents: 0, quantity: 1 },
      { unitCostCents: 0, quantity: 1 }
    ], 'by_cost')
    expect(result.allocations).toEqual([150, 150])
  })
})

describe('calculadora de rentabilidad', () => {
  const base = {
    purchaseCents: 1000,
    expectedSaleCents: 3000,
    feesPercent: 10,
    feesFixedCents: 0,
    shippingCents: 400,
    otherCents: 0,
    targetMarginPercent: 25,
    minProfitCents: 500
  }

  it('calcula beneficio, margen y ROI', () => {
    const result = evaluatePurchase(base)
    // ingreso neto = 3000 * 0.9 = 2700; coste = 1400; beneficio = 1300
    expect(result.netRevenueCents).toBe(2700)
    expect(result.costCents).toBe(1400)
    expect(result.estimatedProfitCents).toBe(1300)
    expect(result.marginPercent).toBeCloseTo((1300 / 3000) * 100, 6)
    expect(result.roiPercent).toBeCloseTo((1300 / 1400) * 100, 6)
  })

  it('calcula el precio de equilibrio', () => {
    const result = evaluatePurchase({ ...base, expectedSaleCents: 0 })
    // coste 1400 / (1 - 0.10) = 1555.55 -> 1556
    expect(result.breakEvenPriceCents).toBe(1556)
  })

  it('calcula el precio minimo de venta segun margen y beneficio minimo', () => {
    const result = evaluatePurchase({ ...base, expectedSaleCents: 5000 })
    // margen: (0 + 1400) / (1 - 0.10 - 0.25) = 2153.8 -> 2154
    // beneficio: (500 + 1400) / 0.9 = 2111.1 -> 2112
    expect(result.minSalePriceCents).toBe(2154)
  })

  it('calcula la compra maxima aconsejable', () => {
    const result = evaluatePurchase({ ...base, expectedSaleCents: 3000, shippingCents: 0 })
    // ingreso neto 2700 - max(500, 750) = 1950
    expect(result.maxPurchasePriceCents).toBe(1950)
  })

  it('avisa cuando la operacion pierde dinero', () => {
    const result = evaluatePurchase({ ...base, expectedSaleCents: 1000 })
    expect(result.estimatedProfitCents).toBeLessThan(0)
    expect(result.warnings).toContain('already_at_loss')
  })

  it('avisa cuando el margen objetivo es inalcanzable', () => {
    const result = evaluatePurchase({ ...base, feesPercent: 60, targetMarginPercent: 50 })
    expect(result.warnings).toContain('target_unreachable')
    expect(result.minSalePriceCents).toBeNull()
  })

  it('siempre marca el resultado como estimacion', () => {
    expect(evaluatePurchase(base).warnings).toContain('estimated_only')
  })

  it('avisa si falta el precio de venta estimado', () => {
    const result = evaluatePurchase({ ...base, expectedSaleCents: 0 })
    expect(result.warnings).toContain('expected_price_missing')
  })
})

describe('indicadores de inventario', () => {
  it('calcula la rotacion anual', () => {
    expect(inventoryTurns(12000, 4000)).toBe(3)
    expect(inventoryTurns(1000, 0)).toBeNull()
  })

  it('pondera la antiguedad por capital, no por numero de articulos', () => {
    const result = weightedAverageAgeDays([
      { ageDays: 10, capitalCents: 100 },
      { ageDays: 100, capitalCents: 900 }
    ])
    // (10*100 + 100*900) / 1000 = 91
    expect(result).toBeCloseTo(91, 6)
    expect(weightedAverageAgeDays([])).toBeNull()
  })
})
