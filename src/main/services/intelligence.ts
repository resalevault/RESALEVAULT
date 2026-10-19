/**
 * RESALEVAULT - RESALEVAULT Intelligence.
 *
 * Todas las alertas se generan con REGLAS LOCALES sobre la base de datos. No se
 * usa ninguna IA: asi funcionan sin conexion, son instantaneas y no cuestan
 * dinero. La IA, cuando llegue, solo se usara para explicar o resumir.
 *
 * Principios de honestidad aplicados a cada alerta:
 *  - Se declaran los DATOS EXACTOS en los que se basa (`facts`), con su valor.
 *  - Se distinguen hechos de estimaciones: una antiguedad es un hecho; un
 *    beneficio previsto es una estimacion y se etiqueta como tal.
 *  - No se promete ningun aumento de beneficio ni se presenta una correlacion
 *    como causa.
 *  - El usuario puede descartar cada alerta (con caducidad) y ajustar umbrales.
 *  - Ninguna recomendacion se aplica sola.
 */

import type {
  Insight,
  InsightReport,
  InsightSeverity,
  IntelligenceThresholds
} from '@shared/types-modules'
import type { Database, SqlParam } from '../db/database'
import { nowIso, toNumber, toStringValue } from '../db/support'

const THRESHOLDS_KEY = 'intelligence.thresholds'

export const DEFAULT_THRESHOLDS: IntelligenceThresholds = {
  staleDays: 60,
  lowMarginPercent: 15,
  maxCapitalSharePercent: 50,
  pendingPrepDays: 14,
  pendingOrderDays: 5,
  returnsRatePercent: 15,
  expenseGrowthPercent: 30,
  enabled: true
}

interface InsightDraft {
  ruleId: string
  severity: InsightSeverity
  titleKey: string
  facts: Array<{ labelKey: string; value: string }>
  actions?: Insight['actions']
  subjectIds?: string[]
  subject?: string
  configurable?: boolean
}

export class IntelligenceService {
  constructor(private readonly db: Database) {}

  getThresholds(): IntelligenceThresholds {
    const raw = this.db.scalar<string>('SELECT value FROM settings WHERE key = $key', { $key: THRESHOLDS_KEY })
    if (!raw) return { ...DEFAULT_THRESHOLDS }
    try {
      const parsed = JSON.parse(raw) as Partial<IntelligenceThresholds>
      return { ...DEFAULT_THRESHOLDS, ...parsed }
    } catch {
      return { ...DEFAULT_THRESHOLDS }
    }
  }

