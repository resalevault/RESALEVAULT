/**
 * Reglas de licencia del backend online, aisladas de Deno y de Supabase.
 *
 * Todo lo que decide si una activacion se acepta vive aqui, con el tiempo y el
 * almacenamiento inyectados, para poder probarlo sin red ni base de datos.
 * El punto de entrada de la Edge Function solo valida la firma, calcula el hash
 * y adapta estas funciones a Postgres.
 */

export type LicencePlan = 'free' | 'pro' | 'business'
export type LicenceKind = 'perpetual' | 'subscription' | 'founder'
export type LicenceStatus = 'active' | 'revoked' | 'suspended'

export interface LicenceRecord {
  id: string
  codeHash: string
  plan: LicencePlan
  kind: LicenceKind
  seats: number
  status: LicenceStatus
  expiresAt: string | null
}

export interface ActivationRecord {
  machineId: string
  lastSeenAt: string
}

export interface ActivationWrite {
  licenceId: string
  machineId: string
  machineLabel: string
  appVersion: string
  os: string
  at: string
}

export interface RevokedRecord {
  codeHash: string
  revokedAt: string
}

export interface LicenceStore {
  findByCodeHash(codeHash: string): Promise<LicenceRecord | null>
  listActivations(licenceId: string): Promise<ActivationRecord[]>
  touchActivation(input: ActivationWrite): Promise<void>
  removeActivation(licenceId: string, machineId: string): Promise<boolean>
  listRevokedSince(since: string | null): Promise<RevokedRecord[]>
}

export type ActivationFailure =
  | 'invalid_input'
  | 'unknown_code'
  | 'revoked'
  | 'suspended'
  | 'expired'
  | 'seats_exhausted'

export type ActivationResult =
  | {
      ok: true
      state: 'activated' | 'already_active'
      plan: LicencePlan
      kind: LicenceKind
      seats: number
      seatsUsed: number
      expiresAt: string | null
    }
  | { ok: false; reason: ActivationFailure; seatsUsed?: number }

export interface ActivateInput {
  codeHash: string
  machineId: string
  machineLabel?: string
  appVersion?: string
  os?: string
}

const HASH_PATTERN = /^[0-9a-f]{64}$/
const MACHINE_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function isExpired(expiresAt: string | null, now: string): boolean {
  if (expiresAt === null) return false
  const limit = Date.parse(expiresAt)
  const current = Date.parse(now)
  // Una fecha ilegible no debe regalar una licencia: se trata como caducada.
  if (Number.isNaN(limit)) return true
  if (Number.isNaN(current)) return true
  return current >= limit
}

/**
 * Activa un equipo. Es idempotente: repetir la activacion del mismo equipo no
 * consume un puesto nuevo (los arranques y las reinstalaciones no deben agotar
 * las plazas de un cliente legitimo).
 */
export async function activate(
  input: ActivateInput,
  store: LicenceStore,
  now: string
): Promise<ActivationResult> {
  if (!HASH_PATTERN.test(input.codeHash)) return { ok: false, reason: 'invalid_input' }
  if (!MACHINE_PATTERN.test(input.machineId)) return { ok: false, reason: 'invalid_input' }

  const licence = await store.findByCodeHash(input.codeHash)
  if (!licence) return { ok: false, reason: 'unknown_code' }
  if (licence.status === 'revoked') return { ok: false, reason: 'revoked' }
  if (licence.status === 'suspended') return { ok: false, reason: 'suspended' }
  if (isExpired(licence.expiresAt, now)) return { ok: false, reason: 'expired' }

  const activations = await store.listActivations(licence.id)
  const already = activations.some((entry) => entry.machineId === input.machineId)

  if (!already && activations.length >= licence.seats) {
    return { ok: false, reason: 'seats_exhausted', seatsUsed: activations.length }
  }

  await store.touchActivation({
    licenceId: licence.id,
    machineId: input.machineId,
    machineLabel: cleanText(input.machineLabel, 80),
    appVersion: cleanText(input.appVersion, 32),
    os: cleanText(input.os, 32),
    at: now
  })

  return {
    ok: true,
    state: already ? 'already_active' : 'activated',
    plan: licence.plan,
    kind: licence.kind,
    seats: licence.seats,
    seatsUsed: already ? activations.length : activations.length + 1,
    expiresAt: licence.expiresAt
  }
}

/** Libera un puesto. Solo afecta al equipo indicado. */
export async function deactivate(
  input: { codeHash: string; machineId: string },
  store: LicenceStore
): Promise<{ ok: true; removed: boolean } | { ok: false; reason: 'invalid_input' | 'unknown_code' }> {
  if (!HASH_PATTERN.test(input.codeHash)) return { ok: false, reason: 'invalid_input' }
  if (!MACHINE_PATTERN.test(input.machineId)) return { ok: false, reason: 'invalid_input' }

  const licence = await store.findByCodeHash(input.codeHash)
  if (!licence) return { ok: false, reason: 'unknown_code' }

  const removed = await store.removeActivation(licence.id, input.machineId)
  return { ok: true, removed }
}

/**
 * Lista de revocaciones para que la app pueda dejar de aceptar codigos
 * revocados aunque la firma siga siendo valida.
 */
export async function revocations(
  input: { since: string | null },
  store: LicenceStore,
  now: string
): Promise<{ codes: string[]; cursor: string }> {
  const since = input.since !== null && !Number.isNaN(Date.parse(input.since)) ? input.since : null
  const records = await store.listRevokedSince(since)
  return {
    codes: records.map((record) => record.codeHash),
    cursor: now
  }
}
