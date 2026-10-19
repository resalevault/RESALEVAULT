/**
 * RESALEVAULT - Composicion de la aplicacion.
 *
 * Une la barra de titulo, la navegacion y la pantalla activa. Las pantallas no
 * implementadas se resuelven con una pagina explicita de "en construccion": no
 * se inventan datos ni se muestran cifras de ejemplo.
 */

import type { ReactNode } from 'react'
import { ROUTE_PHASE } from '@shared/api'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { Button, ToastStack } from './components/ui'
import { useApp } from './lib/app-context'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ProductFormPage } from './pages/ProductFormPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { LocationsPage } from './pages/LocationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { OrdersPage } from './pages/OrdersPage'
import { PickingPage } from './pages/PickingPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ImportExportPage } from './pages/ImportExportPage'
import { ShippingTrackerPage } from './pages/ShippingTrackerPage'
import { BrowserBar } from './components/BrowserBar'
import { IntelligencePage, LicensePage } from './pages/IntelligencePage'
import { AiStudioPage } from './pages/AiStudioPage'

export function App(): ReactNode {
  const { ready, fatalError, t, browserState } = useApp()

  if (fatalError) {
    return (
      <div className="center-screen">
        <div className="center-screen__box">
          <span className="monogram" style={{ width: 44, height: 44, fontSize: 18 }}>
            RV
          </span>
          <h1 className="page-title">{t('app.startupError')}</h1>
          <p className="dim">
            {fatalError === 'preload_bridge_missing'
              ? 'No se ha podido establecer el puente seguro entre la interfaz y el sistema.'
              : null}
          </p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="center-screen">
        <div className="center-screen__box">
          <div className="spinner" />
          <span className="dim">{t('app.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="content">
          <BrowserBar />
          {/* Se mantiene montada (oculta) mientras el navegador nativo cubre el
              area: asi se conservan los filtros al volver. */}
          <div className={browserState.open ? 'content-body is-covered' : 'content-body'}>
            <ActiveScreen />
          </div>
        </main>
      </div>
      <ToastStack />
    </div>
  )
}

function ActiveScreen(): ReactNode {
  const { route } = useApp()

  switch (route.name) {
    case 'dashboard':
      return <DashboardPage />
    case 'inventory':
      return <InventoryPage />
    case 'product':
      return route.productId ? <ProductDetailPage productId={route.productId} /> : <InventoryPage />
    case 'product-new':
      return <ProductFormPage />
    case 'categories':
      return <CategoriesPage />
    case 'locations':
      return <LocationsPage />
    case 'settings':
      return <SettingsPage />
    case 'purchases':
      return <PurchasesPage />
    case 'orders':
      return <OrdersPage />
    case 'shipping':
      return <OrdersPage onlyAwaiting />
    case 'picking':
      return <PickingPage />
    case 'analytics':
      return <AnalyticsPage />
    case 'import-export':
      return <ImportExportPage />
    case 'shipping-tracker':
      return <ShippingTrackerPage />
    case 'intelligence':
      return <IntelligencePage />
    case 'ai-studio':
      return <AiStudioPage />
    case 'license':
      return <LicensePage />
    default:
      return <PlaceholderPage route={route.name} phase={ROUTE_PHASE[route.name] ?? 0} />
  }
}
