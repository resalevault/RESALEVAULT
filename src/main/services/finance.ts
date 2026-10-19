/**
 * RESALEVAULT - Informes financieros.
 *
 * La formula del beneficio de un pedido esta implementada DOS veces:
 *  1. En `shared/finance-extended.ts` (TypeScript, para un pedido concreto).
 *  2. Aqui, en SQL agregado, porque calcular 5.000 pedidos uno a uno seria
 *     inaceptablemente lento.
 *
 * Dos implementaciones de la misma formula son un riesgo de divergencia, asi
 * que hay una prueba automatizada que compara ambas sobre los mismos pedidos.
 * Si alguien cambia una y no la otra, la prueba falla.
 *
 * Honestidad de las cifras: alli donde repartir un coste exigiria inventar un
 * criterio (comisiones por categoria, por ejemplo) NO se publica beneficio
 * neto, sino el resultado DIRECTO de la mercancia. Un numero exacto y acotado
 * es mejor que un numero bonito e inventado.
 */

import type { FinanceQuery, FinanceReport, PeriodRange } from '@shared/types-modules'
import { computeOrderFinancials, inventoryTurns, weightedAverageAgeDays } from '@shared/finance-extended'
import { buildAgeBuckets } from '../db/repositories/dashboard'
import type { Database, SqlParam } from '../db/database'
import { toNumber, toStringValue } from '../db/support'

/** Condiciones sobre la fecha de venta, reutilizadas en todas las consultas. */
function periodFilter(query: FinanceQuery, params: Record<string, SqlParam>, alias = 'o'): string {
  const clauses: string[] = [`${alias}.status <> 'cancelled'`]
  if (query.from) {
    params.$from = query.from
    clauses.push(`${alias}.sold_at >= $from`)
  }
  if (query.to) {
    params.$to = query.to
    clauses.push(`${alias}.sold_at <= $to`)
  }
  if (query.platformIds && query.platformIds.length > 0) {
    const keys = query.platformIds.map((id, index) => {
      params[`$plat${index}`] = id
      return `$plat${index}`
    })
    clauses.push(`${alias}.platform_id IN (${keys.join(', ')})`)
  }
  return clauses.join(' AND ')
}

/**
 * CTE que reproduce exactamente `computeOrderFinancials` en SQL.
 * `totals` existe porque SQLite no permite usar un alias en la misma lista de
 * seleccion donde se define.
 */
function perOrderCte(query: FinanceQuery, params: Record<string, SqlParam>): string {
  return `
    WITH per_order AS (
      SELECT o.id, o.sold_at, o.platform_id, o.status,
             o.discount_cents, o.shipping_charged_cents, o.shipping_cost_cents, o.other_cents,
             (SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0)
                FROM order_items oi WHERE oi.order_id = o.id) AS goods_revenue,
             (SELECT COALESCE(SUM(oi.unit_cost_cents * oi.quantity), 0)
                FROM order_items oi WHERE oi.order_id = o.id) AS goods_cost,
             (SELECT COALESCE(SUM(f.amount_cents), 0)
                FROM order_fees f WHERE f.order_id = o.id) AS fees,
             (SELECT COALESCE(SUM(r.refund_cents), 0)
                FROM order_returns r WHERE r.order_id = o.id) AS refunds,
             (SELECT COALESCE(SUM(r.fee_refund_cents), 0)
                FROM order_returns r WHERE r.order_id = o.id) AS fees_refunded,
             (SELECT COALESCE(SUM(r.shipping_lost_cents), 0)
                FROM order_returns r WHERE r.order_id = o.id) AS shipping_lost,
             (SELECT COALESCE(SUM(oi.quantity), 0)
                FROM order_items oi WHERE oi.order_id = o.id) AS units,
             (SELECT COUNT(*) FROM order_returns r2 WHERE r2.order_id = o.id) AS return_count
      FROM orders o
      WHERE ${periodFilter(query, params)}
    ),
    totals AS (
      SELECT *,
             (goods_revenue - discount_cents + shipping_charged_cents) AS net_revenue,
             (goods_revenue - discount_cents + shipping_charged_cents - goods_cost - fees
               - shipping_cost_cents - other_cents - refunds + fees_refunded - shipping_lost) AS net_profit
      FROM per_order
    )
  `
}

