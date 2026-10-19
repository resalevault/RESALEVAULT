/**
 * RESALEVAULT - Importacion y exportacion CSV.
 *
 * El flujo de importacion tiene tres pasos deliberados:
 *  1. Elegir el archivo y ver las columnas detectadas.
 *  2. Mapear columnas y ANALIZAR: cuantas filas son validas, que duplicados hay
 *     y con que valores. Esto no escribe nada.
 *  3. Importar, eligiendo que hacer con los SKU que ya existen.
 *
 * Las coincidencias por nombre NUNCA se fusionan solas: se omiten y se avisan.
 * Fusionar dos articulos distintos por parecerse el nombre seria una perdida de
 * datos silenciosa.
 */

import { useState, type ReactNode } from 'react'
import type { CsvColumnMapping, CsvImportReport, CsvPreview } from '@shared/types-modules'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Button, Card, Field, Select, TextInput } from '../components/ui'
import { IconImportExport, IconPlus } from '../components/Icons'

const EXPORT_FORMATS = ['products', 'orders', 'purchases', 'expenses', 'picking'] as const

export function ImportExportPage(): ReactNode {
  const { t, notify, dataVersion, refreshData } = useApp()

  const [path, setPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<CsvColumnMapping>({})
  const [report, setReport] = useState<CsvImportReport | null>(null)
  const [strategy, setStrategy] = useState<'skip' | 'update' | 'create_anyway'>('skip')
  const [dryRun, setDryRun] = useState(true)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.csv.import>> | null>(null)
  const [format, setFormat] = useState<(typeof EXPORT_FORMATS)[number]>('products')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [busy, setBusy] = useState(false)

  void dataVersion

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const chooseFile = async (): Promise<void> => {
    try {
      const chosen = await api.csv.chooseImportFile()
      if (chosen.canceled || !chosen.path) return
      setPath(chosen.path)
      setResult(null)
      const data = await api.csv.preview(chosen.path)
      setPreview(data)
      setMapping(data.suggestedMapping)
      setReport(null)
    } catch (error) {
      reportError(error)
    }
  }

  const analyze = async (): Promise<void> => {
    if (!path) return
    setBusy(true)
    try {
      setReport(await api.csv.analyze(path, mapping))
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (): Promise<void> => {
    if (!path) return
    setBusy(true)
    try {
      const outcome = await api.csv.import({ path, mapping, duplicateStrategy: strategy, dryRun })
      setResult(outcome)
      if (!dryRun) {
        notify(t('csv.runImport'), 'success')
        refreshData()
      }
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  const runExport = async (): Promise<void> => {
    try {
      const chosen = await api.csv.chooseExportPath(format, `resalevault-${format}.csv`)
      if (chosen.canceled || !chosen.path) return
      const outcome = await api.csv.export({ path: chosen.path, format, includeArchived, delimiter: ';' })
      notify(t('csv.exported', { rows: outcome.rows, path: outcome.path }), 'success')
    } catch (error) {
      reportError(error)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('csv.title')}</h1>
          <p className="page-subtitle">{t('csv.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button icon={<IconImportExport size={14} />} onClick={() => void chooseFile()}>
            {t('csv.chooseFile')}
          </Button>
        </div>
      </header>

      <Card title={t('csv.importTitle')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('csv.importHint')}
        </p>

        <div className="row" style={{ marginBottom: 12 }}>
          <span className="chip">{path ? t('csv.fileChosen', { name: path.split(/[\\/]/).pop() ?? '' }) : t('csv.noFile')}</span>
          {preview ? (
            <>
              <span className="badge badge--muted">
                {t('csv.delimiter')}: {preview.delimiter === '\t' ? 'TAB' : preview.delimiter}
              </span>
              <span className="badge badge--accent">
                {t('csv.totalRows')}: {preview.totalRows}
              </span>
            </>
          ) : null}
        </div>

        {preview ? (
          <>
            <div className="stack stack--sm">
              {preview.targetFields.map((target) => (
                <div key={target.field} className="form-row">
                  <div style={{ flex: '0 0 190px' }}>
                    <span className={target.required ? 'field__label' : 'faint'}>
                      {t(target.labelKey as 'common.name')}
                      {target.required ? ` · ${t('csv.required')}` : ''}
                    </span>
                  </div>
                  <div style={{ flex: '1 1 240px' }}>
                    <Select
                      value={String(mapping[target.field] ?? -1)}
                      onChange={(value) =>
                        setMapping((current) => ({ ...current, [target.field]: Number(value) }))
                      }
                    >
                      <option value="-1">{t('csv.ignore')}</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={String(index)}>
                          {header || `#${index + 1}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <span className="faint">
                {t('csv.mappingHint')}
              </span>
              <Button onClick={() => void analyze()} disabled={busy}>
                {t('csv.analyze')}
              </Button>
            </div>
          </>
        ) : (
          <div className="notice">
            <IconImportExport size={15} />
            {t('csv.noFile')}
          </div>
        )}
      </Card>

      {report ? (
        <Card title={t('csv.analyze')}>
          <div className="grid-cards" style={{ marginBottom: 12 }}>
            <Stat label={t('csv.parsed')} value={String(report.parsed)} />
            <Stat label={t('csv.valid')} value={String(report.valid)} accent />
            <Stat label={t('csv.invalid')} value={String(report.invalid)} />
            <Stat label={t('csv.duplicates')} value={String(report.duplicates.length)} />
          </div>

          {report.duplicates.length > 0 ? (
            <>
              <div className="notice notice--warn" style={{ marginBottom: 8 }}>
                {t('csv.duplicatesHint')}
              </div>
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('common.sku')}</th>
                      <th>{t('common.name')}</th>
                      <th>{t('csv.existing')}</th>
                      <th>{t('csv.differences')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.duplicates.slice(0, 60).map((duplicate) => (
                      <tr key={`${duplicate.row}-${duplicate.existingId}`}>
                        <td>{duplicate.row}</td>
                        <td className="cell-mono">{duplicate.sku || '—'}</td>
                        <td>{duplicate.name}</td>
                        <td>
                          <span className="badge badge--muted">
                            {duplicate.reason === 'sku_exists' ? t('csv.duplicateSku') : t('csv.duplicatePossible')}
                          </span>{' '}
                          <span className="mono">{duplicate.existingSku}</span> {duplicate.existingName}
                        </td>
                        <td>
                          {duplicate.differences.slice(0, 3).map((difference) => (
                            <span key={difference.field} className="chip" style={{ marginRight: 4 }}>
                              {difference.field}: {difference.existing} → {difference.incoming}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {report.issues.length > 0 ? (
            <details style={{ marginBottom: 12 }}>
              <summary className="faint">
                {t('csv.issues')} ({report.issues.length})
              </summary>
              <div className="stack stack--sm" style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {report.issues.slice(0, 80).map((issue, index) => (
                  <div key={index} className="stat-line">
                    <span className="mono faint">
                      #{issue.row} · {issue.field}
                    </span>
                    <span className="dim">{t(issue.message as 'csv.issues')}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div className="form-grid">
            <Field label={t('csv.strategy')}>
              <Select value={strategy} onChange={(value) => setStrategy(value as 'skip')}>
                <option value="skip">{t('csv.strategySkip')}</option>
                <option value="update">{t('csv.strategyUpdate')}</option>
                <option value="create_anyway">{t('csv.strategyCreate')}</option>
              </Select>
            </Field>
            <Field label="">
              <label className="checkbox">
                <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
                {t('csv.dryRun')}
              </label>
            </Field>
          </div>

          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => void runImport()} disabled={busy}>
              {t('csv.runImport')}
            </Button>
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card title={t('csv.result')}>
          <div className="grid-cards">
            <Stat label={t('csv.created')} value={String(result.created)} accent />
            <Stat label={t('csv.updated')} value={String(result.updated)} />
            <Stat label={t('csv.skipped')} value={String(result.skipped)} />
            <Stat label={t('csv.failed')} value={String(result.failed)} />
          </div>
          {dryRun ? (
            <div className="notice notice--warn" style={{ marginTop: 10 }}>
              {t('csv.dryRun')}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title={t('csv.exportTitle')}>
        <p className="dim" style={{ marginTop: 0 }}>
          {t('csv.exportHint')}
        </p>
        <div className="form-grid">
          <Field label={t('csv.exportFormat')}>
            <Select value={format} onChange={(value) => setFormat(value as 'products')}>
              {EXPORT_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {t(`csv.formats.${value}` as 'csv.formats.products')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              {t('csv.includeArchived')}
            </label>
          </Field>
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => void runExport()}>
            {t('csv.export')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }): ReactNode {
  return (
    <div className={accent ? 'kpi kpi--accent' : 'kpi'}>
      <span className="kpi__label">{label}</span>
      <span className={accent ? 'kpi__value kpi__value--accent' : 'kpi__value'}>{value}</span>
    </div>
  )
}

export type { TextInput }
