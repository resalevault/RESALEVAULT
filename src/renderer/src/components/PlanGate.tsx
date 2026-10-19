/**
 * RESALEVAULT - Puerta de plan.
 *
 * Muestra una explicación clara cuando una función no está incluida en el plan
 * actual, en lugar de dejar una pantalla rota o un error técnico.
 *
 * Importante: esto es SOLO la capa visual. El proceso principal vuelve a
 * comprobar el plan en cada operación (`LicenseService.assertFeature`), porque
 * un límite que solo se comprueba en la interfaz no es un límite.
 */

import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card } from './ui'
import { IconLicense } from './Icons'

export type GatedFeature = 'analytics' | 'intelligence' | 'aiStudio' | 'csvImport' | 'bulkEdit'

export function PlanGate({
  feature,
  children
}: {
  feature: GatedFeature
  children: ReactNode
}): ReactNode {
  const { t, dataVersion, navigate } = useApp()
  const license = useAsyncData(() => api.license.state(), [dataVersion])

  if (!license.data) {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    )
  }

  const allowed = license.data.limits[feature] === true
  if (allowed) return <>{children}</>

  return (
    <div className="page">
      <Card>
        <div className="empty">
          <div className="empty__icon">
            <IconLicense size={24} />
          </div>
          <h2 className="empty__title">{t('plan.requiresPro')}</h2>
          <p className="empty__message">{t('plan.requiresProHint')}</p>
          <Button variant="primary" onClick={() => navigate({ name: 'license' })}>
            {t('plan.title')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
