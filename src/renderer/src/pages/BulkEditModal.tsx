/**
 * RESALEVAULT - Edicion masiva.
 *
 * Flujo deliberadamente en dos pasos: primero se rellenan los cambios, despues
 * se muestra una VISTA PREVIA calculada en el proceso principal (que indica
 * cuantos articulos cambiaran de verdad y con que valores) y solo entonces se
 * aplican. Nada se modifica a ciegas.
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { BulkUpdatePreview, Category, Location, ProductBulkUpdateInput, ProductStatus } from '@shared/types'
import { PRODUCT_STATUSES, PRODUCT_CONDITIONS } from '@shared/types'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Button, Card, Field, Modal, MoneyInput, Select, TextArea, TextInput } from '../components/ui'

type PriceMode = 'keep' | 'set' | 'percent' | 'delta'

export function BulkEditModal({
  ids,
  categories,
  locations,
  onClose,
  onApplied
}: {
  ids: string[]
  categories: Category[]
  locations: Location[]
  onClose: () => void
  onApplied: (affected: number) => void
}): ReactNode {
  const { t, notify, money } = useApp()

  const [status, setStatus] = useState<string>('')
  const [condition, setCondition] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [locationId, setLocationId] = useState<string>('')
  const [priceMode, setPriceMode] = useState<PriceMode>('keep')
  const [priceValue, setPriceValue] = useState<number>(0)
  const [pricePercent, setPricePercent] = useState<string>('')
  const [addTags, setAddTags] = useState('')
  const [removeTags, setRemoveTags] = useState('')
  const [note, setNote] = useState('')

  const [preview, setPreview] = useState<BulkUpdatePreview | null>(null)
  const [busy, setBusy] = useState(false)

  const buildInput = (): ProductBulkUpdateInput | null => {
    const input: ProductBulkUpdateInput = { ids }
    let hasChange = false

    if (status) {
      input.status = status as ProductStatus
      hasChange = true
    }
    if (condition) {
      input.condition = condition as ProductBulkUpdateInput['condition']
      hasChange = true
    }
    if (categoryId) {
      input.categoryId = categoryId === '__none__' ? null : categoryId
      hasChange = true
    }
    if (locationId) {
      input.locationId = locationId === '__none__' ? null : locationId
      hasChange = true
    }
    if (priceMode === 'set') {
      input.priceAdjustment = { mode: 'set', value: priceValue }
      hasChange = true
    } else if (priceMode === 'delta') {
      input.priceAdjustment = { mode: 'delta', value: priceValue }
      hasChange = true
    } else if (priceMode === 'percent') {
      const parsed = Number(pricePercent.replace(',', '.'))
      if (Number.isFinite(parsed) && parsed !== 0) {
        input.priceAdjustment = { mode: 'percent', value: parsed }
        hasChange = true
      }
    }

    const added = splitTags(addTags)
    const removed = splitTags(removeTags)
    if (added.length > 0) {
      input.addTags = added
      hasChange = true
    }
    if (removed.length > 0) {
      input.removeTags = removed
      hasChange = true
    }
    if (note.trim()) {
      input.appendPrivateNote = note.trim()
      hasChange = true
    }

    return hasChange ? input : null
  }

  const input = useMemo(buildInput, [
    ids,
    status,
    condition,
    categoryId,
    locationId,
    priceMode,
    priceValue,
    pricePercent,
    addTags,
    removeTags,
    note
  ])

  const requestPreview = async (): Promise<void> => {
    if (!input) return
    setBusy(true)
    try {
      setPreview(await api.products.bulkPreview(input))
    } catch (error) {
      notify(error instanceof AppError ? t(`errors.${error.code}` as 'errors.internal_error') : t('errors.internal_error', { id: '-' }), 'error')
    } finally {
      setBusy(false)
    }
  }

  const apply = async (): Promise<void> => {
    if (!input) return
    setBusy(true)
    try {
      const result = await api.products.bulkUpdate(input)
      onApplied(result.affected)
      onClose()
    } catch (error) {
      notify(
        error instanceof AppError ? t(`errors.${error.code}` as 'errors.internal_error') : t('errors.internal_error', { id: '-' }),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      wide
      title={t('bulk.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void requestPreview()} disabled={!input || busy}>
            {t('common.preview')}
          </Button>
          <Button variant="primary" onClick={() => void apply()} disabled={!input || busy || !preview}>
            {t('bulk.confirmApply')}
          </Button>
        </>
      }
    >
      <p className="dim" style={{ marginTop: 0 }}>
        {t('bulk.subtitle', { count: ids.length })} — {t('bulk.emptyHint')}
      </p>

      <Card title={t('bulk.sectionFields')}>
        <div className="form-grid">
          <Field label={t('bulk.setStatus')}>
            <Select value={status} onChange={setStatus}>
              <option value="">{t('bulk.keep')}</option>
              {PRODUCT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`status.${value}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('bulk.setCondition')}>
            <Select value={condition} onChange={setCondition}>
              <option value="">{t('bulk.keep')}</option>
              {PRODUCT_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`condition.${value}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('bulk.setCategory')}>
            <Select value={categoryId} onChange={setCategoryId}>
              <option value="">{t('bulk.keep')}</option>
              <option value="__none__">{t('bulk.clearCategory')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '\u00a0\u00a0\u00a0' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('bulk.setLocation')}>
            <Select value={locationId} onChange={setLocationId}>
              <option value="">{t('bulk.keep')}</option>
              <option value="__none__">{t('bulk.clearLocation')}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.path}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('bulk.priceAdjust')}>
            <Select value={priceMode} onChange={(value) => setPriceMode(value as PriceMode)}>
              <option value="keep">{t('bulk.priceKeep')}</option>
              <option value="set">{t('bulk.priceSet')}</option>
              <option value="delta">{t('bulk.priceDelta')}</option>
              <option value="percent">{t('bulk.pricePercent')}</option>
            </Select>
          </Field>

          {priceMode === 'set' || priceMode === 'delta' ? (
            <Field label={t('common.amount')}>
              <MoneyInput valueCents={priceValue} onChange={setPriceValue} />
            </Field>
          ) : null}

          {priceMode === 'percent' ? (
            <Field label="%">
              <TextInput value={pricePercent} onChange={setPricePercent} placeholder="10" />
            </Field>
          ) : null}

          <Field label={t('bulk.addTags')}>
            <TextInput value={addTags} onChange={setAddTags} placeholder="rebajas, lote-2" />
          </Field>

          <Field label={t('bulk.removeTags')}>
            <TextInput value={removeTags} onChange={setRemoveTags} placeholder="revisar" />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label={t('bulk.appendNote')}>
            <TextArea value={note} onChange={setNote} rows={2} />
          </Field>
        </div>
      </Card>

      {preview ? (
        <div style={{ marginTop: 14 }}>
          <Card title={t('bulk.previewTitle')}>
            <p style={{ marginTop: 0 }} className="dim">
              {preview.affected === 0
                ? t('bulk.previewNone')
                : t('bulk.previewCount', { count: preview.affected, fields: preview.totalFields })}
            </p>

            {preview.truncated ? (
              <p className="faint" style={{ marginTop: -6 }}>
                {t('bulk.previewTruncated', { count: preview.changes.length, total: preview.affected })}
              </p>
            ) : null}

            {preview.changes.length > 0 ? (
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('inventory.columnSku')}</th>
                      <th>{t('inventory.columnName')}</th>
                      <th>{t('common.filters')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((change) => (
                      <tr key={change.id}>
                        <td className="cell-mono">{change.sku}</td>
                        <td>{change.name}</td>
                        <td>
                          {change.fields.map((field, index) => (
                            <span key={`${change.id}-${index}`} className="chip" style={{ marginRight: 6 }}>
                              {labelForField(t, field.field)}:{' '}
                              <strong>{displayFieldValue(t, money, field.field, field.before)}</strong> →{' '}
                              <strong style={{ color: 'var(--accent)' }}>
                                {displayFieldValue(t, money, field.field, field.after)}
                              </strong>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </Modal>
  )
}

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** Nombre legible del campo modificado. */
function labelForField(t: ReturnType<typeof useApp>['t'], field: string): string {
  switch (field) {
    case 'status':
      return t('common.status')
    case 'condition':
      return t('common.condition')
    case 'category_id':
      return t('common.category')
    case 'location_id':
      return t('common.location')
    case 'expected_sale_price_cents':
      return t('product.expectedPrice')
    case 'tags':
      return t('bulk.fieldTags')
    case 'private_notes':
      return t('bulk.fieldNote')
    default:
      return field
  }
}

/** Traduce los codigos de estado a texto y anade el simbolo de divisa. */
function displayFieldValue(
  t: ReturnType<typeof useApp>['t'],
  money: (cents: number) => string,
  field: string,
  value: string
): string {
  if (field === 'expected_sale_price_cents') {
    const cents = Math.round(Number(value) * 100)
    return Number.isFinite(cents) ? money(cents) : value
  }
  if (field === 'status') return t(`status.${value}` as 'status.available')
  if (field === 'condition') return t(`condition.${value}` as 'condition.unknown')
  return value
}
