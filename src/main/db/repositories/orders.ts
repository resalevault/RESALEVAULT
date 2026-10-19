/**
 * RESALEVAULT - Pedidos, comisiones, devoluciones y preparacion.
 *
 * Decisiones de integridad (todas protegen dinero):
 *
 *  1. **No se puede vender dos veces el mismo articulo.** Antes de crear un
 *     pedido se comprueba que ningun articulo este ya en un pedido vigente ni
 *     marcado como vendido. La comprobacion vive aqui, no en la interfaz.
 *  2. **El coste de venta se congela.** `order_items.unit_cost_cents`, `sku` y
 *     `title` copian el valor en el momento de la venta. Corregir despues el
 *     coste del articulo NO altera los pedidos cerrados.
 *  3. **El beneficio es NETO.** Se descuentan comisiones, envio asumido, otros
 *     cargos y devoluciones. El calculo esta en `shared/finance-extended.ts`.
 *  4. **Envio cobrado ≠ envio pagado.** Son campos separados: uno es ingreso y
 *     el otro coste. Sumarlos juntos falsearia el margen.
 *  5. **Un pedido no se marca como enviado sin confirmacion explicita.** El
 *     metodo exige `confirm: true` y, si no hay numero de seguimiento, lo
 *     advierte en lugar de inventarlo.
 *  6. **Eliminar exige cancelar antes** y la cancelacion DEVUELVE los articulos
 *     al inventario, revirtiendo su estado y su precio final.
 */

import type {
  Order,
  OrderCreateInput,
  OrderFee,
  OrderFeeKind,
  OrderFinancials,
  OrderItem,
  OrderQuery,
  OrderReturn,
  OrderStatus,
  OrderSummary,
  PickingCheck,
  PickingLine,
  PickingOrder,
  ScanResolution
} from '@shared/types-modules'
import type { Page } from '@shared/types'
import { ORDER_OPEN_STATUSES } from '@shared/types-modules'
import { computeOrderFinancials } from '@shared/finance-extended'
import type { Database, SqlParam } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import type { ProductRepository } from './products'
import { inClause, newId, nowIso, toNumber, toNullableString, toStringValue } from '../support'

const SORT_SQL: Record<NonNullable<OrderQuery['sort']>, string> = {
  date_desc: 'o.sold_at DESC, o.created_at DESC',
  date_asc: 'o.sold_at ASC, o.created_at ASC',
  profit_desc: 'o.sold_at DESC',
  profit_asc: 'o.sold_at ASC',
  number_asc: 'o.order_number COLLATE NOCASE ASC'
}

