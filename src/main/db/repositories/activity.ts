/**
 * RESALEVAULT - Registro de actividad global.
 *
 * Cada operacion relevante deja una traza. Se guarda un resumen legible en el
 * idioma del momento en que ocurrio (por eso el texto se congela aqui) mas los
 * datos estructurados necesarios. Esto permite mostrar "actividad reciente"
 * sin reconstruir el significado de cada accion.
 */

import type { Database } from '../database'
import { ACTOR_USER_ID, newId, nowIso } from '../support'
import type { ActivityEntry } from '@shared/types'

export interface ActivityInput {
  entity: string
  entityId?: string | null
  action: string
  summary: string
  details?: unknown
}

export function logActivity(db: Database, input: ActivityInput): void {
  db.run(
    `INSERT INTO activity_log (id, at, entity, entity_id, action, summary, details, user_id)
     VALUES ($id, $at, $entity, $entityId, $action, $summary, $details, $user)`,
    {
      $id: newId(),
      $at: nowIso(),
      $entity: input.entity,
      $entityId: input.entityId ?? null,
      $action: input.action,
      $summary: input.summary,
      $details: input.details === undefined ? null : JSON.stringify(input.details),
      $user: ACTOR_USER_ID
    }
  )
}

export function listRecentActivity(db: Database, limit = 12): ActivityEntry[] {
  return db
    .all<{
      id: string
      at: string
      entity: string
      entity_id: string | null
      action: string
      summary: string
    }>(
      `SELECT id, at, entity, entity_id, action, summary
       FROM activity_log
       ORDER BY at DESC
       LIMIT $limit`,
      { $limit: Math.max(1, Math.min(200, limit)) }
    )
    .map((row) => ({
      id: row.id,
      at: row.at,
      entity: row.entity,
      entityId: row.entity_id,
      action: row.action,
      summary: row.summary
    }))
}

export function trimActivityLog(db: Database, keep = 5000): number {
  const result = db.run(
    `DELETE FROM activity_log
     WHERE id NOT IN (SELECT id FROM activity_log ORDER BY at DESC LIMIT $keep)`,
    { $keep: keep }
  )
  return result.changes
}
