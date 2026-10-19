/**
 * RESALEVAULT - Barra del navegador integrado.
 *
 * Ocupa exactamente `--browser-chrome-height` (44 px) porque la vista nativa se
 * coloca justo debajo, usando las mismas constantes (`shared/layout.ts`).
 *
 * Si la pagina falla, la vista nativa se oculta y aqui se muestra el error:
 * una vista nativa siempre pinta por delante del DOM, asi que es la unica forma
 * de explicar que ha pasado.
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { BrowserPopupNotice } from '@shared/types-tracking'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Button, IconButton } from './ui'
import { CarrierBadge } from './CarrierBadge'
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDashboard,
  IconRefresh
} from './Icons'

export function BrowserBar(): ReactNode {
  const { t, browserState, browserAction, navigate, notify } = useApp()
  const [popup, setPopup] = useState<BrowserPopupNotice | null>(null)

  useEffect(() => {
    return api.browser.onPopupBlocked((notice) => setPopup(notice))
  }, [])

  useEffect(() => {
    return api.browser.onDownloadBlocked((filename) => {
      notify(t('tracking.downloadBlocked', { name: filename }), 'error')
    })
  }, [notify, t])

  if (!browserState.open) return null

  return (
    <>
      <div className="browser-bar">
        <IconButton
          label={t('tracking.browserBack')}
          onClick={() => browserAction('back')}
        >
          <IconChevronLeft size={14} />
        </IconButton>

        <IconButton
          label={t('tracking.browserForward')}
          onClick={() => browserAction('forward')}
        >
          <IconChevronRight size={14} />
        </IconButton>

        <IconButton label={t('tracking.browserReload')} onClick={() => browserAction('reload')}>
          <IconRefresh size={14} />
        </IconButton>

        <span className="browser-bar__carrier">
          <CarrierBadge carrier={{ id: browserState.carrierId ?? '', name: browserState.carrierName }} size={20} />
          {browserState.carrierName || t('tracking.title')}
        </span>

        <span className="browser-bar__url" title={browserState.url}>
          {browserState.url || '—'}
        </span>

        {browserState.loading ? <span className="browser-bar__loading" aria-hidden="true" /> : null}

        <Button
          size="sm"
          icon={<IconDashboard size={13} />}
          onClick={() => {
            browserAction('close')
            navigate({ name: 'shipping-tracker' })
          }}
          title={t('tracking.browserHome')}
        >
          {t('tracking.browserHome')}
        </Button>

        <IconButton label={t('tracking.browserClose')} onClick={() => browserAction('close')}>
          <IconClose size={14} />
        </IconButton>
      </div>

      {popup ? (
        <div className="notice notice--warn" style={{ margin: 0, borderRadius: 0 }}>
          <IconAlert size={15} />
          <span className="spacer">{t('tracking.popupBlocked')}</span>
          <Button
            size="sm"
            onClick={() => {
              void api.browser.open({
                url: popup.url,
                carrierId: browserState.carrierId ?? '',
                carrierName: browserState.carrierName
              })
              setPopup(null)
            }}
          >
            {t('tracking.popupOpenHere')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPopup(null)}>
            {t('common.close')}
          </Button>
        </div>
      ) : null}

      {browserState.errorCode ? (
        <div className="browser-error">
          <div className="center-screen__box">
            <IconAlert size={28} />
            <h2 className="page-title" style={{ fontSize: 18 }}>
              {t('tracking.browserError')}
            </h2>
            <p className="dim" style={{ margin: 0 }}>
              {t('tracking.browserErrorHint')}
            </p>
            <code className="mono faint" style={{ fontSize: 11 }}>
              {browserState.errorCode}
              {browserState.errorDetail ? ` · ${browserState.errorDetail}` : ''}
            </code>
            <div className="row">
              <Button variant="primary" onClick={() => browserAction('reload')}>
                {t('tracking.browserRetry')}
              </Button>
              <Button onClick={() => browserAction('close')}>{t('tracking.browserClose')}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
