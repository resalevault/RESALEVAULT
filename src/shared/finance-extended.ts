/**
 * RESALEVAULT - Formulario financiero. TODAS las formulas, en un solo sitio.
 *
 * Este archivo es la unica implementacion de los calculos de dinero: lo usan
 * el proceso principal y las pruebas. Documentacion completa en
 * docs/FORMULAS.md.
 *
 * Principio rector: NUNCA se mezclan conceptos distintos.
 *   - Ingreso  != beneficio
 *   - Bruto    != neto
 *   - Margen (sobre venta) != retorno sobre la inversion (sobre coste)
 *   - Envio cobrado (ingreso) != envio pagado (coste)
 */

import type { AllocationMethod, OrderFinancials } from './types-modules'

export interface OrderCostLine {
  unitPriceCents: number
  unitCostCents: number
  quantity: number
}

export interface OrderCostInput {
  items: readonly OrderCostLine[]
  discountCents?: number
  shippingChargedCents?: number
  shippingCostCents?: number
  otherCents?: number
  fees?: readonly { amountCents: number }[]
  returns?: readonly {
    refundCents: number
    feeRefundCents: number
    shippingLostCents: number
  }[]
}

/**
 * Cuenta de resultados de un pedido.
 *
 *   goodsRevenue  = SUM(precio * cantidad)
 *   netRevenue    = goodsRevenue − descuento + envioCobrado
 *   goodsCost     = SUM(coste * cantidad)
 *   fees          = SUM(comisiones)
 *   netProfit     = netRevenue − goodsCost − fees − envioPagado − otros
 *                   − reembolsos + comisionesDevueltas − envioPerdido
 *   marginPercent = netProfit / netRevenue × 100
 *
 * `netProfit` es BENEFICIO NETO: ya descuenta comisiones, envios y
 * devoluciones. Es la cifra que NO se mostraba antes de este modulo.
 */
export function computeOrderFinancials(input: OrderCostInput): OrderFinancials {
  let goodsRevenue = 0
  let goodsCost = 0
  let units = 0

  for (const line of input.items) {
    const quantity = Math.max(0, Math.round(line.quantity))
    goodsRevenue += Math.round(line.unitPriceCents) * quantity
    goodsCost += Math.round(line.unitCostCents) * quantity
    units += quantity
  }

  const discount = Math.round(input.discountCents ?? 0)
  const shippingCharged = Math.round(input.shippingChargedCents ?? 0)
  const shippingCost = Math.round(input.shippingCostCents ?? 0)
  const other = Math.round(input.otherCents ?? 0)

  const fees = (input.fees ?? []).reduce((sum, fee) => sum + Math.round(fee.amountCents), 0)

  let refunds = 0
  let feesRefunded = 0
  let shippingLost = 0
  for (const entry of input.returns ?? []) {
    refunds += Math.round(entry.refundCents)
    feesRefunded += Math.round(entry.feeRefundCents)
    shippingLost += Math.round(entry.shippingLostCents)
  }

  const netRevenue = goodsRevenue - discount + shippingCharged

  const netProfit =
    netRevenue - goodsCost - fees - shippingCost - other - refunds + feesRefunded - shippingLost

  return {
    goodsRevenueCents: goodsRevenue,
    discountCents: discount,
    shippingChargedCents: shippingCharged,
    netRevenueCents: netRevenue,
    goodsCostCents: goodsCost,
    feesCents: fees,
    shippingCostCents: shippingCost,
    otherCostCents: other,
    refundsCents: refunds,
    feesRefundedCents: feesRefunded,
    shippingLostCents: shippingLost,
    netProfitCents: netProfit,
    marginPercent: netRevenue > 0 ? (netProfit / netRevenue) * 100 : null,
    unitsSold: units
  }
}

/** Comision de plataforma expresada como porcentaje mas un fijo. */
export function feeFromPercent(
  salePriceCents: number,
  percent: number,
  fixedCents = 0
): number {
  return Math.round((salePriceCents * percent) / 100) + Math.round(fixedCents)
}

// ---------------------------------------------------------------------------
// Reparto de costes de una compra
// ---------------------------------------------------------------------------

export interface AllocationLineInput {
  unitCostCents: number
  quantity: number
}

export interface AllocationResult {
  /** Importe asignado a cada linea, en el mismo orden de entrada. */
  allocations: number[]
  allocatedTotalCents: number
  unallocatedCents: number
}

