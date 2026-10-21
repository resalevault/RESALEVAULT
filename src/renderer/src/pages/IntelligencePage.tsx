/**
 * RESALEVAULT - Intelligence y licencia.
 *
 * Intelligence: alertas calculadas con reglas LOCALES en el proceso principal.
 * Ninguna alerta se aplica sola y cada una declara los datos en los que se basa.
 *
 * Licencia: se muestra el estado REAL. Sin licencia activada, el plan es Free y
 * asi se dice. Las licencias fundadoras no se emiten desde la aplicacion: se
 * generan con la herramienta administrativa y se entregan manualmente.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { PLAN_DISPLAY_ORDER, PLAN_FEATURE_KEYS, FOUNDER_QUOTA } from '@shared/plans'
import type { Insight, LicensePlan } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card, EmptyState, Field, Modal, TextArea, TextInput } from '../components/ui'
import { IconAlert, IconCheck, IconExternal, IconIntelligence, IconLicense } from '../components/Icons'
import { PlanGate } from '../components/PlanGate'

// ===========================================================================
// Intelligence
// ===========================================================================

export function IntelligencePage(): ReactNode {
  return (
    <PlanGate feature="intelligence">
      <IntelligenceContent />
    </PlanGate>
  )
}

function IntelligenceContent(): ReactNode {
  const { t, number, dateTime, notify, dataVersion } = useApp()
  const report = useAsyncData(() => api.intelligence.report(), [dataVersion])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const data = report.data

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('insights.title')}</h1>
          <p className="page-subtitle">{t('insights.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          {data ? (
            <span className="badge badge--muted">{t('insights.rulesRun', { count: data.rulesRun })}</span>
          ) : null}
          <Button onClick={() => setSettingsOpen(true)}>{t('insights.thresholds')}</Button>
          <Button variant="primary" onClick={() => report.reload()}>
            {t('common.refresh')}
          </Button>
        </div>
      </header>

      {data ? (
        <>
          <div className="grid-cards" style={{ marginBottom: 12 }}>
            <Severity label={t('insights.severity.critical')} count={data.counts.critical} tone="danger" />
            <Severity label={t('insights.severity.warning')} count={data.counts.warning} tone="warn" />
            <Severity label={t('insights.severity.info')} count={data.counts.info} tone="muted" />
            <div className="kpi">
              <span className="kpi__label">{t('insights.generatedAt', { time: '' })}</span>
              <span className="kpi__value" style={{ fontSize: 15 }}>
                {dateTime(data.generatedAt)}
              </span>
            </div>
          </div>

          {data.insights.length === 0 ? (
            <Card>
              <EmptyState
                icon={<IconIntelligence size={26} />}
                title={t('insights.empty')}
                message={t('insights.emptyMessage')}
              />
            </Card>
          ) : (
            <div className="stack">
              {data.insights.map((insight) => (
                <InsightCard
                  key={insight.key}
                  insight={insight}
                  onDismiss={(days) => {
                    void api.intelligence
                      .dismiss({ key: insight.key, ruleId: insight.ruleId, days })
                      .then(() => {
                        notify(t('insights.dismissed'), 'success')
                        report.reload()
                      })
                      .catch(reportError)
                  }}
                />
              ))}
            </div>
          )}

          {data.skipped.length > 0 ? (
            <div className="notice" style={{ marginTop: 12 }}>
              {t('insights.skipped', { rules: data.skipped.join(', ') })}
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <div className="spinner" />
        </Card>
      )}

      {settingsOpen && data ? (
        <ThresholdsModal
          current={data.thresholds}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false)
            report.reload()
          }}
        />
      ) : null}
    </div>
  )

  function Severity({ label, count, tone }: { label: string; count: number; tone: string }): ReactNode {
    return (
      <div className={tone === 'danger' ? 'kpi kpi--accent' : 'kpi'}>
        <span className="kpi__label">{label}</span>
        <span
          className="kpi__value"
          style={{ color: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : undefined }}
        >
          {number(count)}
        </span>
      </div>
    )
  }
}

function InsightCard({
  insight,
  onDismiss
}: {
  insight: Insight
  onDismiss: (days: number) => void
}): ReactNode {
  const { t, navigate } = useApp()

  const tone =
    insight.severity === 'critical' ? 'var(--danger)' : insight.severity === 'warning' ? 'var(--warn)' : 'var(--info)'

  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span style={{ color: tone, marginTop: 2 }}>
          <IconAlert size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong>{t(insight.titleKey as 'insights.rules.stale_stock')}</strong>
            <span className="badge badge--muted">{t(`insights.severity.${insight.severity}` as 'insights.severity.info')}</span>
            <span className="mono faint">{insight.ruleId}</span>
          </div>

          <div className="stack stack--sm" style={{ marginTop: 8 }}>
            <span className="field__label">{t('insights.facts')}</span>
            <div className="row">
              {insight.facts.map((fact, index) => (
                <span key={index} className="chip">
                  {t(fact.labelKey as 'common.total')}: <strong>{fact.value}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            {insight.actions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                onClick={() => {
                  if (action.kind === 'open_settings') navigate({ name: 'settings' })
                  else if (action.kind === 'open_order') navigate({ name: 'orders' })
                  else if (action.target) navigate({ name: 'product', productId: action.target })
                }}
              >
                {action.kind === 'open_settings'
                  ? t('nav.settings')
                  : action.kind === 'open_order'
                    ? t('nav.orders')
                    : t('media.open')}
              </Button>
            ))}
            <span className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => onDismiss(7)}>
              {t('insights.dismissDays', { days: 7 })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(0)}>
              {t('insights.dismissForever')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function ThresholdsModal({
  current,
  onClose,
  onSaved
}: {
  current: Awaited<ReturnType<typeof api.intelligence.thresholds>>
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const { t, notify } = useApp()
  const [draft, setDraft] = useState(current)

  return (
    <Modal
      title={t('insights.thresholds')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              void api.intelligence
                .setThresholds(draft)
                .then(() => {
                  notify(t('settings.saved'), 'success')
                  onSaved()
                })
                .catch(() =>
                  notify(t('errors.internal_error', { id: '-' }), 'error')
                )
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('insights.staleDays')}>
          <TextInput
            value={String(draft.staleDays)}
            onChange={(value) => setDraft({ ...draft, staleDays: Number(value) || 1 })}
          />
        </Field>
        <Field label={t('insights.lowMarginPercent')}>
          <TextInput
            value={String(draft.lowMarginPercent)}
            onChange={(value) => setDraft({ ...draft, lowMarginPercent: Number(value) || 0 })}
          />
        </Field>
        <Field label={t('insights.maxCapitalSharePercent')}>
          <TextInput
            value={String(draft.maxCapitalSharePercent)}
            onChange={(value) => setDraft({ ...draft, maxCapitalSharePercent: Number(value) || 1 })}
          />
        </Field>
        <Field label={t('insights.pendingPrepDays')}>
          <TextInput
            value={String(draft.pendingPrepDays)}
            onChange={(value) => setDraft({ ...draft, pendingPrepDays: Number(value) || 1 })}
          />
        </Field>
        <Field label={t('insights.pendingOrderDays')}>
          <TextInput
            value={String(draft.pendingOrderDays)}
            onChange={(value) => setDraft({ ...draft, pendingOrderDays: Number(value) || 1 })}
          />
        </Field>
        <Field label={t('insights.returnsRatePercent')}>
          <TextInput
            value={String(draft.returnsRatePercent)}
            onChange={(value) => setDraft({ ...draft, returnsRatePercent: Number(value) || 0 })}
          />
        </Field>
      </div>
      <label className="checkbox" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
        {t('common.yes')} / {t('common.no')}
      </label>
    </Modal>
  )
}

// ===========================================================================
// Licencia y plan
// ===========================================================================

export function LicensePage(): ReactNode {
  const { t, number, notify, dataVersion } = useApp()
  const state = useAsyncData(() => api.license.state(), [dataVersion])
  const [code, setCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [buyBusy, setBuyBusy] = useState(false)
  const [discordUrl, setDiscordUrl] = useState<string>('https://discord.gg/9bMhnGvjrx')

  // Se pregunta al proceso principal el destino real (lista blanca). Si la
  // llamada fallara, se conserva la constante por defecto: el boton sigue
  // funcionando y el usuario ve el enlace.
  useEffect(() => {
    let cancelled = false
    void api.links
      .targets()
      .then((targets) => {
        if (!cancelled) setDiscordUrl(targets.discordInvite)
      })
      .catch(() => {
        // Se mantiene la constante por defecto: no es un fallo bloqueante.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const openDiscord = (): void => {
    setBuyBusy(true)
    void api.links
      .open('discord_invite')
      .then((result) => {
        notify(result.opened ? t('plan.buyOpened') : t('plan.buyOpenFailed'), result.opened ? 'success' : 'error')
      })
      .catch(() => notify(t('plan.buyOpenFailed'), 'error'))
      .finally(() => setBuyBusy(false))
  }

  const copyDiscord = (): void => {
    setBuyBusy(true)
    void api.links
      .copy('discord_invite')
      .then((result) => {
        notify(result.copied ? t('plan.buyCopied') : t('plan.buyOpenFailed'), result.copied ? 'success' : 'error')
      })
      .catch(reportError)
      .finally(() => setBuyBusy(false))
  }

  const data = state.data

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('plan.title')}</h1>
          <p className="page-subtitle">{t('plan.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          {data ? (
            <span className="badge badge--accent">
              {t(`plan.plan${capitalize(data.plan)}` as 'plan.planFree')}
            </span>
          ) : null}
        </div>
      </header>

      {!data ? (
        <Card>
          <div className="spinner" />
        </Card>
      ) : (
        <>
          <div className="notice" style={{ marginBottom: 12 }}>
            <IconLicense size={15} />
            {t('plan.planLimitsApplied')}
          </div>

          <div className="grid-2">
            <Card title={t('plan.current')}>
              <div className="stack stack--sm">
                <Row label={t('plan.current')} value={t(`plan.plan${capitalize(data.plan)}` as 'plan.planFree')} />
                <Row label={t('plan.holder')} value={data.holder || '—'} />
                <Row
                  label={t('common.status')}
                  value={data.status}
                />
                <Row label={t('plan.activatedAt')} value={data.activatedAt ?? '—'} />
                <Row label={t('plan.expiresAt')} value={data.expiresAt ?? t('plan.perpetual')} />
                <Row label={t('plan.seats')} value={String(data.seats)} />
                <Row label={t('plan.deviceId')} value={data.deviceId.slice(0, 13) + '…'} />
                {!data.signatureValid ? (
                  <div className="notice notice--warn">{data.notes}</div>
                ) : null}
                {data.status === 'active' ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      void api.license
                        .deactivate()
                        .then(() => state.reload())
                        .catch(reportError)
                    }}
                  >
                    {t('plan.deactivate')}
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card title={t('plan.limits')}>
              <div className="stack stack--sm">
                <Row label={t('plan.products')} value={limitLabel(data.limits.maxProducts, number, t('plan.unlimited'))} />
                <Row label={t('plan.uploads')} value={limitLabel(data.limits.maxUploads, number, t('plan.unlimited'))} />
                <Row
                  label={t('plan.aiCalls')}
                  value={limitLabel(data.limits.aiMonthlyCalls, number, t('plan.unlimited'))}
                />
                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                <span className="field__label">{t('plan.usage')}</span>
                <Row label={t('plan.products')} value={number(data.usage.products)} />
                <Row label={t('plan.uploads')} value={number(data.usage.uploads)} />
                <Row label={t('plan.aiCalls')} value={number(data.usage.aiCallsThisMonth)} />
              </div>
            </Card>
          </div>

          <Card title={t('plan.activate')}>
            <p className="dim" style={{ marginTop: 0 }}>
              {t('plan.noBackend')}
            </p>
            <Field label={t('plan.activate')}>
              <TextArea value={code} onChange={setCode} rows={3} />
            </Field>
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                disabled={activating || code.trim().length < 10}
                onClick={() => {
                  setActivating(true)
                  void api.license
                    .activate({ code: code.trim() })
                    .then(() => {
                      notify(t('settings.saved'), 'success')
                      setCode('')
                      state.reload()
                    })
                    .catch(reportError)
                    .finally(() => setActivating(false))
                }}
              >
                {t('plan.activate')}
              </Button>
            </div>
          </Card>

          <Card title={t('plan.buyTitle')}>
            <p className="dim" style={{ marginTop: 0 }}>
              {t('plan.buyDescription')}
            </p>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="primary"
                disabled={buyBusy}
                onClick={openDiscord}
                icon={<IconExternal size={15} />}
              >
                {t('plan.buyButton')}
              </Button>
              <Button disabled={buyBusy} onClick={copyDiscord} icon={<IconLicense size={15} />}>
                {t('plan.buyCopy')}
              </Button>
              {/* El propio enlace es un objetivo accesible: se puede abrir con
                  el teclado (Enter) y con el raton, y funciona si el boton
                  principal no responde. */}
              <a
                className="mono"
                href={discordUrl}
                onClick={(event) => {
                  event.preventDefault()
                  openDiscord()
                }}
                style={{ fontSize: 11.5, marginLeft: 'auto' }}
              >
                {discordUrl}
              </a>
            </div>

            <p className="faint" style={{ marginBottom: 0, marginTop: 10 }}>
              {t('plan.buyCopyHint')}
            </p>
            <div className="notice notice--warn" style={{ marginTop: 10 }}>
              {t('plan.buyNoPayment')}
            </div>
          </Card>

          <Card title={t('plan.plansTitle')}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    {PLAN_DISPLAY_ORDER.map((plan) => (
                      <th key={plan} className="cell-num">
                        {t(`plan.plan${capitalize(plan)}` as 'plan.planFree')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FEATURE_KEYS.map((feature) => (
                    <tr key={feature.key}>
                      <td>{t(feature.labelKey as 'plan.featureMedia')}</td>
                      {PLAN_DISPLAY_ORDER.map((plan) => (
                        <td key={plan} className="cell-num">
                          {featureValue(plan, feature.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>{t('plan.products')}</td>
                    {PLAN_DISPLAY_ORDER.map((plan) => (
                      <td key={plan} className="cell-num">
                        {plan === 'business' ? t('plan.unlimited') : plan === 'pro' ? '20.000' : '150'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              {PLAN_DISPLAY_ORDER.map((plan) => (
                <span key={plan} className="chip">
                  {t(`plan.plan${capitalize(plan)}Hint` as 'plan.planFreeHint')}
                </span>
              ))}
            </div>

            <div className="notice notice--warn" style={{ marginTop: 12 }}>
              {t('plan.foundingHint')} — Pro: {FOUNDER_QUOTA.pro} · Business: {FOUNDER_QUOTA.business}
            </div>
          </Card>
        </>
      )}
    </div>
  )

  function Row({ label, value }: { label: string; value: string }): ReactNode {
    return (
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="faint">{label}</span>
        <span className="stat-line__value mono" style={{ fontSize: 11.5 }}>
          {value}
        </span>
      </div>
    )
  }
}

function featureValue(
  plan: LicensePlan,
  key: (typeof PLAN_FEATURE_KEYS)[number]['key']
): ReactNode {
  // Se importa de forma perezosa para no duplicar la tabla de limites.
  const limits = planLimitsFor(plan)
  const value = limits[key]
  if (typeof value === 'boolean') return value ? <IconCheck size={14} /> : '—'
  return value === -1 ? '∞' : String(value)
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function limitLabel(value: number, format: (value: number) => string, unlimited: string): string {
  return value === -1 ? unlimited : format(value)
}

/** Reexportado para la tabla comparativa (evita duplicar los limites). */
import { PLAN_LIMITS } from '@shared/plans'
function planLimitsFor(plan: LicensePlan): (typeof PLAN_LIMITS)[LicensePlan] {
  return PLAN_LIMITS[plan]
}