interface OrderRow {
  id: string
  order_number: string
  platform_id: string | null
  platform_name: string | null
  sold_at: string
  buyer: string
  status: string
  shipping_charged_cents: number
  shipping_cost_cents: number
  discount_cents: number
  other_cents: number
  payment_reference: string
  tracking_number: string
  carrier: string
  notes: string
  prepared_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  is_demo: number
  created_at: string
  updated_at: string
  units: number
  item_count: number
  has_return: number
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.platform_id, pf.name AS platform_name, o.sold_at, o.buyer,
         o.status, o.shipping_charged_cents, o.shipping_cost_cents, o.discount_cents, o.other_cents,
         o.payment_reference, o.tracking_number, o.carrier, o.notes,
         o.prepared_at, o.shipped_at, o.delivered_at, o.is_demo, o.created_at, o.updated_at,
         (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS units,
         (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = o.id) AS item_count,
         (SELECT COUNT(*) FROM order_returns r WHERE r.order_id = o.id) AS has_return
  FROM orders o
  LEFT JOIN platforms pf ON pf.id = o.platform_id
`

export class OrderRepository {
  constructor(
    private readonly db: Database,
    private readonly products: ProductRepository
  ) {}

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  list(query: OrderQuery = {}): Page<OrderSummary> {
    const page = Math.max(1, Math.floor(query.page ?? 1))
    const pageSize = Math.max(1, Math.min(200, Math.floor(query.pageSize ?? 50)))
    const sort = query.sort && SORT_SQL[query.sort] ? query.sort : 'date_desc'

    const clauses: string[] = []
    const params: Record<string, SqlParam> = {}

    if (query.search?.trim()) {
      params.$q = '%' + query.search.trim().replace(/[\\%_]/g, (m) => '\\' + m) + '%'
      clauses.push(
        `(o.order_number LIKE $q ESCAPE '\\' OR o.buyer LIKE $q ESCAPE '\\'
          OR o.tracking_number LIKE $q ESCAPE '\\' OR o.notes LIKE $q ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM order_items oi3 WHERE oi3.order_id = o.id
                     AND (oi3.sku LIKE $q ESCAPE '\\' OR oi3.title LIKE $q ESCAPE '\\')))`
      )
    }
    if (query.status && query.status.length > 0) {
      clauses.push(`o.status IN (${inClause('st', query.status, params)})`)
    }
    if (query.platformIds && query.platformIds.length > 0) {
      clauses.push(`o.platform_id IN (${inClause('pf', query.platformIds, params)})`)
    }
    if (query.from) {
      params.$from = query.from
      clauses.push('o.sold_at >= $from')
    }
    if (query.to) {
      params.$to = query.to
      clauses.push('o.sold_at <= $to')
    }
    if (query.onlyWithReturns) {
      clauses.push('EXISTS (SELECT 1 FROM order_returns r2 WHERE r2.order_id = o.id)')
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const total = toNumber(this.db.scalar<number>(`SELECT COUNT(*) AS v FROM orders o ${where}`, params))
    const rows = this.db.all<OrderRow>(
      `${ORDER_SELECT} ${where} ORDER BY ${SORT_SQL[sort]} LIMIT $limit OFFSET $offset`,
      { ...params, $limit: pageSize, $offset: (page - 1) * pageSize }
    )

    const items = rows.map((row) => this.toSummary(row))

    // El orden por beneficio se aplica tras calcularlo (necesita las formulas).
    if (sort === 'profit_desc') items.sort((a, b) => b.netProfitCents - a.netProfitCents)
    if (sort === 'profit_asc') items.sort((a, b) => a.netProfitCents - b.netProfitCents)

    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
  }

  get(id: string): Order {
    const row = this.db.get<OrderRow>(`${ORDER_SELECT} WHERE o.id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'order' })
    return this.hydrate(row)
  }

  private toSummary(row: OrderRow): OrderSummary {
    const financials = this.financials(row.id)
    return {
      id: row.id,
      orderNumber: toStringValue(row.order_number),
      platformId: row.platform_id,
      platformName: toNullableString(row.platform_name),
      soldAt: toStringValue(row.sold_at),
      buyer: toStringValue(row.buyer),
      status: row.status as OrderStatus,
      itemCount: toNumber(row.item_count),
      units: toNumber(row.units),
      netRevenueCents: financials.netRevenueCents,
      netProfitCents: financials.netProfitCents,
      marginPercent: financials.marginPercent,
      trackingNumber: toStringValue(row.tracking_number),
      hasReturn: toNumber(row.has_return) > 0,
      createdAt: toStringValue(row.created_at)
    }
  }

  private hydrate(row: OrderRow): Order {
    return {
      id: row.id,
      orderNumber: toStringValue(row.order_number),
      platformId: row.platform_id,
      platformName: toNullableString(row.platform_name),
      soldAt: toStringValue(row.sold_at),
      buyer: toStringValue(row.buyer),
      status: row.status as OrderStatus,
      shippingChargedCents: toNumber(row.shipping_charged_cents),
      shippingCostCents: toNumber(row.shipping_cost_cents),
      discountCents: toNumber(row.discount_cents),
      otherCents: toNumber(row.other_cents),
      paymentReference: toStringValue(row.payment_reference),
      trackingNumber: toStringValue(row.tracking_number),
      carrier: toStringValue(row.carrier),
      notes: toStringValue(row.notes),
      preparedAt: toNullableString(row.prepared_at),
      shippedAt: toNullableString(row.shipped_at),
      deliveredAt: toNullableString(row.delivered_at),
      isDemo: toNumber(row.is_demo) === 1,
      items: this.items(row.id),
      fees: this.fees(row.id),
      returns: this.returns(row.id),
      financials: this.financials(row.id),
      createdAt: toStringValue(row.created_at),
      updatedAt: toStringValue(row.updated_at)
    }
  }

  items(orderId: string): OrderItem[] {
    return this.db
      .all<{
        id: string
        order_id: string
        product_id: string | null
        sku: string
        title: string
        quantity: number
        unit_price_cents: number
        unit_cost_cents: number
      }>(
        `SELECT id, order_id, product_id, sku, title, quantity, unit_price_cents, unit_cost_cents
         FROM order_items WHERE order_id = $id ORDER BY created_at ASC`,
        { $id: orderId }
      )
      .map((row) => {
        const quantity = Math.max(1, toNumber(row.quantity, 1))
        const price = toNumber(row.unit_price_cents)
        const cost = toNumber(row.unit_cost_cents)
        return {
          id: row.id,
          orderId: row.order_id,
          productId: row.product_id,
          sku: toStringValue(row.sku),
          title: toStringValue(row.title),
          quantity,
          unitPriceCents: price,
          unitCostCents: cost,
          lineRevenueCents: price * quantity,
          lineCostCents: cost * quantity
        }
      })
  }

  fees(orderId: string): OrderFee[] {
    return this.db
      .all<{ id: string; order_id: string; kind: string; label: string; amount_cents: number }>(
        `SELECT id, order_id, kind, label, amount_cents FROM order_fees
         WHERE order_id = $id ORDER BY created_at ASC`,
        { $id: orderId }
      )
      .map((row) => ({
        id: row.id,
        orderId: row.order_id,
        kind: row.kind as OrderFeeKind,
        label: toStringValue(row.label),
        amountCents: toNumber(row.amount_cents)
      }))
  }

  returns(orderId: string): OrderReturn[] {
    return this.db
      .all<{
        id: string
        order_id: string
        returned_at: string
        reason: string
        refund_cents: number
        fee_refund_cents: number
        shipping_lost_cents: number
        restock: number
        notes: string
      }>(
        `SELECT id, order_id, returned_at, reason, refund_cents, fee_refund_cents,
                shipping_lost_cents, restock, notes
         FROM order_returns WHERE order_id = $id ORDER BY returned_at ASC`,
        { $id: orderId }
      )
      .map((row) => ({
        id: row.id,
        orderId: row.order_id,
        returnedAt: toStringValue(row.returned_at),
        reason: toStringValue(row.reason),
        refundCents: toNumber(row.refund_cents),
        feeRefundCents: toNumber(row.fee_refund_cents),
        shippingLostCents: toNumber(row.shipping_lost_cents),
        restock: toNumber(row.restock) === 1,
        notes: toStringValue(row.notes)
      }))
  }

  /** Formulas de un pedido. Es la UNICA fuente del beneficio de un pedido. */
  financials(orderId: string): OrderFinancials {
    const header = this.db.get<{
      discount_cents: number
      shipping_charged_cents: number
      shipping_cost_cents: number
      other_cents: number
    }>(
      `SELECT discount_cents, shipping_charged_cents, shipping_cost_cents, other_cents
       FROM orders WHERE id = $id`,
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

    return computeOrderFinancials({
      items: items.map((row) => ({
        quantity: toNumber(row.quantity, 1),
        unitPriceCents: toNumber(row.unit_price_cents),
        unitCostCents: toNumber(row.unit_cost_cents)
      })),
      discountCents: toNumber(header?.discount_cents),
      shippingChargedCents: toNumber(header?.shipping_charged_cents),
      shippingCostCents: toNumber(header?.shipping_cost_cents),
      otherCents: toNumber(header?.other_cents),
      fees: fees.map((row) => ({ amountCents: toNumber(row.amount_cents) })),
      returns: returns.map((row) => ({
        refundCents: toNumber(row.refund_cents),
        feeRefundCents: toNumber(row.fee_refund_cents),
        shippingLostCents: toNumber(row.shipping_lost_cents)
      }))
    })
  }

  // -------------------------------------------------------------------------
  // Alta de pedidos
  // -------------------------------------------------------------------------

  private nextOrderNumber(soldAt: string): string {
    const year = soldAt.slice(0, 4)
    const current = toNumber(this.db.scalar<number>("SELECT value FROM counters WHERE key = 'order_seq'")) + 1
    this.db.run(
      `INSERT INTO counters (key, value) VALUES ('order_seq', $value)
       ON CONFLICT(key) DO UPDATE SET value = MAX(value, $value)`,
      { $value: current }
    )
    return `RV-${year}-${String(current).padStart(4, '0')}`
  }

  /**
   * Comprueba que los articulos pueden venderse. Motivo: evitar vender dos
   * veces el mismo articulo, que es el error mas caro de este modulo.
   */
  private assertSellable(productIds: readonly string[], ignoreOrderId: string | null): void {
    for (const productId of productIds) {
      const sellability = this.products.getSellability([productId])[0]
      if (!sellability) throw appError('not_found', { entity: 'product' })
      if (sellability.archivedAt) {
        throw appError('conflict', { reason: 'product_archived', sku: sellability.sku })
      }

      const existing = this.db.get<{ order_number: string }>(
        `SELECT o.order_number FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = $product AND o.status <> 'cancelled' AND ($ignore IS NULL OR o.id <> $ignore)
         LIMIT 1`,
        { $product: productId, $ignore: ignoreOrderId }
      )
      if (existing) {
        throw appError('conflict', {
          reason: 'already_sold',
          sku: sellability.sku,
          orderNumber: existing.order_number
        })
      }
    }
  }

  create(input: OrderCreateInput): Order {
    if (!input.items || input.items.length === 0) throw appError('invalid_input', { field: 'items' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.soldAt)) throw appError('invalid_input', { field: 'soldAt' })

    const productIds = input.items.map((item) => item.productId)
    if (new Set(productIds).size !== productIds.length) {
      throw appError('conflict', { reason: 'duplicate_product_in_order' })
    }

    const id = newId()
    const at = nowIso()
    const status: OrderStatus = input.status ?? 'pending'

    this.db.transaction(() => {
      // Se revalida dentro de la transaccion: entre la comprobacion y el alta
      // no puede colarse una venta del mismo articulo.
      this.assertSellable(productIds, null)

      const orderNumber = this.nextOrderNumber(input.soldAt)

      this.db.run(
        `INSERT INTO orders (id, order_number, platform_id, sold_at, buyer, status,
            shipping_charged_cents, shipping_cost_cents, discount_cents, other_cents,
            payment_reference, tracking_number, carrier, notes, is_demo, created_at, updated_at)
         VALUES ($id, $number, $platform, $date, $buyer, $status,
            $charged, $cost, $discount, $other, $payment, $tracking, $carrier, $notes, 0, $at, $at)`,
        {
          $id: id,
          $number: orderNumber,
          $platform: input.platformId ?? null,
          $date: input.soldAt,
          $buyer: input.buyer?.trim() ?? '',
          $status: status,
          $charged: Math.round(input.shippingChargedCents ?? 0),
          $cost: Math.round(input.shippingCostCents ?? 0),
          $discount: Math.round(input.discountCents ?? 0),
          $other: Math.round(input.otherCents ?? 0),
          $payment: input.paymentReference?.trim() ?? '',
          $tracking: input.trackingNumber?.trim() ?? '',
          $carrier: input.carrier?.trim() ?? '',
          $notes: input.notes ?? '',
          $at: at
        }
      )

      const sellability = this.products.getSellability(productIds)
      const costByProduct = new Map(sellability.map((entry) => [entry.id, entry]))

      for (const item of input.items) {
        const product = costByProduct.get(item.productId)
        if (!product) throw appError('not_found', { entity: 'product' })
        const quantity = Math.max(1, Math.round(item.quantity ?? 1))

        this.db.run(
          `INSERT INTO order_items (id, order_id, product_id, sku, title, quantity,
              unit_price_cents, unit_cost_cents, created_at)
           VALUES ($id, $order, $product, $sku, $title, $quantity, $price, $cost, $at)`,
          {
            $id: newId(),
            $order: id,
            $product: item.productId,
            // Congelados a proposito: ver cabecera del archivo.
            $sku: product.sku,
            $title: product.name,
            $quantity: quantity,
            $price: Math.round(item.unitPriceCents),
            $cost: product.totalCostCents,
            $at: at
          }
        )

        this.products.applySaleState(item.productId, {
          status: status === 'shipped' || status === 'delivered' ? 'shipped' : 'sold',
          finalSalePriceCents: Math.round(item.unitPriceCents),
          note: `pedido ${orderNumber}`
        })
      }

      for (const fee of input.fees ?? []) {
        this.db.run(
          `INSERT INTO order_fees (id, order_id, kind, label, amount_cents, created_at)
           VALUES ($id, $order, $kind, $label, $amount, $at)`,
          {
            $id: newId(),
            $order: id,
            $kind: fee.kind,
            $label: fee.label ?? '',
            $amount: Math.round(fee.amountCents),
            $at: at
          }
        )
      }

      logActivity(this.db, {
        entity: 'order',
        entityId: id,
        action: 'created',
        summary: `Pedido ${orderNumber} creado con ${input.items.length} articulo(s)`,
        details: { platform: input.platformId ?? null }
      })
    })

    return this.get(id)
  }

  update(
    id: string,
    patch: Partial<{
      platformId: string | null
      soldAt: string
      buyer: string
      shippingChargedCents: number
      shippingCostCents: number
      discountCents: number
      otherCents: number
      paymentReference: string
      trackingNumber: string
      carrier: string
      notes: string
    }>
  ): Order {
    const current = this.get(id)
    this.db.run(
      `UPDATE orders SET platform_id = $platform, sold_at = $date, buyer = $buyer,
          shipping_charged_cents = $charged, shipping_cost_cents = $cost,
          discount_cents = $discount, other_cents = $other, payment_reference = $payment,
          tracking_number = $tracking, carrier = $carrier, notes = $notes, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $platform: patch.platformId === undefined ? current.platformId : patch.platformId,
        $date: patch.soldAt ?? current.soldAt,
        $buyer: patch.buyer?.trim() ?? current.buyer,
        $charged: patch.shippingChargedCents ?? current.shippingChargedCents,
        $cost: patch.shippingCostCents ?? current.shippingCostCents,
        $discount: patch.discountCents ?? current.discountCents,
        $other: patch.otherCents ?? current.otherCents,
        $payment: patch.paymentReference?.trim() ?? current.paymentReference,
        $tracking: patch.trackingNumber?.trim() ?? current.trackingNumber,
        $carrier: patch.carrier?.trim() ?? current.carrier,
        $notes: patch.notes ?? current.notes,
        $at: nowIso()
      }
    )
    return this.get(id)
  }

  // -------------------------------------------------------------------------
  // Estados
  // -------------------------------------------------------------------------

  setStatus(id: string, status: OrderStatus, options: { confirm?: boolean; trackingNumber?: string; carrier?: string } = {}): Order {
    const current = this.get(id)
    const at = nowIso()

    // Un pedido solo pasa a "enviado" con confirmacion real del usuario.
    if ((status === 'shipped' || status === 'delivered') && options.confirm !== true) {
      throw appError('conflict', { reason: 'shipping_requires_confirmation' })
    }

    const assignments = ['status = $status', 'updated_at = $at']
    const params: Record<string, SqlParam> = { $id: id, $status: status, $at: at }

    if (status === 'preparing' && !current.preparedAt) {
      assignments.push('prepared_at = $at')
    }
    if (status === 'shipped' && !current.shippedAt) {
      assignments.push('shipped_at = $at')
      params.$tracking = options.trackingNumber?.trim() ?? current.trackingNumber
      params.$carrier = options.carrier?.trim() ?? current.carrier
      assignments.push('tracking_number = $tracking', 'carrier = $carrier')
    }
    if (status === 'delivered' && !current.deliveredAt) {
      assignments.push('delivered_at = $at')
      if (!current.shippedAt) assignments.push('shipped_at = $at')
    }

    this.db.transaction(() => {
      this.db.run(`UPDATE orders SET ${assignments.join(', ')} WHERE id = $id`, params)

      // Los articulos acompanan al estado del pedido.
      if (status === 'shipped' || status === 'delivered') {
        for (const item of current.items) {
          if (item.productId) {
            this.products.applySaleState(item.productId, {
              status: 'shipped',
              finalSalePriceCents: item.unitPriceCents,
              note: `pedido ${current.orderNumber} marcado como ${status}`
            })
          }
        }
      }

      logActivity(this.db, {
        entity: 'order',
        entityId: id,
        action: 'status',
        summary: `Pedido ${current.orderNumber}: ${current.status} -> ${status}`
      })
    })

    return this.get(id)
  }

  /**
   * Cancela el pedido y DEVUELVE los articulos al inventario. Es la unica via
   * para poder eliminar un pedido despues.
   */
  cancel(id: string, reason: string): Order {
    const current = this.get(id)
    if (current.status === 'cancelled') return current

    this.db.transaction(() => {
      for (const item of current.items) {
        if (!item.productId) continue
        this.products.applySaleState(item.productId, {
          status: 'available',
          finalSalePriceCents: null,
          note: `pedido ${current.orderNumber} cancelado`
        })
      }

      this.db.run(
        "UPDATE orders SET status = 'cancelled', updated_at = $at, notes = $notes WHERE id = $id",
        {
          $id: id,
          $at: nowIso(),
          $notes: current.notes ? `${current.notes}\n[cancelado] ${reason}` : `[cancelado] ${reason}`
        }
      )

      logActivity(this.db, {
        entity: 'order',
        entityId: id,
        action: 'cancelled',
        summary: `Pedido ${current.orderNumber} cancelado: ${reason}`
      })
    })

    return this.get(id)
  }

  /** Elimina un pedido cancelado. Solo entonces: si no, se perderia el rastro. */
  remove(id: string): { affected: number } {
    const current = this.get(id)
    if (current.status !== 'cancelled') {
      throw appError('conflict', { reason: 'must_cancel_first' })
    }
    this.db.run('DELETE FROM orders WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'order',
      entityId: id,
      action: 'deleted',
      summary: `Pedido eliminado: ${current.orderNumber}`
    })
    return { affected: 1 }
  }

  // -------------------------------------------------------------------------
  // Comisiones
  // -------------------------------------------------------------------------

  addFee(orderId: string, fee: { kind: OrderFeeKind; label?: string; amountCents: number }): Order {
    if (!this.db.scalar<number>('SELECT 1 AS v FROM orders WHERE id = $id', { $id: orderId })) {
      throw appError('not_found', { entity: 'order' })
    }
    const id = newId()
    this.db.run(
      `INSERT INTO order_fees (id, order_id, kind, label, amount_cents, created_at)
       VALUES ($id, $order, $kind, $label, $amount, $at)`,
      {
        $id: id,
        $order: orderId,
        $kind: fee.kind,
        $label: fee.label ?? '',
        $amount: Math.round(fee.amountCents),
        $at: nowIso()
      }
    )
    return this.get(orderId)
  }

  updateFee(feeId: string, patch: { kind?: OrderFeeKind; label?: string; amountCents?: number }): Order {
    const current = this.db.get<{ order_id: string; kind: string; label: string; amount_cents: number }>(
      'SELECT order_id, kind, label, amount_cents FROM order_fees WHERE id = $id',
      { $id: feeId }
    )
    if (!current) throw appError('not_found', { entity: 'order_fee' })

    this.db.run('UPDATE order_fees SET kind = $kind, label = $label, amount_cents = $amount WHERE id = $id', {
      $id: feeId,
      $kind: patch.kind ?? current.kind,
      $label: patch.label ?? toStringValue(current.label),
      $amount: patch.amountCents === undefined ? toNumber(current.amount_cents) : Math.round(patch.amountCents)
    })
    return this.get(current.order_id)
  }

  removeFee(feeId: string): Order {
    const current = this.db.get<{ order_id: string }>('SELECT order_id FROM order_fees WHERE id = $id', {
      $id: feeId
    })
    if (!current) throw appError('not_found', { entity: 'order_fee' })
    this.db.run('DELETE FROM order_fees WHERE id = $id', { $id: feeId })
    return this.get(current.order_id)
  }

  // -------------------------------------------------------------------------
  // Devoluciones
  // -------------------------------------------------------------------------

  addReturn(input: {
    orderId: string
    returnedAt: string
    reason?: string
    refundCents: number
    feeRefundCents?: number
    shippingLostCents?: number
    restock?: boolean
    notes?: string
  }): Order {
    const order = this.get(input.orderId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.returnedAt)) throw appError('invalid_input', { field: 'returnedAt' })

    const refund = Math.round(input.refundCents)
    if (refund < 0) throw appError('invalid_input', { field: 'refundCents' })

    const id = newId()
    const restock = input.restock ?? true

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO order_returns (id, order_id, returned_at, reason, refund_cents, fee_refund_cents,
            shipping_lost_cents, restock, notes, created_at)
         VALUES ($id, $order, $date, $reason, $refund, $feeRefund, $shippingLost, $restock, $notes, $at)`,
        {
          $id: id,
          $order: input.orderId,
          $date: input.returnedAt,
          $reason: input.reason?.trim() ?? '',
          $refund: refund,
          $feeRefund: Math.round(input.feeRefundCents ?? 0),
          $shippingLost: Math.round(input.shippingLostCents ?? 0),
          $restock: restock ? 1 : 0,
          $notes: input.notes ?? '',
          $at: nowIso()
        }
      )

      this.db.run("UPDATE orders SET status = 'returned', updated_at = $at WHERE id = $id", {
        $id: input.orderId,
        $at: nowIso()
      })

      // El historial del pedido se conserva: solo se registra la devolucion.
      if (restock) {
        for (const item of order.items) {
          if (!item.productId) continue
          this.products.applySaleState(item.productId, {
            status: 'returned',
            finalSalePriceCents: null,
            note: `devuelto del pedido ${order.orderNumber}`
          })
        }
      }

      logActivity(this.db, {
        entity: 'order',
        entityId: input.orderId,
        action: 'returned',
        summary: `Devolucion registrada en ${order.orderNumber}: ${(refund / 100).toFixed(2)}`,
        details: { restock }
      })
    })

    return this.get(input.orderId)
  }

  removeReturn(returnId: string): Order {
    const current = this.db.get<{ order_id: string; restock: number }>(
      'SELECT order_id, restock FROM order_returns WHERE id = $id',
      { $id: returnId }
    )
    if (!current) throw appError('not_found', { entity: 'order_return' })

    const order = this.get(current.order_id)

    this.db.transaction(() => {
      this.db.run('DELETE FROM order_returns WHERE id = $id', { $id: returnId })

      // Se revierte el estado del articulo y del pedido.
      if (toNumber(current.restock) === 1) {
        for (const item of order.items) {
          if (!item.productId) continue
          this.products.applySaleState(item.productId, {
            status: 'sold',
            finalSalePriceCents: item.unitPriceCents,
            note: `devolucion anulada del pedido ${order.orderNumber}`
          })
        }
      }

      const remaining = toNumber(
        this.db.scalar<number>('SELECT COUNT(*) AS v FROM order_returns WHERE order_id = $id', {
          $id: current.order_id
        })
      )
      if (remaining === 0) {
        const restored: OrderStatus = order.shippedAt ? 'shipped' : 'preparing'
        this.db.run('UPDATE orders SET status = $status, updated_at = $at WHERE id = $id', {
          $id: current.order_id,
          $status: restored,
          $at: nowIso()
        })
      }

      logActivity(this.db, {
        entity: 'order',
        entityId: current.order_id,
        action: 'return_deleted',
        summary: `Devolucion anulada en ${order.orderNumber}`
      })
    })

    return this.get(current.order_id)
  }

  // -------------------------------------------------------------------------
  // Preparacion de pedidos
  // -------------------------------------------------------------------------

  pickingQueue(): PickingOrder[] {
    const params: Record<string, SqlParam> = {}
    const clause = inClause('pst', ORDER_OPEN_STATUSES, params)

    const rows = this.db.all<OrderRow>(
      `${ORDER_SELECT} WHERE o.status IN (${clause}) ORDER BY o.sold_at ASC`,
      params
    )

    return rows.map((row) => this.buildPickingOrder(row))
  }

  pickingFor(orderId: string): PickingOrder {
    const row = this.db.get<OrderRow>(`${ORDER_SELECT} WHERE o.id = $id`, { $id: orderId })
    if (!row) throw appError('not_found', { entity: 'order' })
    return this.buildPickingOrder(row)
  }

  private buildPickingOrder(row: OrderRow): PickingOrder {
    const lines: PickingLine[] = this.db
      .all<{
        product_id: string | null
        sku: string
        title: string
        quantity: number
        location_id: string | null
        location_path: string | null
        picked_at: string | null
        packed_at: string | null
        scanned_sku: string | null
        note: string | null
      }>(
        `SELECT oi.product_id, oi.sku, oi.title, oi.quantity,
                pr.location_id, l.path AS location_path,
                pc.picked_at, pc.packed_at, pc.scanned_sku, pc.note
         FROM order_items oi
         LEFT JOIN products pr ON pr.id = oi.product_id
         LEFT JOIN locations l ON l.id = pr.location_id
         LEFT JOIN picking_checks pc ON pc.order_id = oi.order_id AND pc.product_id = oi.product_id
         WHERE oi.order_id = $id
         ORDER BY l.path COLLATE NOCASE ASC, oi.sku ASC`,
        { $id: row.id }
      )
      .map((line) => ({
        productId: toStringValue(line.product_id),
        sku: toStringValue(line.sku),
        title: toStringValue(line.title),
        quantity: Math.max(1, toNumber(line.quantity, 1)),
        locationId: line.location_id,
        locationPath: toNullableString(line.location_path),
        check:
          line.product_id === null
            ? null
            : {
                orderId: row.id,
                productId: toStringValue(line.product_id),
                pickedAt: toNullableString(line.picked_at),
                packedAt: toNullableString(line.packed_at),
                scannedSku: toStringValue(line.scanned_sku),
                note: toStringValue(line.note)
              }
      }))

    // Agrupacion por ubicacion: menos desplazamientos por el almacen.
    const groups = new Map<string, PickingLine[]>()
    for (const line of lines) {
      const key = line.locationPath ?? ''
      const bucket = groups.get(key)
      if (bucket) bucket.push(line)
      else groups.set(key, [line])
    }

    return {
      orderId: row.id,
      orderNumber: toStringValue(row.order_number),
      soldAt: toStringValue(row.sold_at),
      status: row.status as OrderStatus,
      platformName: toNullableString(row.platform_name),
      buyer: toStringValue(row.buyer),
      units: toNumber(row.units),
      trackingNumber: toStringValue(row.tracking_number),
      lines,
      byLocation: [...groups.entries()].map(([locationPath, groupLines]) => ({ locationPath, lines: groupLines })),
      pickedCount: lines.filter((line) => line.check?.pickedAt).length,
      packedCount: lines.filter((line) => line.check?.packedAt).length
    }
  }

  /**
   * Resuelve un codigo escaneado. Acepta SKU de articulo o ruta de ubicacion.
   * Se usa para el escaneo de comprobacion durante la preparacion.
   */
  resolveScan(code: string): ScanResolution {
    const value = code.trim()
    if (!value) return { kind: 'unknown', code: value }

    const location = this.db.get<{ path: string }>(
      'SELECT path FROM locations WHERE path = $code COLLATE NOCASE OR code = $code COLLATE NOCASE LIMIT 1',
      { $code: value }
    )
    if (location) return { kind: 'location', code: value, locationPath: location.path }

    const product = this.db.get<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM products WHERE sku = $code COLLATE NOCASE LIMIT 1',
      { $code: value }
    )
    if (product) {
      return {
        kind: 'product',
        code: value,
        productId: product.id,
        productName: product.name,
        productStatus: product.status as ScanResolution['productStatus']
      }
    }

    return { kind: 'unknown', code: value }
  }

  /**
   * Marca una linea como recogida. Si el SKU escaneado no coincide con el
   * esperado, NO se marca y se devuelve el motivo: la comprobacion existe
   * justamente para detectar errores de empaquetado.
   */
  markPicked(
    orderId: string,
    productId: string,
    scannedSku: string
  ): { ok: boolean; reason?: 'sku_mismatch' | 'not_in_order'; expectedSku?: string } {
    const expected = this.db.get<{ sku: string }>(
      'SELECT sku FROM order_items WHERE order_id = $order AND product_id = $product',
      { $order: orderId, $product: productId }
    )
    if (!expected) return { ok: false, reason: 'not_in_order' }

    const scanned = scannedSku.trim()
    if (scanned && scanned.toUpperCase() !== toStringValue(expected.sku).toUpperCase()) {
      return { ok: false, reason: 'sku_mismatch', expectedSku: expected.sku }
    }

    const at = nowIso()
    this.db.run(
      `INSERT INTO picking_checks (order_id, product_id, picked_at, packed_at, scanned_sku, note)
       VALUES ($order, $product, $at, NULL, $scanned, '')
       ON CONFLICT(order_id, product_id) DO UPDATE SET picked_at = $at, scanned_sku = $scanned`,
      { $order: orderId, $product: productId, $at: at, $scanned: scanned }
    )

    // El pedido pasa a "en preparacion" en cuanto se empieza a recoger.
    this.db.run(
      "UPDATE orders SET status = 'preparing', prepared_at = COALESCE(prepared_at, $at), updated_at = $at WHERE id = $id AND status = 'pending'",
      { $id: orderId, $at: at }
    )

    return { ok: true }
  }

  markPacked(orderId: string, productId: string): { ok: boolean; allPacked: boolean } {
    const at = nowIso()
    this.db.run(
      `INSERT INTO picking_checks (order_id, product_id, picked_at, packed_at, scanned_sku, note)
       VALUES ($order, $product, $at, $at, '', '')
       ON CONFLICT(order_id, product_id) DO UPDATE SET packed_at = $at, picked_at = COALESCE(picking_checks.picked_at, $at)`,
      { $order: orderId, $product: productId, $at: at }
    )

    const pending = toNumber(
      this.db.scalar<number>(
        `SELECT COUNT(*) AS v FROM order_items oi
         LEFT JOIN picking_checks pc ON pc.order_id = oi.order_id AND pc.product_id = oi.product_id
         WHERE oi.order_id = $order AND (pc.packed_at IS NULL OR pc.packed_at = '')`,
        { $order: orderId }
      )
    )

    if (pending === 0) {
      this.db.run(
        "UPDATE orders SET status = 'packed', updated_at = $at WHERE id = $id AND status IN ('pending','preparing')",
        { $id: orderId, $at: at }
      )
    }

    return { ok: true, allPacked: pending === 0 }
  }

  resetCheck(orderId: string, productId: string): { affected: number } {
    return {
      affected: this.db.run('DELETE FROM picking_checks WHERE order_id = $order AND product_id = $product', {
        $order: orderId,
        $product: productId
      }).changes
    }
  }

  setCheckNote(orderId: string, productId: string, note: string): void {
    this.db.run(
      `INSERT INTO picking_checks (order_id, product_id, picked_at, packed_at, scanned_sku, note)
       VALUES ($order, $product, NULL, NULL, '', $note)
       ON CONFLICT(order_id, product_id) DO UPDATE SET note = $note`,
      { $order: orderId, $product: productId, $note: note.slice(0, 2000) }
    )
  }

  checksFor(orderId: string): PickingCheck[] {
    return this.db
      .all<{
        order_id: string
        product_id: string
        picked_at: string | null
        packed_at: string | null
        scanned_sku: string
        note: string
      }>(
        `SELECT order_id, product_id, picked_at, packed_at, scanned_sku, note
         FROM picking_checks WHERE order_id = $id`,
        { $id: orderId }
      )
      .map((row) => ({
        orderId: row.order_id,
        productId: row.product_id,
        pickedAt: toNullableString(row.picked_at),
        packedAt: toNullableString(row.packed_at),
        scannedSku: toStringValue(row.scanned_sku),
        note: toStringValue(row.note)
      }))
  }
}