export class FinanceService {
  constructor(
    private readonly db: Database,
    private readonly staleThresholds: readonly number[],
    private readonly targetMarginPercent = 25
  ) {}

  report(query: FinanceQuery = {}): FinanceReport {
    const params: Record<string, SqlParam> = {}
    const cte = perOrderCte(query, params)

    // -----------------------------------------------------------------------
    // Pedidos y resultado
    // -----------------------------------------------------------------------
    const totals = this.db.get<Record<string, number>>(
      `${cte}
       SELECT COUNT(*) AS order_count,
              COALESCE(SUM(units), 0) AS units,
              COALESCE(SUM(goods_revenue), 0) AS goods_revenue,
              COALESCE(SUM(discount_cents), 0) AS discount,
              COALESCE(SUM(shipping_charged_cents), 0) AS shipping_charged,
              COALESCE(SUM(net_revenue), 0) AS net_revenue,
              COALESCE(SUM(goods_cost), 0) AS goods_cost,
              COALESCE(SUM(fees), 0) AS fees,
              COALESCE(SUM(shipping_cost_cents), 0) AS shipping_cost,
              COALESCE(SUM(other_cents), 0) AS other_cost,
              COALESCE(SUM(refunds), 0) AS refunds,
              COALESCE(SUM(fees_refunded), 0) AS fees_refunded,
              COALESCE(SUM(shipping_lost), 0) AS shipping_lost,
              COALESCE(SUM(net_profit), 0) AS net_profit,
              COALESCE(SUM(CASE WHEN return_count > 0 THEN 1 ELSE 0 END), 0) AS orders_with_returns
       FROM totals`,
      params
    )

    const orderCount = toNumber(totals?.order_count)
    const netRevenue = toNumber(totals?.net_revenue)
    const goodsCost = toNumber(totals?.goods_cost)
    const netProfit = toNumber(totals?.net_profit)

    // -----------------------------------------------------------------------
    // Dimensiones
    // -----------------------------------------------------------------------
    const byPlatform = this.db
      .all<Record<string, unknown>>(
        `${cte}
         SELECT t.platform_id, pf.name AS platform_name,
                COUNT(*) AS order_count,
                COALESCE(SUM(t.units), 0) AS units,
                COALESCE(SUM(t.net_revenue), 0) AS net_revenue,
                COALESCE(SUM(t.net_profit), 0) AS net_profit
         FROM totals t
         LEFT JOIN platforms pf ON pf.id = t.platform_id
         GROUP BY t.platform_id
         ORDER BY net_profit DESC`,
        params
      )
      .map((row) => ({
        platformId: (row.platform_id as string | null) ?? null,
        name: toStringValue(row.platform_name),
        orders: toNumber(row.order_count),
        units: toNumber(row.units),
        netRevenueCents: toNumber(row.net_revenue),
        netProfitCents: toNumber(row.net_profit),
        marginPercent:
          toNumber(row.net_revenue) > 0 ? (toNumber(row.net_profit) / toNumber(row.net_revenue)) * 100 : null
      }))

    const expenseParams: Record<string, SqlParam> = {}
    const expenseClauses: string[] = []
    if (query.from) {
      expenseParams.$efrom = query.from
      expenseClauses.push('incurred_on >= $efrom')
    }
    if (query.to) {
      expenseParams.$eto = query.to
      expenseClauses.push('incurred_on <= $eto')
    }
    const expenseWhere = expenseClauses.length > 0 ? `WHERE ${expenseClauses.join(' AND ')}` : ''

    const expensesByCategory = this.db
      .all<{ category: string; total: number }>(
        `SELECT category, COALESCE(SUM(amount_cents), 0) AS total FROM expenses ${expenseWhere}
         GROUP BY category ORDER BY total DESC`,
        expenseParams
      )
      .map((row) => ({ category: toStringValue(row.category), totalCents: toNumber(row.total) }))

    const expensesTotal = expensesByCategory.reduce((sum, entry) => sum + entry.totalCents, 0)

    const byMonthRaw = this.db.all<Record<string, unknown>>(
      `${cte}
       SELECT substr(t.sold_at, 1, 7) AS month,
              COUNT(*) AS order_count,
              COALESCE(SUM(t.units), 0) AS units,
              COALESCE(SUM(t.net_revenue), 0) AS net_revenue,
              COALESCE(SUM(t.net_profit), 0) AS net_profit
       FROM totals t
       GROUP BY month ORDER BY month ASC`,
      params
    )

    const expensesByMonth = this.db.all<{ month: string; total: number }>(
      `SELECT substr(incurred_on, 1, 7) AS month, COALESCE(SUM(amount_cents), 0) AS total
       FROM expenses ${expenseWhere} GROUP BY month`,
      expenseParams
    )
    const expenseMonthMap = new Map(expensesByMonth.map((row) => [row.month, toNumber(row.total)]))

    const byMonth = byMonthRaw.map((row) => {
      const month = toStringValue(row.month)
      return {
        month,
        orders: toNumber(row.order_count),
        units: toNumber(row.units),
        netRevenueCents: toNumber(row.net_revenue),
        netProfitCents: toNumber(row.net_profit),
        expensesCents: expenseMonthMap.get(month) ?? 0
      }
    })

    // ------------------------------------------------------------------
    // Por categoria y por estado: resultado DIRECTO de la mercancia.
    // Las comisiones y los envios no se reparten: se calcula lo que es exacto.
    // ------------------------------------------------------------------
    const lineFilter = periodFilter(query, params)
    const byCategory = this.db
      .all<Record<string, unknown>>(
        `WITH RECURSIVE cat_tree(id, root_id, root_name) AS (
           SELECT id, id, name FROM categories WHERE parent_id IS NULL
           UNION ALL
           SELECT c.id, t.root_id, t.root_name FROM categories c JOIN cat_tree t ON c.parent_id = t.id
         )
         SELECT t.root_id AS category_id, t.root_name AS category_name,
                COALESCE(SUM(oi.quantity), 0) AS units,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue,
                COALESCE(SUM(oi.unit_cost_cents * oi.quantity), 0) AS cost
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN cat_tree t ON t.id = p.category_id
         WHERE ${lineFilter}
         GROUP BY t.root_id
         ORDER BY revenue DESC
         LIMIT 20`,
        params
      )
      .map((row) => {
        const revenue = toNumber(row.revenue)
        const cost = toNumber(row.cost)
        return {
          categoryId: (row.category_id as string | null) ?? null,
          name: toStringValue(row.category_name),
          units: toNumber(row.units),
          goodsRevenueCents: revenue,
          goodsCostCents: cost,
          grossProfitCents: revenue - cost,
          marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null
        }
      })

    const byCondition = this.db
      .all<Record<string, unknown>>(
        `SELECT COALESCE(p.condition, 'unknown') AS condition,
                COALESCE(SUM(oi.quantity), 0) AS units,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue,
                COALESCE(SUM(oi.unit_cost_cents * oi.quantity), 0) AS cost
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE ${lineFilter}
         GROUP BY condition
         ORDER BY revenue DESC`,
        params
      )
      .map((row) => {
        const revenue = toNumber(row.revenue)
        const cost = toNumber(row.cost)
        return {
          condition: toStringValue(row.condition, 'unknown'),
          units: toNumber(row.units),
          goodsRevenueCents: revenue,
          goodsCostCents: cost,
          grossProfitCents: revenue - cost,
          marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null
        }
      })

    const productsRanked = this.db.all<Record<string, unknown>>(
      `SELECT oi.product_id, oi.sku, oi.title,
              COALESCE(SUM(oi.quantity), 0) AS units,
              COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue,
              COALESCE(SUM(oi.unit_cost_cents * oi.quantity), 0) AS cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${lineFilter} AND oi.product_id IS NOT NULL
       GROUP BY oi.product_id
       ORDER BY revenue DESC`,
      params
    )

    const toProductRow = (row: Record<string, unknown>): FinanceReport['topProducts'][number] => {
      const revenue = toNumber(row.revenue)
      const cost = toNumber(row.cost)
      return {
        productId: toStringValue(row.product_id),
        sku: toStringValue(row.sku),
        title: toStringValue(row.title),
        units: toNumber(row.units),
        goodsRevenueCents: revenue,
        goodsCostCents: cost,
        grossProfitCents: revenue - cost,
        marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null
      }
    }

    const topProducts = productsRanked.slice(0, 10).map(toProductRow)
    // Los "peores" se ordenan por beneficio directo ascendente.
    const worstProducts = [...productsRanked]
      .sort((a, b) => {
        const profitA = toNumber(a.revenue) - toNumber(a.cost)
        const profitB = toNumber(b.revenue) - toNumber(b.cost)
        return profitA - profitB
      })
      .slice(0, 10)
      .map(toProductRow)

    // -----------------------------------------------------------------------
    // Inventario
    // -----------------------------------------------------------------------
    const inventory = this.db.get<Record<string, number>>(
      `SELECT COUNT(*) AS units,
              COALESCE(SUM(purchase_price_cents + acquisition_fees_cents), 0) AS capital,
              COALESCE(SUM(expected_sale_price_cents), 0) AS retail
       FROM products
       WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')`
    )

    const inventoryCapital = toNumber(inventory?.capital)

    const agedRows = this.db.all<{ age: number; capital: number }>(
      `SELECT CAST(julianday('now') - julianday(COALESCE(purchase_date, created_at)) AS INTEGER) AS age,
              (purchase_price_cents + acquisition_fees_cents) AS capital
       FROM products
       WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')`
    )

    const buckets = buildAgeBuckets(this.staleThresholds)
    const staleBuckets = buckets.map((bucket) => {
      const matching = agedRows.filter((row) => {
        const age = toNumber(row.age)
        if (bucket.key.startsWith('gte_')) return age >= Number(bucket.key.slice(4))
        const [lower, upper] = bucket.label.split('-').map(Number)
        return age >= (lower ?? 0) && age < (upper ?? 0)
      })
      return {
        bucket: bucket.label,
        count: matching.length,
        capitalCents: matching.reduce((sum, row) => sum + toNumber(row.capital), 0)
      }
    })

    const purchasesParams: Record<string, SqlParam> = {}
    const purchaseClauses: string[] = []
    if (query.from) {
      purchasesParams.$pfrom = query.from
      purchaseClauses.push('purchased_at >= $pfrom')
    }
    if (query.to) {
      purchasesParams.$pto = query.to
      purchaseClauses.push('purchased_at <= $pto')
    }
    const purchaseWhere = purchaseClauses.length > 0 ? `WHERE ${purchaseClauses.join(' AND ')}` : ''

    const purchaseTotals = this.db.get<Record<string, number>>(
      `SELECT COUNT(*) AS n,
              (SELECT COALESCE(SUM(pi.unit_cost_cents * pi.quantity), 0) FROM purchase_items pi
                WHERE pi.purchase_id IN (SELECT id FROM purchases ${purchaseWhere})) AS items,
              (SELECT COALESCE(SUM(p2.shipping_cents + p2.other_cents - p2.discount_cents), 0)
                FROM purchases p2 ${purchaseWhere.replace(/\bpurchased_at\b/g, 'p2.purchased_at')}) AS extra
       FROM purchases ${purchaseWhere}`,
      purchasesParams
    )

    const purchasesItems = toNumber(purchaseTotals?.items)
    const purchasesExtra = toNumber(purchaseTotals?.extra)

    const ordersWithReturns = toNumber(totals?.orders_with_returns)

    const report: FinanceReport = {
      period: { from: query.from ?? null, to: query.to ?? null },

      orders: {
        count: orderCount,
        units: toNumber(totals?.units),
        goodsRevenueCents: toNumber(totals?.goods_revenue),
        discountCents: toNumber(totals?.discount),
        shippingChargedCents: toNumber(totals?.shipping_charged),
        netRevenueCents: netRevenue,
        goodsCostCents: goodsCost,
        feesCents: toNumber(totals?.fees),
        shippingCostCents: toNumber(totals?.shipping_cost),
        otherCostCents: toNumber(totals?.other_cost),
        refundsCents: toNumber(totals?.refunds),
        feesRefundedCents: toNumber(totals?.fees_refunded),
        shippingLostCents: toNumber(totals?.shipping_lost),
        grossProfitCents: netRevenue - goodsCost,
        netProfitCents: netProfit,
        marginPercent: netRevenue > 0 ? (netProfit / netRevenue) * 100 : null,
        averageOrderCents: orderCount > 0 ? Math.round(netRevenue / orderCount) : 0,
        averageProfitCents: orderCount > 0 ? Math.round(netProfit / orderCount) : 0
      },

      expenses: { totalCents: expensesTotal, byCategory: expensesByCategory },

      purchases: {
        count: toNumber(purchaseTotals?.n),
        totalCents: purchasesItems + purchasesExtra,
        itemsCents: purchasesItems,
        extraCents: purchasesExtra
      },

      business: {
        netProfitCents: netProfit - expensesTotal,
        marginPercent: netRevenue > 0 ? ((netProfit - expensesTotal) / netRevenue) * 100 : null
      },

      inventory: {
        units: toNumber(inventory?.units),
        capitalCents: inventoryCapital,
        retailCents: toNumber(inventory?.retail),
        potentialCents: toNumber(inventory?.retail) - inventoryCapital,
        averageAgeDays: weightedAverageAgeDays(
          agedRows.map((row) => ({ ageDays: toNumber(row.age), capitalCents: toNumber(row.capital) }))
        ),
        // Se compara con el capital ACTUAL porque no hay historico de capital.
        // La interfaz lo indica para no dar a entender que es un promedio real.
        turnsPerYear: inventoryTurns(goodsCost, inventoryCapital),
        staleBuckets
      },

      byPlatform,
      byMonth,
      byCategory,
      byCondition,
      topProducts,
      worstProducts,
      returnsRatePercent: orderCount > 0 ? (ordersWithReturns / orderCount) * 100 : null
    }

    return report
  }

