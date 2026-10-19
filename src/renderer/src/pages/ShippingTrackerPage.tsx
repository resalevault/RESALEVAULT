/**
 * RESALEVAULT - Shipping Tracker.
 *
 * Dos secciones en la misma pestana:
 *  - "Your Trackcodes": codigos guardados en SQLite. Funciona sin conexion.
 *  - "Carriers": directorio local de transportistas con su pagina oficial.
 *
 * "Track Now" abre la pagina del transportista en el navegador integrado. Si el
 * transportista admite el codigo en la URL, se rellena solo; si no, se copia al
 * portapapeles y se avisa. **Abrir la pagina nunca se presenta como un estado
 * confirmado**: el estado solo cambia si lo pone el usuario.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type {
  Carrier,
  CarrierRegion,
  Trackcode,
  TrackcodeDraft,
  TrackcodeQuery,
  TrackcodeStatus
} from '@shared/types-tracking'
import { CARRIER_REGIONS, TRACKCODE_STATUSES } from '@shared/types-tracking'
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
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { CarrierBadge } from '../components/CarrierBadge'
import {
  IconArchive,
  IconEdit,
  IconExternal,
  IconPlus,
  IconRestore,
  IconSearch,
  IconTag,
  IconTracker,
  IconTrash
} from '../components/Icons'

type Tab = 'trackcodes' | 'carriers'

const STATUS_TONE: Record<TrackcodeStatus, string> = {
  pending: 'trackcode-status--pending',
  in_transit: 'trackcode-status--in_transit',
  delivered: 'trackcode-status--delivered',
  incident: 'trackcode-status--incident',
  archived: 'trackcode-status--archived'
}

export function ShippingTrackerPage(): ReactNode {
  const { t, number, date, notify, dataVersion } = useApp()

  const [tab, setTab] = useState<Tab>('trackcodes')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 220)

  const [carrierFilter, setCarrierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<NonNullable<TrackcodeQuery['sort']>>('created_desc')
  const [showArchived, setShowArchived] = useState(false)

  const [region, setRegion] = useState<CarrierRegion | 'ALL'>('ALL')
  const [carrierSearch, setCarrierSearch] = useState('')
  const debouncedCarrierSearch = useDebounced(carrierSearch, 200)

  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; trackcode?: Trackcode; carrierId?: string } | null>(
    null
  )
  const [carrierEditor, setCarrierEditor] = useState<Carrier | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Trackcode | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const carriers = useAsyncData(
    () => api.tracking.carriers({ search: debouncedCarrierSearch || undefined, region }),
    [debouncedCarrierSearch, region]
  )

  const query = useMemo<TrackcodeQuery>(() => {
    const result: TrackcodeQuery = { sort, pageSize: 200 }
    if (debouncedSearch.trim()) result.search = debouncedSearch.trim()
    if (carrierFilter) result.carrierIds = [carrierFilter]
    if (statusFilter) {
      if (statusFilter === 'archived') result.onlyArchived = true
      else result.statuses = [statusFilter as TrackcodeStatus]
    }
    if (showArchived) result.includeArchived = true
    return result
  }, [debouncedSearch, carrierFilter, statusFilter, sort, showArchived])

  const list = useAsyncData(() => api.tracking.list(query), [query, dataVersion])
  const allCarriers = useAsyncData(() => api.tracking.carriers({}), [dataVersion])

  const carrierById = useMemo(() => {
    const map = new Map<string, Carrier>()
    for (const carrier of allCarriers.data ?? []) map.set(carrier.id, carrier)
    return map
  }, [allCarriers.data])

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const reload = (): void => {
    list.reload()
    carriers.reload()
    allCarriers.reload()
  }

  const trackNow = async (trackcode: Trackcode): Promise<void> => {
    setBusyId(trackcode.id)
    try {
      const result = await api.tracking.trackNow(trackcode.id)
      notify(result.filledByUrl ? t('tracking.urlFilled') : t('tracking.copyPasteHint'), 'info')
    } catch (error) {
      reportError(error)
    } finally {
      setBusyId(null)
    }
  }

  const openCarrierPage = async (carrier: Carrier): Promise<void> => {
    try {
      await api.browser.open({
        url: carrier.trackUrl,
        carrierId: carrier.id,
        carrierName: carrier.name
      })
    } catch (error) {
      reportError(error)
    }
  }

  const copyCode = (code: string): void => {
    const clipboard = navigator.clipboard
    if (!clipboard?.writeText) {
      notify(t('errors.unsupported_file_type'), 'error')
      return
    }
    void clipboard
      .writeText(code)
      .then(() => notify(t('tracking.copied'), 'success'))
      .catch(() => notify(t('errors.internal_error', { id: '-' }), 'error'))
  }

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('tracking.title')}</h1>
          <p className="page-subtitle">{t('tracking.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setEditor({ mode: 'create' })}
          >
            {t('tracking.addTrackcode')}
          </Button>
        </div>
      </header>

      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <div className="segmented">
          <button
            type="button"
            className={tab === 'trackcodes' ? 'is-active' : ''}
            onClick={() => setTab('trackcodes')}
          >
            {t('tracking.tabTrackcodes')} ({number(total)})
          </button>
          <button
            type="button"
            className={tab === 'carriers' ? 'is-active' : ''}
            onClick={() => setTab('carriers')}
          >
            {t('tracking.tabCarriers')} ({number((allCarriers.data ?? []).length)})
          </button>
        </div>
      </div>

      {tab === 'trackcodes' ? (
        <>
          <div className="toolbar">
            <div className="toolbar__grow" style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}>
                <IconSearch size={14} />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder={t('tracking.searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="filter-bar">
            <Field label={t('tracking.filterCarrier')}>
              <Select value={carrierFilter} onChange={setCarrierFilter}>
                <option value="">{t('common.all')}</option>
                {(allCarriers.data ?? []).map((carrier) => (
                  <option key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('tracking.filterStatus')}>
              <Select value={statusFilter} onChange={setStatusFilter}>
                <option value="">{t('common.all')}</option>
                {TRACKCODE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`tracking.statuses.${status}` as 'tracking.statuses.pending')}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('tracking.sortBy')}>
              <Select value={sort} onChange={(value) => setSort(value as typeof sort)}>
                <option value="created_desc">{t('tracking.sortCreatedDesc')}</option>
                <option value="created_asc">{t('tracking.sortCreatedAsc')}</option>
                <option value="expected_asc">{t('tracking.sortExpected')}</option>
                <option value="code_asc">{t('tracking.sortCode')}</option>
                <option value="carrier_asc">{t('tracking.sortCarrier')}</option>
              </Select>
            </Field>

            <Field label="">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                {t('tracking.showArchived')}
              </label>
            </Field>
          </div>

          <Card flush>
            {list.loading && !list.data ? (
              <div className="empty">
                <div className="spinner" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<IconTracker size={26} />}
                title={total === 0 && !debouncedSearch ? t('tracking.emptyTitle') : t('tracking.noResults')}
                message={total === 0 && !debouncedSearch ? t('tracking.emptyMessage') : t('tracking.noResultsHint')}
                action={
                  total === 0 && !debouncedSearch ? (
                    <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
                      {t('tracking.addTrackcode')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setSearch('')
                        setCarrierFilter('')
                        setStatusFilter('')
                        setShowArchived(false)
                      }}
                    >
                      {t('common.clearFilters')}
                    </Button>
                  )
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('tracking.packageName')}</th>
                      <th>{t('tracking.code')}</th>
                      <th>{t('tracking.filterCarrier')}</th>
                      <th>{t('tracking.status')}</th>
                      <th>{t('tracking.expectedDate')}</th>
                      <th>{t('common.date')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((trackcode) => {
                      const carrier = carrierById.get(trackcode.carrierId)
                      return (
                        <tr key={trackcode.id}>
                          <td>
                            <span className="cell-strong">{trackcode.name || '—'}</span>
                            {trackcode.orderRef ? (
                              <span className="faint" style={{ marginLeft: 6, fontSize: 11 }}>
                                {trackcode.orderRef}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <span className="mono">{trackcode.code}</span>
                            <IconButton
                              label={t('tracking.copy')}
                              onClick={() => copyCode(trackcode.code)}
                            >
                              <IconTag size={12} />
                            </IconButton>
                          </td>
                          <td>
                            <span className="row" style={{ gap: 6 }}>
                              <CarrierBadge
                                carrier={carrier ?? { id: trackcode.carrierId, name: trackcode.carrierName }}
                                size={20}
                              />
                              <span className="dim">{trackcode.carrierName}</span>
                            </span>
                          </td>
                          <td>
                            <span className={`trackcode-status ${STATUS_TONE[trackcode.status]}`}>
                              {t(`tracking.statuses.${trackcode.status}` as 'tracking.statuses.pending')}
                            </span>
                            <span
                              className="status-origin"
                              style={{ marginLeft: 6 }}
                              title={t('tracking.statusOriginHint')}
                            >
                              {trackcode.statusSource === 'confirmed'
                                ? t('tracking.statusConfirmed')
                                : trackcode.statusSource === 'manual'
                                  ? t('tracking.statusManual')
                                  : t('tracking.statusNone')}
                            </span>
                          </td>
                          <td className="dim">{trackcode.expectedDate ? date(trackcode.expectedDate) : '—'}</td>
                          <td className="dim" style={{ fontSize: 11.5 }}>
                            {date(trackcode.createdAt)}
                          </td>
                          <td>
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void trackNow(trackcode)}
                                disabled={busyId === trackcode.id}
                              >
                                {busyId === trackcode.id ? t('tracking.opening') : t('tracking.trackNow')}
                              </Button>
                              <IconButton
                                label={t('tracking.edit')}
                                onClick={() => setEditor({ mode: 'edit', trackcode })}
                              >
                                <IconEdit size={13} />
                              </IconButton>
                              {trackcode.archivedAt ? (
                                <IconButton
                                  label={t('tracking.restore')}
                                  onClick={() => {
                                    void api.tracking
                                      .restore([trackcode.id])
                                      .then(reload)
                                      .catch(reportError)
                                  }}
                                >
                                  <IconRestore size={13} />
                                </IconButton>
                              ) : (
                                <IconButton
                                  label={t('tracking.archive')}
                                  onClick={() => {
                                    void api.tracking
                                      .archive([trackcode.id])
                                      .then(reload)
                                      .catch(reportError)
                                  }}
                                >
                                  <IconArchive size={13} />
                                </IconButton>
                              )}
                              <IconButton
                                label={t('tracking.delete')}
                                onClick={() => setPendingDelete(trackcode)}
                              >
                                <IconTrash size={13} />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="field__hint" style={{ marginTop: 8 }}>
            {t('tracking.openedHint')}
          </div>
        </>
      ) : (
        <>
          <p className="dim" style={{ marginTop: 0 }}>
            {t('tracking.carriersSubtitle')}
          </p>

          <div className="toolbar">
            <div className="toolbar__grow" style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}>
                <IconSearch size={14} />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder={t('common.search')}
                value={carrierSearch}
                onChange={(event) => setCarrierSearch(event.target.value)}
              />
            </div>

            <div className="segmented">
              {(['ALL', ...CARRIER_REGIONS] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={region === value ? 'is-active' : ''}
                  onClick={() => setRegion(value)}
                >
                  {value === 'ALL'
                    ? t('common.all')
                    : t(`tracking.region${value}` as 'tracking.regionES')}
                </button>
              ))}
            </div>
          </div>

          {(carriers.data ?? []).length === 0 ? (
            <Card>
              <EmptyState icon={<IconTracker size={26} />} title={t('tracking.noCarriers')} />
            </Card>
          ) : (
            <div className="grid-cards">
              {(carriers.data ?? []).map((carrier) => (
                <div key={carrier.id} className="carrier-card">
                  <CarrierBadge carrier={carrier} />
                  <div className="carrier-card__body">
                    <div className="carrier-card__name">{carrier.name}</div>
                    <div className="carrier-card__meta">
                      <span>{carrier.country || '—'}</span>
                      <span
                        className={carrier.verified ? 'badge badge--ok' : 'badge badge--muted'}
                        title={carrier.verified ? t('tracking.verifiedHint') : t('tracking.unverifiedHint')}
                      >
                        {carrier.verified ? t('tracking.verifiedUrl') : t('tracking.unverifiedUrl')}
                      </span>
                      {carrier.strategy === 'url' ? (
                        <span className="badge badge--accent" title={t('tracking.urlFilled')}>
                          {t('tracking.strategyUrl')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <IconButton
                      label={t('tracking.openCarrier')}
                      onClick={() => void openCarrierPage(carrier)}
                    >
                      <IconExternal size={13} />
                    </IconButton>
                    <IconButton
                      label={t('tracking.addFromCarrier')}
                      onClick={() => setEditor({ mode: 'create', carrierId: carrier.id })}
                    >
                      <IconPlus size={13} />
                    </IconButton>
                    <IconButton
                      label={t('tracking.editCarrier')}
                      onClick={() => setCarrierEditor(carrier)}
                    >
                      <IconEdit size={13} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editor ? (
        <TrackcodeModal
          mode={editor.mode}
          trackcode={editor.trackcode}
          initialCarrierId={editor.carrierId}
          carriers={allCarriers.data ?? []}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            reload()
          }}
        />
      ) : null}

      {carrierEditor ? (
        <CarrierModal
          carrier={carrierEditor}
          onClose={() => setCarrierEditor(null)}
          onSaved={() => {
            setCarrierEditor(null)
            reload()
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('tracking.confirmDelete')}
          tone="danger"
          message={t('tracking.confirmDeleteHint')}
          confirmLabel={t('tracking.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void api.tracking
              .remove([pendingDelete.id])
              .then(() => {
                setPendingDelete(null)
                reload()
              })
              .catch(reportError)
          }}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alta / edicion de un codigo
// ---------------------------------------------------------------------------

function TrackcodeModal({
  mode,
  trackcode,
  initialCarrierId,
  carriers,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  trackcode?: Trackcode
  initialCarrierId?: string
  carriers: Carrier[]
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const { t, notify } = useApp()

  const [code, setCode] = useState(trackcode?.code ?? '')
  const [carrierId, setCarrierId] = useState(trackcode?.carrierId ?? initialCarrierId ?? '')
  const [name, setName] = useState(trackcode?.name ?? '')
  const [orderRef, setOrderRef] = useState(trackcode?.orderRef ?? '')
  const [purchaseDate, setPurchaseDate] = useState(trackcode?.purchaseDate ?? '')
  const [expectedDate, setExpectedDate] = useState(trackcode?.expectedDate ?? '')
  const [status, setStatus] = useState<TrackcodeStatus>(trackcode?.status ?? 'pending')
  const [notes, setNotes] = useState(trackcode?.notes ?? '')
  const [carrierSearch, setCarrierSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicate, setDuplicate] = useState<{ code: string; carrier: string; id: string } | null>(null)

  const filteredCarriers = useMemo(() => {
    const term = carrierSearch.trim().toLowerCase()
    if (!term) return carriers
    return carriers.filter((carrier) => carrier.name.toLowerCase().includes(term))
  }, [carriers, carrierSearch])

  const payload = (): TrackcodeDraft => ({
    code,
    carrierId,
    name,
    orderRef,
    purchaseDate: purchaseDate || null,
    expectedDate: expectedDate || null,
    status,
    notes
  })

  const save = async (): Promise<void> => {
    if (!code.trim() || !carrierId) {
      notify(t('errors.invalid_input', { field: t('tracking.code') }), 'error')
      return
    }
    setSaving(true)
    try {
      if (mode === 'edit' && trackcode) {
        await api.tracking.update(trackcode.id, {
          code,
          carrierId,
          name,
          orderRef,
          purchaseDate: purchaseDate || null,
          expectedDate: expectedDate || null,
          status,
          notes
        })
      } else {
        await api.tracking.create(payload())
      }
      onSaved()
    } catch (error) {
      if (error instanceof AppError && error.code === 'conflict' && error.params?.reason === 'duplicate') {
        setDuplicate({
          code: String(error.params.code ?? code),
          carrier: String(error.params.carrier ?? ''),
          id: String(error.params.existingId ?? '')
        })
        return
      }
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        title={mode === 'edit' ? t('tracking.edit') : t('tracking.addTrackcode')}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {mode === 'edit' ? t('common.saveChanges') : t('common.create')}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label={t('tracking.code')}>
            <TextInput value={code} onChange={setCode} mono placeholder={t('tracking.codePlaceholder')} />
          </Field>

          <Field label={t('tracking.filterCarrier')}>
            <TextInput value={carrierSearch} onChange={setCarrierSearch} placeholder={t('common.search')} />
            <div style={{ marginTop: 4 }}>
              <Select value={carrierId} onChange={setCarrierId}>
                <option value="">{t('common.select')}</option>
                {filteredCarriers.map((carrier) => (
                  <option key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </option>
                ))}
              </Select>
            </div>
          </Field>

          <Field label={t('tracking.packageName')}>
            <TextInput
              value={name}
              onChange={setName}
              placeholder={t('tracking.packageNamePlaceholder')}
            />
          </Field>

          <Field label={t('tracking.orderRef')}>
            <TextInput value={orderRef} onChange={setOrderRef} placeholder={t('tracking.orderRefPlaceholder')} />
          </Field>

          <Field label={t('tracking.purchaseDate')}>
            <input
              type="date"
              className="input"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </Field>

          <Field label={t('tracking.expectedDate')}>
            <input
              type="date"
              className="input"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
            />
          </Field>

          <Field label={t('tracking.status')} hint={t('tracking.statusOriginHint')}>
            <Select value={status} onChange={(value) => setStatus(value as TrackcodeStatus)}>
              {TRACKCODE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`tracking.statuses.${value}` as 'tracking.statuses.pending')}
                </option>
              ))}
            </Select>
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('common.notes')}>
              <TextArea value={notes} onChange={setNotes} rows={2} />
            </Field>
          </div>
        </div>
      </Modal>

      {duplicate ? (
        <ConfirmDialog
          title={t('tracking.duplicateTitle')}
          message={t('tracking.duplicateMessage', { code: duplicate.code, carrier: duplicate.carrier })}
          confirmLabel={t('common.close')}
          onCancel={() => setDuplicate(null)}
          onConfirm={() => {
            setDuplicate(null)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Edicion de transportista (URLs que cambian)
// ---------------------------------------------------------------------------

function CarrierModal({
  carrier,
  onClose,
  onSaved
}: {
  carrier: Carrier
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const { t, notify } = useApp()
  const [trackUrl, setTrackUrl] = useState(carrier.trackUrl)
  const [urlTemplate, setUrlTemplate] = useState(carrier.urlTemplate)
  const [notes, setNotes] = useState(carrier.notes)

  return (
    <Modal
      title={t('tracking.editCarrier')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              void api.tracking
                .updateCarrier(carrier.id, {
                  trackUrl,
                  urlTemplate,
                  strategy: urlTemplate.includes('{code}') ? 'url' : 'copy',
                  notes
                })
                .then(onSaved)
                .catch((error: unknown) =>
                  notify(
                    error instanceof AppError
                      ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
                      : t('errors.internal_error', { id: '-' }),
                    'error'
                  )
                )
            }}
          >
            {t('tracking.saveCarrier')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('tracking.trackUrl')}>
          <TextInput value={trackUrl} onChange={setTrackUrl} />
        </Field>
        <Field label={t('tracking.urlTemplate')} hint={t('tracking.urlTemplateHint')}>
          <TextInput value={urlTemplate} onChange={setUrlTemplate} />
        </Field>
        <Field label={t('common.notes')}>
          <TextArea value={notes} onChange={setNotes} rows={2} />
        </Field>
      </div>
    </Modal>
  )
}
