/**
 * RESALEVAULT - Pantalla de seccion no implementada.
 *
 * Existe a proposito: en lugar de mostrar datos simulados o una pantalla en
 * blanco, explica con claridad que la seccion llegara en una fase concreta y
 * que cuando exista trabajara sobre datos reales.
 */

import type { ReactNode } from 'react'
import type { RouteName } from '@shared/api'
import type { MessageKey } from '../i18n'
import { useApp } from '../lib/app-context'
import { Button, Card } from '../components/ui'
import { IconDashboard } from '../components/Icons'

export const ROUTE_LABEL_KEY: Record<RouteName, MessageKey> = {
  dashboard: 'nav.dashboard',
  inventory: 'nav.inventory',
  purchases: 'nav.purchases',
  orders: 'nav.orders',
  picking: 'nav.picking',
  shipping: 'nav.shipping',
  'ai-studio': 'nav.aiStudio',
  intelligence: 'nav.intelligence',
  analytics: 'nav.analytics',
  categories: 'nav.categories',
  locations: 'nav.locations',
  'import-export': 'nav.importExport',
  'shipping-tracker': 'nav.shippingTracker',
  settings: 'nav.settings',
  license: 'nav.license'
}

export const ROUTE_DESCRIPTION_KEY: Partial<Record<RouteName, MessageKey>> = {
  purchases: 'placeholder.purchases',
  orders: 'placeholder.orders',
  picking: 'placeholder.picking',
  shipping: 'placeholder.shipping',
  'ai-studio': 'placeholder.aiStudio',
  intelligence: 'placeholder.intelligence',
  analytics: 'placeholder.analytics',
  'import-export': 'placeholder.importExport',
  license: 'placeholder.license'
}

export function PlaceholderPage({ route, phase }: { route: RouteName; phase: number }): ReactNode {
  const { t, navigate } = useApp()
  const descriptionKey = ROUTE_DESCRIPTION_KEY[route]

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t(ROUTE_LABEL_KEY[route])}</h1>
          <p className="page-subtitle">{t('placeholder.title')}</p>
        </div>
        <div className="page-header__actions">
          {phase > 0 ? <span className="phase-tag">{t('placeholder.phase', { phase })}</span> : null}
          <Button icon={<IconDashboard size={14} />} onClick={() => navigate({ name: 'dashboard' })}>
            {t('placeholder.backToDashboard')}
          </Button>
        </div>
      </header>

      <Card title={t('placeholder.what')}>
        <div className="stack">
          {descriptionKey ? <p style={{ margin: 0 }}>{t(descriptionKey)}</p> : null}
          <div className="notice notice--warn">{t('placeholder.message')}</div>
        </div>
      </Card>
    </div>
  )
}
