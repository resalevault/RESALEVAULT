/**
 * RESALEVAULT - Cliente de licencias online (proceso principal).
 *
 * Principios de diseno:
 *
 *  1. **Offline primero.** La firma Ed25519 del codigo se verifica SIEMPRE en
 *     local. Una licencia ya activada conserva su plan aunque no haya red. El
 *     backend sirve para controlar PUESTOS y REVOCACIONES, no para conceder el
 *     plan: si el servidor cae, los clientes legitimos siguen trabajando.
 *
 *  2. **Nunca borra datos.** Un rechazo del servidor como maximo cambia el
 *     estado de la licencia. El inventario, los pedidos y las fotos no se tocan.
 *
 *  3. **Sin secretos.** Envia la clave PUBLISHABLE (publica por diseno) como
 *     Bearer. La clave de servicio jamas sale del servidor.
 *
 *  4. **Comprobacion perezosa.** El estado online se refresca como mucho cada
 *     `ONLINE_RECHECK_DAYS`; las revocaciones se piden solo desde el ultimo
 *     cursor, para no castigar la red en cada arranque.
 *
 *  5. **Todo lo decidible esta separado de la red** (`buildActivateRequest`,
 *     `parseActivateResponse`, `applyOnlineOutcome`) para poder probarlo sin
 *     conexion.
 */

import { createHash } from 'node:crypto'
import {
  LICENCE_ENDPOINT,
  LICENCE_PUBLISHABLE_KEY,
  ONLINE_RECHECK_DAYS,
  ONLINE_TIMEOUT_MS,
  rejectReasonIsBlocking,
  type LicenceOnlineState,
  type LicenceRejectReason
} from '@shared/licence-backend'
import type { Database } from '../db/database'
import { newId, nowIso } from '../db/support'

// ---------------------------------------------------------------------------
// Partes puras (sin red, sin base de datos): lo que se puede probar a fondo.
// ---------------------------------------------------------------------------

/** SHA-256 en hexadecimal. Identifica el codigo en el servidor sin enviarlo. */
export function codeHash(code: string): string {
  return createHash('sha256').update(code.trim(), 'utf8').digest('hex')
}

export interface ActivateRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

export interface ActivateContext {
  code: string
  machineId: string
  machineLabel?: string
  appVersion?: string
  os?: string
}

/** Construye la peticion de activacion. Puro: mismos argumentos, misma salida. */
export function buildActivateRequest(input: ActivateContext, baseUrl = LICENCE_ENDPOINT): ActivateRequest {
  return {
    url: `${baseUrl}/activate`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${LICENCE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify({
      code: input.code.trim(),
      machineId: input.machineId,
      machineLabel: input.machineLabel ?? '',
      appVersion: input.appVersion ?? '',
      os: input.os ?? ''
    })
  }
}

/** Construye la peticion de liberacion de puesto. */
export function buildDeactivateRequest(
  input: { code: string; machineId: string },
  baseUrl = LICENCE_ENDPOINT
): ActivateRequest {
  return {
    url: `${baseUrl}/deactivate`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${LICENCE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify({ code: input.code.trim(), machineId: input.machineId })
  }
}

export interface RevocationsResult {
  codes: string[]
  cursor: string
}

/** Direccion de la lista de revocaciones desde un cursor. `since` opcional. */
export function buildRevocationsUrl(since: string | null, baseUrl = LICENCE_ENDPOINT): string {
  const url = new URL(`${baseUrl}/revocations`)
  if (since) url.searchParams.set('since', since)
  return url.toString()
}

export type ParsedActivate =
  | {
      ok: true
      state: 'activated' | 'already_active'
      plan: string
      kind: string
      seats: number
      seatsUsed: number
      expiresAt: string | null
    }
  | { ok: false; reason: LicenceRejectReason; seatsUsed?: number }

/**
 * Interpreta la respuesta del servidor. Tolera respuestas raras sin lanzar:
 * ante la duda, se trata como fallo de red (no bloquea al usuario).
 */
export function parseActivateResponse(status: number, body: string): ParsedActivate {
  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(body) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, reason: 'server_error' }
    }
    parsed = value as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'server_error' }
  }

  // Solo se acepta una activacion si el servidor respondio con exito. Un
  // `ok:true` acompanado de un estado HTTP de error no se cree.
  if (parsed.ok === true && (status < 200 || status >= 300)) {
    return { ok: false, reason: 'server_error' }
  }

  if (parsed.ok === true) {
    const state = parsed.state === 'already_active' ? 'already_active' : 'activated'
    return {
      ok: true,
      state,
      plan: typeof parsed.plan === 'string' ? parsed.plan : 'free',
      kind: typeof parsed.kind === 'string' ? parsed.kind : '',
      seats: typeof parsed.seats === 'number' ? parsed.seats : 1,
      seatsUsed: typeof parsed.seatsUsed === 'number' ? parsed.seatsUsed : 1,
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null
    }
  }

  const reason = typeof parsed.reason === 'string' ? (parsed.reason as LicenceRejectReason) : 'server_error'
  const seatsUsed = typeof parsed.seatsUsed === 'number' ? parsed.seatsUsed : undefined
  return { ok: false, reason, seatsUsed }
}