/**
 * Reparte el coste adicional de una compra (envio, portes, otros, menos el
 * descuento) entre las lineas.
 *
 * Reglas:
 *  - `by_cost`: proporcional al coste de cada linea.
 *  - `equal`:   a partes iguales entre lineas.
 *  - `none`:    no se reparte nada.
 *  - El redondeo es en centimos y el RESIDUO se asigna a la ultima linea, de
 *    modo que `sum(allocations)` es exactamente `extraCents`. Sin esto, el
 *    reparto perderia centimos por redondeo y el coste de los articulos no
 *    cuadraria con lo pagado.
 *  - Un `extraCents` negativo (descuento mayor que los gastos) se reparte
 *    igual, en negativo, sin bajar el coste de una linea por debajo de cero.
 */
export function allocateExtraCost(
  extraCents: number,
  lines: readonly AllocationLineInput[],
  method: AllocationMethod
): AllocationResult {
  const count = lines.length
  const extra = Math.round(extraCents)

  if (count === 0 || method === 'none' || extra === 0) {
    return {
      allocations: new Array<number>(count).fill(0),
      allocatedTotalCents: 0,
      // Con el metodo `none` el coste adicional NO se reparte: se declara
      // explicitamente como no asignado para que la interfaz pueda avisarlo.
      unallocatedCents: count === 0 ? extra : method === 'none' ? extra : 0
    }
  }

  const base: number[] = new Array<number>(count).fill(0)

  if (method === 'equal') {
    const perLine = extra / count
    const floor = Math.trunc(perLine)
    for (let index = 0; index < count; index += 1) base[index] = floor
  } else {
    const weights = lines.map((line) =>
      Math.max(0, Math.round(line.unitCostCents) * Math.max(0, Math.round(line.quantity)))
    )
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

    if (totalWeight === 0) {
      // Sin costes que usar como peso, se reparte a partes iguales en lugar de
      // dejar el coste adicional sin asignar.
      const perLine = extra / count
      const floor = Math.trunc(perLine)
      for (let index = 0; index < count; index += 1) base[index] = floor
    } else {
      for (let index = 0; index < count; index += 1) {
        base[index] = Math.trunc((extra * (weights[index] as number)) / totalWeight)
      }
    }
  }

  // El residuo del redondeo va a la ultima linea: asi la suma es exacta.
  const allocated = base.reduce((sum, value) => sum + value, 0)
  base[count - 1] = (base[count - 1] as number) + (extra - allocated)

  return {
    allocations: base,
    allocatedTotalCents: extra,
    unallocatedCents: 0
  }
}

// ---------------------------------------------------------------------------
// Calculadora de rentabilidad ANTES de comprar
// ---------------------------------------------------------------------------

export interface ProfitabilityInput {
  purchaseCents: number
  expectedSaleCents: number
  /** Comision de plataforma en porcentaje sobre el precio de venta. */
  feesPercent: number
  /** Comision fija por operacion. */
  feesFixedCents: number
  shippingCents: number
  otherCents: number
  /** Margen objetivo en porcentaje sobre el precio de venta. */
  targetMarginPercent: number
  /** Beneficio minimo aceptable, en centimos. */
  minProfitCents: number
}

export type ProfitabilityWarning =
  | 'expected_price_missing'
  | 'target_unreachable'
  | 'already_at_loss'
  | 'below_min_profit'
  | 'below_target_margin'
  | 'estimated_only'

/**
 * Evaluacion de una compra ANTES de realizarla.
 *
 * Formulas:
 *   costeTotal      = compra + envio + otros
 *   ingresoNeto(P)  = P × (1 − comision%) − comisionFija
 *   beneficio(P)    = ingresoNeto(P) − costeTotal
 *   margen(P)       = beneficio(P) / P × 100
 *
 *   precioMinimoParaBeneficio = (beneficioMinimo + comisionFija + costeTotal) / (1 − comision%)
 *   precioMinimoParaMargen    = (comisionFija + costeTotal) / (1 − comision% − margenObjetivo)
 *   precioMinimoVenta         = max(ambos, 0)
 *   compraMaxima              = ingresoNeto(P) − max(beneficioMinimo, P × margenObjetivo)
 *                               − envio − otros
 *   roi%                      = beneficio / costeTotal × 100   (retorno sobre lo invertido)
 *
 * IMPORTANTE: son ESTIMACIONES basadas en los datos que introduce el usuario.
 * No son precios de mercado verificados.
 */
export interface ProfitabilityResult {
  costCents: number
  netRevenueCents: number
  estimatedProfitCents: number
  /** Margen sobre el precio de venta. */
  marginPercent: number | null
  /** Retorno sobre el capital invertido. Distinto del margen. */
  roiPercent: number | null
  breakEvenPriceCents: number
  minSalePriceCents: number | null
  maxPurchasePriceCents: number | null
  effectiveFeePercent: number
  warnings: ProfitabilityWarning[]
}

