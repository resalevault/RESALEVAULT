/**
 * RESALEVAULT - Analitica y calculadora de rentabilidad.
 *
 * Todas las cifras provienen del motor de informes del proceso principal, que a
 * su vez reproduce la formula documentada en docs/FORMULAS.md.
 *
 * Se separa a proposito:
 *  - Beneficio BRUTO: ingreso neto menos coste de la mercancia.
 *  - Beneficio NETO de pedidos: ademas descuenta comisiones, envios, otros
 *    cargos y devoluciones.
 *  - Beneficio NETO del negocio: ademas descuenta los gastos generales.
 *
 * La rotacion y la antiguedad media llevan su propia nota: son aproximaciones
 * calculadas sobre el capital ACTUAL, no promedios historicos.
 */

import { useState, type ReactNode } from 'react'
import type { FinanceReport } from '@shared/types-modules'
import { evaluatePurchase, type ProfitabilityResult } from '@shared/finance-extended'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card, EmptyState, Field, MoneyInput, Select, TextInput } from '../components/ui'
import { IconAnalytics, IconCheck, IconExternal } from '../components/Icons'

type Preset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'all'

export function AnalyticsPage(): ReactNode {
  const { t, money, percent, number, notify, dataVersion, today } = useApp()
  const [preset, setPreset] = useState<Preset>('thisMonth')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const range = (): { from?: string; to?: string } => {
    if (from || to) return { from: from || undefined, to: to || undefined }
    const year = today.slice(0, 4)
    const month = today.slice(5, 7)
    if (preset === 'thisMonth') return { from: `${year}-${month}-01`, to: today }
    if (preset === 'lastMonth') {
      const previous = new Date(Number(year), Number(month) - 2, 1)
      const value = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
      const lastDay = new Date(previous.getFullYear(), previous.getMonth() + 1, 0).getDate()
      return { from: `${value}-01`, to: `${value}-${String(lastDay).padStart(2, '0')}` }
    }
    if (preset === 'thisYear') return { from: `${year}-01-01`, to: today }
    return {}
  }

  const bounds = range()
  const report = useAsyncData(() => api.finance.report(bounds), [bounds.from, bounds.to, dataVersion])
  const [crossCheck, setCrossCheck] = useState<string | null>(null)

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const exportCsv = async (): Promise<void> => {
    try {
      const chosen = await api.csv.chooseExportPath('orders', 'resalevault-pedidos.csv')
      if (chosen.canceled || !chosen.path) return
      const result = await api.csv.export({ path: chosen.path, format: 'orders' })
      notify(t('csv.exported', { rows: result.rows, path: result.path }), 'success')
    } catch (error) {
      reportError(error)
    }
  }

  const runCrossCheck = async (): Promise<void> => {
    try {
      const orders = await api.orders.list({ pageSize: 1, sort: 'date_desc' })
      const first = orders.items[0]
      if (!first) {
        setCrossCheck(null)
        return
      }
      const result = await api.finance.crossCheck(first.id)
      setCrossCheck(
        result.match
          ? t('analytics.crossCheckOk')
          : t('analytics.crossCheckFail', { sql: money(result.sqlCents), detail: money(result.typescriptCents) })
      )
    } catch (error) {
      reportError(error)
    }
  }

  if (report.error) {
    return (
      <div className="page">
        <Card>
          <div className="notice notice--warn">{t('errors.internal_error', { id: '-' })}</div>
        </Card>
      </div>
    )
  }

  const data = report.data

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('analytics.title')}</h1>
          <p className="page-subtitle">{t('analytics.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button
            icon={<IconExternal size={14} />}
            onClick={() => {
              void runCrossCheck()
            }}
          >
            {t('analytics.crossCheck')}
          </Button>
          <Button variant="primary" onClick={() => void exportCsv()}>
            {t('analytics.exportCsv')}
          </Button>
        </div>
      </header>

      <div className="filter-bar">
        <Field label={t('common.date')}>
          <Select value={preset} onChange={(value) => setPreset(value as Preset)}>
            <option value="thisMonth">{t('analytics.thisMonth')}</option>
            <option value="lastMonth">{t('analytics.lastMonth')}</option>
            <option value="thisYear">{t('analytics.thisYear')}</option>
            <option value="all">{t('analytics.allTime')}</option>
          </Select>
        </Field>
        <Field label={t('analytics.from')}>
          <input type="date" className="input" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t('analytics.to')}>
          <input type="date" className="input" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="">
          <Button
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            {t('common.clear')}
          </Button>
        </Field>
      </div>

      {crossCheck ? (
        <div className="notice notice--accent" style={{ marginBottom: 12 }}>
          <IconCheck size={15} />
          {crossCheck}
        </div>
      ) : null}

      {!data ? (
        <Card>
          <div className="spinner" />
        </Card>
      ) : data.orders.count === 0 && data.expenses.totalCents === 0 ? (
        <Card>
          <EmptyState icon={<IconAnalytics size={26} />} title={t('analytics.noData')} message={t('analytics.noDataHint')} />
        </Card>
      ) : (
        <>
          <div className="grid-cards" style={{ marginBottom: 14 }}>
            <Kpi label={t('analytics.ordersCount')} value={number(data.orders.count)} />
            <Kpi label={t('analytics.unitsSold')} value={number(data.orders.units)} />
            <Kpi label={t('analytics.netRevenue')} value={money(data.orders.netRevenueCents)} />
            <Kpi label={t('analytics.grossProfit')} value={money(data.orders.grossProfitCents)} />
            <Kpi
              label={t('analytics.netProfit')}
              value={money(data.orders.netProfitCents)}
              accent
              hint={t('order.netProfitHint')}
            />
            <Kpi label={t('analytics.expenses')} value={money(data.expenses.totalCents)} />
            <Kpi
              label={t('analytics.businessNet')}
              value={money(data.business.netProfitCents)}
              accent={data.business.netProfitCents >= 0}
              danger={data.business.netProfitCents < 0}
              hint={t('analytics.businessNetHint')}
            />
            <Kpi
              label={t('analytics.margin')}
              value={data.orders.marginPercent === null ? '—' : percent(data.orders.marginPercent)}
            />
            <Kpi label={t('analytics.averageOrder')} value={money(data.orders.averageOrderCents)} />
            <Kpi label={t('analytics.averageProfit')} value={money(data.orders.averageProfitCents)} />
            <Kpi
              label={t('analytics.returnsRate')}
              value={data.returnsRatePercent === null ? '—' : percent(data.returnsRatePercent)}
            />
          </div>

          <div className="grid-2">
            <Card title={t('analytics.sectionSales')}>
              <div className="stack stack--sm">
                <Row label={t('analytics.netRevenue')} value={money(data.orders.netRevenueCents)} />
                <Row label={t('analytics.goodsCost')} value={money(-data.orders.goodsCostCents)} />
                <Row label={t('analytics.fees')} value={money(-data.orders.feesCents)} />
                <Row label={t('analytics.shippingCost')} value={money(-data.orders.shippingCostCents)} />
                <Row label={t('analytics.otherCosts')} value={money(-data.orders.otherCostCents)} />
                <Row label={t('analytics.refunds')} value={money(-data.orders.refundsCents)} />
                <Row label={t('analytics.shippingCharged')} value={money(data.orders.shippingChargedCents)} />
                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                <Row label={t('analytics.netProfit')} value={money(data.orders.netProfitCents)} strong accent />
                <Row label={t('analytics.expenses')} value={money(-data.expenses.totalCents)} />
                <Row
                  label={t('analytics.businessNet')}
                  value={money(data.business.netProfitCents)}
                  strong
                  accent
                />
              </div>
            </Card>

            <Card title={t('analytics.sectionInventory')}>
              <div className="stack stack--sm">
                <Row label={t('analytics.capital')} value={money(data.inventory.capitalCents)} />
                <Row label={t('analytics.retail')} value={money(data.inventory.retailCents)} />
                <Row label={t('analytics.potential')} value={money(data.inventory.potentialCents)} />
                <Row
                  label={t('analytics.turns')}
                  value={data.inventory.turnsPerYear === null ? '—' : data.inventory.turnsPerYear.toFixed(2)}
                />
                <div className="field__hint">{t('analytics.turnsHint')}</div>
                <Row
                  label={t('analytics.averageAge')}
                  value={
                    data.inventory.averageAgeDays === null
                      ? '—'
                      : `${data.inventory.averageAgeDays.toFixed(0)} ${t('common.days')}`
                  }
                />
                <div className="field__hint">{t('analytics.averageAgeHint')}</div>
                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                {data.inventory.staleBuckets.map((bucket) => (
                  <Row
                    key={bucket.bucket}
                    label={`${bucket.bucket} ${t('common.days')} (${number(bucket.count)})`}
                    value={money(bucket.capitalCents)}
                  />
                ))}
              </div>
            </Card>
          </div>

          <div className="grid-2" style={{ marginTop: 14 }}>
            <Card title={t('analytics.byPlatform')}>
              <Table
                headers={[t('order.platform'), t('analytics.ordersCount'), t('analytics.netRevenue'), t('analytics.netProfit'), t('analytics.margin')]}
                rows={data.byPlatform.map((entry) => [
                  entry.name || '—',
                  number(entry.orders),
                  money(entry.netRevenueCents),
                  money(entry.netProfitCents),
                  entry.marginPercent === null ? '—' : percent(entry.marginPercent)
                ])}
              />
            </Card>

            <Card title={t('analytics.byMonth')}>
              <Table
                headers={[t('common.date'), t('analytics.ordersCount'), t('analytics.netRevenue'), t('analytics.netProfit'), t('analytics.expenses')]}
                rows={data.byMonth.map((entry) => [
                  entry.month,
                  number(entry.orders),
                  money(entry.netRevenueCents),
                  money(entry.netProfitCents),
                  money(entry.expensesCents)
                ])}
              />
            </Card>
          </div>

          <Card title={t('analytics.byCategory')}>
            <p className="dim" style={{ marginTop: 0 }}>
              {t('analytics.byCategoryHint')}
            </p>
            <Table
              headers={[t('common.category'), t('analytics.unitsSold'), t('order.goodsRevenue'), t('analytics.goodsCost'), t('analytics.grossProfit'), t('analytics.margin')]}
              rows={data.byCategory.map((entry) => [
                entry.name || t('dashboard.uncategorized'),
                number(entry.units),
                money(entry.goodsRevenueCents),
                money(entry.goodsCostCents),
                money(entry.grossProfitCents),
                entry.marginPercent === null ? '—' : percent(entry.marginPercent)
              ])}
            />
          </Card>

          <div className="grid-2" style={{ marginTop: 14 }}>
            <Card title={t('analytics.topProducts')}>
              <Table
                headers={[t('common.sku'), t('analytics.unitsSold'), t('order.goodsRevenue'), t('analytics.grossProfit')]}
                rows={data.topProducts.map((entry) => [
                  entry.sku,
                  number(entry.units),
                  money(entry.goodsRevenueCents),
                  money(entry.grossProfitCents)
                ])}
              />
            </Card>
            <Card title={t('analytics.worstProducts')}>
              <Table
                headers={[t('common.sku'), t('analytics.unitsSold'), t('order.goodsRevenue'), t('analytics.grossProfit')]}
                rows={data.worstProducts.map((entry) => [
                  entry.sku,
                  number(entry.units),
                  money(entry.goodsRevenueCents),
                  money(entry.grossProfitCents)
                ])}
              />
            </Card>
          </div>

          <Card title={t('analytics.byCondition')}>
            <Table
              headers={[t('common.condition'), t('analytics.unitsSold'), t('order.goodsRevenue'), t('analytics.grossProfit')]}
              rows={data.byCondition.map((entry) => [
                t(`condition.${entry.condition}` as 'condition.unknown'),
                number(entry.units),
                money(entry.goodsRevenueCents),
                money(entry.grossProfitCents)
              ])}
            />
          </Card>
        </>
      )}

      <ProfitabilityCalculator />
    </div>
  )
}

