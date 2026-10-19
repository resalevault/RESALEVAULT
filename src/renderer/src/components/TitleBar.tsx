/**
 * RESALEVAULT - Barra de titulo propia.
 *
 * La ventana no usa el marco del sistema (identidad visual propia), asi que la
 * zona arrastrable se declara con `-webkit-app-region: drag` y los controles de
 * ventana invocan acciones REALES sobre la ventana de Electron.
 *
 * Incluye la busqueda global: consulta el inventario real con un retardo para
 * no golpear la base de datos en cada pulsacion.
 */

import { useEffect, useRef, useState } from 'react'
import type { ProductSummary } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData, useDebounced } from '../lib/hooks'
import {
  IconClose,
  IconGlobe,
  IconMoon,
  IconSearch,
  IconSun
} from './Icons'

export function TitleBar(): React.ReactNode {
  const { t, theme, locale, updateSettings, navigate, notify } = useApp()
  const [maximized, setMaximized] = useState(false)
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const debounced = useDebounced(term, 240)

  useEffect(() => {
    void api.window.isMaximized().then(setMaximized)
    return api.window.onMaximizedChanged(setMaximized)
  }, [])

  const results = useAsyncData<ProductSummary[] | null>(
    async () => {
      if (debounced.trim().length < 2) return null
      const page = await api.products.list({ search: debounced.trim(), pageSize: 7, sort: 'updated_desc' })
      return page.items
    },
    [debounced]
  )

  useEffect(() => {
    const handler = (event: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [])

  const items = results.data ?? []

  return (
    <div className="titlebar">
      <div className="titlebar__brand">
        <span className="monogram">RV</span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span className="brand-name">RESALEVAULT</span>
          <span className="brand-tagline">{t('app.tagline')}</span>
        </span>
      </div>

      <div className="titlebar__search" ref={boxRef} style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 9,
              top: 6,
              color: 'var(--text-faint)',
              pointerEvents: 'none'
            }}
          >
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 29, height: 28 }}
            placeholder={t('nav.searchPlaceholder')}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTerm('')
                setOpen(false)
              }
            }}
            aria-label={t('common.search')}
          />
        </div>

        {open && debounced.trim().length >= 2 ? (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 0,
              right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-2)',
              zIndex: 30,
              overflow: 'hidden'
            }}
          >
            {items.length === 0 ? (
              <div style={{ padding: '10px 12px' }} className="faint">
                {t('inventory.noResults')}
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="navitem"
                  style={{ borderRadius: 0, justifyContent: 'flex-start' }}
                  onClick={() => {
                    navigate({ name: 'product', productId: item.id })
                    setOpen(false)
                    setTerm('')
                  }}
                >
                  <span className="mono" style={{ color: 'var(--accent)' }}>
                    {item.sku}
                  </span>
                  <span className="navitem__label">{item.name}</span>
                  <span className="faint" style={{ fontSize: 11 }}>
                    {t(`status.${item.status}`)}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="titlebar__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title={t('titleBar.toggleLanguage')}
          onClick={() => {
            void updateSettings({ locale: locale === 'es' ? 'en' : 'es' }).catch(() =>
              notify(t('errors.internal_error', { id: '-' }), 'error')
            )
          }}
        >
          <IconGlobe size={14} />
          {locale.toUpperCase()}
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          title={t('titleBar.toggleTheme')}
          onClick={() => {
            void updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }).catch(() =>
              notify(t('errors.internal_error', { id: '-' }), 'error')
            )
          }}
        >
          {theme === 'dark' ? <IconMoon size={14} /> : <IconSun size={14} />}
        </button>
      </div>

      <div className="window-controls">
        <button type="button" title={t('titleBar.minimize')} onClick={() => void api.window.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          title={maximized ? t('titleBar.restore') : t('titleBar.maximize')}
          onClick={() => void api.window.toggleMaximize().then(setMaximized)}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="is-close"
          title={t('titleBar.close')}
          onClick={() => void api.window.close()}
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  )
}
