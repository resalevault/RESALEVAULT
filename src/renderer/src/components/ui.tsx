/**
 * RESALEVAULT - Primitivas de interfaz.
 *
 * Componentes pequenos y sin dependencias: botones, campos, modales, insignias
 * y estados vacios. Todo el texto visible proviene del traductor.
 */

import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from 'react'
import { centsToAmount, parseAmountToCents } from '@shared/format'
import type { ProductCondition, ProductStatus } from '@shared/types'
import { useApp } from '../lib/app-context'
import { IconAlert, IconCheck, IconClose } from './Icons'

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
  icon?: ReactNode
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled = false,
  type = 'button',
  title,
  icon
}: ButtonProps): ReactNode {
  const classes = ['btn']
  if (variant !== 'default') classes.push(`btn--${variant}`)
  if (size === 'sm') classes.push('btn--sm')

  return (
    <button type={type} className={classes.join(' ')} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  variant = 'ghost'
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  variant?: ButtonProps['variant']
}): ReactNode {
  const classes = ['btn', 'btn--icon']
  if (variant !== 'default') classes.push(`btn--${variant}`)
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} title={label} aria-label={label}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor
}: {
  label?: string
  hint?: string
  error?: string
  children: ReactNode
  htmlFor?: string
}): ReactNode {
  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error">{error}</span> : null}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = false,
  invalid = false,
  maxLength,
  id,
  disabled = false,
  onBlur
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  invalid?: boolean
  maxLength?: number
  id?: string
  disabled?: boolean
  onBlur?: () => void
}): ReactNode {
  const classes = ['input']
  if (mono) classes.push('input--mono')
  if (invalid) classes.push('input--invalid')

  return (
    <input
      id={id}
      type="text"
      className={classes.join(' ')}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  id
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  id?: string
}): ReactNode {
  return (
    <textarea
      id={id}
      className="input"
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function Select({
  value,
  onChange,
  children,
  id,
  disabled = false
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  id?: string
  disabled?: boolean
}): ReactNode {
  return (
    <select
      id={id}
      className="select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  )
}

/**
 * Campo de importe monetario.
 *
 * El valor viaja SIEMPRE en centimos enteros. Mientras el usuario escribe se
 * conserva su texto tal cual (para no pelear con la coma decimal) y solo se
 * convierte al perder el foco, que es cuando se normaliza.
 */
export function MoneyInput({
  valueCents,
  onChange,
  id,
  disabled = false
}: {
  valueCents: number
  onChange: (cents: number) => void
  id?: string
  disabled?: boolean
}): ReactNode {
  const { locale } = useApp()
  const decimalSeparator = locale.startsWith('en') ? '.' : ','

  const format = (cents: number): string =>
    centsToAmount(cents).toFixed(2).replace('.', decimalSeparator)

  const [text, setText] = useState(() => format(valueCents))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setText(format(valueCents))
    // `format` depende de locale; se recalcula en cada render a proposito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents, editing, locale])

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className="input input--numeric"
      value={text}
      disabled={disabled}
      onFocus={() => setEditing(true)}
      onChange={(event) => {
        const raw = event.target.value
        setText(raw)
        const cents = parseAmountToCents(raw, locale)
        if (cents !== null) onChange(cents)
        else if (raw.trim() === '') onChange(0)
      }}
      onBlur={() => {
        setEditing(false)
        const cents = parseAmountToCents(text, locale)
        setText(format(cents ?? 0))
        if (cents === null) onChange(0)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Insignias y etiquetas
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<ProductStatus, string> = {
  to_prepare: 'badge--warn',
  available: 'badge--accent',
  reserved: 'badge--info',
  sold: 'badge--ok',
  shipped: 'badge--ok',
  returned: 'badge--danger',
  archived: 'badge--muted'
}

export function StatusBadge({ status }: { status: ProductStatus }): ReactNode {
  const { t } = useApp()
  return (
    <span className={`badge badge--dot ${STATUS_TONE[status] ?? 'badge--muted'}`}>
      {t(`status.${status}`)}
    </span>
  )
}

export function ConditionLabel({ condition }: { condition: ProductCondition }): ReactNode {
  const { t } = useApp()
  return <span className="dim">{t(`condition.${condition}`)}</span>
}

/**
 * Tono estable derivado de un texto.
 *
 * Decision de diseno: en lugar de mantener una lista de colores por plataforma
 * (que se quedaria obsoleta en cuanto el usuario anadiese una), el color se
 * DERIVA del codigo. Asi la misma plataforma tiene SIEMPRE el mismo color, sin
 * ninguna configuracion, y el usuario puede anadir las que quiera.
 */
export function toneForCode(code: string): string {
  const series = [
    'var(--series-1)',
    'var(--series-2)',
    'var(--series-3)',
    'var(--series-4)',
    'var(--series-5)',
    'var(--series-6)'
  ]
  let hash = 0
  const value = code.toLowerCase()
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return series[Math.abs(hash) % series.length] as string
}

/** Insignia de plataforma con su color estable. */
export function PlatformBadge({ name, code }: { name: string; code?: string | null }): ReactNode {
  const tone = toneForCode(code ?? name)
  return (
    <span className="platform-badge" style={{ color: tone }} title={name}>
      <span className="platform-badge__dot" />
      {name}
    </span>
  )
}

/** Barra de serie con los tramos proporcionados. */
export function SeriesBar({
  parts
}: {
  parts: Array<{ value: number; tone: string; label?: string }>
}): ReactNode {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0)
  if (total <= 0) return <div className="series-bar" />
  return (
    <div className="series-bar">
      {parts.map((part, index) => (
        <div
          key={index}
          className="series-bar__part"
          style={{
            width: `${(Math.max(0, part.value) / total) * 100}%`,
            background: part.tone
          }}
          title={part.label}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estados vacios y carga
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  message,
  action
}: {
  icon?: ReactNode
  title: string
  message?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <h3 className="empty__title">{title}</h3>
      {message ? <p className="empty__message">{message}</p> : null}
      {action}
    </div>
  )
}

export function LoadingBlock({ label }: { label?: string }): ReactNode {
  const { t } = useApp()
  return (
    <div className="empty">
      <div className="spinner" />
      <span className="dim">{label ?? t('common.loading')}</span>
    </div>
  )
}

export function Spinner(): ReactNode {
  return <div className="spinner" />
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): ReactNode {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={wide ? 'modal modal--wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <IconButton label="close" onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = 'default',
  onConfirm,
  onCancel
}: {
  title: string
  message: string
  confirmLabel: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}): ReactNode {
  const { t } = useApp()
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Avisos flotantes
// ---------------------------------------------------------------------------

export function ToastStack(): ReactNode {
  const { toasts, dismissToast } = useApp()
  if (toasts.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span style={{ marginTop: 1 }}>
            {toast.tone === 'error' ? <IconAlert size={15} /> : <IconCheck size={15} />}
          </span>
          <span className="spacer">{toast.message}</span>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => dismissToast(toast.id)}
            aria-label="close"
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bloques de contenido
// ---------------------------------------------------------------------------

export function Card({
  title,
  actions,
  children,
  flush = false
}: {
  title?: string
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
}): ReactNode {
  return (
    <section className={flush ? 'card card--flush' : 'card'}>
      {title || actions ? (
        <div
          className="row row--between"
          style={{ marginBottom: flush ? 14 : 10, padding: flush ? '14px 16px 0' : 0 }}
        >
          {title ? <h2 className="section-title" style={{ margin: 0 }}>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Identificador de campo unico para asociar etiqueta y control. */
export function useFieldId(prefix: string): string {
  const generated = useId()
  return `${prefix}-${generated}`
}
