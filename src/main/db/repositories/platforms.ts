/**
 * RESALEVAULT - Repositorio de plataformas de venta.
 *
 * Las plataformas son datos configurables, no codigo: el usuario puede anadir
 * mercadillos, grupos de WhatsApp o su propia web. Las integraciones reales con
 * cada marketplace llegaran como conectores autorizados (Fase 7); por ahora el
 * registro de anuncios es manual y explicito.
 */

import type { Platform } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { newId, nowIso, toBoolean, toNumber, toStringValue } from '../support'

interface PlatformRow {
  id: string
  code: string
  name: string
  sort_order: number
  active: number
  is_builtin: number
}

function mapPlatform(row: PlatformRow): Platform {
  return {
    id: row.id,
    code: toStringValue(row.code),
    name: toStringValue(row.name),
    sortOrder: toNumber(row.sort_order),
    active: toBoolean(row.active),
    isBuiltin: toBoolean(row.is_builtin)
  }
}

export class PlatformRepository {
  constructor(private readonly db: Database) {}

  list(includeInactive = true): Platform[] {
    const where = includeInactive ? '' : 'WHERE p.active = 1'
    return this.db
      .all<PlatformRow>(
        `SELECT p.id, p.code, p.name, p.sort_order, p.active, p.is_builtin
         FROM platforms p ${where}
         ORDER BY p.sort_order ASC, p.name COLLATE NOCASE ASC`
      )
      .map(mapPlatform)
  }

  findById(id: string): Platform | null {
    const row = this.db.get<PlatformRow>(
      'SELECT id, code, name, sort_order, active, is_builtin FROM platforms WHERE id = $id',
      { $id: id }
    )
    return row ? mapPlatform(row) : null
  }

  create(input: { code: string; name: string }): Platform {
    const code = input.code.trim().toLowerCase()
    const name = input.name.trim()
    if (!code) throw appError('invalid_input', { field: 'code' })
    if (!name) throw appError('invalid_input', { field: 'name' })

    const duplicate = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM platforms WHERE code = $code COLLATE NOCASE', {
        $code: code
      })
    )
    if (duplicate > 0) throw appError('conflict', { entity: 'platform', code })

    const id = newId()
    const at = nowIso()
    const sortOrder = toNumber(
      this.db.scalar<number>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS v FROM platforms')
    )

    this.db.run(
      `INSERT INTO platforms (id, code, name, sort_order, active, is_builtin, created_at, updated_at)
       VALUES ($id, $code, $name, $sort, 1, 0, $at, $at)`,
      { $id: id, $code: code, $name: name, $sort: sortOrder, $at: at }
    )

    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'platform_not_persisted' })
    return created
  }

  update(id: string, patch: { name?: string; active?: boolean; sortOrder?: number }): Platform {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'platform' })

    const nextName = patch.name?.trim() ?? current.name
    if (!nextName) throw appError('invalid_input', { field: 'name' })

    this.db.run(
      `UPDATE platforms SET name = $name, active = $active, sort_order = $sort, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $name: nextName,
        $active: (patch.active ?? current.active) ? 1 : 0,
        $sort: patch.sortOrder ?? current.sortOrder,
        $at: nowIso()
      }
    )

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'platform_not_persisted' })
    return updated
  }

  /** Numero de anuncios registrados en una plataforma (para borrados seguros). */
  listingCount(id: string): number {
    return toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM product_listings WHERE platform_id = $id', {
        $id: id
      })
    )
  }
}