  setThresholds(patch: Partial<IntelligenceThresholds>): IntelligenceThresholds {
    const next = { ...this.getThresholds(), ...patch }
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)
       ON CONFLICT(key) DO UPDATE SET value = $value, updated_at = $at`,
      { $key: THRESHOLDS_KEY, $value: JSON.stringify(next), $at: nowIso() }
    )
    return next
  }

  dismiss(input: { key: string; ruleId: string; subject?: string; days?: number }): void {
    const days = input.days ?? 0
    const until =
      days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null

    this.db.run(
      `INSERT INTO intelligence_state (key, rule_id, subject, action, until_at, updated_at)
       VALUES ($key, $rule, $subject, 'dismissed', $until, $at)
       ON CONFLICT(key) DO UPDATE SET until_at = $until, updated_at = $at`,
      {
        $key: input.key,
        $rule: input.ruleId,
        $subject: input.subject ?? '',
        $until: until,
        $at: nowIso()
      }
    )
  }

  restore(key: string): void {
    this.db.run('DELETE FROM intelligence_state WHERE key = $key', { $key: key })
  }

  /** Claves descartadas y todavia vigentes. */
  private activeDismissals(): Set<string> {
    const rows = this.db.all<{ key: string; until_at: string | null }>(
      "SELECT key, until_at FROM intelligence_state WHERE action = 'dismissed'"
    )
    const now = Date.now()
    const active = new Set<string>()
    for (const row of rows) {
      if (!row.until_at) {
        active.add(row.key)
        continue
      }
      const until = new Date(row.until_at).getTime()
      if (Number.isNaN(until) || until > now) active.add(row.key)
    }
    return active
  }

  report(): InsightReport {
    const thresholds = this.getThresholds()
    const dismissed = this.activeDismissals()
    const skipped: string[] = []
    const drafts: InsightDraft[] = []

    const hasProducts = toNumber(this.db.scalar<number>('SELECT COUNT(*) AS v FROM products')) > 0
    const hasOrders = toNumber(this.db.scalar<number>('SELECT COUNT(*) AS v FROM orders')) > 0

    if (!thresholds.enabled) {
      return {
        generatedAt: nowIso(),
        rulesRun: 0,
        insights: [],
        counts: { critical: 0, warning: 0, info: 0 },
        skipped: ['all'],
        thresholds
      }
    }

    // -----------------------------------------------------------------------
    // 1. Inventario vacio
    // -----------------------------------------------------------------------
    if (!hasProducts) {
      drafts.push({
        ruleId: 'inventory_empty',
        severity: 'info',
        titleKey: 'inventory.emptyTitle',
        facts: [{ labelKey: 'common.total', value: '0' }],
        actions: [{ kind: 'open_settings' }]
      })
    }

    // -----------------------------------------------------------------------
    // 2. Articulos que se venderian con perdidas (hecho, no estimacion)
    // -----------------------------------------------------------------------
    if (hasProducts) {
      const negative = this.db.all<Record<string, unknown>>(
        `SELECT id, sku, name, purchase_price_cents + acquisition_fees_cents AS cost,
                expected_sale_price_cents AS expected
         FROM products
         WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')
           AND expected_sale_price_cents > 0
           AND expected_sale_price_cents < (purchase_price_cents + acquisition_fees_cents)
         ORDER BY (expected_sale_price_cents - (purchase_price_cents + acquisition_fees_cents)) ASC
         LIMIT 10`
      )

      for (const row of negative) {
        const cost = toNumber(row.cost)
        const expected = toNumber(row.expected)
        drafts.push({
          ruleId: 'negative_margin',
          severity: 'critical',
          titleKey: 'insights.rules.negative_margin',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [
            { labelKey: 'product.totalCost', value: cents(cost) },
            { labelKey: 'product.expectedPrice', value: cents(expected) },
            { labelKey: 'product.estimatedMargin', value: cents(expected - cost) }
          ],
          actions: [{ kind: 'open_product', target: toStringValue(row.id) }, { kind: 'review_price' }]
        })
      }

      // ---------------------------------------------------------------------
      // 3. Margen bajo
      // ---------------------------------------------------------------------
      const lowMargin = this.db.all<Record<string, unknown>>(
        `SELECT id, sku, name, purchase_price_cents + acquisition_fees_cents AS cost,
                expected_sale_price_cents AS expected
         FROM products
         WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')
           AND expected_sale_price_cents > 0
           AND expected_sale_price_cents >= (purchase_price_cents + acquisition_fees_cents)
         ORDER BY (expected_sale_price_cents - (purchase_price_cents + acquisition_fees_cents)) * 1.0
                  / expected_sale_price_cents ASC
         LIMIT 25`
      )

      const below = lowMargin.filter((row) => {
        const margin = ((toNumber(row.expected) - toNumber(row.cost)) / toNumber(row.expected)) * 100
        return margin < thresholds.lowMarginPercent
      })

      for (const row of below) {
        const cost = toNumber(row.cost)
        const expected = toNumber(row.expected)
        const margin = expected > 0 ? ((expected - cost) / expected) * 100 : 0
        drafts.push({
          ruleId: 'low_margin',
          severity: 'warning',
          titleKey: 'insights.rules.low_margin',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [
            { labelKey: 'product.expectedPrice', value: cents(expected) },
            { labelKey: 'product.marginPercent', value: margin.toFixed(1) + ' %' },
            { labelKey: 'insights.thresholds.lowMarginPercent', value: String(thresholds.lowMarginPercent) + ' %' }
          ],
          actions: [{ kind: 'open_product', target: toStringValue(row.id) }, { kind: 'review_price' }]
        })
      }

      // ---------------------------------------------------------------------
      // 4. Stock estancado
      // ---------------------------------------------------------------------
      const stale = this.db.all<Record<string, unknown>>(
        `SELECT id, sku, name, expected_sale_price_cents AS expected,
                purchase_price_cents + acquisition_fees_cents AS cost,
                CAST(julianday('now') - julianday(COALESCE(purchase_date, created_at)) AS INTEGER) AS age
         FROM products
         WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')
           AND CAST(julianday('now') - julianday(COALESCE(purchase_date, created_at)) AS INTEGER) >= $days
         ORDER BY age DESC LIMIT 12`,
        { $days: thresholds.staleDays }
      )

      for (const row of stale) {
        drafts.push({
          ruleId: 'stale_stock',
          severity: 'warning',
          titleKey: 'insights.rules.stale_stock',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [
            { labelKey: 'inventory.columnAge', value: String(toNumber(row.age)) },
            { labelKey: 'product.totalCost', value: cents(toNumber(row.cost)) },
            { labelKey: 'insights.thresholds.staleDays', value: String(thresholds.staleDays) }
          ],
          actions: [{ kind: 'open_product', target: toStringValue(row.id) }, { kind: 'review_price' }]
        })
      }

      // ---------------------------------------------------------------------
      // 5. Datos incompletos (afecta directamente a la conversion del anuncio)
      // ---------------------------------------------------------------------
      const incomplete = this.db.all<Record<string, unknown>>(
        `SELECT p.id, p.sku, p.name,
                (SELECT COUNT(*) FROM product_media m WHERE m.product_id = p.id AND m.kind = 'photo') AS photos,
                p.category_id, p.location_id, p.description
         FROM products p
         WHERE p.archived_at IS NULL AND p.status NOT IN ('sold','shipped')
           AND ((SELECT COUNT(*) FROM product_media m WHERE m.product_id = p.id AND m.kind = 'photo') = 0
                OR p.category_id IS NULL
                OR p.location_id IS NULL
                OR TRIM(p.description) = '')
         ORDER BY p.updated_at DESC LIMIT 15`
      )

      for (const row of incomplete) {
        const missing: string[] = []
        if (toNumber(row.photos) === 0) missing.push('media.photos')
        if (row.category_id === null) missing.push('common.category')
        if (row.location_id === null) missing.push('common.location')
        if (String(row.description ?? '').trim() === '') missing.push('common.description')

        drafts.push({
          ruleId: 'missing_data',
          severity: 'info',
          titleKey: 'insights.rules.missing_data',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [{ labelKey: 'insights.facts', value: missing.join(', ') }],
          actions: [{ kind: 'open_product', target: toStringValue(row.id) }]
        })
      }

      // ---------------------------------------------------------------------
      // 6. Disponibles sin ningun anuncio registrado
      // ---------------------------------------------------------------------
      const unlisted = this.db.get<Record<string, unknown>>(
        `SELECT COUNT(*) AS n
         FROM products p
         WHERE p.archived_at IS NULL AND p.status = 'available'
           AND NOT EXISTS (SELECT 1 FROM product_listings pl WHERE pl.product_id = p.id)`
      )
      const unlistedCount = toNumber(unlisted?.n)
      if (unlistedCount > 0) {
        drafts.push({
          ruleId: 'unlisted',
          severity: 'info',
          titleKey: 'insights.rules.unlisted',
          facts: [{ labelKey: 'common.total', value: String(unlistedCount) }],
          actions: [{ kind: 'open_settings' }]
        })
      }

      // ---------------------------------------------------------------------
      // 7. Pendientes de preparar demasiado tiempo
      // ---------------------------------------------------------------------
      const pendingPrep = this.db.all<Record<string, unknown>>(
        `SELECT id, sku, name,
                CAST(julianday('now') - julianday(COALESCE(purchase_date, created_at)) AS INTEGER) AS age
         FROM products
         WHERE archived_at IS NULL AND status = 'to_prepare'
           AND CAST(julianday('now') - julianday(COALESCE(purchase_date, created_at)) AS INTEGER) >= $days
         ORDER BY age DESC LIMIT 10`,
        { $days: thresholds.pendingPrepDays }
      )

      for (const row of pendingPrep) {
        drafts.push({
          ruleId: 'pending_prep',
          severity: 'info',
          titleKey: 'insights.rules.pending_prep',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [
            { labelKey: 'common.status', value: 'to_prepare' },
            { labelKey: 'inventory.columnAge', value: String(toNumber(row.age)) }
          ],
          actions: [{ kind: 'open_product', target: toStringValue(row.id) }]
        })
      }

      // ---------------------------------------------------------------------
      // 8. Concentracion de capital en una categoria raiz
      // ---------------------------------------------------------------------
      const concentration = this.db.all<Record<string, unknown>>(
        `WITH RECURSIVE tree(id, root_id, root_name) AS (
           SELECT id, id, name FROM categories WHERE parent_id IS NULL
           UNION ALL
           SELECT c.id, t.root_id, t.root_name FROM categories c JOIN tree t ON c.parent_id = t.id
         )
         SELECT t.root_id, t.root_name,
                COALESCE(SUM(p.purchase_price_cents + p.acquisition_fees_cents), 0) AS capital
         FROM products p
         LEFT JOIN tree t ON t.id = p.category_id
         WHERE p.archived_at IS NULL AND p.status NOT IN ('sold','shipped')
         GROUP BY t.root_id ORDER BY capital DESC`
      )

      const totalCapital = concentration.reduce((sum, row) => sum + toNumber(row.capital), 0)
      for (const row of concentration) {
        if (totalCapital <= 0) break
        const share = (toNumber(row.capital) / totalCapital) * 100
        if (share <= thresholds.maxCapitalSharePercent) continue
        drafts.push({
          ruleId: 'capital_concentration',
          severity: 'info',
          titleKey: 'insights.rules.capital_concentration',
          subject: toStringValue(row.root_id),
          facts: [
            { labelKey: 'common.category', value: toStringValue(row.root_name) || '-' },
            { labelKey: 'analytics.capital', value: cents(toNumber(row.capital)) },
            { labelKey: 'analytics.capital', value: share.toFixed(1) + ' %' }
          ],
          actions: [{ kind: 'open_settings' }]
        })
      }
    }

    // -----------------------------------------------------------------------
    // 9. Pedidos sin enviar
    // -----------------------------------------------------------------------
    if (hasOrders) {
      const pendingOrders = this.db.all<Record<string, unknown>>(
        `SELECT id, order_number,
                CAST(julianday('now') - julianday(sold_at) AS INTEGER) AS age
         FROM orders
         WHERE status IN ('pending','preparing','packed')
           AND CAST(julianday('now') - julianday(sold_at) AS INTEGER) >= $days
         ORDER BY age DESC LIMIT 10`,
        { $days: thresholds.pendingOrderDays }
      )

      for (const row of pendingOrders) {
        drafts.push({
          ruleId: 'pending_orders',
          severity: 'warning',
          titleKey: 'insights.rules.pending_orders',
          subject: toStringValue(row.id),
          subjectIds: [toStringValue(row.id)],
          facts: [{ labelKey: 'inventory.columnAge', value: String(toNumber(row.age)) }],
          actions: [{ kind: 'open_order', target: toStringValue(row.id) }]
        })
      }

      // ---------------------------------------------------------------------
      // 10. Tasa de devoluciones
      // ---------------------------------------------------------------------
      const returnStats = this.db.get<Record<string, unknown>>(
        `SELECT COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM order_returns r WHERE r.order_id = o.id)
                                  THEN 1 ELSE 0 END), 0) AS with_returns
         FROM orders o WHERE o.status <> 'cancelled'`
      )
      const totalOrders = toNumber(returnStats?.orders)
      const withReturns = toNumber(returnStats?.with_returns)
      if (totalOrders >= 10) {
        const rate = (withReturns / totalOrders) * 100
        if (rate >= thresholds.returnsRatePercent) {
          drafts.push({
            ruleId: 'returns_rate',
            severity: 'warning',
            titleKey: 'insights.rules.returns_rate',
            facts: [
              { labelKey: 'analytics.returnsRate', value: rate.toFixed(1) + ' %' },
              { labelKey: 'analytics.ordersCount', value: String(totalOrders) },
              { labelKey: 'insights.thresholds.returnsRatePercent', value: String(thresholds.returnsRatePercent) + ' %' }
            ],
            actions: [{ kind: 'open_order' }]
          })
        }
      }
    }

    // -----------------------------------------------------------------------
    // 11. Crecimiento de gastos generales (mes actual vs anterior)
    // -----------------------------------------------------------------------
    const expenseMonths = this.db.all<Record<string, unknown>>(
      `SELECT substr(incurred_on, 1, 7) AS month, COALESCE(SUM(amount_cents), 0) AS total
       FROM expenses GROUP BY month ORDER BY month DESC LIMIT 2`
    )

    if (expenseMonths.length === 2) {
      const current = toNumber(expenseMonths[0]?.total)
      const previous = toNumber(expenseMonths[1]?.total)
      if (previous > 0) {
        const growth = ((current - previous) / previous) * 100
        if (growth >= thresholds.expenseGrowthPercent) {
          drafts.push({
            ruleId: 'expense_growth',
            severity: 'warning',
            titleKey: 'insights.rules.expense_growth',
            facts: [
              { labelKey: 'common.date', value: toStringValue(expenseMonths[1]?.month) },
              { labelKey: 'expense.total', value: cents(previous) },
              { labelKey: 'expense.total', value: cents(current) },
              { labelKey: 'analytics.margin', value: growth.toFixed(1) + ' %' }
            ],
            actions: [{ kind: 'open_settings' }]
          })
        }
      }
    }

    // -----------------------------------------------------------------------
    // 12. Sin ventas recientes teniendo inventario
    // -----------------------------------------------------------------------
    if (hasProducts) {
      const recentSales = toNumber(
        this.db.scalar<number>(
          `SELECT COUNT(*) AS v FROM orders
           WHERE status <> 'cancelled' AND sold_at >= date('now', '-30 day')`
        )
      )
      const liveInventory = toNumber(
        this.db.scalar<number>(
          "SELECT COUNT(*) AS v FROM products WHERE archived_at IS NULL AND status NOT IN ('sold','shipped')"
        )
      )
      if (recentSales === 0 && liveInventory > 0) {
        drafts.push({
          ruleId: 'no_sales_period',
          severity: 'info',
          titleKey: 'insights.rules.no_sales_period',
          facts: [
            { labelKey: 'common.days', value: '30' },
            { labelKey: 'dashboard.itemsAvailable', value: String(liveInventory) }
          ],
          actions: [{ kind: 'open_settings' }]
        })
      }
    }

    // -----------------------------------------------------------------------
    // Filtrado de descartadas y contadores
    // -----------------------------------------------------------------------
    const insights: Insight[] = []
    const counts: Record<InsightSeverity, number> = { critical: 0, warning: 0, info: 0 }

    for (const draft of drafts) {
      const key = `${draft.ruleId}:${draft.subject ?? ''}`
      if (dismissed.has(key)) continue

      counts[draft.severity] += 1
      insights.push({
        key,
        ruleId: draft.ruleId,
        severity: draft.severity,
        titleKey: draft.titleKey,
        facts: draft.facts,
        actions: draft.actions ?? [],
        subjectIds: draft.subjectIds ?? [],
        configurable: draft.configurable ?? true
      })
    }

    const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 }
    insights.sort((a, b) => order[a.severity] - order[b.severity])

    return {
      generatedAt: nowIso(),
      rulesRun: 12,
      insights,
      counts,
      skipped,
      thresholds
    }
  }
}

function cents(value: number): string {
  return (value / 100).toFixed(2)
}

export { THRESHOLDS_KEY }
export type { SqlParam }
