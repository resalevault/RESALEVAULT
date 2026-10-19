/**
 * RESALEVAULT - Repositorio de categorias (jerarquia de dos o mas niveles).
 *
 * Reglas aplicadas:
 *  - El slug es unico entre hermanas (indice UNIQUE en la base de datos).
 *  - Una categoria no puede ser su propia ancestra (se comprueba antes de mover).
 *  - No se elimina una categoria con subcategorias ni con articulos asignados:
 *    devolvemos un error explicito en lugar de reasignar datos en silencio.
 */

import type { Category } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import { newId, nowIso, slugify, toNumber, toStringValue } from '../support'

interface CategoryRow {
  id: string
  parent_id: string | null
  name: string
  slug: string
  sort_order: number
  created_at: string
  updated_at: string
  product_count: number
}

const SELECT_BASE = `
  SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
  FROM categories c
`

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    sortOrder: toNumber(row.sort_order),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
    productCount: toNumber(row.product_count)
  }
}

export class CategoryRepository {
  constructor(private readonly db: Database) {}

  list(): Category[] {
    return this.db
      .all<CategoryRow>(`${SELECT_BASE} ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`)
      .map(mapCategory)
  }

  findById(id: string): Category | null {
    const row = this.db.get<CategoryRow>(`${SELECT_BASE} WHERE c.id = $id`, { $id: id })
    return row ? mapCategory(row) : null
  }

  create(input: { name: string; parentId?: string | null }): Category {
    const name = input.name.trim()
    if (!name) throw appError('invalid_input', { field: 'name' })

    const parentId = input.parentId ?? null
    if (parentId) {
      const parent = this.findById(parentId)
      if (!parent) throw appError('not_found', { entity: 'category' })
    }

    const slug = slugify(name)
    if (this.slugTaken(slug, parentId, null)) {
      throw appError('category_duplicate', { name })
    }

    const id = newId()
    const at = nowIso()
    const sortOrder = toNumber(
      this.db.scalar<number>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS v FROM categories WHERE COALESCE(parent_id, $empty) = COALESCE($parent, $empty)', {
        $parent: parentId,
        $empty: ''
      })
    )

    this.db.run(
      `INSERT INTO categories (id, parent_id, name, slug, sort_order, created_at, updated_at)
       VALUES ($id, $parent, $name, $slug, $sort, $at, $at)`,
      { $id: id, $parent: parentId, $name: name, $slug: slug, $sort: sortOrder, $at: at }
    )

    logActivity(this.db, {
      entity: 'category',
      entityId: id,
      action: 'created',
      summary: `Categoria creada: ${name}`
    })

    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'category_not_persisted' })
    return created
  }

  update(id: string, patch: { name?: string; parentId?: string | null; sortOrder?: number }): Category {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'category' })

    const nextName = patch.name?.trim() ?? current.name
    if (!nextName) throw appError('invalid_input', { field: 'name' })
    const nextParent = patch.parentId === undefined ? current.parentId : patch.parentId
    const nextSort = patch.sortOrder ?? current.sortOrder

    if (nextParent === id) {
      throw appError('invalid_location_hierarchy', { reason: 'self_parent' })
    }

    if (nextParent && nextParent !== current.parentId) {
      const parent = this.findById(nextParent)
      if (!parent) throw appError('not_found', { entity: 'category' })
      if (this.isDescendant(nextParent, id)) {
        throw appError('invalid_location_hierarchy', { reason: 'cycle' })
      }
    }

    const nextSlug = nextName === current.name ? current.slug : slugify(nextName)
    if (this.slugTaken(nextSlug, nextParent, id)) {
      throw appError('category_duplicate', { name: nextName })
    }

    this.db.run(
      `UPDATE categories
       SET name = $name, slug = $slug, parent_id = $parent, sort_order = $sort, updated_at = $at
       WHERE id = $id`,
      { $id: id, $name: nextName, $slug: nextSlug, $parent: nextParent, $sort: nextSort, $at: nowIso() }
    )

    logActivity(this.db, {
      entity: 'category',
      entityId: id,
      action: 'updated',
      summary: `Categoria actualizada: ${nextName}`
    })

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'category_not_persisted' })
    return updated
  }

  remove(id: string): { affected: number } {
    const category = this.findById(id)
    if (!category) throw appError('not_found', { entity: 'category' })

    const children = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM categories WHERE parent_id = $id', { $id: id })
    )
    if (children > 0) throw appError('cannot_delete_has_children', { count: children, entity: 'category' })

    if (category.productCount > 0) {
      throw appError('cannot_delete_in_use', { count: category.productCount, entity: 'category' })
    }

    this.db.run('DELETE FROM categories WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'category',
      entityId: id,
      action: 'deleted',
      summary: `Categoria eliminada: ${category.name}`
    })
    return { affected: 1 }
  }

  /** Numero de articulos que quedarian sin categoria si se borrase (para avisos en la interfaz). */
  countProductsInSubtree(id: string): number {
    return toNumber(
      this.db.scalar<number>(
        `WITH RECURSIVE tree(id) AS (
           SELECT id FROM categories WHERE id = $id
           UNION ALL
           SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
         )
         SELECT COUNT(*) AS v FROM products WHERE category_id IN (SELECT id FROM tree)`,
        { $id: id }
      )
    )
  }

  private slugTaken(slug: string, parentId: string | null, exceptId: string | null): boolean {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM categories
       WHERE slug = $slug
         AND COALESCE(parent_id, '') = COALESCE($parent, '')
         AND ($except IS NULL OR id <> $except)`,
      { $slug: slug, $parent: parentId, $except: exceptId }
    )
    return toNumber(row?.n) > 0
  }

  private isDescendant(candidateChildId: string, ancestorId: string): boolean {
    const found = this.db.scalar<number>(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM categories WHERE parent_id = $ancestor
         UNION ALL
         SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
       )
       SELECT COUNT(*) AS v FROM tree WHERE id = $child`,
      { $ancestor: ancestorId, $child: candidateChildId }
    )
    return toNumber(found) > 0
  }
}