/** Interpreta la lista de revocaciones. Una respuesta invalida no revoca nada. */
export function parseRevocationsResponse(status: number, body: string): RevocationsResult | null {
  if (status !== 200) return null
  try {
    const value = JSON.parse(body) as unknown
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const codes = Array.isArray(record.codes)
      ? record.codes.filter((entry): entry is string => typeof entry === 'string')
      : []
    const cursor = typeof record.cursor === 'string' ? record.cursor : ''
    return { codes, cursor }
  } catch {
    return null
  }
}

/**
 * Decide si toca refrescar el estado online. Pura: recibe las fechas.
 * `null` (nunca comprobado) siempre refresca.
 */
export function shouldRecheck(lastCheckAt: string | null, now: string, days = ONLINE_RECHECK_DAYS): boolean {
  if (!lastCheckAt) return true
  const last = Date.parse(lastCheckAt)
  const current = Date.parse(now)
  if (Number.isNaN(last) || Number.isNaN(current)) return true
  const elapsedDays = (current - last) / (1000 * 60 * 60 * 24)
  return elapsedDays >= days
}

/**
 * Decide que hacer con el resultado de la activacion online.
 * No aplica nada por si sola: describe la accion para que el servicio la ejecute.
 */
export type OnlineDecision =
  | { action: 'keep'; state: LicenceOnlineState; reason: string }
  | { action: 'mark_verified'; seatsUsed: number }
  | { action: 'mark_rejected'; reason: LicenceRejectReason; blocking: boolean }

export function decideOnlineOutcome(result: ParsedActivate, reachable: boolean): OnlineDecision {
  if (!reachable) {
    // Sin red o servidor caido: se conserva el plan y se marca 'offline'.
    return { action: 'keep', state: 'offline', reason: 'network' }
  }
  if (result.ok) {
    return { action: 'mark_verified', seatsUsed: result.seatsUsed }
  }
  return {
    action: 'mark_rejected',
    reason: result.reason,
    blocking: rejectReasonIsBlocking(result.reason)
  }
}

// ---------------------------------------------------------------------------
// Servicio con estado: usa la base de datos y la red.
// ---------------------------------------------------------------------------

export interface OnlineCheckResult {
  state: LicenceOnlineState
  /** Motivo del rechazo, si lo hubo. Vacio cuando todo fue bien. */
  reason: string
  seatsUsed: number | null
}

interface LicenseRow {
  id: string
  code_hash: string
  payload: string
  signature: string
  last_check_at: string | null
  revocation_cursor: string | null
}

export interface OnlineClientOptions {
  /** Se inyecta en las pruebas para no tocar la red real. */
  fetchImpl?: typeof fetch
  endpoint?: string
  now?: () => string
  appVersion?: string
  os?: string
}

export class LicenceOnlineClient {
  private readonly fetchImpl: typeof fetch
  private readonly endpoint: string
  private readonly now: () => string
  private readonly appVersion: string
  private readonly os: string

  constructor(
    private readonly db: Database,
    options: OnlineClientOptions = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.endpoint = options.endpoint ?? LICENCE_ENDPOINT
    this.now = options.now ?? nowIso
    this.appVersion = options.appVersion ?? ''
    this.os = options.os ?? ''
  }

  private activeRow(): LicenseRow | null {
    return (
      this.db.get<LicenseRow>(
        `SELECT id, code_hash, payload, signature, last_check_at, revocation_cursor
         FROM licenses WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`
      ) ?? null
    )
  }

