/**
 * RESALEVAULT - Tarjeta de copias de seguridad (dentro de Ajustes).
 *
 * Decision importante que la interfaz deja clara: **restaurar sustituye todos
 * los datos**. Por eso hay una confirmacion explicita, se avisa de que antes se
 * guarda la base actual y se explica que la aplicacion se reiniciara.
 *
 * El boton de restaurar NO restaura en caliente: prepara la copia validada y
 * reinicia. Al arrancar, el proceso principal sustituye el archivo antes de
 * abrir SQLite.
 */

import { useState, type ReactNode } from 'react'
import type { BackupFileInfo, BackupStatus } from '@shared/types-backup'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, TextInput } from '../components/ui'
import { IconAlert, IconArchive, IconExternal, IconRefresh } from '../components/Icons'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function BackupsCard(): ReactNode {
  const { t, number, dateTime, notify, dataVersion, refreshData } = useApp()

  const status = useAsyncData(() => api.backups.status(), [dataVersion])
  const list = useAsyncData(() => api.backups.list(), [dataVersion])
  const storage = useAsyncData(() => api.media.storageReport(), [dataVersion])

  const [creating, setCreating] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const reportError = (error: unknown): void =>
    notify(
      error instanceof AppError
        ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
        : t('errors.internal_error', { id: '-' }),
      'error'
    )

  const create = async (): Promise<void> => {
    setCreating(true)
    try {
      const result = await api.backups.create()
      notify(
        t('backup.created', {
          name: result.path.split(/[\\/]/).pop() ?? '',
          size: formatBytes(result.bytes)
        }),
        'success'
      )
      status.reload()
      list.reload()
      refreshData()
    } catch (error) {
      reportError(error)
    } finally {
      setCreating(false)
    }
  }

  const verify = async (file: BackupFileInfo): Promise<void> => {
    setVerifying(file.path)
    setVerifyMessage(null)
    try {
      const result = await api.backups.verify(file.path)
      if (result.ok) {
        setVerifyMessage({
          ok: true,
          text: t('backup.verifyOk', { schema: result.schemaVersion ?? 0 })
        })
      } else {
        setVerifyMessage({
          ok: false,
          text: `${t('backup.verifyFail')} — ${t(`backup.reason.${result.reason ?? 'corrupt'}` as 'backup.reason.corrupt')}`
        })
      }
    } catch (error) {
      reportError(error)
    } finally {
      setVerifying(null)
    }
  }

  const restore = async (): Promise<void> => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await api.backups.restore(restoreTarget.path)
      notify(t('backup.willRestart'), 'success')
      // El proceso principal reinicia la aplicacion en ~1 segundo.
    } catch (error) {
      setRestoring(false)
      setRestoreTarget(null)
      reportError(error)
    }
  }

  const data = status.data

  return (
    <>
      <Card
        title={t('backup.title')}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <Button
              size="sm"
              icon={<IconExternal size={13} />}
              onClick={() => void api.backups.openFolder().catch(reportError)}
            >
              {t('backup.openFolder')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<IconArchive size={13} />}
              onClick={() => void create()}
              disabled={creating}
            >
              {creating ? t('backup.creating') : t('backup.createNow')}
            </Button>
          </div>
        }
      >
        <p className="dim" style={{ marginTop: 0 }}>
          {t('backup.subtitle')}
        </p>

        {!data ? (
          <div className="spinner" />
        ) : (
          <>
            <div className="grid-cards" style={{ marginBottom: 12 }}>
              <div className="kpi kpi--accent">
                <span className="kpi__label">{t('backup.lastBackup')}</span>
                <span className="kpi__value" style={{ fontSize: 15 }}>
                  {data.lastBackupAt ? dateTime(data.lastBackupAt) : t('backup.never')}
                </span>
                <span className="kpi__hint">
                  {data.config.enabled
                    ? data.due
                      ? t('backup.dueNow')
                      : `${t('backup.nextDue')}: ${data.nextDueAt ? dateTime(data.nextDueAt) : '—'}`
                    : t('backup.disabled')}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi__label">{t('backup.count')}</span>
                <span className="kpi__value">{number(data.count)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__label">{t('backup.totalSize')}</span>
                <span className="kpi__value">{formatBytes(data.totalBytes)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__label">{t('backup.mediaFiles')}</span>
                <span className="kpi__value">{number(storage.data?.storedFiles ?? 0)}</span>
                <span className="kpi__hint">{formatBytes(storage.data?.totalBytes ?? 0)}</span>
              </div>
            </div>

            <div className="form-grid">
              <Field label={t('backup.enabled')}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={data.config.enabled}
                    onChange={(event) => {
                      void api.backups
                        .setConfig({ enabled: event.target.checked })
                        .then(() => status.reload())
                        .catch(reportError)
                    }}
                  />
                  {data.config.enabled ? t('common.yes') : t('common.no')}
                </label>
              </Field>

              <Field label={t('backup.intervalDays')}>
                <TextInput
                  value={String(data.config.intervalDays)}
                  onChange={(value) => {
                    const parsed = Number(value)
                    if (!Number.isFinite(parsed) || parsed < 1) return
                    void api.backups
                      .setConfig({ intervalDays: parsed })
                      .then(() => status.reload())
                      .catch(reportError)
                  }}
                />
              </Field>

              <Field label={t('backup.maxCopies')}>
                <TextInput
                  value={String(data.config.maxCopies)}
                  onChange={(value) => {
                    const parsed = Number(value)
                    if (!Number.isFinite(parsed) || parsed < 1) return
                    void api.backups
                      .setConfig({ maxCopies: parsed })
                      .then(() => status.reload())
                      .catch(reportError)
                  }}
                />
              </Field>

              <Field label={t('backup.includeMedia')}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={data.config.includeMedia}
                    onChange={(event) => {
                      void api.backups
                        .setConfig({ includeMedia: event.target.checked })
                        .then(() => status.reload())
                        .catch(reportError)
                    }}
                  />
                  {data.config.includeMedia ? t('common.yes') : t('common.no')}
                </label>
              </Field>

              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t('backup.destination')}>
                  <span className="mono" style={{ fontSize: 11 }}>
                    {data.destination}
                  </span>
                </Field>
              </div>
            </div>

            {!data.config.includeMedia ? (
              <div className="notice notice--warn" style={{ marginTop: 10 }}>
                <IconAlert size={15} />
                {t('backup.withoutMedia')}
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card title={t('backup.listTitle')} flush>
        {(list.data ?? []).length === 0 ? (
          <EmptyState
            icon={<IconArchive size={26} />}
            title={t('backup.empty')}
            message={t('backup.emptyHint')}
            action={
              <Button variant="primary" onClick={() => void create()} disabled={creating}>
                {t('backup.createNow')}
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.name')}</th>
                  <th className="cell-num">{t('common.total')}</th>
                  <th className="cell-num">{t('backup.productsCount', { count: 0 }).replace('0', '')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((file) => (
                  <tr key={file.path}>
                    <td>{dateTime(file.createdAt)}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {file.name}
                    </td>
                    <td className="cell-num">{formatBytes(file.bytes)}</td>
                    <td className="cell-num dim">
                      {file.products === null ? '—' : number(file.products)}
                      {file.includesMedia ? ' · 📷' : ''}
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        <Button
                          size="sm"
                          onClick={() => void verify(file)}
                          disabled={verifying === file.path}
                        >
                          {verifying === file.path ? t('backup.verifying') : t('backup.verify')}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setRestoreTarget(file)}>
                          {t('backup.restore')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {verifyMessage ? (
        <div className={verifyMessage.ok ? 'notice notice--accent' : 'notice notice--warn'} style={{ marginTop: 10 }}>
          {verifyMessage.ok ? null : <IconAlert size={15} />}
          {verifyMessage.text}
        </div>
      ) : null}

      {storage.data && (storage.data.orphanFiles.length > 0 || storage.data.missingFiles.length > 0) ? (
        <Card title={t('backup.mediaTitle')}>
          <div className="stack stack--sm">
            {storage.data.orphanFiles.length > 0 ? (
              <div className="stat-line">
                <span className="faint">{t('backup.orphans')}</span>
                <span className="stat-line__value">{number(storage.data.orphanFiles.length)}</span>
              </div>
            ) : null}
            {storage.data.missingFiles.length > 0 ? (
              <div className="stat-line">
                <span className="faint">{t('backup.missing')}</span>
                <span className="stat-line__value">{number(storage.data.missingFiles.length)}</span>
              </div>
            ) : null}
            {storage.data.orphanFiles.length > 0 ? (
              <div className="row">
                <Button
                  size="sm"
                  icon={<IconRefresh size={13} />}
                  onClick={() => {
                    void api.media
                      .cleanupOrphans()
                      .then((result) => {
                        notify(t('backup.cleanupDone', { count: result.removed }), 'success')
                        storage.reload()
                      })
                      .catch(reportError)
                  }}
                >
                  {t('backup.cleanup')}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {restoreTarget ? (
        <ConfirmDialog
          title={t('backup.restoreConfirm')}
          tone="danger"
          message={`${t('backup.restoreWarning')}\n\n${t('backup.willRestart')}`}
          confirmLabel={restoring ? t('backup.restoring') : t('backup.restore')}
          onCancel={() => {
            if (!restoring) setRestoreTarget(null)
          }}
          onConfirm={() => void restore()}
        />
      ) : null}

      {restoring ? (
        <Modal title={t('backup.restoring')} onClose={() => undefined}>
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="spinner" />
            <span className="dim">{t('backup.willRestart')}</span>
          </div>
        </Modal>
      ) : null}
    </>
  )
}

/** Estado expuesto para pruebas manuales desde la consola de desarrollo. */
export type { BackupStatus }
