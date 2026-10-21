/**
 * RESALEVAULT - Licencias y planes.
 *
 * Como funciona la firma:
 *  - El payload de la licencia es un JSON con plan, tipo, titular, fechas y
 *    numero de puestos.
 *  - El emisor (herramienta administrativa, con la clave PRIVADA) firma ese JSON
 *    con Ed25519.
 *  - El codigo de activacion es `base64url(payload) + "." + base64url(firma)`.
 *  - Esta aplicacion solo lleva la clave PUBLICA: puede VERIFICAR, nunca EMITIR.
 *
 * Reglas de honestidad y de producto:
 *  - Si la firma no valida, el plan cae a Free y se informa. No se "casi valida".
 *  - Los limites salen de `shared/plans.ts`, la unica fuente de verdad.
 *  - No hay ninguna licencia de produccion en el ejecutable.
 *  - La activacion online (revocacion, control de dispositivos) necesita el
 *    backend de la Fase 6; aqui no se simula ninguna comprobacion remota.
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto'
import type {
  LicenseActivationInput,
  LicenseKind,
  LicensePlan,
  LicenseState,
  LicenseStatus,
  PlanLimits
} from '@shared/types-modules'
import { LICENSE_FORMAT_VERSION, LICENSE_PUBLIC_KEY_BASE64 } from '@shared/license-keys'
import { PLAN_LIMITS, UNLIMITED } from '@shared/plans'
import type { Database } from '../db/database'
import { appError } from '../errors'
import { logActivity } from '../db/repositories/activity'
import { newId, nowIso, toNumber, toNullableString, toStringValue } from '../db/support'
import type { LicenceOnlineClient } from './licence-online'
import { codeHash } from './licence-online'

interface LicensePayload {
  v: number
  id: string
  plan: LicensePlan
  kind: LicenseKind
  holder?: string
  issuedAt?: string
  expiresAt?: string | null
  seats?: number
  notes?: string
}

export interface LicenseVerification {
  ok: boolean
  reason?:
    | 'malformed'
    | 'unsupported_version'
    | 'bad_signature'
    | 'no_public_key'
    | 'unknown_plan'
    | 'expired'
  payload: LicensePayload | null
}

/** Decodifica base64url a Buffer. */
function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + padding, 'base64')
}

/**
 * Verifica un codigo de activacion SIN tocar la base de datos.
 * Es una funcion pura respecto al estado: la usan tanto el servicio como las
 * pruebas.
 */
export function verifyLicenseCode(code: string, publicKeyBase64 = LICENSE_PUBLIC_KEY_BASE64): LicenseVerification {
  const trimmed = code.trim()
  const separator = trimmed.indexOf('.')
  if (separator <= 0 || separator === trimmed.length - 1) {
    return { ok: false, reason: 'malformed', payload: null }
  }

  let payload: LicensePayload
  let rawPayload: string
  try {
    rawPayload = fromBase64Url(trimmed.slice(0, separator)).toString('utf8')
    payload = JSON.parse(rawPayload) as LicensePayload
  } catch {
    return { ok: false, reason: 'malformed', payload: null }
  }

  if (!payload || typeof payload.id !== 'string' || typeof payload.plan !== 'string') {
    return { ok: false, reason: 'malformed', payload: null }
  }

  if (payload.v !== LICENSE_FORMAT_VERSION) {
    return { ok: false, reason: 'unsupported_version', payload }
  }

  if (!Object.prototype.hasOwnProperty.call(PLAN_LIMITS, payload.plan)) {
    return { ok: false, reason: 'unknown_plan', payload }
  }

  if (!publicKeyBase64) {
    return { ok: false, reason: 'no_public_key', payload }
  }

  let signatureValid = false
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki'
    })
    signatureValid = verifySignature(
      null,
      Buffer.from(rawPayload, 'utf8'),
      publicKey,
      fromBase64Url(trimmed.slice(separator + 1))
    )
  } catch {
    signatureValid = false
  }

  if (!signatureValid) return { ok: false, reason: 'bad_signature', payload }

  if (payload.expiresAt) {
    const expiry = new Date(payload.expiresAt).getTime()
    if (!Number.isNaN(expiry) && expiry < Date.now()) {
      return { ok: false, reason: 'expired', payload }
    }
  }

  return { ok: true, payload }
}

