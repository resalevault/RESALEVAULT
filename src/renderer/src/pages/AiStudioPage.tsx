/**
 * RESALEVAULT - AI Studio (BYOK).
 *
 * Reglas que la pantalla hace visibles:
 *  - Sin ninguna conexion, NO se simula ninguna respuesta: se explica como
 *    configurarla.
 *  - La clave se guarda cifrada con el almacen del sistema y nunca se vuelve a
 *    mostrar completa.
 *  - Los modelos se consultan al proveedor; no hay listas obsoletas escritas a
 *    mano.
 *  - El coste es una ESTIMACION con el precio que configura el usuario.
 *  - La sugerencia de precio es una estimacion basada en sus datos, no un
 *    precio de mercado verificado.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AiConnection,
  AiGenerateResult,
  AiModelInfo,
  AiProvider,
  AiTask
} from '@shared/types-modules'
import type { ProductSummary } from '@shared/types'
import { AI_PROVIDERS, AI_TASKS } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData, useDebounced } from '../lib/hooks'
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Select,
  Spinner,
  TextArea,
  TextInput
} from '../components/ui'
import { IconPlus, IconSparkles, IconTrash } from '../components/Icons'

const TASK_KEYS: Record<AiTask, string> = {
  title: 'ai.tasksNames.title',
  description: 'ai.tasksNames.description',
  translation: 'ai.tasksNames.translation',
  classification: 'ai.tasksNames.classification',
  attributes: 'ai.tasksNames.attributes',
  keywords: 'ai.tasksNames.keywords',
  review: 'ai.tasksNames.review',
  price_suggestion: 'ai.tasksNames.price_suggestion'
}

export function AiStudioPage(): ReactNode {
  const { t, money, number, notify, dataVersion, locale } = useApp()

  const license = useAsyncData(() => api.license.state(), [dataVersion])
  const connections = useAsyncData(() => api.ai.connections(), [dataVersion])
  const routes = useAsyncData(() => api.ai.routes(), [dataVersion])
  const usage = useAsyncData(() => api.ai.usage(), [dataVersion])
  const prices = useAsyncData(() => api.ai.prices(), [dataVersion])

  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [modelsByConnection, setModelsByConnection] = useState<Record<string, AiModelInfo[]>>({})

  const [search, setSearch] = useState('')
  const debounced = useDebounced(search, 240)
  const products = useAsyncData(
    () => api.products.list({ search: debounced.trim() || undefined, pageSize: 40, sort: 'updated_desc' }),
    [debounced, dataVersion]
  )

  const [productId, setProductId] = useState('')
  const [task, setTask] = useState<AiTask>('title')
  const [instruction, setInstruction] = useState('')
  const [language, setLanguage] = useState<string>(locale)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AiGenerateResult | null>(null)

  const reportError = (error: unknown): void => {
    if (error instanceof AppError && error.code === 'license_required') {
      notify(t('ai.needsPlan'), 'error')
      return
    }
    if (error instanceof AppError && error.code === 'plan_limit_reached') {
      notify(t('errors.plan_limit_reached'), 'error')
      return
    }
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )
  }

  const gatesOk = license.data?.limits.aiStudio === true

  const loadModels = async (connectionId: string): Promise<void> => {
    if (modelsByConnection[connectionId]) return
    try {
      const models = await api.ai.models(connectionId)
      setModelsByConnection((current) => ({ ...current, [connectionId]: models }))
    } catch (error) {
      reportError(error)
    }
  }

  useEffect(() => {
    // Se cargan los modelos de la primera conexion activa para poder elegir uno.
    const first = (connections.data ?? []).find((connection) => connection.active)
    if (first) void loadModels(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.data])

  const runTest = async (connection: AiConnection): Promise<void> => {
    setTesting(connection.id)
    setTestResult(null)
    try {
      const outcome = await api.ai.testConnection(connection.id)
      if (outcome.ok) {
        setModelsByConnection((current) => ({ ...current, [connection.id]: outcome.models }))
        setTestResult({
          id: connection.id,
          ok: true,
          text: t('ai.testOk', { count: outcome.modelCount, ms: outcome.latencyMs })
        })
      } else {
        setTestResult({
          id: connection.id,
          ok: false,
          text: t(`ai.errors.${outcome.errorCode ?? 'provider_error'}` as 'ai.errors.provider_error')
        })
      }
      connections.reload()
    } catch (error) {
      reportError(error)
    } finally {
      setTesting(null)
    }
  }

  const run = async (): Promise<void> => {
    if (!productId) {
      notify(t('ai.selectProduct'), 'error')
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const outcome = await api.ai.generate({
        task,
        productId,
        instruction: instruction.trim() || undefined,
        language
      })
      setResult(outcome)
      usage.reload()
    } catch (error) {
      reportError(error)
      usage.reload()
    } finally {
      setRunning(false)
    }
  }

  const applyResult = async (): Promise<void> => {
    if (!result || !productId) return
    try {
      if (result.task === 'title') {
        await api.products.update(productId, { name: result.text.slice(0, 200) })
      } else if (result.task === 'description') {
        await api.products.update(productId, { description: result.text.slice(0, 20000) })
      } else if (result.task === 'translation') {
        await api.products.update(productId, { description: result.text.slice(0, 20000) })
      } else {
        notify(t('ai.onlyTextApplied'), 'info')
        return
      }
      notify(t('product.updated'), 'success')
    } catch (error) {
      reportError(error)
    }
  }

  if (!license.data) {
    return (
      <div className="page">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('ai.title')}</h1>
          <p className="page-subtitle">{t('ai.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <span className="badge badge--accent">{t('ai.byok')}</span>
          <Button
            variant="primary"
            icon={<IconPlus size={14} />}
            onClick={() => setCreating(true)}
            disabled={!license.data?.limits.aiStudio}
          >
            {t('ai.newConnection')}
          </Button>
        </div>
      </header>

      <div className="notice" style={{ marginBottom: 12 }}>
        {t('ai.byokHint')}
      </div>

      {!gatesOk ? (
        <Card>
          <div className="notice notice--warn" style={{ marginBottom: 10 }}>
            {t('ai.needsPlan')}
          </div>
          <p className="dim" style={{ marginTop: 0 }}>
            {t('ai.noConnectionsHint')}
          </p>
        </Card>
      ) : null}

      <Card title={t('ai.connections')}>
        {(connections.data ?? []).length === 0 ? (
          <EmptyState
            icon={<IconSparkles size={26} />}
            title={t('ai.noConnections')}
            message={t('ai.noConnectionsHint')}
            action={
              <Button variant="primary" onClick={() => setCreating(true)} disabled={!gatesOk}>
                {t('ai.newConnection')}
              </Button>
            }
          />
        ) : (
          <div className="stack">
            {(connections.data ?? []).map((connection) => (
              <div key={connection.id} className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row">
                    <span className="badge badge--accent">
                      {t(`ai.providers.${connection.provider}` as 'ai.providers.gemini')}
                    </span>
                    <strong>{connection.label || t(`ai.providers.${connection.provider}` as 'ai.providers.gemini')}</strong>
                    <span className="mono faint">{connection.secretHint}</span>
                    {connection.active ? (
                      <span className="badge badge--ok">{t('ai.active')}</span>
                    ) : (
                      <span className="badge badge--muted">{t('ai.inactive')}</span>
                    )}
                    {connection.lastOkAt ? (
                      <span className="chip">{t('ai.connected')}</span>
                    ) : connection.lastError ? (
                      <span className="chip">{t(`ai.errors.${connection.lastError}` as 'ai.errors.provider_error')}</span>
                    ) : null}
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" onClick={() => void runTest(connection)} disabled={testing === connection.id}>
                      {testing === connection.id ? t('ai.testing') : t('ai.test')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        void api.ai
                          .updateConnection(connection.id, { active: !connection.active })
                          .then(() => connections.reload())
                          .catch(reportError)
                      }}
                    >
                      {connection.active ? t('ai.inactive') : t('ai.active')}
                    </Button>
                    <IconButton
                      label={t('ai.remove')}
                      onClick={() => {
                        void api.ai
                          .removeConnection(connection.id)
                          .then(() => {
                            connections.reload()
                            routes.reload()
                          })
                          .catch(reportError)
                      }}
                    >
                      <IconTrash size={14} />
                    </IconButton>
                  </div>
                </div>

                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <span className="faint">{t('ai.defaultModel')}:</span>
                  <div style={{ minWidth: 220 }}>
                    <Select
                      value={connection.defaultModel}
                      onChange={(value) => {
                        void api.ai
                          .updateConnection(connection.id, { defaultModel: value })
                          .then(() => connections.reload())
                          .catch(reportError)
                      }}
                    >
                      <option value="">{t('ai.noModel')}</option>
                      {(modelsByConnection[connection.id] ?? []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName || model.id}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void loadModels(connection.id)}>
                    {t('ai.loadModels')}
                  </Button>
                </div>

                {testResult && testResult.id === connection.id ? (
                  <div className={testResult.ok ? 'notice notice--accent' : 'notice notice--warn'} style={{ marginTop: 8 }}>
                    {testResult.text}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="field__hint" style={{ marginTop: 10 }}>
          {t('ai.modelsHint')}
        </div>
      </Card>

      <Card title={t('ai.taskRoutes')}>
        <div className="stack stack--sm">
          {AI_TASKS.map((value) => {
            const connectionId = routes.data?.[value]?.connectionId ?? ''
            const model = routes.data?.[value]?.model ?? ''
            const models = modelsByConnection[connectionId] ?? []
            return (
              <div key={value} className="form-row">
                <div style={{ flex: '1 1 170px' }}>
                  <span className="field__label">{t(TASK_KEYS[value] as 'ai.tasksNames.title')}</span>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <Select
                    value={connectionId}
                    onChange={(value2) => {
                      if (value2) void loadModels(value2)
                      void api.ai.setRoute(value, value2 || null, '').then(() => routes.reload()).catch(reportError)
                    }}
                  >
                    <option value="">{t('common.none')}</option>
                    {(connections.data ?? []).map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.label || t(`ai.providers.${connection.provider}` as 'ai.providers.gemini')}
                      </option>
                    ))}
                  </Select>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <Select
                    value={model}
                    onChange={(value2) => {
                      void api.ai.setRoute(value, connectionId || null, value2).then(() => routes.reload()).catch(reportError)
                    }}
                    disabled={!connectionId}
                  >
                    <option value="">{t('ai.noModel')}</option>
                    {models.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.displayName || entry.id}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title={t('ai.run')}>
        <div className="form-grid">
          <Field label={t('ai.selectProduct')}>
            <TextInput value={search} onChange={setSearch} placeholder={t('common.search')} />
          </Field>
          <Field label={t('common.name')}>
            <Select value={productId} onChange={setProductId}>
              <option value="">{t('common.select')}</option>
              {(products.data?.items ?? []).map((item: ProductSummary) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ai.tasks')}>
            <Select value={task} onChange={(value) => setTask(value as AiTask)}>
              {AI_TASKS.map((value) => (
                <option key={value} value={value}>
                  {t(TASK_KEYS[value] as 'ai.tasksNames.title')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ai.language')}>
            <Select value={language} onChange={setLanguage}>
              <option value="es">Espanol</option>
              <option value="en">English</option>
              <option value="fr">Francais</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="pt">Portugues</option>
            </Select>
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('ai.instruction')}>
              <TextArea value={instruction} onChange={setInstruction} rows={2} />
            </Field>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={() => void run()} disabled={running || !gatesOk}>
            {running ? t('ai.running') : t('ai.run')}
          </Button>
        </div>

        {result ? (
          <div style={{ marginTop: 12 }}>
            <Card title={t('ai.result')}>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="badge badge--accent">{t(`ai.providers.${result.provider}` as 'ai.providers.gemini')}</span>
                <span className="mono faint">{result.model}</span>
                <span className="chip">
                  {t('ai.inputTokens')}: {number(result.inputTokens)}
                </span>
                <span className="chip">
                  {t('ai.outputTokens')}: {number(result.outputTokens)}
                </span>
                <span className="chip">
                  {t('ai.estimatedCost')}: {money(Math.round(result.costMicros / 1000))}
                </span>
              </div>

              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 12,
                  margin: 0,
                  fontSize: 12.5,
                  fontFamily: 'var(--font-body)'
                }}
              >
                {result.text}
              </pre>

              {result.disclaimerKey ? (
                <div className="notice notice--warn" style={{ marginTop: 10 }}>
                  {t(result.disclaimerKey as 'ai.priceDisclaimer')}
                </div>
              ) : null}

              <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                <Button
                  onClick={() => {
                    const clipboard = navigator.clipboard
                    if (!clipboard?.writeText) {
                      notify(t('errors.unsupported_file_type'), 'error')
                      return
                    }
                    void clipboard
                      .writeText(result.text)
                      .then(() => notify(t('ai.copy'), 'success'))
                      .catch(() => notify(t('errors.internal_error', { id: '-' }), 'error'))
                  }}
                >
                  {t('ai.copy')}
                </Button>
                <Button variant="primary" onClick={() => void applyResult()}>
                  {t('ai.applyToProduct')}
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
      </Card>

      <div className="grid-2">
        <Card title={t('ai.usageTitle')}>
          <p className="dim" style={{ marginTop: 0 }}>
            {t('ai.usageHint')}
          </p>
          <div className="grid-cards">
            <div className="kpi">
              <span className="kpi__label">{t('ai.calls')}</span>
              <span className="kpi__value">{number(usage.data?.totalCalls ?? 0)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__label">{t('ai.inputTokens')}</span>
              <span className="kpi__value">{number(usage.data?.totalInputTokens ?? 0)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__label">{t('ai.outputTokens')}</span>
              <span className="kpi__value">{number(usage.data?.totalOutputTokens ?? 0)}</span>
            </div>
            <div className="kpi kpi--accent">
              <span className="kpi__label">{t('ai.estimatedCost')}</span>
              <span className="kpi__value kpi__value--accent">
                {money(Math.round((usage.data?.totalCostMicros ?? 0) / 1000))}
              </span>
            </div>
          </div>

          {(usage.data?.recent ?? []).length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.date')}</th>
                    <th>{t('ai.tasks')}</th>
                    <th>{t('ai.provider')}</th>
                    <th className="cell-num">{t('ai.estimatedCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage.data?.recent ?? []).slice(0, 20).map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {entry.at.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td>{entry.task}</td>
                      <td className="dim">{entry.ok ? entry.provider : t('ai.testFail')}</td>
                      <td className="cell-num">{money(Math.round(entry.costMicros / 1000))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <PriceEditor prices={prices.data ?? []} onSaved={() => prices.reload()} />
      </div>

      <Card title={t('ai.multiFlow')}>
        <div className="notice notice--warn" style={{ marginBottom: 8 }}>
          {t('ai.multiFlowHint')}
        </div>
        <div className="chip">{t('ai.multiFlowEstimate')}</div>
      </Card>

      {creating ? (
        <ConnectionModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            connections.reload()
          }}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alta de conexion
// ---------------------------------------------------------------------------

function ConnectionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): ReactNode {
  const { t, notify } = useApp()
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [label, setLabel] = useState('')
  const [secret, setSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      title={t('ai.newConnection')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={saving || secret.trim().length < 8}
            onClick={() => {
              setSaving(true)
              void api.ai
                .createConnection({ provider, label, secret, baseUrl })
                .then(() => {
                  setSecret('')
                  onSaved()
                })
                .catch((error: unknown) =>
                  notify(
                    error instanceof AppError
                      ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
                      : t('errors.internal_error', { id: '-' }),
                    'error'
                  )
                )
                .finally(() => setSaving(false))
            }}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('ai.provider')}>
          <Select value={provider} onChange={(value) => setProvider(value as AiProvider)}>
            {AI_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {t(`ai.providers.${value}` as 'ai.providers.gemini')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('ai.label')}>
          <TextInput value={label} onChange={setLabel} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('ai.apiKey')} hint={t('ai.apiKeyHint')}>
            <TextInput value={secret} onChange={setSecret} mono />
          </Field>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('ai.baseUrl')} hint={t('ai.baseUrlHint')}>
            <TextInput value={baseUrl} onChange={setBaseUrl} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Precios (los configura el usuario)
// ---------------------------------------------------------------------------

function PriceEditor({
  prices,
  onSaved
}: {
  prices: Array<{ provider: string; model: string; inputPerMillionMicros: number; outputPerMillionMicros: number }>
  onSaved: () => void
}): ReactNode {
  const { t, notify } = useApp()
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [model, setModel] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  const existing = useMemo(
    () => prices.filter((entry) => entry.provider === provider),
    [prices, provider]
  )

  return (
    <Card title={t('ai.pricePerMillion')}>
      <p className="dim" style={{ marginTop: 0 }}>
        {t('ai.usageHint')}
      </p>

      {existing.length > 0 ? (
        <div className="stack stack--sm" style={{ marginBottom: 10 }}>
          {existing.map((entry) => (
            <div key={entry.model} className="stat-line">
              <span className="mono" style={{ fontSize: 11 }}>
                {entry.model}
              </span>
              <span className="dim" style={{ fontSize: 11 }}>
                {t('ai.priceInput')}: {(entry.inputPerMillionMicros / 1_000_000).toFixed(4)} ·{' '}
                {t('ai.priceOutput')}: {(entry.outputPerMillionMicros / 1_000_000).toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="form-grid">
        <Field label={t('ai.provider')}>
          <Select value={provider} onChange={(value) => setProvider(value as AiProvider)}>
            {AI_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {t(`ai.providers.${value}` as 'ai.providers.gemini')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('ai.defaultModel')}>
          <TextInput value={model} onChange={setModel} mono />
        </Field>
        <Field label={t('ai.priceInput')}>
          <TextInput value={input} onChange={setInput} />
        </Field>
        <Field label={t('ai.priceOutput')}>
          <TextInput value={output} onChange={setOutput} />
        </Field>
      </div>

      <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <Button
          disabled={!model.trim()}
          onClick={() => {
            const inputValue = Number(input.replace(',', '.'))
            const outputValue = Number(output.replace(',', '.'))
            void api.ai
              .setPrice({
                provider,
                model: model.trim(),
                inputPerMillionMicros: Math.round((Number.isFinite(inputValue) ? inputValue : 0) * 1_000_000),
                outputPerMillionMicros: Math.round((Number.isFinite(outputValue) ? outputValue : 0) * 1_000_000)
              })
              .then(() => {
                notify(t('ai.savePrice'), 'success')
                setModel('')
                setInput('')
                setOutput('')
                onSaved()
              })
              .catch(() => notify(t('errors.internal_error', { id: '-' }), 'error'))
          }}
        >
          {t('ai.savePrice')}
        </Button>
      </div>
    </Card>
  )
}
