/**
 * RESALEVAULT - Compras, gastos generales y proveedores.
 *
 * Tres pestanas porque son tres cosas distintas que se consultan juntas:
 *  - Compras: el documento de adquisicion. Su coste se REPARTE entre articulos.
 *  - Gastos: costes generales del negocio. NO son coste de mercancia.
 *  - Proveedores: el catalogo de quienes te venden.
 *
 * La vista previa del reparto se pide al proceso principal, que es quien
 * calcula la formula. La interfaz nunca recalcula dinero.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { ExpenseCategory, Purchase, Supplier } from '@shared/types-modules'
import { ALLOCATION_METHODS, EXPENSE_CATEGORIES, EXPENSE_RECURRENCE } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Modal,
  MoneyInput,
  Select,
  TextArea,
  TextInput
} from '../components/ui'
import { IconPlus, IconPurchases, IconTrash } from '../components/Icons'

type Tab = 'purchases' | 'expenses' | 'suppliers'

interface DraftLine {
  key: string
  productId: string
  description: string
  quantity: number
  unitCostCents: number
}

export function PurchasesPage(): ReactNode {
  const { t, money, number, date, notify, dataVersion } = useApp()
  const [tab, setTab] = useState<Tab>('purchases')

  const purchases = useAsyncData(() => api.purchases.list({ limit: 200 }), [dataVersion])
  const expenses = useAsyncData(() => api.expenses.list({ limit: 300 }), [dataVersion])
  const summary = useAsyncData(() => api.expenses.summary(), [dataVersion])
  const suppliers = useAsyncData(() => api.suppliers.list(), [dataVersion])
  const products = useAsyncData(() => api.products.list({ pageSize: 300, sort: 'name_asc' }), [dataVersion])

  const [draftOpen, setDraftOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [detail, setDetail] = useState<Purchase | null>(null)

  const reportError = (error: unknown): void => {
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )
  }

  const reloadAll = (): void => {
    purchases.reload()
    expenses.reload()
    summary.reload()
    suppliers.reload()
  }

  const purchaseTotals = useMemo(() => {
    const rows = purchases.data ?? []
    return {
      count: rows.length,
      total: rows.reduce((sum, row) => sum + row.totalCostCents, 0)
    }
  }, [purchases.data])

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('purchase.title')}</h1>
          <p className="page-subtitle">{t('purchase.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => {
              if (tab === 'purchases') setDraftOpen(true)
              else if (tab === 'expenses') setExpenseOpen(true)
              else setSupplierOpen(true)
            }}
          >
            {tab === 'purchases' ? t('purchase.new') : tab === 'expenses' ? t('expense.new') : t('purchase.newSupplier')}
          </Button>
        </div>
      </header>

      <div className="row" style={{ marginBottom: 12 }}>
        {(['purchases', 'expenses', 'suppliers'] as Tab[]).map((value) => (
          <Button key={value} size="sm" variant={tab === value ? 'primary' : 'default'} onClick={() => setTab(value)}>
            {value === 'purchases'
              ? t('purchase.title')
              : value === 'expenses'
                ? t('expense.title')
                : t('purchase.suppliersTitle')}
          </Button>
        ))}
      </div>

      {tab === 'purchases' ? (
        <>
          <div className="grid-cards" style={{ marginBottom: 12 }}>
            <div className="kpi kpi--accent">
              <span className="kpi__label">{t('purchase.totalSpent')}</span>
              <span className="kpi__value kpi__value--accent">{money(purchaseTotals.total)}</span>
              <span className="kpi__hint">{number(purchaseTotals.count)}</span>
            </div>
          </div>

          <Card flush>
            {(purchases.data ?? []).length === 0 ? (
              <EmptyState
                icon={<IconPurchases size={26} />}
                title={t('purchase.empty')}
                message={t('purchase.emptyMessage')}
                action={
                  <Button variant="primary" onClick={() => setDraftOpen(true)}>
                    {t('purchase.new')}
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('purchase.purchasedAt')}</th>
                      <th>{t('purchase.reference')}</th>
                      <th>{t('purchase.supplier')}</th>
                      <th className="cell-num">{t('purchase.lines')}</th>
                      <th className="cell-num">{t('purchase.itemsCost')}</th>
                      <th className="cell-num">{t('purchase.extraCost')}</th>
                      <th className="cell-num">{t('purchase.totalCost')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(purchases.data ?? []).map((purchase) => (
                      <tr key={purchase.id} className="is-clickable" onClick={() => setDetail(purchase)}>
                        <td>{date(purchase.purchasedAt)}</td>
                        <td className="cell-mono">{purchase.reference || '—'}</td>
                        <td>{purchase.supplierName || '—'}</td>
                        <td className="cell-num">{purchase.items.length}</td>
                        <td className="cell-num">{money(purchase.itemsCostCents)}</td>
                        <td className="cell-num dim">{money(purchase.extraCostCents)}</td>
                        <td className="cell-num cell-strong">{money(purchase.totalCostCents)}</td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <IconButton
                            label={t('common.delete')}
                            onClick={() => {
                              void api.purchases
                                .remove(purchase.id)
                                .then(() => {
                                  notify(t('common.delete'), 'success')
                                  reloadAll()
                                })
                                .catch(reportError)
                            }}
                          >
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
        </>
      ) : null}

      {tab === 'expenses' ? (
        <>
          <div className="notice" style={{ marginBottom: 12 }}>
            {t('expense.emptyMessage')}
          </div>

          <div className="grid-cards" style={{ marginBottom: 12 }}>
            <div className="kpi kpi--accent">
              <span className="kpi__label">{t('expense.total')}</span>
              <span className="kpi__value kpi__value--accent">{money(summary.data?.totalCents ?? 0)}</span>
            </div>
            {(summary.data?.byCategory ?? []).slice(0, 4).map((entry) => (
              <div key={entry.category} className="kpi">
                <span className="kpi__label">{t(`expense.categories.${entry.category}` as 'expense.categories.other')}</span>
                <span className="kpi__value">{money(entry.totalCents)}</span>
                <span className="kpi__hint">{number(entry.count)}</span>
              </div>
            ))}
          </div>

          <Card flush>
            {(expenses.data ?? []).length === 0 ? (
              <EmptyState
                title={t('expense.empty')}
                message={t('expense.emptyMessage')}
                action={
                  <Button variant="primary" onClick={() => setExpenseOpen(true)}>
                    {t('expense.new')}
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('expense.date')}</th>
                      <th>{t('expense.category')}</th>
                      <th>{t('expense.description')}</th>
                      <th>{t('expense.recurring')}</th>
                      <th className="cell-num">{t('expense.amount')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(expenses.data ?? []).map((expense) => (
                      <tr key={expense.id}>
                        <td>{date(expense.incurredOn)}</td>
                        <td>
                          <span className="badge badge--muted">
                            {t(`expense.categories.${expense.category}` as 'expense.categories.other')}
                          </span>
                        </td>
                        <td>{expense.description || '—'}</td>
                        <td className="dim">
                          {t(`expense.recurrence.${expense.recurring}` as 'expense.recurrence.none')}
                        </td>
                        <td className="cell-num cell-strong">{money(expense.amountCents)}</td>
                        <td>
                          <IconButton
                            label={t('common.delete')}
                            onClick={() => {
                              void api.expenses
                                .remove(expense.id)
                                .then(reloadAll)
                                .catch(reportError)
                            }}
                          >
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
        </>
      ) : null}

      {tab === 'suppliers' ? (
        <Card flush>
          {(suppliers.data ?? []).length === 0 ? (
            <EmptyState
              title={t('purchase.suppliersTitle')}
              action={
                <Button variant="primary" onClick={() => setSupplierOpen(true)}>
                  {t('purchase.newSupplier')}
                </Button>
              }
            />
          ) : (
            <div className="tree">
              {(suppliers.data ?? []).map((supplier) => (
                <div key={supplier.id} className="tree__row">
                  <span className="tree__name">{supplier.name}</span>
                  <span className="tree__meta">{supplier.contact || '—'}</span>
                  <span className="badge badge--muted">
                    {t('purchase.purchasesCount', { count: supplier.purchaseCount })}
                  </span>
                  <span className="badge">{money(supplier.totalSpentCents)}</span>
                  <span className="tree__actions">
                    <IconButton
                      label={t('common.delete')}
                      onClick={() => {
                        void api.suppliers
                          .remove(supplier.id)
                          .then(reloadAll)
                          .catch(reportError)
                      }}
                    >
                      <IconTrash size={14} />
                    </IconButton>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {draftOpen ? (
        <PurchaseDraftModal
          suppliers={suppliers.data ?? []}
          productOptions={(products.data?.items ?? []).map((item) => ({
            id: item.id,
            label: `${item.sku} · ${item.name}`,
            costCents: item.totalCostCents
          }))}
          onClose={() => setDraftOpen(false)}
          onCreated={() => {
            setDraftOpen(false)
            reloadAll()
          }}
        />
      ) : null}

      {expenseOpen ? (
        <ExpenseModal
          onClose={() => setExpenseOpen(false)}
          onSaved={() => {
            setExpenseOpen(false)
            reloadAll()
          }}
        />
      ) : null}

      {supplierOpen ? (
        <SupplierModal
          onClose={() => setSupplierOpen(false)}
          onSaved={() => {
            setSupplierOpen(false)
            reloadAll()
          }}
        />
      ) : null}

      {detail ? (
        <Modal title={t('purchase.edit')} onClose={() => setDetail(null)} wide>
          <PurchaseDetail purchase={detail} />
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <Button onClick={() => setDetail(null)}>{t('common.close')}</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alta de compra
// ---------------------------------------------------------------------------

function PurchaseDraftModal({
  suppliers,
  productOptions,
  onClose,
  onCreated
}: {
  suppliers: Supplier[]
  productOptions: Array<{ id: string; label: string; costCents: number }>
  onClose: () => void
  onCreated: () => void
}): ReactNode {
  const { t, money, notify, today } = useApp()

  const [reference, setReference] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [purchasedAt, setPurchasedAt] = useState(today)
  const [shipping, setShipping] = useState(0)
  const [other, setOther] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [method, setMethod] = useState('by_cost')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 'l1', productId: '', description: '', quantity: 1, unitCostCents: 0 }
  ])
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.purchases.previewAllocation>> | null>(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Purchase | null>(null)

  const payload = (): Parameters<typeof api.purchases.create>[0] => ({
    reference,
    supplierName,
    purchasedAt,
    shippingCents: shipping,
    otherCents: other,
    discountCents: discount,
    allocationMethod: method as 'by_cost',
    notes,
    items: lines.map((line) => ({
      productId: line.productId || null,
      description: line.description,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents
    }))
  })

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const doPreview = async (): Promise<void> => {
    try {
      setPreview(await api.purchases.previewAllocation(payload()))
    } catch (error) {
      reportError(error)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await api.purchases.create(payload())
      setCreated(result)
      notify(t('common.save'), 'success')
    } catch (error) {
      reportError(error)
    } finally {
      setSaving(false)
    }
  }

  const materialize = async (): Promise<void> => {
    if (!created) return
    const unlinked = created.items.filter((item) => !item.productId).map((item) => item.id)
    if (unlinked.length === 0) return
    try {
      const result = await api.purchases.materialize(created.id, unlinked)
      notify(t('purchase.materializeDone', { count: result.created }), 'success')
      onCreated()
    } catch (error) {
      reportError(error)
    }
  }

  const updateLine = (key: string, patch: Partial<DraftLine>): void => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  return (
    <Modal
      wide
      title={t('purchase.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void doPreview()} disabled={saving}>
            {t('purchase.preview')}
          </Button>
          {created ? (
            <Button variant="primary" onClick={() => void materialize()}>
              {t('purchase.materialize')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {t('common.save')}
            </Button>
          )}
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('purchase.reference')}>
          <TextInput value={reference} onChange={setReference} />
        </Field>
        <Field label={t('purchase.supplier')} hint={t('purchase.supplierPlaceholder')}>
          <TextInput value={supplierName} onChange={setSupplierName} />
          {suppliers.length > 0 ? (
            <div className="row" style={{ marginTop: 4 }}>
              {suppliers.slice(0, 6).map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  className="chip"
                  onClick={() => setSupplierName(supplier.name)}
                >
                  {supplier.name}
                </button>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label={t('purchase.purchasedAt')}>
          <input
            type="date"
            className="input"
            value={purchasedAt}
            onChange={(event) => setPurchasedAt(event.target.value)}
          />
        </Field>
        <Field label={t('purchase.shippingCost')}>
          <MoneyInput valueCents={shipping} onChange={setShipping} />
        </Field>
        <Field label={t('purchase.otherCosts')}>
          <MoneyInput valueCents={other} onChange={setOther} />
        </Field>
        <Field label={t('purchase.discount')}>
          <MoneyInput valueCents={discount} onChange={setDiscount} />
        </Field>
        <Field label={t('purchase.allocation')} hint={t('purchase.allocationHint')}>
          <Select value={method} onChange={setMethod}>
            <option value="by_cost">{t('purchase.methodByCost')}</option>
            <option value="equal">{t('purchase.methodEqual')}</option>
            <option value="none">{t('purchase.methodNone')}</option>
          </Select>
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label={t('common.notes')}>
          <TextArea value={notes} onChange={setNotes} rows={2} />
        </Field>
      </div>

      <Card title={t('purchase.lines')}>
        <div className="stack stack--sm">
          {lines.map((line) => (
            <div key={line.key} className="form-row">
              <div style={{ flex: '2 1 200px' }}>
                <Select
                  value={line.productId}
                  onChange={(value) => {
                    const product = productOptions.find((option) => option.id === value)
                    updateLine(line.key, {
                      productId: value,
                      description: line.description || (product ? product.label.split(' · ')[1] ?? '' : ''),
                      unitCostCents: product && line.unitCostCents === 0 ? product.costCents : line.unitCostCents
                    })
                  }}
                >
                  <option value="">{t('purchase.noLink')}</option>
                  {productOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div style={{ flex: '2 1 160px' }}>
                <TextInput
                  value={line.description}
                  onChange={(value) => updateLine(line.key, { description: value })}
                  placeholder={t('purchase.lineDescription')}
                />
              </div>
              <div style={{ flex: '0 0 70px' }}>
                <TextInput
                  value={String(line.quantity)}
                  onChange={(value) => updateLine(line.key, { quantity: Math.max(1, Number(value) || 1) })}
                />
              </div>
              <div style={{ flex: '1 1 110px' }}>
                <MoneyInput
                  valueCents={line.unitCostCents}
                  onChange={(cents) => updateLine(line.key, { unitCostCents: cents })}
                />
              </div>
              <IconButton
                label={t('common.delete')}
                onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
              >
                <IconTrash size={14} />
              </IconButton>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <Button
            size="sm"
            icon={<IconPlus size={13} />}
            onClick={() =>
              setLines((current) => [
                ...current,
                { key: `l${current.length + 1}-${Date.now()}`, productId: '', description: '', quantity: 1, unitCostCents: 0 }
              ])
            }
          >
            {t('purchase.addLine')}
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card title={t('purchase.preview')}>
          <p className="dim" style={{ marginTop: 0 }}>
            {t('purchase.previewHint')}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('purchase.lineDescription')}</th>
                  <th className="cell-num">{t('purchase.quantity')}</th>
                  <th className="cell-num">{t('purchase.unitCost')}</th>
                  <th className="cell-num">{t('purchase.extraCost')}</th>
                  <th className="cell-num">{t('purchase.effectiveUnitCost')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line) => (
                  <tr key={line.index}>
                    <td>{line.description}</td>
                    <td className="cell-num">{line.quantity}</td>
                    <td className="cell-num">{money(line.unitCostCents)}</td>
                    <td className="cell-num dim">{money(line.allocatedExtraCents)}</td>
                    <td className="cell-num cell-strong">{money(line.effectiveUnitCostCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('purchase.extraCost')}</td>
                  <td className="cell-num" colSpan={2}>
                    {money(preview.allocatedTotalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : null}

      {created ? (
        <div className="notice notice--accent" style={{ marginTop: 12 }}>
          {t('purchase.applyHint')} — {t('purchase.totalCost')}: {money(created.totalCostCents)}
        </div>
      ) : null}
    </Modal>
  )
}

function PurchaseDetail({ purchase }: { purchase: Purchase }): ReactNode {
  const { t, money, date } = useApp()
  return (
    <div className="stack">
      <div className="row">
        <span className="badge badge--muted">{date(purchase.purchasedAt)}</span>
        {purchase.reference ? <span className="mono">{purchase.reference}</span> : null}
        {purchase.supplierName ? <span className="chip">{purchase.supplierName}</span> : null}
        <span className="badge badge--accent">{money(purchase.totalCostCents)}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('purchase.lineDescription')}</th>
              <th className="cell-num">{t('purchase.quantity')}</th>
              <th className="cell-num">{t('purchase.unitCost')}</th>
              <th className="cell-num">{t('purchase.extraCost')}</th>
              <th className="cell-num">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.productSku ? <span className="mono">{item.productSku}</span> : null}{' '}
                  {item.productName || item.description || '—'}
                </td>
                <td className="cell-num">{item.quantity}</td>
                <td className="cell-num">{money(item.unitCostCents)}</td>
                <td className="cell-num dim">{money(item.allocatedExtraCents)}</td>
                <td className="cell-num cell-strong">{money(item.lineCostCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notice">{t('purchase.deleteWarning')}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): ReactNode {
  const { t, notify, today } = useApp()
  const [category, setCategory] = useState<ExpenseCategory>('packaging')
  const [description, setDescription] = useState('')
  const [amountCents, setAmountCents] = useState(0)
  const [incurredOn, setIncurredOn] = useState(today)
  const [recurring, setRecurring] = useState('none')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await api.expenses.create({
        category,
        description,
        amountCents,
        incurredOn,
        recurring: recurring as 'none'
      })
      onSaved()
    } catch (error) {
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
    <Modal
      title={t('expense.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || amountCents <= 0}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('expense.category')}>
          <Select value={category} onChange={(value) => setCategory(value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`expense.categories.${value}` as 'expense.categories.other')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('expense.amount')}>
          <MoneyInput valueCents={amountCents} onChange={setAmountCents} />
        </Field>
        <Field label={t('expense.date')}>
          <input
            type="date"
            className="input"
            value={incurredOn}
            onChange={(event) => setIncurredOn(event.target.value)}
          />
        </Field>
        <Field label={t('expense.recurring')}>
          <Select value={recurring} onChange={setRecurring}>
            {EXPENSE_RECURRENCE.map((value) => (
              <option key={value} value={value}>
                {t(`expense.recurrence.${value}` as 'expense.recurrence.none')}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('expense.description')}>
            <TextInput value={description} onChange={setDescription} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

function SupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): ReactNode {
  const { t, notify } = useApp()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <Modal
      title={t('purchase.newSupplier')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => {
              void api.suppliers
                .create({ name, contact, notes })
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
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')}>
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label={t('purchase.contact')}>
          <TextInput value={contact} onChange={setContact} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('common.notes')}>
            <TextArea value={notes} onChange={setNotes} rows={2} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

export { ALLOCATION_METHODS }