interface LicenseRow {
  id: string
  plan: string
  kind: string
  payload: string
  signature: string
  code_hash: string
  status: string
  activated_at: string | null
  expires_at: string | null
  last_check_at: string | null
  device_id: string
  seats: number
  holder: string
  notes: string
  online_state: string
  online_error: string
}

export class LicenseService {
  constructor(
    private readonly db: Database,
    /**
     * Cliente online OPCIONAL. Sin el, el servicio funciona igual que antes:
     * verificacion pura offline. Se inyecta en la aplicacion real y en las
     * pruebas que comprueban la integracion.
     */
    private readonly online: LicenceOnlineClient | null = null
  ) {}

  /** Identificador estable de este equipo. Se crea la primera vez. */
  deviceId(): string {
    const existing = this.db.scalar<string>('SELECT id FROM device_identity LIMIT 1')
    if (existing) {
      this.db.run('UPDATE device_identity SET last_seen_at = $at', { $at: nowIso() })
      return existing
    }
    const id = newId()
    const at = nowIso()
    this.db.run(
      'INSERT INTO device_identity (id, name, created_at, last_seen_at) VALUES ($id, $name, $at, $at)',
      { $id: id, $name: 'Este equipo', $at: at }
    )
    return id
  }

  active(): LicenseRow | null {
    return (
      this.db.get<LicenseRow>(
        `SELECT id, plan, kind, payload, signature, code_hash, status, activated_at, expires_at,
                last_check_at, device_id, seats, holder, notes, online_state, online_error
         FROM licenses WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1`
      ) ?? null
    )
  }

  /**
   * Estado real de la licencia. Si no hay ninguna activa, o si la firma no
   * valida, el plan es Free. Nunca se asciende de plan sin firma correcta.
   */
  state(): LicenseState {
    const deviceId = this.deviceId()
    const row = this.active()

    const usage = {
      // Los articulos ARCHIVADOS no cuentan: archivar es la forma de liberar
      // espacio en el plan. Si el usuario restaura alguno y supera la cuota, no
      // se borra nada: solo se impide crear articulos NUEVOS.
      products: toNumber(
        this.db.scalar<number>('SELECT COUNT(*) AS v FROM products WHERE archived_at IS NULL')
      ),
      uploads: toNumber(this.db.scalar<number>('SELECT COUNT(*) AS v FROM product_media')),
      aiCallsThisMonth: toNumber(
        this.db.scalar<number>(
          `SELECT COUNT(*) AS v FROM ai_usage
           WHERE ok = 1 AND at >= $from`,
          { $from: `${new Date().toISOString().slice(0, 7)}-01` }
        )
      )
    }

    if (!row) {
      return {
        plan: 'free',
        kind: null,
        status: 'inactive',
        licenseId: null,
        holder: '',
        activatedAt: null,
        expiresAt: null,
        seats: 1,
        deviceId,
        limits: PLAN_LIMITS.free,
        usage,
        signatureValid: false,
        notes: 'No hay ninguna licencia activada.',
        online: { state: 'unknown', reason: '', lastCheckAt: null }
      }
    }

    // Se reverifica SIEMPRE: una fila manipulada a mano en la base de datos no
    // debe conceder un plan de pago.
    const verification = verifyLicenseCode(`${row.payload}.${row.signature}`)
    let plan: LicensePlan = verification.ok && verification.payload ? verification.payload.plan : 'free'

    // Revocacion conocida: si el hash del codigo esta en la cache local de
    // revocaciones, el plan se rebaja a Free aunque la firma sea correcta. Se
    // conserva TODO el contenido del usuario; solo cambian los limites.
    const revokedLocally = this.isRevokedCode(row.payload, row.signature)
    if (revokedLocally) plan = 'free'

    const notes = revokedLocally
      ? 'Esta licencia ha sido revocada. El plan se ha rebajado a Free; tus datos siguen intactos.'
      : verification.ok
        ? toStringValue(row.notes)
        : `La firma no es valida (${verification.reason ?? 'desconocido'}). El plan se ha rebajado a Free.`

    return {
      plan,
      kind: (row.kind as LicenseKind) ?? null,
      status: row.status as LicenseStatus,
      licenseId: row.id,
      holder: toStringValue(row.holder),
      activatedAt: toNullableString(row.activated_at),
      expiresAt: toNullableString(row.expires_at),
      seats: Math.max(1, toNumber(row.seats, 1)),
      deviceId,
      limits: PLAN_LIMITS[plan],
      usage,
      signatureValid: verification.ok,
      notes,
      online: {
        state: (toStringValue(row.online_state) || 'unknown') as 'unknown' | 'verified' | 'offline' | 'rejected',
        reason: toStringValue(row.online_error),
        lastCheckAt: toNullableString(row.last_check_at)
      }
    }
  }

