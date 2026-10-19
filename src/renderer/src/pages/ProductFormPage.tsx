/**
 * RESALEVAULT - Formulario de articulo (crear y editar).
 *
 * Se usa la misma pantalla para ambos casos. Detalles deliberados:
 *  - El SKU se puede dejar vacio: el proceso principal lo genera y garantiza la
 *    unicidad. Si el usuario escribe uno, se comprueba su disponibilidad
 *    consultando la base de datos (no una lista en memoria).
 *  - Los atributos personalizados se construyen a partir de las definiciones
 *    guardadas, de modo que anadir un atributo en Ajustes lo hace aparecer aqui.
 *  - El margen se recalcula en vivo, pero se etiqueta como BRUTO.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppSettings, AttributeDefinition, ProductAttributes, ProductCreateInput } from '@shared/types'
import { PRODUCT_CONDITIONS, PRODUCT_STATUSES, SOLD_STATUSES } from '@shared/types'
import { renderSkuPattern, validateSkuPattern } from '@shared/sku'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import {
  Button,
  Card,
  Field,
  MoneyInput,
  Select,
  Spinner,
  TextArea,
  TextInput
} from '../components/ui'
import { IconChevronLeft, IconRefresh } from '../components/Icons'

interface FormState {
  name: string
  sku: string
  description: string
  categoryId: string
  brand: string
  model: string
  size: string
  color: string
  condition: string
  status: string
  locationId: string
  purchaseDate: string
  purchasePriceCents: number
  acquisitionFeesCents: number
  expectedSalePriceCents: number
  finalSalePriceCents: number
  privateNotes: string
  tags: string
  attributes: ProductAttributes
}

const EMPTY: FormState = {
  name: '',
  sku: '',
  description: '',
  categoryId: '',
  brand: '',
  model: '',
  size: '',
  color: '',
  condition: 'unknown',
  status: 'to_prepare',
  locationId: '',
  purchaseDate: '',
  purchasePriceCents: 0,
  acquisitionFeesCents: 0,
  expectedSalePriceCents: 0,
  finalSalePriceCents: 0,
  privateNotes: '',
  tags: '',
  attributes: {}
}

export function ProductFormPage({
  productId,
  onDone
}: {
  productId?: string
  onDone?: () => void
}): ReactNode {
  const { t, money, notify, navigate, locale } = useApp()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [loaded, setLoaded] = useState(productId === undefined)
  const [saving, setSaving] = useState(false)
  const [skuAvailable, setSkuAvailable] = useState<boolean | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const categories = useAsyncData(() => api.categories.list(), [])
  const locations = useAsyncData(() => api.locations.list(), [])
  const attributes = useAsyncData(() => api.attributes.list(), [])
  const settings = useAsyncData(() => api.app.getSettings(), [])

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    void api.products
      .get(productId)
      .then((detail) => {
        if (cancelled) return
        const p = detail.product
        setForm({
          name: p.name,
          sku: p.sku,
          description: p.description,
          categoryId: p.categoryId ?? '',
          brand: p.brand,
          model: p.model,
          size: p.size,
          color: p.color,
          condition: p.condition,
          status: p.status,
          locationId: p.locationId ?? '',
          purchaseDate: p.purchaseDate ?? '',
          purchasePriceCents: p.purchasePriceCents,
          acquisitionFeesCents: p.acquisitionFeesCents,
          expectedSalePriceCents: p.expectedSalePriceCents,
          finalSalePriceCents: p.finalSalePriceCents ?? 0,
          privateNotes: p.privateNotes,
          tags: detail.tags.map((tag) => tag.name).join(', '),
          attributes: p.attributes
        })
        setLoaded(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        notify(
          error instanceof AppError
            ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
            : t('errors.internal_error', { id: '-' }),
          'error'
        )
        navigate({ name: 'inventory' })
      })
    return () => {
      cancelled = true
    }
  }, [productId, notify, t, navigate])

  // Comprobacion de disponibilidad del SKU con retardo.
  useEffect(() => {
    const sku = form.sku.trim()
    if (!sku) {
      setSkuAvailable(null)
      return undefined
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void api.products
        .checkSku(sku, productId ?? null)
        .then((result) => {
          if (!cancelled) setSkuAvailable(result.available)
        })
        .catch(() => {
          if (!cancelled) setSkuAvailable(null)
        })
    }, 260)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [form.sku, productId])

  const totalCost = form.purchasePriceCents + form.acquisitionFeesCents
  const isSold = SOLD_STATUSES.includes(form.status as (typeof SOLD_STATUSES)[number])
  const estimatedMargin = form.expectedSalePriceCents - totalCost
  const realizedMargin = isSold ? form.finalSalePriceCents - totalCost : null

  const patternPreview = useMemo(() => {
    const current: AppSettings | null = settings.data
    if (!current) return ''
    const validation = validateSkuPattern(current.skuPattern)
    if (!validation.ok || !validation.hasSequence) return ''
    const categoryName =
      (categories.data ?? []).find((category) => category.id === form.categoryId)?.name ?? null
    return renderSkuPattern(current.skuPattern, {
      prefix: current.skuPrefix,
      categoryName,
      date: new Date(),
      sequence: 1
    })
  }, [settings.data, categories.data, form.categoryId])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const generateSku = async (): Promise<void> => {
    try {
      const suggestion = await api.products.suggestSku(form.categoryId || null)
      update('sku', suggestion)
    } catch {
      notify(t('errors.internal_error', { id: '-' }), 'error')
    }
  }

  const submit = async (): Promise<void> => {
    if (!form.name.trim()) {
      setNameError(t('errors.invalid_input', { field: t('common.name') }))
      return
    }
    setNameError(null)
    setSaving(true)

    const payload: ProductCreateInput = {
      name: form.name.trim(),
      description: form.description,
      categoryId: form.categoryId || null,
      brand: form.brand.trim(),
      model: form.model.trim(),
      size: form.size.trim(),
      color: form.color.trim(),
      condition: form.condition as ProductCreateInput['condition'],
      status: form.status as ProductCreateInput['status'],
      locationId: form.locationId || null,
      purchaseDate: form.purchaseDate || null,
      purchasePriceCents: form.purchasePriceCents,
      acquisitionFeesCents: form.acquisitionFeesCents,
      expectedSalePriceCents: form.expectedSalePriceCents,
      finalSalePriceCents: isSold ? form.finalSalePriceCents : null,
      privateNotes: form.privateNotes,
      attributes: form.attributes,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    }
    if (form.sku.trim()) payload.sku = form.sku.trim()

    try {
      if (productId) {
        await api.products.update(productId, payload)
        notify(t('product.updated'), 'success')
      } else {
        const created = await api.products.create(payload)
        notify(t('product.created'), 'success')
        if (onDone) onDone()
        else navigate({ name: 'product', productId: created.id })
        return
      }
      if (onDone) onDone()
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

  if (!loaded) {
    return (
      <div className="page">
        <Spinner />
      </div>
    )
  }

  const skuWarning = skuAvailable === false ? t('product.skuTaken') : undefined

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{productId ? t('product.editTitle') : t('product.newTitle')}</h1>
          <p className="page-subtitle">{t('app.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button
            icon={<IconChevronLeft size={14} />}
            onClick={() => (onDone ? onDone() : navigate({ name: 'inventory' }))}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving || skuAvailable === false}>
            {productId ? t('product.save') : t('product.create')}
          </Button>
        </div>
      </header>

      <div className="grid-2">
        <Card title={t('product.sectionIdentity')}>
          <div className="form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <Field
                label={t('common.name')}
                error={nameError ?? undefined}
                hint={t('common.required')}
              >
                <TextInput
                  value={form.name}
                  onChange={(value) => update('name', value)}
                  invalid={Boolean(nameError)}
                />
              </Field>
            </div>

            <Field
              label={t('common.sku')}
              hint={patternPreview ? `${t('product.skuAutoHint')} → ${patternPreview}` : t('product.skuAutoHint')}
              error={skuWarning}
            >
              <div className="form-row">
                <div className="spacer" style={{ minWidth: 120 }}>
                  <TextInput
                    value={form.sku}
                    onChange={(value) => update('sku', value.toUpperCase())}
                    mono
                    invalid={skuAvailable === false}
                  />
                </div>
                <Button size="sm" icon={<IconRefresh size={13} />} onClick={() => void generateSku()}>
                  {t('common.refresh')}
                </Button>
              </div>
            </Field>

            <Field label={t('common.brand')}>
              <TextInput value={form.brand} onChange={(value) => update('brand', value)} />
            </Field>

            <Field label={t('common.model')}>
              <TextInput value={form.model} onChange={(value) => update('model', value)} />
            </Field>

            <Field label={t('common.size')}>
              <TextInput value={form.size} onChange={(value) => update('size', value)} />
            </Field>

            <Field label={t('common.color')}>
              <TextInput value={form.color} onChange={(value) => update('color', value)} />
            </Field>

            <Field label={t('common.condition')}>
              <Select value={form.condition} onChange={(value) => update('condition', value)}>
                {PRODUCT_CONDITIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`condition.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('common.status')}>
              <Select value={form.status} onChange={(value) => update('status', value)}>
                {PRODUCT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`status.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('common.description')}>
                <TextArea value={form.description} onChange={(value) => update('description', value)} />
              </Field>
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card title={t('product.sectionPricing')}>
            <div className="form-grid">
              <Field label={t('product.purchasePrice')}>
                <MoneyInput
                  valueCents={form.purchasePriceCents}
                  onChange={(cents) => update('purchasePriceCents', cents)}
                />
              </Field>
              <Field label={t('product.acquisitionFees')} hint={t('product.acquisitionFeesHint')}>
                <MoneyInput
                  valueCents={form.acquisitionFeesCents}
                  onChange={(cents) => update('acquisitionFeesCents', cents)}
                />
              </Field>
              <Field label={t('product.expectedPrice')}>
                <MoneyInput
                  valueCents={form.expectedSalePriceCents}
                  onChange={(cents) => update('expectedSalePriceCents', cents)}
                />
              </Field>
              <Field label={t('product.purchaseDate')}>
                <input
                  type="date"
                  className="input"
                  value={form.purchaseDate}
                  onChange={(event) => update('purchaseDate', event.target.value)}
                />
              </Field>
              {isSold ? (
                <Field label={t('product.finalPrice')}>
                  <MoneyInput
                    valueCents={form.finalSalePriceCents}
                    onChange={(cents) => update('finalSalePriceCents', cents)}
                  />
                </Field>
              ) : null}
            </div>

            <div className="stack stack--sm" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="stat-line">
                <span className="faint">{t('product.totalCost')}</span>
                <span className="stat-line__value">{money(totalCost)}</span>
              </div>
              <div className="stat-line">
                <span className="faint">{t('product.estimatedMargin')}</span>
                <span
                  className="stat-line__value"
                  style={{ color: estimatedMargin < 0 ? 'var(--danger)' : 'var(--accent)' }}
                >
                  {money(estimatedMargin)}
                </span>
              </div>
              {realizedMargin !== null ? (
                <div className="stat-line">
                  <span className="faint">{t('product.realizedMargin')}</span>
                  <span
                    className="stat-line__value"
                    style={{ color: realizedMargin < 0 ? 'var(--danger)' : 'var(--ok)' }}
                  >
                    {money(realizedMargin)}
                  </span>
                </div>
              ) : null}
              <div className="stat-line" style={{ fontSize: 10.5 }}>
                <span className="faint">{locale.toUpperCase()}</span>
                <span className="field__hint" style={{ textAlign: 'right' }}>
                  {t('dashboard.realizedProfitHint')}
                </span>
              </div>
            </div>
          </Card>

          <Card title={t('product.sectionPlacement')}>
            <div className="form-grid">
              <Field label={t('common.category')}>
                <Select value={form.categoryId} onChange={(value) => update('categoryId', value)}>
                  <option value="">{t('common.none')}</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.parentId ? '\u00a0\u00a0\u00a0' : ''}
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('common.location')}>
                <Select value={form.locationId} onChange={(value) => update('locationId', value)}>
                  <option value="">{t('common.none')}</option>
                  {(locations.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card title={t('product.sectionPrivate')}>
            <div className="stack">
              <Field label={t('product.privateNotes')} hint={t('product.privateNotesHint')}>
                <TextArea value={form.privateNotes} onChange={(value) => update('privateNotes', value)} rows={3} />
              </Field>
              <Field label={t('common.tags')} hint={t('product.tagsHint')}>
                <TextInput value={form.tags} onChange={(value) => update('tags', value)} />
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <Card title={t('product.attributes')}>
        {(attributes.data ?? []).length === 0 ? (
          <div className="notice">{t('product.noAttributes')}</div>
        ) : (
          <div className="form-grid">
            {(attributes.data ?? []).map((definition) => (
              <AttributeField
                key={definition.id}
                definition={definition}
                value={form.attributes[definition.key]}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    attributes: { ...current.attributes, [definition.key]: value }
                  }))
                }
                t={t}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={() => void submit()} disabled={saving || skuAvailable === false}>
          {productId ? t('product.save') : t('product.create')}
        </Button>
      </div>
    </div>
  )
}

function AttributeField({
  definition,
  value,
  onChange,
  t
}: {
  definition: AttributeDefinition
  value: string | number | boolean | null | undefined
  onChange: (value: string | number | boolean | null) => void
  t: ReturnType<typeof useApp>['t']
}): ReactNode {
  switch (definition.type) {
    case 'boolean':
      return (
        <Field label={definition.name}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            {value === true ? t('common.yes') : t('common.no')}
          </label>
        </Field>
      )
    case 'number':
      return (
        <Field label={definition.name}>
          <TextInput
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(next) => onChange(next === '' ? null : Number(next))}
          />
        </Field>
      )
    case 'date':
      return (
        <Field label={definition.name}>
          <input
            type="date"
            className="input"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value || null)}
          />
        </Field>
      )
    case 'select':
      return (
        <Field label={definition.name}>
          <Select
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          >
            <option value="">{t('common.select')}</option>
            {definition.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      )
    default:
      return (
        <Field label={definition.name}>
          <TextInput
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      )
  }
}
