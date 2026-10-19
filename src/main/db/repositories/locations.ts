/**
 * RESALEVAULT - Repositorio de ubicaciones fisicas.
 *
 * Jerarquia estricta: Almacen > Estanteria > Caja > Compartimento.
 *  - `code` es el fragmento corto (ALM01, EST03...).
 *  - `path` es la ruta completa derivada (ALM01-EST03-CAJA12) y es unica.
 *  - Al renombrar o mover un nodo se recalculan las rutas de TODO su subarbol
 *    dentro de una transaccion, de modo que nunca queda una ruta desfasada.
 */

import type { Location, LocationKind } from '@shared/types'
import { LOCATION_PARENT_KIND } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import { newId, nowIso, toNumber, toStringValue } from '../support'

interface LocationRow {
  id: string
  parent_id: string | null
  kind: string
  code: string
  name: string
  path: string
  depth: number
  sort_order: number
  created_at: string
  updated_at: string
  product_count: number
}

const SELECT_BASE = `
  SELECT l.id, l.parent_id, l.kind, l.code, l.name, l.path, l.depth, l.sort_order,
         l.created_at, l.updated_at,
         (SELECT COUNT(*) FROM products p WHERE p.location_id = l.id) AS product_count
  FROM locations l
`

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind as LocationKind,
    code: toStringValue(row.code),
    name: toStringValue(row.name),
    path: toStringValue(row.path),
    depth: toNumber(row.depth),
    sortOrder: toNumber(row.sort_order),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
    productCount: toNumber(row.product_count)
  }
}

export class LocationRepository {
  constructor(private readonly db: Database) {}

  list(): Location[] {
    return this.db
      .all<LocationRow>(
        `${SELECT_BASE} ORDER BY l.depth ASC, l.path COLLATE NOCASE ASC, l.sort_order ASC`
      )
      .map(mapLocation)
  }

  findById(id: string): Location | null {
    const row = this.db.get<LocationRow>(`${SELECT_BASE} WHERE l.id = $id`, { $id: id })
    return row ? mapLocation(row) : null
  }

