/**
 * RESALEVAULT - Gestion de categorias.
 *
 * Arbol de dos niveles con contadores reales de articulos. Los borrados que la
 * logica de negocio rechaza (tiene hijos / tiene articulos) se explican con
 * mensajes concretos en lugar de fallar de forma generica.
 */

import { useState, type ReactNode } from 'react'
import type { Category } from '@shared/types'
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
import { IconCategories, IconEdit, IconPlus, IconTrash } from '../components/Icons'

export function CategoriesPage(): ReactNode {
  const { t, notify, dataVersion } = useApp()
  const categories = useAsyncData(() => api.categories.list(), [dataVersion])

  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [busy, setBusy] = useState(false)

  const all = categories.data ?? []
  const roots = all.filter((category) => category.parentId === null)

  const openCreate = (parent: string | null): void => {
    setCreating({ parentId: parent })
    setName('')
    setParentId(parent ?? '')
  }

  const openEdit = (category: Category): void => {
    setEditing(category)
    setName(category.name)
    setParentId(category.parentId ?? '')
  }

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      if (editing) {
        await api.categories.update(editing.id, { name: trimmed, parentId: parentId || null })
      } else {
        await api.categories.create({ name: trimmed, parentId: parentId || null })
      }
      setCreating(null)
      setEditing(null)
      categories.reload()
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
      await api.categories.remove(deleting.id)
      setDeleting(null)
      categories.reload()
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
          <h1 className="page-title">{t('categories.title')}</h1>
          <p className="page-subtitle">{t('categories.subtitle')}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="primary" icon={<IconPlus size={14} />} onClick={() => openCreate(null)}>
            {t('categories.newRoot')}
          </Button>
        </div>
      </header>

      <Card flush>
        {roots.length === 0 ? (
          <EmptyState
            icon={<IconCategories size={26} />}
            title={t('categories.emptyTitle')}
            message={t('categories.emptyMessage')}
            action={
              <Button variant="primary" onClick={() => openCreate(null)}>
                {t('categories.new')}
              </Button>
            }
          />
        ) : (
          <div className="tree">
            {roots.map((root) => {
              const children = all.filter((category) => category.parentId === root.id)
              return (
                <div key={root.id}>
                  <Row
                    category={root}
                    indent=""
                    onAddChild={() => openCreate(root.id)}
                    onEdit={() => openEdit(root)}
                    onDelete={() => setDeleting(root)}
                    t={t}
                  />
                  {children.map((child) => (
                    <Row
                      key={child.id}
                      category={child}
                      indent="tree__row--child"
                      onAddChild={() => openCreate(child.id)}
                      onEdit={() => openEdit(child)}
                      onDelete={() => setDeleting(child)}
                      t={t}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {creating || editing ? (
        <Modal
          title={editing ? t('common.edit') : t('categories.new')}
          onClose={() => {
            setCreating(null)
            setEditing(null)
          }}
          footer={
            <>
              <Button
                onClick={() => {
                  setCreating(null)
                  setEditing(null)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
                {editing ? t('common.saveChanges') : t('common.create')}
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label={t('common.name')}>
              <TextInput value={name} onChange={setName} />
            </Field>
            <Field label={t('categories.parent')}>
              <Select value={parentId} onChange={setParentId}>
                <option value="">{t('categories.parentNone')}</option>
                {roots
                  .filter((category) => category.id !== editing?.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={t('common.danger')}
          tone="danger"
          message={t('categories.confirmDelete', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}

function Row({
  category,
  indent,
  onAddChild,
  onEdit,
  onDelete,
  t
}: {
  category: Category
  indent: string
  onAddChild: () => void
  onEdit: () => void
  onDelete: () => void
  t: ReturnType<typeof useApp>['t']
}): ReactNode {
  return (
    <div className={`tree__row ${indent}`}>
      <span className="tree__name">{category.name}</span>
      <span className="tree__meta mono">{category.slug}</span>
      <span className="badge badge--muted">{t('categories.products', { count: category.productCount })}</span>
      <span className="tree__actions">
        <IconButton label={t('categories.newChild', { parent: category.name })} onClick={onAddChild}>
          <IconPlus size={14} />
        </IconButton>
        <IconButton label={t('common.edit')} onClick={onEdit}>
          <IconEdit size={14} />
        </IconButton>
        <IconButton label={t('common.delete')} onClick={onDelete}>
          <IconTrash size={14} />
        </IconButton>
      </span>
    </div>
  )
}