  /**
   * Comprobacion de coherencia: recalcula el beneficio con la implementacion de
   * TypeScript para un pedido concreto y lo compara con el SQL agregado.
   * Se usa en las pruebas y en el diagnostico.
   */
  crossCheckOrder(orderId: string): { sqlCents: number; typescriptCents: number; match: boolean } {
    const params: Record<string, SqlParam> = {}
    const row = this.db.get<Record<string, unknown>>(
      `${perOrderCte({}, params)} SELECT net_profit FROM totals WHERE id = $id`,
      { ...params, $id: orderId }
    )

    const header = this.db.get<{
      discount_cents: number
      shipping_charged_cents: number
      shipping_cost_cents: number
      other_cents: number
    }>(
      'SELECT discount_cents, shipping_charged_cents, shipping_cost_cents, other_cents FROM orders WHERE id = $id',
      { $id: orderId }
    )

    const items = this.db.all<{ quantity: number; unit_price_cents: number; unit_cost_cents: number }>(
      'SELECT quantity, unit_price_cents, unit_cost_cents FROM order_items WHERE order_id = $id',
      { $id: orderId }
    )
    const fees = this.db.all<{ amount_cents: number }>(
      'SELECT amount_cents FROM order_fees WHERE order_id = $id',
      { $id: orderId }
    )
    const returns = this.db.all<{
      refund_cents: number
      fee_refund_cents: number
      shipping_lost_cents: number
    }>(
      'SELECT refund_cents, fee_refund_cents, shipping_lost_cents FROM order_returns WHERE order_id = $id',
      { $id: orderId }
    )

    const typescript = computeOrderFinancials({
      items: items.map((item) => ({
        quantity: toNumber(item.quantity, 1),
        unitPriceCents: toNumber(item.unit_price_cents),
        unitCostCents: toNumber(item.unit_cost_cents)
      })),
      discountCents: toNumber(header?.discount_cents),
      shippingChargedCents: toNumber(header?.shipping_charged_cents),
      shippingCostCents: toNumber(header?.shipping_cost_cents),
      otherCents: toNumber(header?.other_cents),
      fees: fees.map((fee) => ({ amountCents: toNumber(fee.amount_cents) })),
      returns: returns.map((entry) => ({
        refundCents: toNumber(entry.refund_cents),
        feeRefundCents: toNumber(entry.fee_refund_cents),
        shippingLostCents: toNumber(entry.shipping_lost_cents)
      }))
    })

    const sqlCents = toNumber(row?.net_profit)
    return { sqlCents, typescriptCents: typescript.netProfitCents, match: sqlCents === typescript.netProfitCents }
  }

  /** Margen objetivo configurado, usado por las recomendaciones de precio. */
  get target(): number {
    return this.targetMarginPercent
  }
}

/** Utilidad para la interfaz: rango de un mes natural. */
export function monthRange(month: string): PeriodRange {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return { from: null, to: null }
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    from: `${year}-${String(monthNumber).padStart(2, '0')}-01`,
    to: `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
}