  create(input: { kind: LocationKind; code: string; name: string; parentId?: string | null }): Location {
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()
    if (!code) throw appError('invalid_input', { field: 'code' })
    if (!name) throw appError('invalid_input', { field: 'name' })

    const parentId = input.parentId ?? null
    const parent = parentId ? this.findById(parentId) : null
    if (parentId && !parent) throw appError('not_found', { entity: 'location' })

    this.assertHierarchy(input.kind, parent)

    if (this.codeTaken(code, null)) {
      throw appError('location_code_duplicate', { code })
    }

    const id = newId()
    const at = nowIso()
    const path = parent ? `${parent.path}-${code}` : code
    const depth = parent ? parent.depth + 1 : 0
    const sortOrder = toNumber(
      this.db.scalar<number>(
        'SELECT COALESCE(MAX(sort_order), 0) + 10 AS v FROM locations WHERE COALESCE(parent_id, $empty) = COALESCE($parent, $empty)',
        { $parent: parentId, $empty: '' }
      )
    )

    this.db.transaction(() => {
      if (this.pathTaken(path, null)) throw appError('location_path_duplicate', { path })
      this.db.run(
        `INSERT INTO locations (id, parent_id, kind, code, name, path, depth, sort_order, created_at, updated_at)
         VALUES ($id, $parent, $kind, $code, $name, $path, $depth, $sort, $at, $at)`,
        {
          $id: id,
          $parent: parentId,
          $kind: input.kind,
          $code: code,
          $name: name,
          $path: path,
          $depth: depth,
          $sort: sortOrder,
          $at: at
        }
      )
      logActivity(this.db, {
        entity: 'location',
        entityId: id,
        action: 'created',
        summary: `Ubicacion creada: ${path}`
      })
    })

    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'location_not_persisted' })
    return created
  }

  update(id: string, patch: { code?: string; name?: string; sortOrder?: number }): Location {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'location' })

    const nextCode = patch.code ? patch.code.trim().toUpperCase() : current.code
    const nextName = patch.name?.trim() ?? current.name
    if (!nextCode) throw appError('invalid_input', { field: 'code' })
    if (!nextName) throw appError('invalid_input', { field: 'name' })

    if (nextCode !== current.code && this.codeTaken(nextCode, id)) {
      throw appError('location_code_duplicate', { code: nextCode })
    }

    const codeChanged = nextCode !== current.code

    this.db.transaction(() => {
      this.db.run(
        `UPDATE locations SET code = $code, name = $name, sort_order = $sort, updated_at = $at
         WHERE id = $id`,
        { $id: id, $code: nextCode, $name: nextName, $sort: patch.sortOrder ?? current.sortOrder, $at: nowIso() }
      )
      if (codeChanged) this.recomputeSubtreePaths(id)
      logActivity(this.db, {
        entity: 'location',
        entityId: id,
        action: 'updated',
        summary: `Ubicacion actualizada: ${nextName}`
      })
    })

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'location_not_persisted' })
    return updated
  }

  /** Mueve un nodo (y su subarbol) bajo otro padre, validando la jerarquia. */
  move(id: string, newParentId: string | null): Location {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'location' })

    if (newParentId === id) throw appError('invalid_location_hierarchy', { reason: 'self_parent' })

    const parent = newParentId ? this.findById(newParentId) : null
    if (newParentId && !parent) throw appError('not_found', { entity: 'location' })

    this.assertHierarchy(current.kind, parent)

    if (newParentId && this.isDescendant(newParentId, id)) {
      throw appError('invalid_location_hierarchy', { reason: 'cycle' })
    }

    this.db.transaction(() => {
      this.db.run(
        'UPDATE locations SET parent_id = $parent, depth = $depth, updated_at = $at WHERE id = $id',
        { $id: id, $parent: newParentId, $depth: parent ? parent.depth + 1 : 0, $at: nowIso() }
      )
      this.recomputeSubtreePaths(id)
      logActivity(this.db, {
        entity: 'location',
        entityId: id,
        action: 'moved',
        summary: `Ubicacion movida: ${current.code}`
      })
    })

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'location_not_persisted' })
    return updated
  }

  remove(id: string): { affected: number } {
    const location = this.findById(id)
    if (!location) throw appError('not_found', { entity: 'location' })

    const children = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM locations WHERE parent_id = $id', { $id: id })
    )
    if (children > 0) throw appError('cannot_delete_has_children', { count: children, entity: 'location' })

    if (location.productCount > 0) {
      throw appError('cannot_delete_in_use', { count: location.productCount, entity: 'location' })
    }

    this.db.run('DELETE FROM locations WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'location',
      entityId: id,
      action: 'deleted',
      summary: `Ubicacion eliminada: ${location.path}`
    })
    return { affected: 1 }
  }

  /** Recalcula `path` y `depth` de un nodo y todos sus descendientes. */
  private recomputeSubtreePaths(rootId: string): void {
    const root = this.db.get<{ id: string; parent_id: string | null; code: string; depth: number }>(
      'SELECT id, parent_id, code, depth FROM locations WHERE id = $id',
      { $id: rootId }
    )
    if (!root) return

    const parentPath = root.parent_id
      ? (this.db.scalar<string>('SELECT path FROM locations WHERE id = $id', { $id: root.parent_id }) ?? '')
      : ''
    const rootPath = parentPath ? `${parentPath}-${root.code}` : root.code
    const rootDepth = parentPath ? parentPath.split('-').length : 0

    this.db.run('UPDATE locations SET path = $path, depth = $depth WHERE id = $id', {
      $path: rootPath,
      $depth: rootDepth,
      $id: rootId
    })

    // Recorrido por niveles: se recalculan los hijos a partir del padre ya
    // actualizado, por lo que basta una pasada.
    const queue: Array<{ id: string; path: string; depth: number }> = [
      { id: rootId, path: rootPath, depth: rootDepth }
    ]
    while (queue.length > 0) {
      const node = queue.shift() as { id: string; path: string; depth: number }
      const children = this.db.all<{ id: string; code: string }>(
        'SELECT id, code FROM locations WHERE parent_id = $parent',
        { $parent: node.id }
      )
      for (const child of children) {
        const childPath = `${node.path}-${child.code}`
        const childDepth = node.depth + 1
        this.db.run('UPDATE locations SET path = $path, depth = $depth, updated_at = $at WHERE id = $id', {
          $path: childPath,
          $depth: childDepth,
          $at: nowIso(),
          $id: child.id
        })
        queue.push({ id: child.id, path: childPath, depth: childDepth })
      }
    }
  }

  private assertHierarchy(kind: LocationKind, parent: Location | null): void {
    const expectedParentKind = LOCATION_PARENT_KIND[kind]
    if (expectedParentKind === null) {
      if (parent) throw appError('invalid_location_hierarchy', { reason: 'warehouse_with_parent' })
      return
    }
    if (!parent) {
      throw appError('invalid_location_hierarchy', { reason: 'missing_parent', expected: expectedParentKind })
    }
    if (parent.kind !== expectedParentKind) {
      throw appError('invalid_location_hierarchy', {
        reason: 'wrong_parent_kind',
        expected: expectedParentKind,
        actual: parent.kind
      })
    }
  }

  private codeTaken(code: string, exceptId: string | null): boolean {
    return (
      toNumber(
        this.db.scalar<number>(
          'SELECT COUNT(*) AS v FROM locations WHERE code = $code COLLATE NOCASE AND ($except IS NULL OR id <> $except)',
          { $code: code, $except: exceptId }
        )
      ) > 0
    )
  }

  private pathTaken(path: string, exceptId: string | null): boolean {
    return (
      toNumber(
        this.db.scalar<number>(
          'SELECT COUNT(*) AS v FROM locations WHERE path = $path COLLATE NOCASE AND ($except IS NULL OR id <> $except)',
          { $path: path, $except: exceptId }
        )
      ) > 0
    )
  }

  private isDescendant(candidateChildId: string, ancestorId: string): boolean {
    return (
      toNumber(
        this.db.scalar<number>(
          `WITH RECURSIVE tree(id) AS (
             SELECT id FROM locations WHERE parent_id = $ancestor
             UNION ALL
             SELECT l.id FROM locations l JOIN tree t ON l.parent_id = t.id
           )
           SELECT COUNT(*) AS v FROM tree WHERE id = $child`,
          { $ancestor: ancestorId, $child: candidateChildId }
        )
      ) > 0
    )
  }
}
