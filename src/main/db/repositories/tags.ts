/**
 * RESALEVAULT - Repositorio de etiquetas.
 *
 * Las etiquetas son transversales (no jerarquicas) y sirven para agrupar
 * articulos con criterios libres: "lote-nike", "rebajas", "pendiente-fotos".
 */

import type { Tag } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import { newId, nowIso, toNumber, toStringValue } from '../support'

interface TagRow {
  id: string
  name: string
  color: string
  product_count: number
}

const SELECT_BASE = `
  SELECT t.id, t.name, t.color,
         (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) AS product_count
  FROM tags t
`

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: toStringValue(row.name),
    color: toStringValue(row.color),
    productCount: toNumber(row.product_count)
  }
}

export class TagRepository {
  constructor(private readonly db: Database) {}

  list(): Tag[] {
    return this.db.all<TagRow>(`${SELECT_BASE} ORDER BY t.name COLLATE NOCASE ASC`).map(mapTag)
  }

  /** Busca por nombre (sin distinguir mayusculas) o la crea si no existe. */
  ensure(name: string, color = ''): Tag {
    const trimmed = name.trim()
    if (!trimmed) throw appError('invalid_input', { field: 'name' })

    const existing = this.db.get<TagRow>(`${SELECT_BASE} WHERE t.name = $name COLLATE NOCASE`, {
      $name: trimmed
    })
    if (existing) return mapTag(existing)

    return this.create({ name: trimmed, color })
  }

  create(input: { name: string; color?: string }): Tag {
    const name = input.name.trim()
    if (!name) throw appError('invalid_input', { field: 'name' })

    const duplicate = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM tags WHERE name = $name COLLATE NOCASE', {
        $name: name
      })
    )
    if (duplicate > 0) throw appError('conflict', { entity: 'tag', name })

    const id = newId()
    this.db.run('INSERT INTO tags (id, name, color, created_at) VALUES ($id, $name, $color, $at)', {
      $id: id,
      $name: name,
      $color: input.color ?? '',
      $at: nowIso()
    })

    const created = this.db.get<TagRow>(`${SELECT_BASE} WHERE t.id = $id`, { $id: id })
    if (!created) throw appError('db_error', { detail: 'tag_not_persisted' })
    return mapTag(created)
  }

  remove(id: string): { affected: number } {
    const row = this.db.get<TagRow>(`${SELECT_BASE} WHERE t.id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'tag' })

    // Quitar una etiqueta desasocia articulos, no los borra: es la semantica
    // esperada en una etiqueta. Se informa del numero de articulos afectados.
    const affected = toNumber(row.product_count)
    this.db.transaction(() => {
      this.db.run('DELETE FROM product_tags WHERE tag_id = $id', { $id: id })
      this.db.run('DELETE FROM tags WHERE id = $id', { $id: id })
    })

    logActivity(this.db, {
      entity: 'tag',
      entityId: id,
      action: 'deleted',
      summary: `Etiqueta eliminada: ${row.name}`
    })

    return { affected }
  }

  /** Asigna etiquetas a un articulo, deduplicando y validando existencia. */
  setTagsForProduct(productId: string, tagIds: readonly string[]): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM product_tags WHERE product_id = $product', { $product: productId })
      const unique = [...new Set(tagIds)]
      for (const tagId of unique) {
        const exists = toNumber(
          this.db.scalar<number>('SELECT COUNT(*) AS v FROM tags WHERE id = $id', { $id: tagId })
        )
        if (exists === 0) continue
        this.db.run(
          'INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES ($product, $tag)',
          { $product: productId, $tag: tagId }
        )
      }
    })
  }

  addTagsToProducts(productIds: readonly string[], tagIds: readonly string[]): number {
    let inserted = 0
    this.db.transaction(() => {
      for (const productId of productIds) {
        for (const tagId of tagIds) {
          const result = this.db.run(
            'INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES ($product, $tag)',
            { $product: productId, $tag: tagId }
          )
          inserted += result.changes
        }
      }
    })
    return inserted
  }

  removeTagsFromProducts(productIds: readonly string[], tagIds: readonly string[]): number {
    let removed = 0
    this.db.transaction(() => {
      for (const productId of productIds) {
        for (const tagId of tagIds) {
          const result = this.db.run(
            'DELETE FROM product_tags WHERE product_id = $product AND tag_id = $tag',
            { $product: productId, $tag: tagId }
          )
          removed += result.changes
        }
      }
    })
    return removed
  }
}
