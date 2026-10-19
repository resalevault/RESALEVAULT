/**
 * RESALEVAULT - Gestion de ubicaciones fisicas.
 *
 * Jerarquia estricta: Almacen > Estanteria > Caja > Compartimento. La interfaz
 * solo ofrece los tipos de hijo que la logica de negocio permite, de modo que
 * el usuario no puede construir una jerarquia invalida desde aqui (y aun asi el
 * proceso principal la vuelve a comprobar).
 */

import { useState, type ReactNode } from 'react'
import type { Location, LocationKind } from '@shared/types'
import { LOCATION_PARENT_KIND } from '@shared/types'
import { api, AppError } from '../lib/api'
import { useApp } from '../lib/app-context'
import { useAsyncData } from '../lib/hooks'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Select,
  TextInput
} from '../components/ui'
import { IconEdit, IconLocations, IconPlus, IconTag, IconTrash } from '../components/Icons'
import { LabelsModal } from './LabelsModal'

const KIND_ORDER: LocationKind[] = ['warehouse', 'shelf', 'box', 'compartment']

const INDENT: Record<number, string> = {
  0: '',
  1: 'tree__row--child',
  2: 'tree__row--grandchild',
  3: 'tree__row--great'
}

export function LocationsPage(): ReactNode {
  const { t, notify, dataVersion } = useApp()
  const locations = useAsyncData(() => api.locations.list(), [dataVersion])

  const [dialog, setDialog] = useState<
    | { mode: 'create'; kind: LocationKind; parentId: string | null }
    | { mode: 'edit'; location: Location }
    | { mode: 'move'; location: Location }
    | null
  >(null)
  const [deleting, setDeleting] = useState<Location | null>(null)
  const [labelTarget, setLabelTarget] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [busy, setBusy] = useState(false)

  const all = locations.data ?? []
  const roots = all.filter((location) => location.parentId === null)

  const openCreate = (kind: LocationKind, parent: Location | null): void => {
    setDialog({ mode: 'create', kind, parentId: parent?.id ?? null })
    setCode('')
    setName('')
    setParentId(parent?.id ?? '')
  }

  const openEdit = (location: Location): void => {
    setDialog({ mode: 'edit', location })
    setCode(location.code)
    setName(location.name)
  }

  const openMove = (location: Location): void => {
    setDialog({ mode: 'move', location })
    setParentId(location.parentId ?? '')
  }

  /** Padres validos para un tipo dado (excluyendo el propio subarbol). */
  const validParents = (kind: LocationKind, excludeId: string | null): Location[] => {
    const expected = LOCATION_PARENT_KIND[kind]
    if (expected === null) return []
    return all.filter((location) => {
      if (location.kind !== expected) return false
      if (!excludeId) return true
      if (location.id === excludeId) return false
      return !location.path.startsWith(pathOf(excludeId) + '-')
    })
  }

  const pathOf = (id: string): string => all.find((location) => location.id === id)?.path ?? ''

  const submit = async (): Promise<void> => {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.mode === 'create') {
        await api.locations.create({
          kind: dialog.kind,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          parentId: dialog.parentId
        })
      } else if (dialog.mode === 'edit') {
        await api.locations.update(dialog.location.id, {
          code: code.trim().toUpperCase(),
          name: name.trim()
        })
      } else {
        await api.locations.move(dialog.location.id, parentId || null)
      }
      setDialog(null)
      locations.reload()
    } catch (error) {
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await api.locations.remove(deleting.id)
      setDeleting(null)
      locations.reload()
    } catch (error) {
      notify(
        error instanceof AppError
          ? t(`errors.${error.code}` as 'errors.internal_error', error.params ?? {})
          : t('errors.internal_error', { id: '-' }),
        'error'
      )
      setDeleting(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1 className="page-title">{t('locations.title')}</h1>
          <p className="page-subtitle">{t('locations.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <span className="faint mono">{t('locations.hierarchyHint')}</span>
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => openCreate('warehouse', null)}>
            {t('locations.newRoot')}
          </Button>
        </div>
      </header>

      <Card flush>
        {roots.length === 0 ? (
          <EmptyState
            icon={<IconLocations size={26} />}
            title={t('locations.emptyTitle')}
            message={t('locations.emptyMessage')}
            action={
              <Button variant="primary" onClick={() => openCreate('warehouse', null)}>
                {t('locations.new')}
              </Button>
            }
          />
        ) : (
          <div className="tree">
            {all.map((location) => {
              const childKind = KIND_ORDER[KIND_ORDER.indexOf(location.kind) + 1]
              return (
                <div key={location.id} className={`tree__row ${INDENT[location.depth] ?? ''}`}>
                  <span className="badge badge--muted">{t(`locationKind.${location.kind}`)}</span>
                  <span className="tree__name">{location.name}</span>
                  <span className="tree__meta mono" style={{ color: 'var(--accent)' }}>
                    {location.path}
                  </span>
                  <span className="badge">{t('locations.products', { count: location.productCount })}</span>
                  <span className="tree__actions">
                    {childKind ? (
                      <IconButton
                        label={t('locations.newChild', { path: location.path })}
                        onClick={() => openCreate(childKind, location)}
                      >
                        <IconPlus size={14} />
                      </IconButton>
                    ) : null}
                    <IconButton label={t('common.edit')} onClick={() => openEdit(location)}>
                      <IconEdit size={14} />
                    </IconButton>
                    <IconButton label={t('locations.moveTo')} onClick={() => openMove(location)}>
                      <IconLocations size={14} />
                    </IconButton>
                    <IconButton label={t('labels.title')} onClick={() => setLabelTarget(location.id)}>
                      <IconTag size={14} />
                    </IconButton>
                    <IconButton label={t('common.delete')} onClick={() => setDeleting(location)}>
                      <IconTrash size={14} />
                    </IconButton>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {dialog ? (
        <Modal
          title={
            dialog.mode === 'create'
              ? t('locations.new')
              : dialog.mode === 'edit'
                ? t('common.edit')
                : t('locations.moveTo')
          }
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => void submit()}
                disabled={
                  busy ||
                  (dialog.mode === 'create' && (!code.trim() || !name.trim())) ||
                  (dialog.mode === 'edit' && (!code.trim() || !name.trim()))
                }
              >
                {t('common.saveChanges')}
              </Button>
            </>
          }
        >
          <div className="stack">
            {dialog.mode === 'create' ? (
              <div className="notice notice--accent">
                {t(`locationKind.${dialog.kind}`)}
                {dialog.parentId ? ` · ${pathOf(dialog.parentId)}` : ''}
              </div>
            ) : null}

            {dialog.mode !== 'move' ? (
              <>
                <Field label={t('locations.code')} hint={t('locations.codeHint')}>
                  <TextInput
                    value={code}
                    onChange={(value) => setCode(value.toUpperCase())}
                    mono
                    maxLength={24}
                  />
                </Field>
                <Field label={t('common.name')}>
                  <TextInput value={name} onChange={setName} />
                </Field>
              </>
            ) : null}

            {dialog.mode === 'move' ? (
              <Field label={t('locations.parent')}>
                <Select value={parentId} onChange={setParentId}>
                  <option value="">{t('common.none')}</option>
                  {validParents(dialog.location.kind, dialog.location.id).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.path}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {labelTarget ? (
        <LabelsModal target="location" ids={[labelTarget]} onClose={() => setLabelTarget(null)} />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={t('common.danger')}
          tone="danger"
          message={t('locations.confirmDelete', { path: deleting.path })}
          confirmLabel={t('common.delete')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}
