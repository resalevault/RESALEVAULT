/**
 * RESALEVAULT - Navegacion lateral.
 *
 * Las secciones que aun no estan implementadas aparecen con la etiqueta de la
 * fase en la que llegaran. Es deliberado: el usuario ve el mapa completo del
 * producto y sabe que NO existe todavia, en lugar de encontrarse una pantalla
 * vacia sin explicacion.
 */

import type { ReactNode } from 'react'
import { ROUTE_PHASE, type RouteName } from '@shared/api'
import { useApp } from '../lib/app-context'
import type { MessageKey } from '../i18n'
import {
  IconAnalytics,
  IconBox,
  IconCategories,
  IconDashboard,
  IconImportExport,
  IconIntelligence,
  IconLicense,
  IconLocations,
  IconOrders,
  IconPicking,
  IconPurchases,
  IconSettings,
  IconShipping,
  IconSparkles,
  IconTracker
} from './Icons'

interface NavEntry {
  route: RouteName
  labelKey: MessageKey
  icon: ReactNode
}

interface NavSection {
  titleKey: MessageKey
  /** Tono de la seccion: da orientacion visual sin recargar la interfaz. */
  tone: 'main' | 'manage' | 'money' | 'intel' | 'system'
  entries: NavEntry[]
}

const SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.sectionMain',
    tone: 'main',
    entries: [
      { route: 'dashboard', labelKey: 'nav.dashboard', icon: <IconDashboard /> },
      { route: 'inventory', labelKey: 'nav.inventory', icon: <IconBox /> }
    ]
  },
  {
    titleKey: 'nav.sectionManage',
    tone: 'manage',
    entries: [
      { route: 'categories', labelKey: 'nav.categories', icon: <IconCategories /> },
      { route: 'locations', labelKey: 'nav.locations', icon: <IconLocations /> },
      { route: 'picking', labelKey: 'nav.picking', icon: <IconPicking /> },
      { route: 'shipping', labelKey: 'nav.shipping', icon: <IconShipping /> },
      { route: 'shipping-tracker', labelKey: 'nav.shippingTracker', icon: <IconTracker /> },
      { route: 'import-export', labelKey: 'nav.importExport', icon: <IconImportExport /> }
    ]
  },
  {
    titleKey: 'nav.sectionMoney',
    tone: 'money',
    entries: [
      { route: 'purchases', labelKey: 'nav.purchases', icon: <IconPurchases /> },
      { route: 'orders', labelKey: 'nav.orders', icon: <IconOrders /> },
      { route: 'analytics', labelKey: 'nav.analytics', icon: <IconAnalytics /> }
    ]
  },
  {
    titleKey: 'nav.sectionIntelligence',
    tone: 'intel',
    entries: [
      { route: 'ai-studio', labelKey: 'nav.aiStudio', icon: <IconSparkles /> },
      { route: 'intelligence', labelKey: 'nav.intelligence', icon: <IconIntelligence /> }
    ]
  },
  {
    titleKey: 'nav.sectionSystem',
    tone: 'system',
    entries: [
      { route: 'settings', labelKey: 'nav.settings', icon: <IconSettings /> },
      { route: 'license', labelKey: 'nav.license', icon: <IconLicense /> }
    ]
  }
]

export function Sidebar(): ReactNode {
  const { t, route, navigate, info } = useApp()

  return (
    <nav className="sidebar" aria-label={t('app.name')}>
      {SECTIONS.map((section) => (
        <div key={section.titleKey}>
          <div className="sidebar__section">{t(section.titleKey)}</div>
          {section.entries.map((entry) => {
            const active = route.name === entry.route
            const phase = ROUTE_PHASE[entry.route]
            return (
              <button
                key={entry.route}
                type="button"
                className={active ? 'navitem is-active' : 'navitem'}
                data-tone={section.tone}
                onClick={() => navigate({ name: entry.route })}
                aria-current={active ? 'page' : undefined}
              >
                {entry.icon}
                <span className="navitem__label">{t(entry.labelKey)}</span>
                {phase !== undefined ? (
                  <span className="navitem__phase" title={t('nav.pending', { phase })}>
                    {phase}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}

      <div className="sidebar__footer">
        <span>v{info?.version ?? '0.1.0'}</span>
        <span title={info?.databasePath ?? ''}>SQLite {info?.sqliteVersion ?? ''}</span>
      </div>
    </nav>
  )
}
