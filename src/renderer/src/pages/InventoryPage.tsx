/**
 * RESALEVAULT - Inventario.
 *
 * Pantalla principal de trabajo: buscar, filtrar, ordenar, seleccionar varios
 * articulos y aplicar acciones en bloque. Todas las consultas se ejecutan en el
 * proceso principal con parametros validados; aqui solo se compone la consulta.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProductQuery, ProductSort, ProductStatus, ProductSummary } from '@shared/types'
import { PRODUCT_STATUSES } from '@shared/types'
import { marginPercent } from '@shared/format'
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
  LoadingBlock,
  Select,
  StatusBadge
} from '../components/ui'
import {
  IconArchive,
  IconBox,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconFilter,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconTrash
} from '../components/Icons'
import { BulkEditModal } from './BulkEditModal'
import { LabelsModal } from './LabelsModal'

const PAGE_SIZE = 50

type PendingAction = { type: 'archive' | 'restore' | 'delete'; ids: string[] } | null

export function InventoryPage(): ReactNode {
  const { t, money, number, percent, date, dataVersion, navigate, notify } = useApp()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [minAge, setMinAge] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<ProductSort>('updated_desc')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const [busy, setBusy] = useState(false)

  const debouncedSearch = useDebounced(search, 240)

  // Al cambiar cualquier filtro se vuelve a la primera pagina.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, categoryId, locationId, minAge, showArchived, sort])

  const query = useMemo<ProductQuery>(() => {
    const result: ProductQuery = { page, pageSize: PAGE_SIZE, sort }
    if (debouncedSearch.trim()) result.search = debouncedSearch.trim()
    if (status === 'archived') result.onlyArchived = true
    else {
      if (status) result.status = [status as ProductStatus]
      if (showArchived) result.includeArchived = true
    }
    if (categoryId) result.categoryIds = [categoryId]
    if (locationId) result.locationIds = [locationId]
    if (minAge) result.minAgeDays = Number(minAge)
    return result
  }, [page, sort, debouncedSearch, status, categoryId, locationId, minAge, showArchived])

  const pageData = useAsyncData(() => api.products.list(query), [query, dataVersion])
  const categories = useAsyncData(() => api.categories.list(), [dataVersion])
  const locations = useAsyncData(() => api.locations.list(), [dataVersion])
  const settings = useAsyncData(() => api.app.getSettings(), [dataVersion])

  const items = pageData.data?.items ?? []
  const total = pageData.data?.total ?? 0
  const pageCount = pageData.data?.pageCount ?? 1

  const selectedSet = useMemo(() => new Set(selection), [selection])
  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedSet.has(item.id))

  const extremes = useMemo(() => {
    if (!pageData.data || total === 0) return { from: 0, to: 0 }
    const from = (pageData.data.page - 1) * pageData.data.pageSize + 1
    const to = Math.min(total, from + items.length - 1)
    return { from, to }
  }, [pageData.data, items.length, total])

  const toggleSelection = (id: string): void => {
    setSelection((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  const toggleAllOnPage = (): void => {
    if (allSelectedOnPage) {
      setSelection((current) => current.filter((id) => !items.some((item) => item.id === id)))
    } else {
      setSelection((current) => [...new Set([...current, ...items.map((item) => item.id)])])
    }
  }

  const runPending = async (): Promise<void> => {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.type === 'archive') {
        const result = await api.products.archive(pending.ids)
        notify(t('bulk.applied', { count: result.affected }), 'success')
      } else if (pending.type === 'restore') {
        const result = await api.products.restore(pending.ids)
        notify(t('bulk.applied', { count: result.affected }), 'success')
      } else {
        const result = await api.products.remove(pending.ids)
        notify(t('bulk.applied', { count: result.affected }), 'success')
      }
      setSelection([])
      setPending(null)
      pageData.reload()
    } catch (error) {
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  const filtersActive =
    Boolean(status) || Boolean(categoryId) || Boolean(locationId) || Boolean(minAge) || showArchived

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('inventory.title')}</h1>
          <p className="page-subtitle">{t('inventory.subtitle', { count: number(total) })}</p>
        </div>
        <div className="page-header__actions">
          <Button
            icon={<IconFilter size={14} />}
            onClick={() => setShowFilters((value) => !value)}
            variant={filtersActive ? 'primary' : 'default'}
          >
            {t('common.filters')}
          </Button>
          <IconButton label={t('common.refresh')} onClick={() => pageData.reload()}>
            <IconRefresh />
          </IconButton>
          <Button variant="primary" onClick={() => navigate({ name: 'product-new' })}>
            {t('inventory.newProduct')}
          </Button>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar__grow" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}>
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t('inventory.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('common.search')}
          />
        </div>

        <Field label={t('inventory.sortBy')}>
          <Select value={sort} onChange={(value) => setSort(value as ProductSort)}>
            <option value="updated_desc">{t('inventory.sortUpdated')}</option>
            <option value="created_desc">{t('inventory.sortCreated')}</option>
            <option value="name_asc">{t('inventory.sortName')}</option>
            <option value="sku_asc">{t('inventory.sortSku')}</option>
            <option value="cost_desc">{t('inventory.sortCost')}</option>
            <option value="expected_desc">{t('inventory.sortExpected')}</option>
            <option value="age_desc">{t('inventory.sortAge')}</option>
            <option value="margin_asc">{t('inventory.sortMargin')}</option>
          </Select>
        </Field>
      </div>

      {showFilters ? (
        <div className="filter-bar">
          <Field label={t('inventory.filterStatus')}>
            <Select value={status} onChange={setStatus}>
              <option value="">{t('common.all')}</option>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('inventory.filterCategory')}>
            <Select value={categoryId} onChange={setCategoryId}>
              <option value="">{t('common.all')}</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '\u00a0\u00a0\u00a0' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('inventory.filterLocation')}>
            <Select value={locationId} onChange={setLocationId}>
              <option value="">{t('common.all')}</option>
              {(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.path}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('inventory.filterAge')}>
            <Select value={minAge} onChange={setMinAge}>
              <option value="">{t('inventory.ageAny')}</option>
              {(settings.data?.staleThresholds ?? [30, 60, 90]).map((threshold) => (
                <option key={threshold} value={String(threshold)}>
                  {t('inventory.ageDays', { count: threshold })}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              {t('inventory.filterArchived')}
            </label>
          </Field>

          <Field label="">
            <Button
              onClick={() => {
                setStatus('')
                setCategoryId('')
                setLocationId('')
                setMinAge('')
                setShowArchived(false)
              }}
              disabled={!filtersActive}
            >
              {t('common.clearFilters')}
            </Button>
          </Field>
        </div>
      ) : null}

      {selection.length > 0 ? (
        <div className="selection-bar">
          <span className="selection-bar__count">
            {t('inventory.selectedCount', { count: selection.length })}
          </span>
          <span className="spacer" />
          <Button size="sm" icon={<IconEdit size={13} />} onClick={() => setBulkOpen(true)} disabled={busy}>
            {t('inventory.bulkEdit')}
          </Button>
          <Button size="sm" onClick={() => setLabelsOpen(true)} disabled={busy}>
            {t('labels.title')}
          </Button>
          <Button
            size="sm"
            icon={<IconArchive size={13} />}
            onClick={() => setPending({ type: 'archive', ids: selection })}
            disabled={busy}
          >
            {t('inventory.archive')}
          </Button>
          <Button
            size="sm"
            icon={<IconRestore size={13} />}
            onClick={() => setPending({ type: 'restore', ids: selection })}
            disabled={busy}
          >
            {t('inventory.restore')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<IconTrash size={13} />}
            onClick={() => setPending({ type: 'delete', ids: selection })}
            disabled={busy}
          >
            {t('inventory.deleteForever')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
            {t('inventory.clearSelection')}
          </Button>
        </div>
      ) : null}

      <Card flush>
        {pageData.loading && !pageData.data ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconBox size={26} />}
            title={total === 0 && !filtersActive && !debouncedSearch ? t('inventory.emptyTitle') : t('inventory.noResults')}
            message={
              total === 0 && !filtersActive && !debouncedSearch
                ? t('inventory.emptyMessage')
                : t('inventory.noResultsHint')
            }
            action={
              total === 0 && !filtersActive && !debouncedSearch ? (
                <Button variant="primary" onClick={() => navigate({ name: 'product-new' })}>
                  {t('inventory.newProduct')}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setSearch('')
                    setStatus('')
                    setCategoryId('')
                    setLocationId('')
                    setMinAge('')
                    setShowArchived(false)
                  }}
                >
                  {t('common.clearFilters')}
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={toggleAllOnPage}
                        aria-label={t('inventory.selectAll', { count: items.length })}
                      />
                    </th>
                    <th>{t('inventory.columnSku')}</th>
                    <th>{t('inventory.columnName')}</th>
                    <th>{t('inventory.columnStatus')}</th>
                    <th>{t('inventory.columnCategory')}</th>
                    <th>{t('inventory.columnLocation')}</th>
                    <th className="cell-num">{t('inventory.columnCost')}</th>
                    <th className="cell-num">{t('inventory.columnExpected')}</th>
                    <th className="cell-num">{t('inventory.columnMargin')}</th>
                    <th className="cell-num">{t('inventory.columnAge')}</th>
                    <th className="cell-num">{t('inventory.columnUpdated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ProductRow
                      key={item.id}
                      item={item}
                      selected={selectedSet.has(item.id)}
                      onToggle={() => toggleSelection(item.id)}
                      onOpen={() => navigate({ name: 'product', productId: item.id })}
                      money={money}
                      percent={percent}
                      date={date}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="row row--between"
              style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}
            >
              <span className="dim" style={{ fontSize: 12 }}>
                {t('inventory.showingRange', { from: extremes.from, to: extremes.to, total })}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <IconButton
                  label={t('common.page')}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <IconChevronLeft />
                </IconButton>
                <span className="mono">
                  {page} / {pageCount}
                </span>
                <IconButton
                  label={t('common.page')}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                >
                  <IconChevronRight />
                </IconButton>
              </span>
            </div>
          </>
        )}
      </Card>

      {bulkOpen ? (
        <BulkEditModal
          ids={selection}
          categories={categories.data ?? []}
          locations={locations.data ?? []}
          onClose={() => setBulkOpen(false)}
          onApplied={(affected) => {
            notify(t('bulk.applied', { count: affected }), 'success')
            setSelection([])
            pageData.reload()
          }}
        />
      ) : null}

      {labelsOpen ? (
        <LabelsModal target="product" ids={selection} onClose={() => setLabelsOpen(false)} />
      ) : null}

      {pending ? (
        <ConfirmDialog
          title={t('common.danger')}
          tone={pending.type === 'delete' ? 'danger' : 'default'}
          message={
            pending.type === 'archive'
              ? t('inventory.confirmArchive', { count: pending.ids.length })
              : pending.type === 'restore'
                ? t('inventory.confirmRestore', { count: pending.ids.length })
                : t('inventory.confirmDelete', { count: pending.ids.length })
          }
          confirmLabel={
            pending.type === 'archive'
              ? t('inventory.archive')
              : pending.type === 'restore'
                ? t('inventory.restore')
                : t('inventory.deleteForever')
          }
          onCancel={() => setPending(null)}
          onConfirm={() => void runPending()}
        />
      ) : null}
    </div>
  )
}

function ProductRow({
  item,
  selected,
  onToggle,
  onOpen,
  money,
  percent,
  date
}: {
  item: ProductSummary
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  money: (cents: number) => string
  percent: (value: number) => string
  date: (value: string | null) => string
}): ReactNode {
  const marginPct = marginPercent(item.expectedSalePriceCents, item.totalCostCents)

  return (
    <tr className={selected ? 'is-selected is-clickable' : 'is-clickable'}>
      <td onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={item.sku} />
      </td>
      <td className="cell-mono" onClick={onOpen}>
        {item.sku}
      </td>
      <td onClick={onOpen}>
        <span className="cell-strong">{item.name}</span>
        <span className="faint" style={{ marginLeft: 8, fontSize: 11.5 }}>
          {[item.brand, item.size, item.color].filter(Boolean).join(' · ')}
        </span>
        {item.tags.length > 0 ? (
          <span style={{ marginLeft: 8 }}>
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="chip" style={{ marginRight: 4 }}>
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </td>
      <td onClick={onOpen}>
        <StatusBadge status={item.status} />
      </td>
      <td className="dim" onClick={onOpen}>
        {item.categoryName ?? '—'}
      </td>
      <td className="cell-mono dim" onClick={onOpen}>
        {item.locationPath ?? '—'}
      </td>
      <td className="cell-num" onClick={onOpen}>
        {item.totalCostCents > 0 ? money(item.totalCostCents) : '—'}
      </td>
      <td className="cell-num" onClick={onOpen}>
        {item.expectedSalePriceCents > 0 ? money(item.expectedSalePriceCents) : '—'}
      </td>
      <td
        className="cell-num"
        onClick={onOpen}
        style={{
          color:
            (item.realizedMarginCents ?? item.estimatedMarginCents) < 0 ? 'var(--danger)' : undefined
        }}
      >
        {item.realizedMarginCents !== null
          ? money(item.realizedMarginCents)
          : item.expectedSalePriceCents > 0
            ? money(item.estimatedMarginCents)
            : '—'}
        {marginPct !== null ? (
          <span className="faint" style={{ marginLeft: 5, fontSize: 11 }}>
            {percent(marginPct)}
          </span>
        ) : null}
      </td>
      <td className="cell-num dim" onClick={onOpen}>
        {item.ageDays}
      </td>
      <td className="cell-num dim" onClick={onOpen} style={{ fontSize: 11.5 }}>
        {date(item.updatedAt)}
      </td>
    </tr>
  )
}
