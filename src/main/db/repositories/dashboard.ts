/**
 * RESALEVAULT - Panel de resumen.
 *
 * Todas las cifras proceden de consultas reales sobre la tabla `products`.
 * Formulas (ver docs/FORMULAS.md):
 *   capitalInvestedCents = SUM(coste total) de articulos NO vendidos ni archivados
 *   inventoryRetailCents = SUM(precio previsto) de esos mismos articulos
 *   grossSalesCents      = SUM(precio final) de articulos vendidos/enviados
 *   realizedProfitCents  = SUM(precio final - coste total) de esos articulos
 *   potentialProfitCents = inventoryRetail - capitalInvested
 *
 * IMPORTANTE: `realizedProfitCents` es BENEFICIO BRUTO. Todavia no descuenta
 * comisiones de plataforma ni gastos de envio: el modulo de pedidos pertenece a
 * la Fase 3. La interfaz lo etiqueta como bruto para no confundirlo con el
 * beneficio neto.
 */

import type { DashboardSummary } from '@shared/types'
import type { Database } from '../database'
import { listRecentActivity } from './activity'
import { toNumber, toStringValue } from '../support'

export interface DashboardOptions {
  staleThresholds: readonly number[]
  activityLimit?: number
}

const CAPITAL_EXPR = '(p.purchase_price_cents + p.acquisition_fees_cents)'
const AGE_EXPR = "CAST(julianday('now') - julianday(COALESCE(p.purchase_date, p.created_at)) AS INTEGER)"
const NOT_SOLD = "p.archived_at IS NULL AND p.status NOT IN ('sold','shipped')"
const SOLD = "p.status IN ('sold','shipped')"

interface AgeBucket {
  /** Clave interna estable. */
  key: string
  /** Etiqueta neutra; el renderer la traduce y le anade la unidad de dias. */
  label: string
  whereSql: string
}

/** Construye las franjas de antiguedad a partir de los umbrales configurados. */
export function buildAgeBuckets(thresholds: readonly number[]): AgeBucket[] {
  const sorted = [...new Set(thresholds.filter((t) => Number.isFinite(t) && t > 0))]
    .map((t) => Math.round(t))
    .sort((a, b) => a - b)

  if (sorted.length === 0) return []

  const buckets: AgeBucket[] = []
  let lowerBound = 0

  for (const threshold of sorted) {
    buckets.push({
      key: `lt_${threshold}`,
      label: `${lowerBound}-${threshold}`,
      whereSql: `age < ${threshold} AND age >= ${lowerBound}`
    })
    lowerBound = threshold
  }

  const last = sorted[sorted.length - 1] as number
  buckets.push({
    key: `gte_${last}`,
    label: `${last}+`,
    whereSql: `age >= ${last}`
  })

  return buckets
}

export function buildDashboardSummary(db: Database, options: DashboardOptions): DashboardSummary {
  const counts = db.get<Record<string, number>>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN p.status = 'available' THEN 1 ELSE 0 END) AS available,
       SUM(CASE WHEN p.status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
       SUM(CASE WHEN p.status = 'to_prepare' THEN 1 ELSE 0 END) AS to_prepare,
       SUM(CASE WHEN ${SOLD} THEN 1 ELSE 0 END) AS sold,
       SUM(CASE WHEN p.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
     FROM products p`
  )

  const money = db.get<Record<string, number>>(
    `SELECT
       COALESCE(SUM(CASE WHEN ${NOT_SOLD} THEN ${CAPITAL_EXPR} ELSE 0 END), 0) AS capital,
       COALESCE(SUM(CASE WHEN ${NOT_SOLD} THEN p.expected_sale_price_cents ELSE 0 END), 0) AS retail,
       COALESCE(SUM(CASE WHEN ${SOLD} THEN COALESCE(p.final_sale_price_cents, 0) ELSE 0 END), 0) AS gross,
       COALESCE(SUM(CASE WHEN ${SOLD} THEN COALESCE(p.final_sale_price_cents, 0) - ${CAPITAL_EXPR} ELSE 0 END), 0) AS realized,
       COALESCE(SUM(CASE WHEN ${NOT_SOLD} THEN p.expected_sale_price_cents - ${CAPITAL_EXPR} ELSE 0 END), 0) AS potential
     FROM products p`
  )

  const buckets = buildAgeBuckets(options.staleThresholds)
  const staleByAge: DashboardSummary['stolenByAge'] = []

  if (buckets.length > 0) {
    // Una sola consulta: se etiquetan las filas por franja y se agregan.
    const caseSql = buckets
      .map((bucket) => `WHEN ${bucket.whereSql} THEN '${bucket.key}'`)
      .join(' ')

    const rows = db.all<{ bucket: string; n: number; capital: number }>(
      `WITH aged AS (
         SELECT ${CAPITAL_EXPR} AS capital, ${AGE_EXPR} AS age
         FROM products p
         WHERE ${NOT_SOLD}
       )
       SELECT CASE ${caseSql} ELSE NULL END AS bucket,
              COUNT(*) AS n,
              COALESCE(SUM(capital), 0) AS capital
       FROM aged
       WHERE bucket IS NOT NULL
       GROUP BY bucket`
    )

    for (const bucket of buckets) {
      const row = rows.find((r) => r.bucket === bucket.key)
      staleByAge.push({
        bucket: bucket.label,
        count: toNumber(row?.n),
        capitalCents: toNumber(row?.capital)
      })
    }
  }

  const topCategories = db
    .all<{ category_id: string | null; name: string | null; n: number; capital: number }>(
      `WITH RECURSIVE cat_tree(id, root_id, root_name) AS (
         SELECT id, id, name FROM categories WHERE parent_id IS NULL
         UNION ALL
         SELECT c.id, t.root_id, t.root_name FROM categories c JOIN cat_tree t ON c.parent_id = t.id
       )
       SELECT t.root_id AS category_id, t.root_name AS name, COUNT(*) AS n,
              COALESCE(SUM(${CAPITAL_EXPR}), 0) AS capital
       FROM products p
       LEFT JOIN cat_tree t ON t.id = p.category_id
       WHERE ${NOT_SOLD}
       GROUP BY t.root_id
       ORDER BY n DESC, t.root_name COLLATE NOCASE ASC
       LIMIT 8`
    )
    .map((row) => ({
      categoryId: row.category_id,
      name: toStringValue(row.name),
      count: toNumber(row.n),
      capitalCents: toNumber(row.capital)
    }))

  return {
    totalItems: toNumber(counts?.total),
    availableItems: toNumber(counts?.available),
    reservedItems: toNumber(counts?.reserved),
    toPrepareItems: toNumber(counts?.to_prepare),
    soldItems: toNumber(counts?.sold),
    archivedItems: toNumber(counts?.archived),
    capitalInvestedCents: toNumber(money?.capital),
    inventoryRetailCents: toNumber(money?.retail),
    grossSalesCents: toNumber(money?.gross),
    realizedProfitCents: toNumber(money?.realized),
    potentialProfitCents: toNumber(money?.potential),
    stolenByAge: staleByAge,
    topCategories,
    recentActivity: listRecentActivity(db, options.activityLimit ?? 12)
  }
}