  /**
   * Intenta activar el puesto de este equipo en el servidor. Devuelve siempre un
   * resultado; NUNCA lanza por un fallo de red. Si el servidor es inalcanzable,
   * `state` es 'offline' y la licencia local se conserva.
   */
  async verify(
    code: string,
    machineId: string,
    machineLabel: string,
    force = false
  ): Promise<OnlineCheckResult> {
    const row = this.activeRow()
    if (!row) return { state: 'unknown', reason: 'no_license', seatsUsed: null }

    if (!force && !shouldRecheck(row.last_check_at, this.now())) {
      // Aun no toca: se mantiene el estado guardado sin llamar a la red.
      const stored = this.db.scalar<string>(
        "SELECT online_state FROM licenses WHERE id = $id",
        { $id: row.id }
      )
      return { state: (stored as LicenceOnlineState) ?? 'unknown', reason: '', seatsUsed: null }
    }

    const request = buildActivateRequest(
      { code, machineId, machineLabel, appVersion: this.appVersion, os: this.os },
      this.endpoint
    )

    let reachable = true
    let result: ParsedActivate
    try {
      const response = await this.fetchWithTimeout(request)
      result = parseActivateResponse(response.status, await response.text())
    } catch {
      reachable = false
      result = { ok: false, reason: 'network' }
    }

    const decision = decideOnlineOutcome(result, reachable)
    const at = this.now()

    if (decision.action === 'keep') {
      // Sin red: se conserva la licencia. NO se cambia el plan ni se borra nada.
      this.db.run(
        "UPDATE licenses SET online_state = $state, online_error = $reason, updated_at = $at WHERE id = $id",
        { $id: row.id, $state: decision.state, $reason: decision.reason, $at: at }
      )
      return { state: decision.state, reason: decision.reason, seatsUsed: null }
    }

    if (decision.action === 'mark_verified') {
      this.db.run(
        `UPDATE licenses SET online_state = 'verified', online_error = '', last_check_at = $at,
           updated_at = $at WHERE id = $id`,
        { $id: row.id, $at: at }
      )
      this.db.run(
        `INSERT INTO license_events (id, license_id, at, event, detail)
         VALUES ($id, $license, $at, 'online_verified', $detail)`,
        { $id: newId(), $license: row.id, $at: at, $detail: `seatsUsed=${decision.seatsUsed}` }
      )
      return { state: 'verified', reason: '', seatsUsed: decision.seatsUsed }
    }

    // Rechazo. Solo los motivos BLOQUEANTES cambian el estado de la licencia; un
    // error temporal del servidor deja la licencia como estaba.
    this.db.run(
      "UPDATE licenses SET online_state = $state, online_error = $reason, last_check_at = $at, updated_at = $at WHERE id = $id",
      {
        $id: row.id,
        $state: decision.blocking ? 'rejected' : 'offline',
        $reason: decision.reason,
        $at: at
      }
    )
    this.db.run(
      `INSERT INTO license_events (id, license_id, at, event, detail)
       VALUES ($id, $license, $at, $event, $detail)`,
      {
        $id: newId(),
        $license: row.id,
        $at: at,
        $event: decision.blocking ? 'online_rejected' : 'online_error',
        $detail: decision.reason
      }
    )

    return {
      state: decision.blocking ? 'rejected' : 'offline',
      reason: decision.reason,
      seatsUsed: null
    }
  }

  /**
   * Libera el puesto de este equipo en el servidor. Si no hay red, se sigue
   * liberando en local: el usuario no debe quedarse atrapado sin conexion.
   */
  async releaseSeat(code: string, machineId: string): Promise<{ remote: boolean }> {
    const request = buildDeactivateRequest({ code, machineId }, this.endpoint)
    try {
      const response = await this.fetchWithTimeout(request)
      return { remote: response.status === 200 }
    } catch {
      return { remote: false }
    }
  }

  /**
   * Descarga las revocaciones desde el ultimo cursor y las cachea en local.
   * Devuelve cuantas nuevas se han registrado. Un fallo de red devuelve 0.
   */
  async syncRevocations(): Promise<{ fetched: number; updated: boolean }> {
    const row = this.activeRow()
    const since = row?.revocation_cursor ?? null

    let reachable = true
    let payload: RevocationsResult | null = null
    try {
      const response = await this.fetchImplWithTimeout(buildRevocationsUrl(since, this.endpoint))
      payload = parseRevocationsResponse(response.status, await response.text())
    } catch {
      reachable = false
    }

    if (!reachable || !payload) return { fetched: 0, updated: false }

    const at = this.now()
    let fetched = 0
    for (const hash of payload.codes) {
      const before = this.db.scalar<number>(
        'SELECT COUNT(*) AS v FROM license_revocations WHERE code_hash = $hash',
        { $hash: hash }
      )
      this.db.run(
        `INSERT INTO license_revocations (code_hash, revoked_at, seen_at)
         VALUES ($hash, $at, $at)
         ON CONFLICT(code_hash) DO UPDATE SET seen_at = $at`,
        { $hash: hash, $at: at }
      )
      if ((before ?? 0) === 0) fetched += 1
    }

    if (row && payload.cursor) {
      this.db.run('UPDATE licenses SET revocation_cursor = $cursor WHERE id = $id', {
        $id: row.id,
        $cursor: payload.cursor
      })
    }

    return { fetched, updated: true }
  }

  /** True si el hash de este codigo aparece en la cache local de revocaciones. */
  isRevoked(code: string): boolean {
    const hash = codeHash(code)
    const found = this.db.scalar<number>('SELECT 1 AS v FROM license_revocations WHERE code_hash = $hash', {
      $hash: hash
    })
    return found === 1
  }

  private async fetchWithTimeout(request: ActivateRequest): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS)
    try {
      return await this.fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  private async fetchImplWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ONLINE_TIMEOUT_MS)
    try {
      return await this.fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${LICENCE_PUBLISHABLE_KEY}` },
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }
}