  /** True si el codigo activo figura en la cache local de revocaciones. */
  private isRevokedCode(payload: string, signature: string): boolean {
    if (!payload || !signature) return false
    // La cache guarda el SHA-256 del codigo completo, que es lo que envia el
    // servidor. El codigo completo es `payload.signature`.
    const hash = codeHash(`${payload}.${signature}`)
    const found = this.db.scalar<number>(
      'SELECT 1 AS v FROM license_revocations WHERE code_hash = $hash',
      { $hash: hash }
    )
    return found === 1
  }

  limits(): PlanLimits {
    return this.state().limits
  }

  activate(input: LicenseActivationInput): LicenseState {
    const verification = verifyLicenseCode(input.code.trim())

    if (!verification.ok || !verification.payload) {
      throw appError('license_required', { reason: verification.reason ?? 'invalid' })
    }

    const payload = verification.payload
    const [payloadPart, signaturePart] = splitCode(input.code.trim())
    const id = newId()
    const at = nowIso()
    const deviceId = this.deviceId()

    this.db.transaction(() => {
      // Solo puede haber una licencia activa a la vez.
      this.db.run("UPDATE licenses SET status = 'inactive', updated_at = $at WHERE status = 'active'", {
        $at: at
      })

      this.db.run(
        `INSERT INTO licenses (id, plan, kind, payload, signature, code_hash, status, activated_at,
            expires_at, last_check_at, device_id, seats, holder, notes, created_at, updated_at)
         VALUES ($id, $plan, $kind, $payload, $signature, $hash, 'active', $at,
            $expires, $at, $device, $seats, $holder, $notes, $at, $at)`,
        {
          $id: id,
          $plan: payload.plan,
          $kind: payload.kind,
          $payload: payloadPart,
          $signature: signaturePart,
          // Se guarda un hash del codigo para poder identificarlo sin
          // almacenarlo entero en claro.
          $hash: hashCode(input.code.trim()),
          $at: at,
          $expires: payload.expiresAt ?? null,
          $device: deviceId,
          $seats: payload.seats ?? 1,
          $holder: input.holder?.trim() || payload.holder || '',
          $notes: payload.notes ?? ''
        }
      )

      this.db.run(
        `INSERT INTO license_events (id, license_id, at, event, detail) VALUES ($id, $license, $at, 'activated', $detail)`,
        {
          $id: newId(),
          $license: id,
          $at: at,
          $detail: `plan=${payload.plan} kind=${payload.kind}`
        }
      )

      logActivity(this.db, {
        entity: 'license',
        entityId: id,
        action: 'activated',
        summary: `Licencia activada: ${payload.plan} (${payload.kind})`
      })
    })

    return this.state()
  }

  deactivate(): LicenseState {
    const row = this.active()
    if (row) {
      // Liberar el puesto en el servidor es "mejor esfuerzo": si no hay red, la
      // desactivacion local sigue adelante para no atrapar al usuario.
      if (this.online) {
        void this.online.releaseSeat(`${row.payload}.${row.signature}`, this.deviceId())
      }
      this.db.transaction(() => {
        this.db.run("UPDATE licenses SET status = 'inactive', updated_at = $at WHERE id = $id", {
          $id: row.id,
          $at: nowIso()
        })
        this.db.run(
          `INSERT INTO license_events (id, license_id, at, event, detail) VALUES ($id, $license, $at, 'deactivated', '')`,
          { $id: newId(), $license: row.id, $at: nowIso() }
        )
      })
    }
    return this.state()
  }

  events(limit = 20): Array<{ at: string; event: string; detail: string }> {
    return this.db
      .all<{ at: string; event: string; detail: string }>(
        'SELECT at, event, detail FROM license_events ORDER BY at DESC LIMIT $limit',
        { $limit: Math.min(200, Math.max(1, limit)) }
      )
      .map((row) => ({ at: row.at, event: row.event, detail: toStringValue(row.detail) }))
  }

