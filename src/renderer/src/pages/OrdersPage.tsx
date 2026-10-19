/**
 * RESALEVAULT - Pedidos.
 *
 * Aqui es donde el beneficio pasa a ser NETO: se descuentan comisiones, envio
 * asumido, otros cargos y devoluciones. Las cifras las calcula el proceso
 * principal; la interfaz solo las presenta con su desglose.
 *
 * Reglas visibles en la propia pantalla:
 *  - No se puede vender dos veces el mismo articulo (lo rechaza el backend).
 *  - Marcar como enviado exige confirmacion explicita.
 *  - Cancelar devuelve los articulos al inventario.
 *  - Eliminar exige cancelar antes.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { Order, OrderFeeKind, OrderStatus, OrderSummary } from '@shared/types-modules'
import type { ProductSummary } from '@shared/types'
import { ORDER_FEE_KINDS, ORDER_STATUSES } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData, useDebounced } from '../lib/hooks'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  MoneyInput,
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { IconOrders, IconPlus, IconSearch, IconTrash } from '../components/Icons'

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'badge--warn',
  preparing: 'badge--info',
  packed: 'badge--info',
  shipped: 'badge--accent',
  delivered: 'badge--ok',
  returned: 'badge--danger',
  cancelled: 'badge--muted'
}

export function OrdersPage({ onlyAwaiting = false }: { onlyAwaiting?: boolean }): ReactNode {
  const { t, money, percent, number, date, notify, dataVersion } = useApp()

  const [search, setSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [status, setStatus] = useState<string>(onlyAwaiting ? 'packed' : '')
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OrderSummary | null>(null)

  const debounced = useDebounced(search, 240)

  const query = useMemo(
    () => ({
      search: debounced.trim() || undefined,
      status: status ? [status as OrderStatus] : undefined,
      pageSize: 100,
      sort: 'date_desc' as const
    }),
    [debounced, status]
  )

  const page = useAsyncData(() => api.orders.list(query), [query, dataVersion])
  const platforms = useAsyncData(() => api.platforms.list(), [dataVersion])
  const productSearchDb = useDebounced(productSearch, 250)
  const products = useAsyncData(
    () =>
      api.products.list({
        status: ['available', 'to_prepare', 'reserved'],
        // Busqueda EN EL PROCESO PRINCIPAL: no se cargan 300 articulos de golpe.
        search: productSearchDb.trim() || undefined,
        pageSize: 40,
        sort: 'name_asc'
      }),
    [productSearchDb, dataVersion]
  )

  const totals = useMemo(() => {
    const rows = page.data?.items ?? []
    return {
      count: rows.length,
      net: rows.reduce((sum, row) => sum + row.netProfitCents, 0),
      revenue: rows.reduce((sum, row) => sum + row.netRevenueCents, 0)
    }
  }, [page.data])

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{onlyAwaiting ? t('nav.shipping') : t('order.title')}</h1>
          <p className="page-subtitle">{t('order.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => setCreating(true)}>
            {t('order.new')}
          </Button>
        </div>
      </header>

      <div className="grid-cards" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <span className="kpi__label">{t('analytics.ordersCount')}</span>
          <span className="kpi__value">{number(totals.count)}</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">{t('order.netRevenue')}</span>
          <span className="kpi__value">{money(totals.revenue)}</span>
        </div>
        <div className="kpi kpi--accent">
          <span className="kpi__label">{t('order.netProfit')}</span>
          <span className="kpi__value kpi__value--accent">{money(totals.net)}</span>
          <span className="kpi__hint">{t('order.netProfitHint')}</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar__grow" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}>
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t('common.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Field label={t('common.status')}>
          <Select value={status} onChange={setStatus}>
            <option value="">{t('common.all')}</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`order.statuses.${value}` as 'order.statuses.pending')}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card flush>
        {(page.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon={<IconOrders size={26} />}
            title={t('order.empty')}
            message={t('order.emptyMessage')}
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('order.new')}
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('order.number')}</th>
                  <th>{t('order.soldAt')}</th>
                  <th>{t('order.platform')}</th>
                  <th>{t('order.buyer')}</th>
                  <th>{t('common.status')}</th>
                  <th className="cell-num">{t('order.items')}</th>
                  <th className="cell-num">{t('order.netRevenue')}</th>
                  <th className="cell-num">{t('order.netProfit')}</th>
                  <th className="cell-num">{t('order.margin')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(page.data?.items ?? []).map((order) => (
                  <tr key={order.id} className="is-clickable" onClick={() => setDetailId(order.id)}>
                    <td className="cell-mono">
                      {order.orderNumber}
                      {order.hasReturn ? <span className="badge badge--danger" style={{ marginLeft: 6 }}>↩</span> : null}
                    </td>
                    <td>{date(order.soldAt)}</td>
                    <td className="dim">{order.platformName ?? '—'}</td>
                    <td>{order.buyer || '—'}</td>
                    <td>
                      <span className={`badge badge--dot ${STATUS_TONE[order.status]}`}>
                        {t(`order.statuses.${order.status}` as 'order.statuses.pending')}
                      </span>
                    </td>
                    <td className="cell-num">{order.units}</td>
                    <td className="cell-num">{money(order.netRevenueCents)}</td>
                    <td
                      className="cell-num cell-strong"
                      style={{ color: order.netProfitCents < 0 ? 'var(--danger)' : 'var(--accent)' }}
                    >
                      {money(order.netProfitCents)}
                    </td>
                    <td className="cell-num dim">
                      {order.marginPercent === null ? '—' : percent(order.marginPercent)}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <IconButton label={t('common.delete')} onClick={() => setPendingDelete(order)}>
                        <IconTrash size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating ? (
        <OrderCreateModal
          platforms={(platforms.data ?? []).map((p) => ({ id: p.id, name: p.name }))}
          products={products.data?.items ?? []}
          onProductSearch={setProductSearch}
          onClose={() => setCreating(false)}
          onCreated={(order) => {
            setCreating(false)
            setDetailId(order.id)
            page.reload()
          }}
        />
      ) : null}

      {detailId ? (
        <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => page.reload()} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('common.danger')}
          tone="danger"
          message={t('order.mustCancelFirst')}
          confirmLabel={t('common.close')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (!pendingDelete) return
            void api.orders
              .remove(pendingDelete.id)
              .then(() => {
                page.reload()
                setPendingDelete(null)
              })
              .catch(reportError)
          }}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alta de pedido
// ---------------------------------------------------------------------------

function OrderCreateModal({
  platforms,
  products,
  onProductSearch,
  onClose,
  onCreated
}: {
  platforms: Array<{ id: string; name: string }>
  products: ProductSummary[]
  onProductSearch: (term: string) => void
  onClose: () => void
  onCreated: (order: Order) => void
}): ReactNode {
  const { t, money, notify, today } = useApp()

  const [platformId, setPlatformId] = useState('')
  const [soldAt, setSoldAt] = useState(today)
  const [buyer, setBuyer] = useState('')
  const [shippingCharged, setShippingCharged] = useState(0)
  const [shippingCost, setShippingCost] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [other, setOther] = useState(0)
  const [tracking, setTracking] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Array<{ productId: string; unitPriceCents: number }>>([])
  const [fees, setFees] = useState<Array<{ kind: OrderFeeKind; label: string; amountCents: number }>>([])
  const [saving, setSaving] = useState(false)

  // El filtrado lo hace el proceso principal (indice + LIMIT), no el cliente.
  const goodsTotal = selected.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId)
    return sum + (product?.expectedSalePriceCents ?? 0)
  }, 0)

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const order = await api.orders.create({
        platformId: platformId || null,
        soldAt,
        buyer,
        shippingChargedCents: shippingCharged,
        shippingCostCents: shippingCost,
        discountCents: discount,
        otherCents: other,
        trackingNumber: tracking,
        items: selected.map((line) => ({
          productId: line.productId,
          unitPriceCents:
            line.unitPriceCents ||
            (products.find((item) => item.id === line.productId)?.expectedSalePriceCents ?? 0)
        })),
        fees: fees.filter((fee) => fee.amountCents > 0)
      })
      onCreated(order)
    } catch (error) {
      reportError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={t('order.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || selected.length === 0}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="notice" style={{ marginBottom: 12 }}>
        {t('order.sellingWarning')}
      </div>

      <div className="form-grid">
        <Field label={t('order.soldAt')}>
          <input type="date" className="input" value={soldAt} onChange={(event) => setSoldAt(event.target.value)} />
        </Field>
        <Field label={t('order.platform')}>
          <Select value={platformId} onChange={setPlatformId}>
            <option value="">{t('common.none')}</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('order.buyer')}>
          <TextInput value={buyer} onChange={setBuyer} />
        </Field>
        <Field label={t('order.trackingNumber')}>
          <TextInput value={tracking} onChange={setTracking} mono />
        </Field>
      </div>

      <Card title={t('order.items')}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}>
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t('order.searchProducts')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              onProductSearch(event.target.value)
            }}
          />
        </div>

        {products.length === 0 ? (
          <div className="notice">{t('order.noAvailable')}</div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
            <table className="table">
              <tbody>
                {products.map((item) => {
                  const isSelected = selected.some((line) => line.productId === item.id)
                  return (
                    <tr key={item.id}>
                      <td style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelected((current) =>
                              isSelected
                                ? current.filter((line) => line.productId !== item.id)
                                : [...current, { productId: item.id, unitPriceCents: item.expectedSalePriceCents }]
                            )
                          }
                        />
                      </td>
                      <td className="cell-mono">{item.sku}</td>
                      <td>{item.name}</td>
                      <td className="cell-num dim">{money(item.totalCostCents)}</td>
                      <td style={{ width: 130 }}>
                        <MoneyInput
                          valueCents={
                            selected.find((line) => line.productId === item.id)?.unitPriceCents ??
                            item.expectedSalePriceCents
                          }
                          onChange={(cents) =>
                            setSelected((current) =>
                              current.map((line) =>
                                line.productId === item.id ? { ...line, unitPriceCents: cents } : line
                              )
                            )
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <span className="dim">
            {t('order.itemsCount', { count: selected.length })} · {money(goodsTotal)}
          </span>
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Card title={t('order.financials')}>
          <div className="form-grid">
            <Field label={t('order.shippingCharged')} hint={t('order.shippingChargedHint')}>
              <MoneyInput valueCents={shippingCharged} onChange={setShippingCharged} />
            </Field>
            <Field label={t('order.shippingCost')} hint={t('order.shippingCostHint')}>
              <MoneyInput valueCents={shippingCost} onChange={setShippingCost} />
            </Field>
            <Field label={t('order.discount')}>
              <MoneyInput valueCents={discount} onChange={setDiscount} />
            </Field>
            <Field label={t('order.otherCosts')}>
              <MoneyInput valueCents={other} onChange={setOther} />
            </Field>
          </div>
        </Card>

        <Card title={t('order.fees')}>
          <div className="stack stack--sm">
            {fees.map((fee, index) => (
              <div key={index} className="form-row">
                <div style={{ flex: '1 1 130px' }}>
                  <Select
                    value={fee.kind}
                    onChange={(value) =>
                      setFees((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, kind: value as OrderFeeKind } : entry
                        )
                      )
                    }
                  >
                    {ORDER_FEE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`order.feeKinds.${kind}` as 'order.feeKinds.commission')}
                      </option>
                    ))}
                  </Select>
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  <MoneyInput
                    valueCents={fee.amountCents}
                    onChange={(cents) =>
                      setFees((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, amountCents: cents } : entry
                        )
                      )
                    }
                  />
                </div>
                <IconButton
                  label={t('common.delete')}
                  onClick={() => setFees((current) => current.filter((_entry, position) => position !== index))}
                >
                  <IconTrash size={14} />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              icon={<IconPlus size={13} />}
              onClick={() => setFees((current) => [...current, { kind: 'commission', label: '', amountCents: 0 }])}
            >
              {t('order.addFee')}
            </Button>
          </div>
        </Card>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Detalle del pedido
// ---------------------------------------------------------------------------

function OrderDetailModal({
  orderId,
  onClose,
  onChanged
}: {
  orderId: string
  onClose: () => void
  onChanged: () => void
}): ReactNode {
  const { t, money, percent, dateTime, notify, dataVersion } = useApp()
  const order = useAsyncData(() => api.orders.get(orderId), [orderId, dataVersion])

  const [confirm, setConfirm] = useState<'ship' | 'deliver' | 'cancel' | 'return' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [refund, setRefund] = useState(0)
  const [tracking, setTracking] = useState('')

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  if (!order.data) {
    return (
      <Modal title={t('order.number')} onClose={onClose}>
        <div className="spinner" />
      </Modal>
    )
  }

  const data = order.data
  const financials = data.financials

  const run = async (): Promise<void> => {
    try {
      if (confirm === 'ship') {
        await api.orders.setStatus(orderId, 'shipped', { confirm: true, trackingNumber: tracking })
      } else if (confirm === 'deliver') {
        await api.orders.setStatus(orderId, 'delivered', { confirm: true })
      } else if (confirm === 'cancel') {
        await api.orders.cancel(orderId, cancelReason || '—')
      } else if (confirm === 'return') {
        await api.orders.addReturn({ orderId, returnedAt: new Date().toISOString().slice(0, 10), refundCents: refund })
      }
      setConfirm(null)
      order.reload()
      onChanged()
    } catch (error) {
      reportError(error)
      setConfirm(null)
    }
  }

  return (
    <Modal
      wide
      title={`${data.orderNumber} · ${data.platformName ?? ''}`}
      onClose={onClose}
      footer={
        <>
          {data.status !== 'cancelled' && data.status !== 'returned' ? (
            <>
              <Button onClick={() => setConfirm('cancel')}>{t('order.cancel')}</Button>
              <Button onClick={() => setConfirm('return')}>{t('order.addReturn')}</Button>
              {data.status !== 'shipped' && data.status !== 'delivered' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setTracking(data.trackingNumber)
                    setConfirm('ship')
                  }}
                >
                  {t('order.ship')}
                </Button>
              ) : null}
            </>
          ) : null}
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <span className={`badge badge--dot ${STATUS_TONE[data.status]}`}>
          {t(`order.statuses.${data.status}` as 'order.statuses.pending')}
        </span>
        <span className="chip">{data.buyer || '—'}</span>
        {data.trackingNumber ? <span className="mono chip">{data.trackingNumber}</span> : null}
        {data.shippedAt ? <span className="faint">{dateTime(data.shippedAt)}</span> : null}
      </div>

      <Card title={t('order.financials')}>
        <div className="stack stack--sm">
          <Line label={t('order.goodsRevenue')} value={money(financials.goodsRevenueCents)} />
          <Line label={t('order.discount')} value={money(-financials.discountCents)} />
          <Line label={t('order.shippingCharged')} value={money(financials.shippingChargedCents)} />
          <Line label={t('order.netRevenue')} value={money(financials.netRevenueCents)} strong />
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <Line label={t('order.goodsCost')} value={money(-financials.goodsCostCents)} />
          <Line label={t('order.fees')} value={money(-financials.feesCents)} />
          <Line label={t('order.shippingCost')} value={money(-financials.shippingCostCents)} />
          <Line label={t('order.otherCosts')} value={money(-financials.otherCostCents)} />
          {financials.refundsCents > 0 ? (
            <Line label={t('order.refunds')} value={money(-financials.refundsCents)} />
          ) : null}
          {financials.feesRefundedCents > 0 ? (
            <Line label={t('order.feeRefund')} value={money(financials.feesRefundedCents)} />
          ) : null}
          {financials.shippingLostCents > 0 ? (
            <Line label={t('order.shippingLost')} value={money(-financials.shippingLostCents)} />
          ) : null}
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <Line
            label={t('order.netProfit')}
            value={money(financials.netProfitCents)}
            strong
            accent={financials.netProfitCents >= 0}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="faint">{t('order.margin')}</span>
            <span className="stat-line__value">
              {financials.marginPercent === null ? '—' : percent(financials.marginPercent)}
            </span>
          </div>
          <div className="notice">{t('order.netProfitHint')}</div>
        </div>
      </Card>

      <Card title={t('order.items')}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.sku')}</th>
                <th>{t('common.name')}</th>
                <th className="cell-num">{t('purchase.quantity')}</th>
                <th className="cell-num">{t('order.unitPrice')}</th>
                <th className="cell-num">{t('order.goodsCost')}</th>
                <th className="cell-num">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td className="cell-mono">{item.sku}</td>
                  <td>{item.title}</td>
                  <td className="cell-num">{item.quantity}</td>
                  <td className="cell-num">{money(item.unitPriceCents)}</td>
                  <td className="cell-num dim">{money(item.lineCostCents)}</td>
                  <td className="cell-num cell-strong">{money(item.lineRevenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {confirm === 'return' ? (
        <Modal
          title={t('order.addReturn')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => void run()}>
                {t('order.addReturn')}
              </Button>
            </>
          }
        >
          <Field label={t('order.refund')}>
            <MoneyInput valueCents={refund} onChange={setRefund} />
          </Field>
          <div className="notice" style={{ marginTop: 10 }}>
            {t('order.restock')}
          </div>
        </Modal>
      ) : null}

      {confirm === 'cancel' ? (
        <Modal
          title={t('order.cancel')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => void run()}>
                {t('order.cancel')}
              </Button>
            </>
          }
        >
          <Field label={t('order.cancelReason')} hint={t('order.cancelHint')}>
            <TextArea value={cancelReason} onChange={setCancelReason} rows={2} />
          </Field>
        </Modal>
      ) : null}

      {confirm === 'ship' ? (
        <Modal
          title={t('order.shipConfirm')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void run()}>
                {t('order.ship')}
              </Button>
            </>
          }
        >
          <div className="notice notice--warn" style={{ marginBottom: 10 }}>
            {t('order.shipConfirmHint')}
          </div>
          <Field label={t('order.trackingNumber')}>
            <TextInput value={tracking} onChange={setTracking} mono />
          </Field>
        </Modal>
      ) : null}
    </Modal>
  )
}

function Line({
  label,
  value,
  strong = false,
  accent = false
}: {
  label: string
  value: string
  strong?: boolean
  accent?: boolean
}): ReactNode {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className={strong ? '' : 'faint'}>{label}</span>
      <span
        className={strong ? 'stat-line__value' : 'stat-line__value dim'}
        style={accent ? { color: 'var(--accent)' } : undefined}
      >
        {value}
      </span>
    </div>
  )
}
