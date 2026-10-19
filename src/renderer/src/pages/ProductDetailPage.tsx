/**
 * RESALEVAULT - Ficha del articulo.
 *
 * Muestra los datos reales del articulo, sus margenes calculados y su historial
 * de cambios. Las secciones que aun no existen (fotografias, anuncios) se
 * anuncian como pendientes en lugar de mostrar huecos vacios sin explicacion.
 */

import { useState, type ReactNode } from 'react'
import { marginPercent } from '@shared/format'
import type { HistoryEntry, Listing, MediaAsset, Platform } from '@shared/types'
import { LISTING_STATUSES } from '@shared/types'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import {
  Button,
  Card,
  ConditionLabel,
  ConfirmDialog,
  Field,
  LoadingBlock,
  Modal,
  MoneyInput,
  PlatformBadge,
  Select,
  StatusBadge,
  TextInput
} from '../components/ui'
import {
  IconArchive,
  IconChevronLeft,
  IconEdit,
  IconExternal,
  IconImage,
  IconPlus,
  IconRestore,
  IconTrash
} from '../components/Icons'
import { ProductFormPage } from './ProductFormPage'

export function ProductDetailPage({ productId }: { productId: string }): ReactNode {
  const { t, money, percent, date, dateTime, navigate, notify, dataVersion } = useApp()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'restore' | 'delete' | null>(null)

  const detail = useAsyncData(() => api.products.get(productId), [productId, dataVersion])
  const platforms = useAsyncData(() => api.platforms.list(), [])

  if (editing) {
    return <ProductFormPage productId={productId} onDone={() => setEditing(false)} />
  }

  if (detail.loading && !detail.data) {
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    )
  }

  if (detail.error || !detail.data) {
    return (
      <div className="page">
        <Card>
          <p style={{ margin: 0 }}>{t('errors.not_found')}</p>
          <div style={{ marginTop: 12 }}>
            <Button icon={<IconChevronLeft size={14} />} onClick={() => navigate({ name: 'inventory' })}>
              {t('nav.inventory')}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const { product, tags, history } = detail.data
  const totalCost = product.purchasePriceCents + product.acquisitionFeesCents
  const estimatedMargin = product.expectedSalePriceCents - totalCost
  const realizedMargin =
    product.finalSalePriceCents !== null ? product.finalSalePriceCents - totalCost : null
  const marginPct = marginPercent(product.expectedSalePriceCents, totalCost)

  const runAction = async (): Promise<void> => {
    if (!confirm) return
    try {
      if (confirm === 'archive') {
        await api.products.archive([productId])
        notify(t('product.updated'), 'success')
      } else if (confirm === 'restore') {
        await api.products.restore([productId])
        notify(t('product.updated'), 'success')
      } else {
        await api.products.remove([productId])
        notify(t('product.deleted'), 'success')
        navigate({ name: 'inventory' })
      }
      setConfirm(null)
      detail.reload()
    } catch (error) {
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
      setConfirm(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>
            {product.sku}
          </span>
          <h1 className="page-title">{product.name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <StatusBadge status={product.status} />
            <ConditionLabel condition={product.condition} />
            {product.archivedAt ? <span className="badge badge--muted">{t('inventory.archivedBadge')}</span> : null}
            {tags.map((tag) => (
              <span key={tag.id} className="chip">
                {tag.name}
              </span>
            ))}
          </div>
        </div>
        <div className="page-header__actions">
          <Button icon={<IconChevronLeft size={14} />} onClick={() => navigate({ name: 'inventory' })}>
            {t('nav.inventory')}
          </Button>
          <Button icon={<IconEdit size={14} />} onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
          {product.archivedAt ? (
            <Button icon={<IconRestore size={14} />} onClick={() => setConfirm('restore')}>
              {t('inventory.restore')}
            </Button>
          ) : (
            <Button icon={<IconArchive size={14} />} onClick={() => setConfirm('archive')}>
              {t('inventory.archive')}
            </Button>
          )}
          {product.archivedAt ? (
            <Button
              variant="danger"
              icon={<IconTrash size={14} />}
              onClick={() => setConfirm('delete')}
              title={t('inventory.deleteForeverHint')}
            >
              {t('inventory.deleteForever')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid-cards" style={{ marginBottom: 14 }}>
        <Metric label={t('product.totalCost')} value={money(totalCost)} />
        <Metric label={t('product.expectedPrice')} value={money(product.expectedSalePriceCents)} />
        <Metric
          label={t('product.estimatedMargin')}
          value={money(estimatedMargin)}
          accent={estimatedMargin > 0}
          danger={estimatedMargin < 0}
          hint={marginPct !== null ? percent(marginPct) : undefined}
        />
        <Metric
          label={t('product.realizedMargin')}
          value={realizedMargin === null ? '—' : money(realizedMargin)}
          accent={realizedMargin !== null && realizedMargin > 0}
          danger={realizedMargin !== null && realizedMargin < 0}
        />
        <Metric
          label={t('product.finalPrice')}
          value={product.finalSalePriceCents === null ? '—' : money(product.finalSalePriceCents)}
        />
        <Metric
          label={t('inventory.columnAge')}
          value={String(productAge(product.createdAt, product.purchaseDate))}
          hint={t('common.days')}
        />
      </div>

      <div className="grid-2">
        <Card title={t('product.detailTitle')}>
          <div className="stack stack--sm">
            <DetailRow label={t('common.sku')} value={product.sku} mono />
            <DetailRow label={t('common.brand')} value={product.brand} />
            <DetailRow label={t('common.model')} value={product.model} />
            <DetailRow label={t('common.size')} value={product.size} />
            <DetailRow label={t('common.color')} value={product.color} />
            <DetailRow label={t('product.purchaseDate')} value={date(product.purchaseDate)} />
            <DetailRow label={t('common.description')} value={product.description} />
            <DetailRow
              label={t('product.privateNotes')}
              value={product.privateNotes}
              hint={t('product.privateNotesHint')}
            />
          </div>
        </Card>

        <div className="stack">
          <MediaSection productId={productId} media={detail.data.media} onChange={() => detail.reload()} />

          <ListingsSection
            productId={productId}
            listings={detail.data.listings}
            platforms={platforms.data ?? []}
            onChange={() => detail.reload()}
          />

          {Object.keys(product.attributes).length > 0 ? (
            <Card title={t('product.attributes')}>
              <div className="stack stack--sm">
                {Object.entries(product.attributes).map(([key, value]) => (
                  <DetailRow key={key} label={key} value={formatAttribute(value)} />
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Card title={t('product.sectionHistory')}>
        {history.length === 0 ? (
          <div className="notice">{t('product.historyEmpty')}</div>
        ) : (
          <div className="tree">
            {history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} t={t} dateTime={dateTime} />
            ))}
          </div>
        )}
      </Card>

      {confirm ? (
        <ConfirmDialog
          title={t('common.danger')}
          tone={confirm === 'delete' ? 'danger' : 'default'}
          message={
            confirm === 'delete'
              ? t('inventory.confirmDelete', { count: 1 })
              : confirm === 'archive'
                ? t('inventory.confirmArchive', { count: 1 })
                : t('inventory.confirmRestore', { count: 1 })
          }
          confirmLabel={
            confirm === 'delete'
              ? t('inventory.deleteForever')
              : confirm === 'archive'
                ? t('inventory.archive')
                : t('inventory.restore')
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runAction()}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fotografias y documentos
// ---------------------------------------------------------------------------

/** URL del protocolo propio. El archivo se sirve validado desde la carpeta de datos. */
function mediaUrl(fileName: string, kind: 'media' | 'thumb'): string {
  return `rv-media://${kind}/${fileName.split('\\').join('/')}`
}

function MediaSection({
  productId,
  media,
  onChange
}: {
  productId: string
  media: MediaAsset[]
  onChange: () => void
}): ReactNode {
  const { t, notify } = useApp()
  const [importing, setImporting] = useState(false)
  const [rejected, setRejected] = useState<Array<{ originalName: string; reason: string }>>([])

  const photos = media.filter((asset) => asset.kind === 'photo')
  const documents = media.filter((asset) => asset.kind === 'document')

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const importFiles = async (): Promise<void> => {
    setImporting(true)
    setRejected([])
    try {
      const result = await api.media.importFromDialog(productId)
      if (result.canceled) return
      setRejected(result.rejected)
      notify(
        result.imported > 0 ? t('media.imported', { count: result.imported }) : t('media.noImported'),
        result.imported > 0 ? 'success' : 'info'
      )
      onChange()
    } catch (error) {
      reportError(error)
    } finally {
      setImporting(false)
    }
  }

  const move = async (asset: MediaAsset, direction: -1 | 1): Promise<void> => {
    const order = media.map((entry) => entry.id)
    const index = order.indexOf(asset.id)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    const next = [...order]
    const a = next[index] as string
    const b = next[target] as string
    next[index] = b
    next[target] = a
    try {
      await api.media.reorder(productId, next)
      onChange()
    } catch (error) {
      reportError(error)
    }
  }

  return (
    <Card
      title={t('media.title')}
      actions={
        <Button size="sm" icon={<IconPlus size={13} />} onClick={() => void importFiles()} disabled={importing}>
          {importing ? t('media.importing') : t('media.addFiles')}
        </Button>
      }
    >
      <div className="stack">
        <div className="field__hint">{t('media.hint')}</div>

        {rejected.length > 0 ? (
          <div className="notice notice--warn">
            <div className="stack stack--sm">
              <strong>{t('media.rejectedTitle')}</strong>
              {rejected.map((entry, index) => (
                <span key={index} className="mono" style={{ fontSize: 11 }}>
                  {entry.originalName} — {t(`media.reason.${entry.reason}` as 'media.reason.error')}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {photos.length === 0 ? (
          <div className="dropzone">
            <IconImage size={20} />
            <div>{t('media.empty')}</div>
            <div className="field__hint">{t('media.emptyHint')}</div>
          </div>
        ) : (
          <div className="media-grid">
            {photos.map((asset, index) => (
              <div key={asset.id} className="media-tile">
                {asset.isCover ? <span className="media-tile__cover">{t('media.cover')}</span> : null}
                <img
                  src={mediaUrl(asset.fileName, 'thumb')}
                  alt={asset.originalName}
                  loading="lazy"
                  draggable={false}
                />
                <div className="media-tile__actions">
                  {!asset.isCover ? (
                    <button
                      type="button"
                      className="btn btn--sm"
                      title={t('media.setCover')}
                      onClick={() => {
                        void api.media
                          .setCover(productId, asset.id)
                          .then(onChange)
                          .catch(reportError)
                      }}
                    >
                      ★
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={index === 0}
                    title={t('media.moveUp')}
                    onClick={() => void move(asset, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={index === photos.length - 1}
                    title={t('media.moveDown')}
                    onClick={() => void move(asset, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    title={t('media.remove')}
                    onClick={() => {
                      void api.media
                        .remove(asset.id)
                        .then(onChange)
                        .catch(reportError)
                    }}
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {documents.length > 0 ? (
          <div>
            <div className="section-title">{t('media.documents')}</div>
            <div className="tree">
              {documents.map((asset) => (
                <div key={asset.id} className="doc-row">
                  <span className="tree__name">{asset.originalName}</span>
                  <span className="faint mono" style={{ fontSize: 10.5 }}>
                    {(asset.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                  <span className="tree__actions" style={{ opacity: 1 }}>
                    <Button
                      size="sm"
                      icon={<IconExternal size={12} />}
                      onClick={() => void api.media.openExternal(asset.id).catch(reportError)}
                    >
                      {t('media.open')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        void api.media
                          .remove(asset.id)
                          .then(onChange)
                          .catch(reportError)
                      }}
                    >
                      <IconTrash size={12} />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="field__hint">{t('media.originalKept')}</div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Anuncios por plataforma
// ---------------------------------------------------------------------------

function ListingsSection({
  productId,
  listings,
  platforms,
  onChange
}: {
  productId: string
  listings: Listing[]
  platforms: Platform[]
  onChange: () => void
}): ReactNode {
  const { t, money, date, notify } = useApp()
  const [open, setOpen] = useState(false)
  const [platformId, setPlatformId] = useState('')
  const [externalId, setExternalId] = useState('')
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState(0)
  const [status, setStatus] = useState('active')

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  return (
    <Card
      title={t('product.sectionListings')}
      actions={
        <Button size="sm" icon={<IconPlus size={13} />} onClick={() => setOpen(true)} disabled={platforms.length === 0}>
          {t('common.add')}
        </Button>
      }
    >
      {listings.length === 0 ? (
        <div className="notice">{t('product.listingsPending')}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.platform')}</th>
                <th>{t('common.price')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.date')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <PlatformBadge name={listing.platformName} code={listing.platformCode} />
                    {listing.externalId ? (
                      <span className="mono faint" style={{ marginLeft: 6, fontSize: 10.5 }}>
                        {listing.externalId}
                      </span>
                    ) : null}
                  </td>
                  <td className="cell-num">
                    {listing.listedPriceCents === null ? '—' : money(listing.listedPriceCents)}
                  </td>
                  <td>
                    <span className="badge badge--muted">
                      {t(`listingStatus.${listing.status}` as 'listingStatus.active')}
                    </span>
                  </td>
                  <td className="dim">{date(listing.listedAt)}</td>
                  <td>
                    <span className="row" style={{ gap: 4 }}>
                      {listing.url ? (
                        <a
                          className="btn btn--sm btn--ghost"
                          href={listing.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={t('media.open')}
                        >
                          <IconExternal size={12} />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() => {
                          void api.listings
                            .remove(listing.id)
                            .then(onChange)
                            .catch(reportError)
                        }}
                      >
                        <IconTrash size={12} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <Modal
          title={t('product.sectionListings')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                disabled={!platformId}
                onClick={() => {
                  void api.listings
                    .create({
                      productId,
                      platformId,
                      externalId,
                      url,
                      listedPriceCents: price,
                      status: status as 'active',
                      listedAt: new Date().toISOString().slice(0, 10)
                    })
                    .then(() => {
                      setOpen(false)
                      setExternalId('')
                      setUrl('')
                      setPrice(0)
                      onChange()
                    })
                    .catch(reportError)
                }}
              >
                {t('common.create')}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <Field label={t('common.platform')}>
              <Select value={platformId} onChange={setPlatformId}>
                <option value="">{t('common.select')}</option>
                {platforms
                  .filter((platform) => platform.active)
                  .map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={t('common.status')}>
              <Select value={status} onChange={setStatus}>
                {LISTING_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`listingStatus.${value}` as 'listingStatus.active')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ID externo">
              <TextInput value={externalId} onChange={setExternalId} mono />
            </Field>
            <Field label="URL">
              <TextInput value={url} onChange={setUrl} />
            </Field>
            <Field label={t('common.price')}>
              <MoneyInput valueCents={price} onChange={setPrice} />
            </Field>
          </div>
        </Modal>
      ) : null}
    </Card>
  )
}

function productAge(createdAt: string, purchaseDate: string | null): number {  const from = new Date(purchaseDate ? purchaseDate + 'T00:00:00' : createdAt)
  if (Number.isNaN(from.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000))
}

function formatAttribute(value: string | number | boolean | null): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}

function Metric({
  label,
  value,
  hint,
  accent = false,
  danger = false
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
  danger?: boolean
}): ReactNode {
  const valueClass = accent && !danger ? 'kpi__value kpi__value--accent' : 'kpi__value'
  return (
    <div className={accent && !danger ? 'kpi kpi--accent' : 'kpi'}>
      <span className="kpi__label">{label}</span>
      <span className={valueClass} style={danger ? { color: 'var(--danger)' } : undefined}>
        {value}
      </span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  hint,
  mono = false
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}): ReactNode {
  return (
    <div className="stat-line" style={{ alignItems: 'flex-start' }}>
      <span className="faint nowrap" style={{ minWidth: 130 }}>
        {label}
      </span>
      <span className={mono ? 'mono' : ''} style={{ textAlign: 'right', wordBreak: 'break-word' }}>
        {value || '—'}
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  )
}

function HistoryRow({
  entry,
  t,
  dateTime
}: {
  entry: HistoryEntry
  t: ReturnType<typeof useApp>['t']
  dateTime: (value: string | null) => string
}): ReactNode {
  const actionKeys: Record<string, string> = {
    created: 'product.historyActionCreated',
    updated: 'product.historyActionUpdated',
    archived: 'product.historyActionArchived',
    restored: 'product.historyActionRestored',
    bulk_update: 'product.historyActionBulkUpdate',
    price_change: 'product.historyActionPriceChange'
  }
  const key = actionKeys[entry.action]
  const label = key ? t(key as 'product.historyActionCreated') : entry.action
  const isPrice = entry.field === 'expected_sale_price_cents' || entry.field === 'final_sale_price_cents'

  const show = (value: string | null): string => {
    if (value === null) return '—'
    if (isPrice) {
      const cents = Number(value)
      return Number.isFinite(cents) ? (cents / 100).toFixed(2) : value
    }
    return value
  }

  return (
    <div className="tree__row">
      <span className="faint" style={{ width: 118, flex: 'none', fontSize: 11.5 }}>
        {dateTime(entry.at)}
      </span>
      <span className="badge badge--muted">{label}</span>
      <span className="tree__name" style={{ fontWeight: 400 }}>
        {entry.field ? (
          <>
            <span className="mono faint">{entry.field}</span>{' '}
            <span className="dim">{show(entry.oldValue)}</span> →{' '}
            <span style={{ color: 'var(--accent)' }}>{show(entry.newValue)}</span>
          </>
        ) : (
          <span className="dim">{entry.note ?? ''}</span>
        )}
      </span>
    </div>
  )
}