  // -------------------------------------------------------------------------
  // Comprobacion ONLINE (puestos y revocaciones)
  // -------------------------------------------------------------------------

  /**
   * Refresca el estado online de la licencia activa: descarga primero las
   * revocaciones (para que una revocacion reciente surta efecto) y despues
   * confirma el puesto de este equipo.
   *
   * Reglas:
   *  - Sin licencia activa, o sin red, no se hace nada y no se lanza error.
   *  - Un rechazo BLOQUEANTE (revocada, caducada, suspendida, puestos agotados)
   *    queda registrado; el estado de la licencia cambia solo en el caso de
   *    revocacion, que se refleja via la cache local. NUNCA se borran datos.
   *  - Los fallos temporales (sin red, error del servidor) no alteran el plan.
   */
  async refreshOnline(force = false): Promise<LicenseState> {
    if (!this.online) return this.state()
    const row = this.active()
    if (!row) return this.state()

    const code = `${row.payload}.${row.signature}`
    const machineId = this.deviceId()

    // 1. Revocaciones primero: si una revocacion nos afecta, el estado debe
    //    reflejarla antes de intentar confirmar el puesto.
    await this.online.syncRevocations()

    // 2. La cache local puede haber marcado esta licencia como revocada.
    if (this.isRevokedCode(row.payload, row.signature)) {
      this.db.run(
        "UPDATE licenses SET status = 'revoked', online_state = 'rejected', online_error = 'revoked', updated_at = $at WHERE id = $id AND status = 'active'",
        { $id: row.id, $at: nowIso() }
      )
      this.db.run(
        `INSERT INTO license_events (id, license_id, at, event, detail) VALUES ($id, $license, $at, 'online_rejected', 'revoked')`,
        { $id: newId(), $license: row.id, $at: nowIso() }
      )
      return this.state()
    }

    // 3. Confirmar el puesto. Nunca lanza.
    await this.online.verify(code, machineId, 'Este equipo', force)
    return this.state()
  }

  /** Descarga revocaciones sin confirmar puesto. Util al arrancar. */
  async syncRevocations(): Promise<{ fetched: number; updated: boolean }> {
    if (!this.online) return { fetched: 0, updated: false }
    return this.online.syncRevocations()
  }

  /** True si el plan actual tiene comprobacion online disponible. */
  get onlineEnabled(): boolean {
    return this.online !== null
  }

  /**
   * Comprueba si una funcion esta disponible en el plan actual.
   * Se llama en el proceso principal, no en la interfaz: un limite que solo se
   * comprueba en la interfaz no es un limite.
   */
  can(feature: keyof PlanLimits): boolean {
    const value = this.limits()[feature]
    return typeof value === 'boolean' ? value : value !== 0
  }

  /** Comprueba un limite numerico (productos, subidas, llamadas de IA). */
  canWithin(limit: keyof PlanLimits, usage: number): boolean {
    const value = this.limits()[limit]
    if (typeof value === 'boolean') return value
    if (value === UNLIMITED) return true
    return usage < value
  }

  /** Lanza un error de dominio si el limite se ha alcanzado. */
  assertProductQuota(): void {
    const state = this.state()
    if (!this.canWithin('maxProducts', state.usage.products)) {
      throw appError('plan_limit_reached', {
        resource: 'maxProducts',
        limit: state.limits.maxProducts,
        plan: state.plan
      })
    }
  }

  assertUploadQuota(additional = 1): void {
    const state = this.state()
    if (!this.canWithin('maxUploads', state.usage.uploads + additional - 1)) {
      throw appError('plan_limit_reached', {
        resource: 'maxUploads',
        limit: state.limits.maxUploads,
        plan: state.plan
      })
    }
  }

  assertFeature(feature: keyof PlanLimits): void {
    if (!this.can(feature)) {
      throw appError('license_required', { feature, plan: this.state().plan })
    }
  }
}

function splitCode(code: string): [string, string] {
  const separator = code.indexOf('.')
  return [code.slice(0, separator), code.slice(separator + 1)]
}

function hashCode(code: string): string {
  // Hash simple y estable para identificar el codigo sin guardarlo entero.
  let hash = 0
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) | 0
  }
  return `h${(hash >>> 0).toString(16)}`
}
