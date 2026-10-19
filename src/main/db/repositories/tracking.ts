/**
 * RESALEVAULT - Repositorio de seguimiento de envios.
 *
 * Decisiones:
 *  - El catalogo de transportistas vive en la base de datos y se siembra de
 *    forma IDEMPOTENTE al arrancar (`INSERT OR IGNORE` por id). Asi se pueden
 *    anadir transportistas nuevos en el futuro sin migraciones y **sin pisar**
 *    las correcciones que haya hecho el usuario.
 *  - Un codigo repetido del mismo transportista se DETECTA pero no se bloquea
 *    de forma absoluta: el usuario puede forzarlo. Advertir sin impedir.
 *  - Archivar libera el codigo del indice unico: se puede volver a anadir.
 *  - El estado distingue `manual` de `confirmed`; hoy nada es `confirmed`
 *    porque no hay integraciones de API activas.
 */

import type {
  Carrier,
  CarrierDraft,
  CarrierRegion,
  CarrierStrategy,
  Trackcode,
  TrackcodeDraft,
  TrackcodeQuery,
  TrackcodeStatus,
  TrackingEvent
} from '@shared/types-tracking'
import { CARRIER_SEED } from '@shared/carriers-seed'
import { isSafeTrackingUrl, normalizeTrackingCode, isValidTrackingCode } from '@shared/tracking-url'
import type { Page } from '@shared/types'
import type { Database, SqlParam } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import { inClause, newId, nowIso, toNumber, toNullableString, toStringValue } from '../support'

// ---------------------------------------------------------------------------
// Transportistas
// ---------------------------------------------------------------------------

interface CarrierRow {
  id: string
  name: string
  region: string
  country: string
  track_url: string
  url_template: string
  strategy: string
  verified: number
  integration: string
  notes: string
  enabled: number
  is_custom: number
  sort_order: number
}

const CARRIER_SELECT = `
  SELECT id, name, region, country, track_url, url_template, strategy, verified,
         integration, notes, enabled, is_custom, sort_order
  FROM carriers
`

function mapCarrier(row: CarrierRow): Carrier {
  return {
    id: row.id,
    name: toStringValue(row.name),
    region: row.region as CarrierRegion,
    country: toStringValue(row.country),
    trackUrl: toStringValue(row.track_url),
    urlTemplate: toStringValue(row.url_template),
    strategy: row.strategy as CarrierStrategy,
    verified: toNumber(row.verified) === 1,
    integration: row.integration === 'api' ? 'api' : 'browser',
    notes: toStringValue(row.notes),
    enabled: toNumber(row.enabled) === 1,
    custom: toNumber(row.is_custom) === 1,
    sortOrder: toNumber(row.sort_order)
  }
}

export class TrackingRepository {
  constructor(private readonly db: Database) {}

  /**
   * Inserta los transportistas del catalogo que aun no existan.
   * No modifica los que ya estan: si el usuario corrigio una URL, se respeta.
   */
  ensureSeed(): { inserted: number } {
    let inserted = 0
    this.db.transaction(() => {
      CARRIER_SEED.forEach((seed, index) => {
        const exists = toNumber(
          this.db.scalar<number>('SELECT COUNT(*) AS v FROM carriers WHERE id = $id', { $id: seed.id })
        )
        if (exists > 0) return

        const at = nowIso()
        this.db.run(
          `INSERT INTO carriers (id, name, region, country, track_url, url_template, strategy,
              verified, integration, notes, enabled, is_custom, sort_order, created_at, updated_at)
           VALUES ($id, $name, $region, $country, $trackUrl, $template, $strategy,
              $verified, 'browser', $notes, 1, 0, $sort, $at, $at)`,
          {
            $id: seed.id,
            $name: seed.name,
            $region: seed.region,
            $country: seed.country,
            $trackUrl: seed.trackUrl,
            $template: seed.urlTemplate,
            $strategy: seed.strategy,
            $verified: seed.verified ? 1 : 0,
            $notes: seed.notes ?? '',
            $sort: index * 10,
            $at: at
          }
        )
        inserted += 1
      })
    })

    if (inserted > 0) {
      logActivity(this.db, {
        entity: 'carrier',
        entityId: null,
        action: 'seeded',
        summary: `Catalogo de transportistas actualizado: ${inserted} nuevos`
      })
    }

    return { inserted }
  }

