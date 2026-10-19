/**
 * RESALEVAULT - Panel principal.
 *
 * Todas las cifras vienen del proceso principal, que las calcula con consultas
 * reales sobre la base de datos. Cuando no hay inventario se muestra un estado
 * vacio honesto, no ceros disfrazados de datos.
 *
 * Nota de honestidad: "beneficio realizado" es BRUTO (no descuenta comisiones
 * ni envios) porque el modulo de pedidos pertenece a la Fase 3. Asi aparece
 * etiquetado en la interfaz.
 */

import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card, EmptyState, LoadingBlock } from '../components/ui'
import { IconAlert, IconBox, IconClock, IconSparkles } from '../components/Icons'

export function DashboardPage(): ReactNode {
  const { t, money, moneyCompact, number, dateTime, dataVersion, navigate, notify, refreshData } = useApp()

  const summary = useAsyncData(() => api.dashboard.summary(), [dataVersion])

  if (summary.loading && !summary.data) return <div className="page">{<LoadingBlock />}</div>

  if (summary.error || !summary.data) {
    return (
      <div className="page">
        <Card>
          <div className="notice notice--warn">{t('errors.internal_error', { id: '-' })}</div>
        </Card>
      </div>
    )
  }

  const data = summary.data
  const isEmpty = data.totalItems === 0

  const handleSeedDemo = async (): Promise<void> => {
    try {
      const result = await api.app.seedDemoData()
      notify(t('settings.demoInserted', { count: result.created }), 'success')
      refreshData()
    } catch {
      notify(t('errors.internal_error', { id: '-' }), 'error')
    }
  }

  if (isEmpty) {
    return (
      <div className="page">
        <header className="page-header">
          <div className="page-header__text">
            <h1 className="page-title">{t('dashboard.title')}</h1>
            <p className="page-subtitle">{t('dashboard.live')}</p>
          </div>
        </header>
        <Card>
          <EmptyState
            icon={<IconBox size={26} />}
            title={t('dashboard.emptyTitle')}
            message={t('dashboard.emptyMessage')}
            action={
              <div className="row">
                <Button variant="primary" onClick={() => navigate({ name: 'product-new' })}>
                  {t('dashboard.createFirst')}
                </Button>
                <Button onClick={() => void handleSeedDemo()}>{t('dashboard.seedDemo')}</Button>
              </div>
            }
          />
        </Card>
      </div>
    )
  }

  const maxBucketCapital = Math.max(1, ...data.stolenByAge.map((bucket) => bucket.capitalCents))
  const totalCapital = data.capitalInvestedCents

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{t('dashboard.live')}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="primary" onClick={() => navigate({ name: 'product-new' })}>
            {t('inventory.newProduct')}
          </Button>
        </div>
      </header>

      <div className="grid-cards" style={{ marginBottom: 14 }}>
        <Kpi label={t('dashboard.itemsAvailable')} value={number(data.availableItems)} />
        <Kpi label={t('dashboard.itemsToPrepare')} value={number(data.toPrepareItems)} />
        <Kpi label={t('dashboard.itemsSold')} value={number(data.soldItems)} />
        <Kpi
          label={t('dashboard.capitalInvested')}
          value={money(data.capitalInvestedCents)}
          hint={t('dashboard.capitalHint')}
          accent
        />
        <Kpi
          label={t('dashboard.inventoryValue')}
          value={money(data.inventoryRetailCents)}
          hint={t('dashboard.inventoryValueHint')}
        />
        <Kpi
          label={t('dashboard.potentialProfit')}
          value={money(data.potentialProfitCents)}
          hint={t('dashboard.potentialProfitHint')}
        />
        <Kpi
          label={t('dashboard.grossSales')}
          value={money(data.grossSalesCents)}
          hint={t('dashboard.grossSalesHint')}
        />
        <Kpi
          label={t('dashboard.realizedProfit')}
          value={money(data.realizedProfitCents)}
          hint={t('dashboard.realizedProfitHint')}
          accent={data.realizedProfitCents > 0}
        />
      </div>

      <div className="grid-2">
        <Card
          title={t('dashboard.staleStock')}
          actions={<span className="faint">{t('dashboard.staleHint')}</span>}
        >
          {data.stolenByAge.every((bucket) => bucket.count === 0) ? (
            <div className="notice">
              <IconClock size={15} />
              {t('dashboard.staleEmpty')}
            </div>
          ) : (
            <div className="stack">
              {data.stolenByAge.map((bucket) => (
                <div key={bucket.bucket} className="stack stack--sm">
                  <div className="stat-line">
                    <span>
                      <span className="mono" style={{ color: 'var(--accent)' }}>
                        {bucket.bucket}
                      </span>{' '}
                      <span className="faint">
                        {t('common.days')} · {number(bucket.count)}
                      </span>
                    </span>
                    <span className="stat-line__value">{money(bucket.capitalCents)}</span>
                  </div>
                  <div className="progress">
                    <div
                      className="progress__fill"
                      style={{ width: `${Math.round((bucket.capitalCents / maxBucketCapital) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="stat-line" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span className="faint">{t('dashboard.capitalInvested')}</span>
                <span className="stat-line__value">{money(totalCapital)}</span>
              </div>
            </div>
          )}
        </Card>

        <Card title={t('dashboard.topCategories')}>
          {data.topCategories.length === 0 ? (
            <div className="notice">{t('dashboard.topCategoriesEmpty')}</div>
          ) : (
            <div className="stack stack--sm">
              {data.topCategories.map((category) => (
                <div key={category.categoryId ?? 'none'} className="stat-line">
                  <span>
                    {category.name || t('dashboard.uncategorized')}
                    <span className="faint"> · {number(category.count)}</span>
                  </span>
                  <span className="stat-line__value">{money(category.capitalCents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={t('dashboard.recentActivity')} flush>
        {data.recentActivity.length === 0 ? (
          <div className="notice" style={{ margin: 16 }}>
            <IconAlert size={15} />
            {t('dashboard.activityEmpty')}
          </div>
        ) : (
          <div className="tree">
            {data.recentActivity.map((entry) => (
              <div key={entry.id} className="tree__row">
                <span className="faint" style={{ width: 118, flex: 'none', fontSize: 11.5 }}>
                  {dateTime(entry.at)}
                </span>
                <span className="tree__name" style={{ fontWeight: 400 }}>
                  {entry.summary}
                </span>
                <span className="badge badge--muted">{entry.entity}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <div className="notice notice--accent">
          <IconSparkles size={15} />
          <span>
            {t('dashboard.subtitle')} — {moneyCompact(data.capitalInvestedCents)}{' '}
            {t('dashboard.capitalHint').toLowerCase()}.
          </span>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  accent = false
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}): ReactNode {
  return (
    <div className={accent ? 'kpi kpi--accent' : 'kpi'}>
      <span className="kpi__label">{label}</span>
      <span className={accent ? 'kpi__value kpi__value--accent' : 'kpi__value'}>{value}</span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </div>
  )
}