function Kpi({
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
  return (
    <div className={accent && !danger ? 'kpi kpi--accent' : 'kpi'}>
      <span className="kpi__label">{label}</span>
      <span
        className={accent && !danger ? 'kpi__value kpi__value--accent' : 'kpi__value'}
        style={danger ? { color: 'var(--danger)' } : undefined}
      >
        {value}
      </span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </div>
  )
}

function Row({
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

function Table({ headers, rows }: { headers: string[]; rows: string[][] }): ReactNode {
  if (rows.length === 0) return <div className="notice">{'—'}</div>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, position) => (
                <td key={position} className={position === 0 ? '' : 'cell-num'}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Calculadora de rentabilidad antes de comprar
// ---------------------------------------------------------------------------

function ProfitabilityCalculator(): ReactNode {
  const { t, money, percent, settings } = useApp()

  const [purchase, setPurchase] = useState(0)
  const [expected, setExpected] = useState(0)
  const [feesPercent, setFeesPercent] = useState(String(settings.defaultFeePercent))
  const [feesFixed, setFeesFixed] = useState(0)
  const [shipping, setShipping] = useState(settings.defaultShippingCents)
  const [other, setOther] = useState(0)
  const [targetMargin, setTargetMargin] = useState(String(settings.targetMarginPercent))
  const [minProfit, setMinProfit] = useState(settings.minProfitCents)

  const result: ProfitabilityResult = evaluatePurchase({
    purchaseCents: purchase,
    expectedSaleCents: expected,
    feesPercent: Number(feesPercent.replace(',', '.')) || 0,
    feesFixedCents: feesFixed,
    shippingCents: shipping,
    otherCents: other,
    targetMarginPercent: Number(targetMargin.replace(',', '.')) || 0,
    minProfitCents: minProfit
  })

  return (
    <Card title={t('calculator.title')}>
      <p className="dim" style={{ marginTop: 0 }}>
        {t('calculator.subtitle')}
      </p>

      <div className="form-grid">
        <Field label={t('calculator.purchase')}>
          <MoneyInput valueCents={purchase} onChange={setPurchase} />
        </Field>
        <Field label={t('calculator.expected')}>
          <MoneyInput valueCents={expected} onChange={setExpected} />
        </Field>
        <Field label={t('calculator.feesPercent')}>
          <TextInput value={feesPercent} onChange={setFeesPercent} />
        </Field>
        <Field label={t('calculator.feesFixed')}>
          <MoneyInput valueCents={feesFixed} onChange={setFeesFixed} />
        </Field>
        <Field label={t('calculator.shipping')}>
          <MoneyInput valueCents={shipping} onChange={setShipping} />
        </Field>
        <Field label={t('calculator.other')}>
          <MoneyInput valueCents={other} onChange={setOther} />
        </Field>
        <Field label={t('calculator.targetMargin')}>
          <TextInput value={targetMargin} onChange={setTargetMargin} />
        </Field>
        <Field label={t('calculator.minProfit')}>
          <MoneyInput valueCents={minProfit} onChange={setMinProfit} />
        </Field>
      </div>

      <div className="grid-cards" style={{ marginTop: 14 }}>
        <Kpi
          label={t('calculator.estimatedProfit')}
          value={money(result.estimatedProfitCents)}
          accent={result.estimatedProfitCents > 0}
          danger={result.estimatedProfitCents < 0}
        />
        <Kpi label={t('calculator.margin')} value={result.marginPercent === null ? '—' : percent(result.marginPercent)} />
        <Kpi
          label={t('calculator.roi')}
          value={result.roiPercent === null ? '—' : percent(result.roiPercent)}
          hint={t('calculator.roiHint')}
        />
        <Kpi label={t('calculator.breakEven')} value={money(result.breakEvenPriceCents)} />
        <Kpi
          label={t('calculator.minSalePrice')}
          value={result.minSalePriceCents === null ? '—' : money(result.minSalePriceCents)}
        />
        <Kpi
          label={t('calculator.maxPurchase')}
          value={result.maxPurchasePriceCents === null ? '—' : money(result.maxPurchasePriceCents)}
        />
      </div>

      <div className="notice notice--warn" style={{ marginTop: 12 }}>
        <strong>{t('calculator.estimate')}:</strong> {t('calculator.estimateHint')}
      </div>

      {result.warnings.filter((warning) => warning !== 'estimated_only').length > 0 ? (
        <div className="stack stack--sm" style={{ marginTop: 10 }}>
          {result.warnings
            .filter((warning) => warning !== 'estimated_only')
            .map((warning) => (
              <div key={warning} className="badge badge--warn">
                {t(`calculator.warnings.${warning}` as 'calculator.warnings.estimated_only')}
              </div>
            ))}
        </div>
      ) : null}
    </Card>
  )
}

export type { FinanceReport }
