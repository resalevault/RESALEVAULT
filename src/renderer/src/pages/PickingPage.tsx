/**
 * RESALEVAULT - Preparacion de pedidos (picking & packing).
 *
 * Pensado para usarse de pie, con un lector de codigos en la mano:
 *  - Los pedidos pendientes se agrupan por UBICACION para reducir los
 *    desplazamientos por el almacen.
 *  - El escaneo COMPRUEBA que el articulo es el correcto: si el SKU no coincide,
 *    no se marca y se avisa. Es justamente el error que se quiere evitar.
 *  - Un pedido no pasa a "enviado" sin confirmacion explicita del usuario.
 *
 * El lector USB funciona como teclado: basta con escuchar las pulsaciones
 * rapidas que terminan en Intro. La misma logica servira para una camara.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PickingLine, PickingOrder } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card, EmptyState, Field, Modal, TextInput } from '../components/ui'
import { IconCheck, IconPicking, IconRefresh } from '../components/Icons'

type ScanFeedback = { tone: 'ok' | 'warn' | 'error'; message: string } | null

export function PickingPage(): ReactNode {
  const { t, number, notify, dataVersion } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<ScanFeedback>(null)
  const [scanValue, setScanValue] = useState('')
  const [shipOpen, setShipOpen] = useState(false)
  const [tracking, setTracking] = useState('')
  const scanRef = useRef<HTMLInputElement | null>(null)

  const queue = useAsyncData(() => api.picking.queue(), [dataVersion])
  const orders = useMemo(() => queue.data ?? [], [queue.data])

  useEffect(() => {
    if (!selectedId && orders.length > 0) setSelectedId(orders[0]?.orderId ?? null)
  }, [orders, selectedId])

  const selected = useMemo(
    () => orders.find((order) => order.orderId === selectedId) ?? null,
    [orders, selectedId]
  )

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const reload = (): void => {
    queue.reload()
  }

  const submitScan = async (): Promise<void> => {
    const code = scanValue.trim()
    if (!code || !selected) return
    setScanValue('')
    try {
      const resolution = await api.picking.scan(code)

      if (resolution.kind === 'location') {
        setFeedback({ tone: 'ok', message: t('picking.scanLocation', { path: resolution.locationPath ?? '' }) })
        return
      }
      if (resolution.kind === 'unknown') {
        setFeedback({ tone: 'error', message: t('picking.scanUnknown', { code }) })
        return
      }

      const line = selected.lines.find((entry) => entry.productId === resolution.productId)
      if (!line) {
        setFeedback({
          tone: 'warn',
          message: t('picking.scanProduct', {
            name: resolution.productName ?? code,
            status: resolution.productStatus ?? ''
          })
        })
        return
      }

      const result = await api.picking.markPicked(selected.orderId, line.productId, code)
      if (!result.ok) {
        setFeedback({
          tone: 'error',
          message:
            result.reason === 'sku_mismatch'
              ? t('picking.scanMismatch', { expected: result.expectedSku ?? '' })
              : t('picking.scanUnknown', { code })
        })
        return
      }

      setFeedback({ tone: 'ok', message: t('picking.scanOk', { code }) })
      reload()
    } catch (error) {
      reportError(error)
    }
  }

  const markPacked = async (line: PickingLine): Promise<void> => {
    if (!selected) return
    try {
      const result = await api.picking.markPacked(selected.orderId, line.productId)
      if (result.allPacked) setFeedback({ tone: 'ok', message: t('picking.allPackedHint') })
      reload()
    } catch (error) {
      reportError(error)
    }
  }

  const resetCheck = async (line: PickingLine): Promise<void> => {
    if (!selected) return
    try {
      await api.picking.resetCheck(selected.orderId, line.productId)
      reload()
    } catch (error) {
      reportError(error)
    }
  }

  const confirmShip = async (): Promise<void> => {
    if (!selected) return
    try {
      await api.orders.setStatus(selected.orderId, 'shipped', { confirm: true, trackingNumber: tracking })
      setShipOpen(false)
      setTracking('')
      notify(t('order.ship'), 'success')
      reload()
      setSelectedId(null)
    } catch (error) {
      reportError(error)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('picking.title')}</h1>
          <p className="page-subtitle">{t('picking.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button icon={<IconRefresh size={14} />} onClick={reload}>
            {t('common.refresh')}
          </Button>
          {selected ? (
            <Button
              variant="primary"
              onClick={() => setShipOpen(true)}
              disabled={selected.pickedCount < selected.lines.length}
            >
              {t('picking.markShipped')}
            </Button>
          ) : null}
        </div>
      </header>

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPicking size={26} />}
            title={t('picking.empty')}
            message={t('picking.emptyMessage')}
          />
        </Card>
      ) : (
        <div className="grid-2">
          <Card title={t('picking.queue')} flush>
            <div className="tree">
              {orders.map((order) => (
                <button
                  key={order.orderId}
                  type="button"
                  className={order.orderId === selectedId ? 'navitem is-active' : 'navitem'}
                  style={{ borderRadius: 0 }}
                  onClick={() => {
                    setSelectedId(order.orderId)
                    setFeedback(null)
                    scanRef.current?.focus()
                  }}
                >
                  <span className="mono" style={{ color: 'var(--accent)' }}>
                    {order.orderNumber}
                  </span>
                  <span className="navitem__label">
                    {order.buyer || '—'} · {t('picking.units', { count: order.units })}
                  </span>
                  <span className="badge badge--muted">
                    {order.pickedCount}/{order.lines.length}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <div className="stack">
            <Card title={t('picking.scanTitle')}>
              <p className="dim" style={{ marginTop: 0 }}>
                {t('picking.scanHint')}
              </p>
              <div className="form-row">
                <div className="spacer" style={{ minWidth: 180 }}>
                  <TextInput
                    value={scanValue}
                    onChange={setScanValue}
                    placeholder={t('picking.scanPlaceholder')}
                    mono
                  />
                </div>
                <Button variant="primary" onClick={() => void submitScan()} disabled={!scanValue.trim()}>
                  {t('picking.checklist')}
                </Button>
              </div>

              {feedback ? (
                <div
                  className={
                    feedback.tone === 'ok'
                      ? 'notice notice--accent'
                      : feedback.tone === 'warn'
                        ? 'notice notice--warn'
                        : 'notice'
                  }
                  style={{ marginTop: 10 }}
                >
                  {feedback.tone === 'ok' ? <IconCheck size={15} /> : null}
                  {feedback.message}
                </div>
              ) : null}
            </Card>

            {selected ? (
              <Card title={`${selected.orderNumber} · ${t('picking.progress', { picked: selected.pickedCount, total: selected.lines.length })}`}>
                <div className="progress" style={{ marginBottom: 12 }}>
                  <div
                    className="progress__fill"
                    style={{
                      width: `${selected.lines.length === 0 ? 0 : Math.round((selected.pickedCount / selected.lines.length) * 100)}%`
                    }}
                  />
                </div>

                <div className="badge badge--muted" style={{ marginBottom: 10 }}>
                  {t('picking.groupedByLocation')}
                </div>

                <div className="stack">
                  {selected.byLocation.map((group) => (
                    <div key={group.locationPath || 'none'}>
                      <div className="section-title" style={{ marginBottom: 4 }}>
                        {group.locationPath || t('picking.noLocation')}
                      </div>
                      {group.lines.map((line) => (
                        <div key={line.productId} className="tree__row" style={{ paddingLeft: 0 }}>
                          <span
                            className="mono"
                            style={{ color: line.check?.pickedAt ? 'var(--accent)' : 'var(--text-faint)' }}
                          >
                            {line.sku}
                          </span>
                          <span className="tree__name">{line.title}</span>
                          <span className="badge badge--muted">×{number(line.quantity)}</span>
                          {line.check?.pickedAt ? (
                            <span className="badge badge--ok">{t('picking.picked')}</span>
                          ) : (
                            <span className="badge badge--warn">{t('picking.pending')}</span>
                          )}
                          {line.check?.packedAt ? <span className="badge badge--ok">{t('picking.packed')}</span> : null}
                          <span className="tree__actions" style={{ opacity: 1 }}>
                            {!line.check?.pickedAt ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  void api.picking
                                    .markPicked(selected.orderId, line.productId, '')
                                    .then(reload)
                                    .catch(reportError)
                                }}
                              >
                                {t('picking.pick')}
                              </Button>
                            ) : null}
                            {line.check?.pickedAt && !line.check?.packedAt ? (
                              <Button size="sm" variant="primary" onClick={() => void markPacked(line)}>
                                {t('picking.pack')}
                              </Button>
                            ) : null}
                            {line.check?.pickedAt ? (
                              <Button size="sm" variant="ghost" onClick={() => void resetCheck(line)}>
                                {t('picking.reset')}
                              </Button>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="notice" style={{ marginTop: 12 }}>
                  <strong>{t('picking.checklist')}:</strong> {t('picking.checklistHint')}
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      {shipOpen && selected ? (
        <Modal
          title={t('order.shipConfirm')}
          onClose={() => setShipOpen(false)}
          footer={
            <>
              <Button onClick={() => setShipOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void confirmShip()}>
                {t('picking.markShipped')}
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
    </div>
  )
}

export type { PickingOrder }
