/**
 * RESALEVAULT - Repositorio de definiciones de atributos personalizados.
 *
 * Permite que cada revendedor defina sus propios campos (temporada, material,
 * numero de edicion...). Los valores se guardan en `products.attributes` como
 * JSON. Las opciones de un atributo de tipo `select` se almacenan serializadas.
 */

import type { AttributeDefinition, AttributeType } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { newId, nowIso, toNumber, toStringValue } from '../support'

interface AttributeRow {
  id: string
  key: string
  name: string
  type: string
  options: string
  sort_order: number
}

function parseOptions(raw: unknown): string[] {
  const text = toStringValue(raw, '[]')
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
    return []
  } catch {
    return []
  }
}

function mapAttribute(row: AttributeRow): AttributeDefinition {
  return {
    id: row.id,
    key: toStringValue(row.key),
    name: toStringValue(row.name),
    type: row.type as AttributeType,
    options: parseOptions(row.options),
    sortOrder: toNumber(row.sort_order)
  }
}

const SELECT_BASE = 'SELECT id, key, name, type, options, sort_order FROM attributes'

export class AttributeRepository {
  constructor(private readonly db: Database) {}

  list(): AttributeDefinition[] {
    return this.db
      .all<AttributeRow>(`${SELECT_BASE} ORDER BY sort_order ASC, name COLLATE NOCASE ASC`)
      .map(mapAttribute)
  }

  findById(id: string): AttributeDefinition | null {
    const row = this.db.get<AttributeRow>(`${SELECT_BASE} WHERE id = $id`, { $id: id })
    return row ? mapAttribute(row) : null
  }

  create(input: { key: string; name: string; type: AttributeType; options?: string[] }): AttributeDefinition {
    const key = input.key.trim().toLowerCase()
    const name = input.name.trim()
    if (!key) throw appError('invalid_input', { field: 'key' })
    if (!name) throw appError('invalid_input', { field: 'name' })
    if (input.type === 'select' && (input.options?.length ?? 0) === 0) {
      throw appError('invalid_input', { field: 'options' })
    }

    const duplicate = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM attributes WHERE key = $key COLLATE NOCASE', {
        $key: key
      })
    )
    if (duplicate > 0) throw appError('conflict', { entity: 'attribute', key })

    const id = newId()
    const at = nowIso()
    const sortOrder = toNumber(
      this.db.scalar<number>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS v FROM attributes')
    )

    this.db.run(
      `INSERT INTO attributes (id, key, name, type, options, sort_order, created_at, updated_at)
       VALUES ($id, $key, $name, $type, $options, $sort, $at, $at)`,
      {
        $id: id,
        $key: key,
        $name: name,
        $type: input.type,
        $options: JSON.stringify(input.options ?? []),
        $sort: sortOrder,
        $at: at
      }
    )

    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'attribute_not_persisted' })
    return created
  }

  update(
    id: string,
    patch: Partial<Pick<AttributeDefinition, 'name' | 'type' | 'options' | 'sortOrder'>>
  ): AttributeDefinition {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'attribute' })

    const nextType = patch.type ?? current.type
    const nextOptions = patch.options ?? current.options
    if (nextType === 'select' && nextOptions.length === 0) {
      throw appError('invalid_input', { field: 'options' })
    }

    this.db.run(
      `UPDATE attributes SET name = $name, type = $type, options = $options, sort_order = $sort, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $name: patch.name?.trim() ?? current.name,
        $type: nextType,
        $options: JSON.stringify(nextOptions),
        $sort: patch.sortOrder ?? current.sortOrder,
        $at: nowIso()
      }
    )

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'attribute_not_persisted' })
    return updated
  }

  remove(id: string): { affected: number } {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'attribute' })

    this.db.run('DELETE FROM attributes WHERE id = $id', { $id: id })
    // Los valores ya guardados en los articulos NO se borran: la definicion
    // desaparece del formulario, pero se conserva el dato historico.
    return { affected: 1 }
  }
}