  listCarriers(query: { search?: string; region?: CarrierRegion | 'ALL'; includeDisabled?: boolean } = {}): Carrier[] {
    const clauses: string[] = []
    const params: Record<string, SqlParam> = {}

    if (!query.includeDisabled) clauses.push('enabled = 1')

    if (query.region && query.region !== 'ALL') {
      params.$region = query.region
      clauses.push('region = $region')
    }

    const term = query.search?.trim()
    if (term) {
      params.$q = '%' + term.replace(/[\\%_]/g, (m) => '\\' + m) + '%'
      clauses.push("(name LIKE $q ESCAPE '\\' OR country LIKE $q ESCAPE '\\')")
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.db
      .all<CarrierRow>(
        `${CARRIER_SELECT} ${where} ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
        params
      )
      .map(mapCarrier)
  }

  getCarrier(id: string): Carrier {
    const row = this.db.get<CarrierRow>(`${CARRIER_SELECT} WHERE id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'carrier' })
    return mapCarrier(row)
  }

  createCarrier(draft: CarrierDraft): Carrier {
    const name = draft.name.trim()
    if (!name) throw appError('invalid_input', { field: 'name' })
    if (!isSafeTrackingUrl(draft.trackUrl)) {
      throw appError('invalid_input', { field: 'trackUrl', reason: 'https_required' })
    }
    if (draft.urlTemplate && !isSafeTrackingUrl(draft.urlTemplate.replace(/\{code\}/g, 'X'))) {
      throw appError('invalid_input', { field: 'urlTemplate', reason: 'https_required' })
    }

    const duplicate = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM carriers WHERE name = $name COLLATE NOCASE', {
        $name: name
      })
    )
    if (duplicate > 0) throw appError('conflict', { entity: 'carrier', name })

    const id = draft.id.trim() || newId()
    const at = nowIso()
    const sortOrder = toNumber(
      this.db.scalar<number>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS v FROM carriers')
    )

    this.db.run(
      `INSERT INTO carriers (id, name, region, country, track_url, url_template, strategy,
          verified, integration, notes, enabled, is_custom, sort_order, created_at, updated_at)
       VALUES ($id, $name, $region, $country, $trackUrl, $template, $strategy, 0, 'browser',
          $notes, 1, 1, $sort, $at, $at)`,
      {
        $id: id,
        $name: name,
        $region: draft.region,
        $country: draft.country ?? '',
        $trackUrl: draft.trackUrl,
        $template: draft.urlTemplate ?? '',
        $strategy: draft.strategy ?? (draft.urlTemplate ? 'url' : 'copy'),
        $notes: draft.notes ?? '',
        $sort: sortOrder,
        $at: at
      }
    )

    return this.getCarrier(id)
  }

  updateCarrier(
    id: string,
    patch: Partial<Pick<Carrier, 'name' | 'region' | 'country' | 'trackUrl' | 'urlTemplate' | 'strategy' | 'notes' | 'enabled'>>
  ): Carrier {
    const current = this.getCarrier(id)

    if (patch.trackUrl !== undefined && !isSafeTrackingUrl(patch.trackUrl)) {
      throw appError('invalid_input', { field: 'trackUrl', reason: 'https_required' })
    }
    if (patch.urlTemplate !== undefined && patch.urlTemplate && !isSafeTrackingUrl(patch.urlTemplate.replace(/\{code\}/g, 'X'))) {
      throw appError('invalid_input', { field: 'urlTemplate', reason: 'https_required' })
    }

    const nextName = patch.name?.trim() ?? current.name
    if (!nextName) throw appError('invalid_input', { field: 'name' })

    if (nextName !== current.name) {
      const duplicate = toNumber(
        this.db.scalar<number>(
          'SELECT COUNT(*) AS v FROM carriers WHERE name = $name COLLATE NOCASE AND id <> $id',
          { $name: nextName, $id: id }
        )
      )
      if (duplicate > 0) throw appError('conflict', { entity: 'carrier', name: nextName })
    }

    this.db.run(
      `UPDATE carriers SET name = $name, region = $region, country = $country,
          track_url = $trackUrl, url_template = $template, strategy = $strategy,
          notes = $notes, enabled = $enabled, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $name: nextName,
        $region: patch.region ?? current.region,
        $country: patch.country ?? current.country,
        $trackUrl: patch.trackUrl ?? current.trackUrl,
        $template: patch.urlTemplate ?? current.urlTemplate,
        $strategy: patch.strategy ?? current.strategy,
        $notes: patch.notes ?? current.notes,
        $enabled: (patch.enabled ?? current.enabled) ? 1 : 0,
        $at: nowIso()
      }
    )

    return this.getCarrier(id)
  }

  /** Solo se puede borrar un transportista propio y sin seguimientos. */
  removeCarrier(id: string): { affected: number } {
    const carrier = this.getCarrier(id)
    if (!carrier.custom) throw appError('conflict', { reason: 'builtin_carrier' })

    const used = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM trackcodes WHERE carrier_id = $id', { $id: id })
    )
    if (used > 0) throw appError('cannot_delete_in_use', { count: used, entity: 'carrier' })

    this.db.run('DELETE FROM carriers WHERE id = $id', { $id: id })
    return { affected: 1 }
  }

  // ---------------------------------------------------------------------------
  // Codigos de seguimiento
  // ---------------------------------------------------------------------------

  private trackcodeSelect(): string {
    return `
      SELECT t.id, t.code, t.carrier_id, c.name AS carrier_name, c.region AS carrier_region,
             t.name, t.order_ref, t.order_id, t.purchase_date, t.expected_date,
             t.status, t.status_source, t.last_opened_at, t.last_checked_at, t.notes,
             t.archived_at, t.created_at, t.updated_at,
             (SELECT COUNT(*) FROM tracking_events e WHERE e.trackcode_id = t.id) AS event_count
      FROM trackcodes t
      JOIN carriers c ON c.id = t.carrier_id
    `
  }

  listTrackcodes(query: TrackcodeQuery = {}): Page<Trackcode> {
    const page = Math.max(1, Math.floor(query.page ?? 1))
    const pageSize = Math.max(1, Math.min(200, Math.floor(query.pageSize ?? 100)))

    const clauses: string[] = []
    const params: Record<string, SqlParam> = {}

    if (query.onlyArchived) clauses.push('t.archived_at IS NOT NULL')
    else if (!query.includeArchived) clauses.push('t.archived_at IS NULL')

    const term = query.search?.trim()
    if (term) {
      params.$q = '%' + term.replace(/[\\%_]/g, (m) => '\\' + m) + '%'
      clauses.push(
        `(t.code LIKE $q ESCAPE '\\' OR t.name LIKE $q ESCAPE '\\'
          OR t.order_ref LIKE $q ESCAPE '\\' OR c.name LIKE $q ESCAPE '\\')`
      )
    }
    if (query.carrierIds && query.carrierIds.length > 0) {
      clauses.push(`t.carrier_id IN (${inClause('car', query.carrierIds, params)})`)
    }
    if (query.statuses && query.statuses.length > 0) {
      clauses.push(`t.status IN (${inClause('st', query.statuses, params)})`)
    }
    if (query.from) {
      params.$from = query.from
      clauses.push('t.created_at >= $from')
    }
    if (query.to) {
      params.$to = query.to
      clauses.push('t.created_at <= $to')
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const sortSql: Record<NonNullable<TrackcodeQuery['sort']>, string> = {
      created_desc: 't.created_at DESC',
      created_asc: 't.created_at ASC',
      expected_asc: 't.expected_date IS NULL, t.expected_date ASC',
      code_asc: 't.code COLLATE NOCASE ASC',
      carrier_asc: 'c.name COLLATE NOCASE ASC, t.created_at DESC'
    }
    const sort = query.sort && sortSql[query.sort] ? query.sort : 'created_desc'

    const total = toNumber(
      this.db.scalar<number>(
        `SELECT COUNT(*) AS v FROM trackcodes t JOIN carriers c ON c.id = t.carrier_id ${where}`,
        params
      )
    )

    const rows = this.db.all<Record<string, unknown>>(
      `${this.trackcodeSelect()} ${where} ORDER BY ${sortSql[sort]} LIMIT $limit OFFSET $offset`,
      { ...params, $limit: pageSize, $offset: (page - 1) * pageSize }
    )

    return {
      items: rows.map(mapTrackcode),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    }
  }

  getTrackcode(id: string): Trackcode {
    const row = this.db.get<Record<string, unknown>>(`${this.trackcodeSelect()} WHERE t.id = $id`, {
      $id: id
    })
    if (!row) throw appError('not_found', { entity: 'trackcode' })
    return mapTrackcode(row)
  }

  /**
   * Busca un duplicado activo (mismo codigo y transportista).
   * Se expone para que la interfaz pueda avisar ANTES de guardar.
   */
  findDuplicate(code: string, carrierId: string, exceptId: string | null = null): Trackcode | null {
    const normalized = normalizeTrackingCode(code)
    const row = this.db.get<Record<string, unknown>>(
      `${this.trackcodeSelect()}
       WHERE t.code = $code COLLATE NOCASE AND t.carrier_id = $carrier
         AND t.archived_at IS NULL AND ($except IS NULL OR t.id <> $except)
       LIMIT 1`,
      { $code: normalized, $carrier: carrierId, $except: exceptId }
    )
    return row ? mapTrackcode(row) : null
  }

  /**
   * Crea un codigo. Si ya existe uno ACTIVO con el mismo codigo y transportista
   * se rechaza: fisicamente es el mismo envio, duplicarlo solo genera ruido.
   * El error incluye `existingId` para que la interfaz pueda abrir el existente.
   */
  createTrackcode(draft: TrackcodeDraft): Trackcode {
    const code = normalizeTrackingCode(draft.code)
    if (!isValidTrackingCode(code)) throw appError('invalid_input', { field: 'code' })

    const carrier = this.getCarrier(draft.carrierId)

    const duplicate = this.findDuplicate(code, carrier.id)
    if (duplicate) {
      throw appError('conflict', {
        reason: 'duplicate',
        code: duplicate.code,
        carrier: duplicate.carrierName,
        existingId: duplicate.id
      })
    }

    const id = newId()
    const at = nowIso()
    const status = draft.status ?? 'pending'

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO trackcodes (id, code, carrier_id, name, order_ref, order_id,
            purchase_date, expected_date, status, status_source, notes, archived_at, created_at, updated_at)
         VALUES ($id, $code, $carrier, $name, $orderRef, $orderId,
            $purchaseDate, $expectedDate, $status, $source, $notes, NULL, $at, $at)`,
        {
          $id: id,
          $code: code,
          $carrier: carrier.id,
          $name: draft.name?.trim() ?? '',
          $orderRef: draft.orderRef?.trim() ?? '',
          $orderId: draft.orderId ?? null,
          $purchaseDate: draft.purchaseDate ?? null,
          $expectedDate: draft.expectedDate ?? null,
          $status: status,
          // Si el usuario indica un estado al crear, es manual. Si no, 'none'.
          $source: draft.status ? 'manual' : 'none',
          $notes: draft.notes ?? '',
          $at: at
        }
      )

      logActivity(this.db, {
        entity: 'trackcode',
        entityId: id,
        action: 'created',
        summary: `Seguimiento anadido: ${code} (${carrier.name})`
      })
    })

    return this.getTrackcode(id)
  }

  updateTrackcode(
    id: string,
    patch: Partial<{
      code: string
      carrierId: string
      name: string
      orderRef: string
      orderId: string | null
      purchaseDate: string | null
      expectedDate: string | null
      status: TrackcodeStatus
      notes: string
    }>
  ): Trackcode {
    const current = this.getTrackcode(id)

    const nextCode = patch.code !== undefined ? normalizeTrackingCode(patch.code) : current.code
    if (!isValidTrackingCode(nextCode)) throw appError('invalid_input', { field: 'code' })

    const nextCarrierId = patch.carrierId ?? current.carrierId
    if (nextCarrierId !== current.carrierId) this.getCarrier(nextCarrierId)

    if (nextCode !== current.code || nextCarrierId !== current.carrierId) {
      const duplicate = this.findDuplicate(nextCode, nextCarrierId, id)
      if (duplicate) {
        throw appError('conflict', {
          reason: 'duplicate',
          code: duplicate.code,
          carrier: duplicate.carrierName,
          existingId: duplicate.id
        })
      }
    }

    const status = patch.status ?? current.status
    // Cambiar el estado a mano implica que la fuente pasa a ser manual.
    const source = patch.status !== undefined ? 'manual' : current.statusSource

    this.db.run(
      `UPDATE trackcodes SET code = $code, carrier_id = $carrier, name = $name,
          order_ref = $orderRef, order_id = $orderId, purchase_date = $purchaseDate,
          expected_date = $expectedDate, status = $status, status_source = $source,
          notes = $notes, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $code: nextCode,
        $carrier: nextCarrierId,
        $name: patch.name?.trim() ?? current.name,
        $orderRef: patch.orderRef?.trim() ?? current.orderRef,
        $orderId: patch.orderId === undefined ? current.orderId : patch.orderId,
        $purchaseDate: patch.purchaseDate === undefined ? current.purchaseDate : patch.purchaseDate,
        $expectedDate: patch.expectedDate === undefined ? current.expectedDate : patch.expectedDate,
        $status: status,
        $source: source,
        $notes: patch.notes ?? current.notes,
        $at: nowIso()
      }
    )

    return this.getTrackcode(id)
  }

  /** Marca que se ha abierto la pagina del transportista. NO confirma nada. */
  touchOpened(id: string): void {
    this.db.run(
      'UPDATE trackcodes SET last_opened_at = $at, updated_at = $at WHERE id = $id',
      { $id: id, $at: nowIso() }
    )
  }

  /** Estado puesto a mano por el usuario. */
  setStatus(id: string, status: TrackcodeStatus): Trackcode {
    this.getTrackcode(id)
    this.db.run(
      "UPDATE trackcodes SET status = $status, status_source = 'manual', updated_at = $at WHERE id = $id",
      { $id: id, $status: status, $at: nowIso() }
    )
    return this.getTrackcode(id)
  }

  archive(ids: readonly string[]): { affected: number } {
    let affected = 0
    this.db.transaction(() => {
      for (const id of ids) {
        const current = this.getTrackcode(id)
        if (current.archivedAt) continue
        const at = nowIso()
        this.db.run(
          "UPDATE trackcodes SET status = 'archived', archived_at = $at, updated_at = $at WHERE id = $id",
          { $id: id, $at: at }
        )
        affected += 1
      }
    })
    return { affected }
  }

  restore(ids: readonly string[]): { affected: number } {
    // Se valida TODO antes de tocar nada: restaurar un codigo cuya version
    // activa ya existe rompe la unicidad y dejaria la operacion a medias.
    for (const id of ids) {
      const current = this.getTrackcode(id)
      if (!current.archivedAt) continue
      const duplicate = this.findDuplicate(current.code, current.carrierId, current.id)
      if (duplicate) {
        throw appError('conflict', {
          reason: 'duplicate_active',
          code: current.code,
          carrier: current.carrierName,
          existingId: duplicate.id
        })
      }
    }

    let affected = 0
    this.db.transaction(() => {
      for (const id of ids) {
        const current = this.getTrackcode(id)
        if (!current.archivedAt) continue
        this.db.run(
          "UPDATE trackcodes SET status = 'pending', archived_at = NULL, updated_at = $at WHERE id = $id",
          { $id: id, $at: nowIso() }
        )
        affected += 1
      }
    })
    return { affected }
  }

  remove(ids: readonly string[]): { affected: number } {
    if (ids.length === 0) return { affected: 0 }
    const params: Record<string, SqlParam> = {}
    const clause = inClause('del', ids, params)
    const affected = this.db.run(`DELETE FROM trackcodes WHERE id IN (${clause})`, params).changes
    return { affected }
  }

  /** Eventos reales, cuando exista una integracion autorizada. Hoy: vacio. */
  listEvents(trackcodeId: string): TrackingEvent[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT id, trackcode_id, at, occurred_at, description, location, status_code, source
         FROM tracking_events WHERE trackcode_id = $id ORDER BY at DESC LIMIT 200`,
        { $id: trackcodeId }
      )
      .map((row) => ({
        id: toStringValue(row.id),
        trackcodeId: toStringValue(row.trackcode_id),
        at: toStringValue(row.at),
        occurredAt: toNullableString(row.occurred_at),
        description: toStringValue(row.description),
        location: toStringValue(row.location),
        statusCode: toStringValue(row.status_code),
        source: row.source === 'manual' ? 'manual' : 'api'
      }))
  }
}

function mapTrackcode(row: Record<string, unknown>): Trackcode {
  return {
    id: toStringValue(row.id),
    code: toStringValue(row.code),
    carrierId: toStringValue(row.carrier_id),
    carrierName: toStringValue(row.carrier_name),
    carrierRegion: (row.carrier_region as CarrierRegion) ?? 'ES',
    name: toStringValue(row.name),
    orderRef: toStringValue(row.order_ref),
    orderId: toNullableString(row.order_id),
    purchaseDate: toNullableString(row.purchase_date),
    expectedDate: toNullableString(row.expected_date),
    status: row.status as TrackcodeStatus,
    statusSource: row.status_source === 'confirmed' ? 'confirmed' : row.status_source === 'manual' ? 'manual' : 'none',
    lastOpenedAt: toNullableString(row.last_opened_at),
    lastCheckedAt: toNullableString(row.last_checked_at),
    notes: toStringValue(row.notes),
    archivedAt: toNullableString(row.archived_at),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
    eventCount: toNumber(row.event_count)
  }
}