export function evaluatePurchase(input: ProfitabilityInput): ProfitabilityResult {
  const purchase = Math.max(0, Math.round(input.purchaseCents))
  const expected = Math.max(0, Math.round(input.expectedSaleCents))
  const shipping = Math.max(0, Math.round(input.shippingCents))
  const other = Math.max(0, Math.round(input.otherCents))
  const fixedFee = Math.max(0, Math.round(input.feesFixedCents))
  const feePercent = clamp(input.feesPercent, 0, 100) / 100
  const targetMargin = clamp(input.targetMarginPercent, 0, 100) / 100
  const minProfit = Math.max(0, Math.round(input.minProfitCents))

  const cost = purchase + shipping + other
  const warnings: ProfitabilityWarning[] = ['estimated_only']

  const netRevenueAt = (price: number): number =>
    Math.round(price * (1 - feePercent)) - fixedFee

  const netRevenue = netRevenueAt(expected)
  const profit = netRevenue - cost
  const margin = expected > 0 ? (profit / expected) * 100 : null
  const roi = cost > 0 ? (profit / cost) * 100 : null

  // Precio de equilibrio: cubrir coste y comision fija sin ganar ni perder.
  const breakEven = feePercent < 1 ? Math.max(0, Math.ceil((fixedFee + cost) / (1 - feePercent))) : 0

  // Precio minimo para alcanzar el beneficio minimo deseado.
  const priceForProfit =
    feePercent < 1 ? Math.max(0, Math.ceil((minProfit + fixedFee + cost) / (1 - feePercent))) : null

  // Precio minimo para alcanzar el margen objetivo.
  let priceForMargin: number | null = null
  let marginUnreachable = false
  if (feePercent + targetMargin < 1) {
    priceForMargin = Math.max(0, Math.ceil((fixedFee + cost) / (1 - feePercent - targetMargin)))
  } else if (targetMargin > 0) {
    // Con esa comision y ese margen objetivo, ningun precio lo consigue.
    marginUnreachable = true
    warnings.push('target_unreachable')
  }

  const candidates = [priceForProfit, priceForMargin].filter((value): value is number => value !== null)
  // Si el margen objetivo es inalcanzable no se publica un "precio minimo" que
  // en realidad no cumpliria lo que el usuario ha pedido.
  const minSalePrice = marginUnreachable ? null : candidates.length > 0 ? Math.max(...candidates) : null

  // Compra maxima: despejando purchase de beneficio >= max(minProfit, P × margen).
  const requiredProfit = Math.max(minProfit, Math.round(expected * targetMargin))
  const maxPurchase = expected > 0 ? netRevenue - requiredProfit - shipping - other : null

  if (expected <= 0) warnings.push('expected_price_missing')
  if (profit < 0) warnings.push('already_at_loss')
  else if (profit < minProfit) warnings.push('below_min_profit')
  else if (margin !== null && margin < input.targetMarginPercent) warnings.push('below_target_margin')

  return {
    costCents: cost,
    netRevenueCents: netRevenue,
    estimatedProfitCents: profit,
    marginPercent: margin,
    roiPercent: roi,
    breakEvenPriceCents: breakEven,
    minSalePriceCents: minSalePrice,
    maxPurchasePriceCents: maxPurchase,
    effectiveFeePercent: feePercent * 100,
    warnings
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

// ---------------------------------------------------------------------------
// Indicadores de inventario
// ---------------------------------------------------------------------------

/**
 * Rotacion de inventario (veces al anyo).
 *   rotacion = costeDeLoVendidoEnElPeriodo / capitalMedioInmovilizado
 * Devuelve `null` si no hay capital medio con el que comparar.
 */
export function inventoryTurns(unitsSoldCostCents: number, averageCapitalCents: number): number | null {
  if (averageCapitalCents <= 0) return null
  return unitsSoldCostCents / averageCapitalCents
}

/**
 * Antiguedad media del inventario en dias, ponderada por capital inmovilizado.
 * Pondera por dinero y no por numero de articulos porque 10 camisetas de 5 EUR
 * no significan lo mismo que 10 moviles de 300 EUR.
 */
export function weightedAverageAgeDays(
  entries: readonly { ageDays: number; capitalCents: number }[]
): number | null {
  const totalCapital = entries.reduce((sum, entry) => sum + Math.max(0, entry.capitalCents), 0)
  if (totalCapital <= 0) return null
  const weighted = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.ageDays) * Math.max(0, entry.capitalCents),
    0
  )
  return weighted / totalCapital
}
