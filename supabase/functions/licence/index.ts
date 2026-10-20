/**
 * Edge Function `licence` de RESALEVAULT.
 *
 * Responsabilidades:
 *  1. Verificar la firma Ed25519 del codigo con la clave PUBLICA.
 *  2. Calcular el SHA-256 del codigo (identificador en la base de datos).
 *  3. Aplicar las reglas de `core.ts` (puestos, caducidad, revocacion).
 *
 * La clave privada no existe en este entorno y no debe existir nunca.
 *
 * Rutas (tras /functions/v1/licence):
 *   POST /activate    { code, machineId, machineLabel?, appVersion?, os? }
 *   POST /deactivate  { code, machineId }
 *   GET  /revocations?since=ISO
 *   GET  /health
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  activate,
  deactivate,
  revocations,
  type ActivationRecord,
  type ActivationWrite,
  type LicenceKind,
  type LicencePlan,
  type LicenceRecord,
  type LicenceStatus,
  type LicenceStore,
  type RevokedRecord
} from './core.ts'
import { sha256Hex, verifyCode, type CodeExpectations } from './code.ts'
import {
  ALLOWED_KINDS,
  ALLOWED_PLANS,
  LICENSE_FORMAT_VERSION,
  LICENSE_PUBLIC_KEY_BASE64
} from './keys.ts'

const MAX_BODY_BYTES = 4096
const MAX_CODE_LENGTH = 2048

const EXPECTED: CodeExpectations = {
  publicKeyBase64: LICENSE_PUBLIC_KEY_BASE64,
  formatVersion: LICENSE_FORMAT_VERSION,
  plans: ALLOWED_PLANS,
  kinds: ALLOWED_KINDS
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

interface LicenceRow {
  id: string
  code_hash: string
  plan: LicencePlan
  kind: LicenceKind
  seats: number
  status: LicenceStatus
  expires_at: string | null
}

interface ActivationRow {
  machine_id: string
  last_seen_at: string
}

function createStore(url: string, serviceKey: string): LicenceStore {
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  return {
    async findByCodeHash(codeHash: string): Promise<LicenceRecord | null> {
      const { data, error } = await db
        .from('licenses')
        .select('id, code_hash, plan, kind, seats, status, expires_at')
        .eq('code_hash', codeHash)
        .maybeSingle<LicenceRow>()
      if (error) throw new Error(`findByCodeHash: ${error.message}`)
      if (!data) return null
      return {
        id: data.id,
        codeHash: data.code_hash,
        plan: data.plan,
        kind: data.kind,
        seats: data.seats,
        status: data.status,
        expiresAt: data.expires_at
      }
    },

    async listActivations(licenceId: string): Promise<ActivationRecord[]> {
      const { data, error } = await db
        .from('license_activations')
        .select('machine_id, last_seen_at')
        .eq('license_id', licenceId)
      if (error) throw new Error(`listActivations: ${error.message}`)
      return (data ?? []).map((row: ActivationRow) => ({
        machineId: row.machine_id,
        lastSeenAt: row.last_seen_at
      }))
    },

    async touchActivation(input: ActivationWrite): Promise<void> {
      const { error } = await db.from('license_activations').upsert(
        {
          license_id: input.licenceId,
          machine_id: input.machineId,
          machine_label: input.machineLabel,
          app_version: input.appVersion,
          os: input.os,
          last_seen_at: input.at
        },
        { onConflict: 'license_id,machine_id' }
      )
      if (error) throw new Error(`touchActivation: ${error.message}`)
    },

    async removeActivation(licenceId: string, machineId: string): Promise<boolean> {
      const { error, count } = await db
        .from('license_activations')
        .delete({ count: 'exact' })
        .eq('license_id', licenceId)
        .eq('machine_id', machineId)
      if (error) throw new Error(`removeActivation: ${error.message}`)
      return (count ?? 0) > 0
    },

    async listRevokedSince(since: string | null): Promise<RevokedRecord[]> {
      const base = db
        .from('licenses')
        .select('code_hash, revoked_at')
        .eq('status', 'revoked')
        .not('revoked_at', 'is', null)
        .order('revoked_at', { ascending: true })
        .limit(5000)
      const { data, error } = since ? await base.gt('revoked_at', since) : await base
      if (error) throw new Error(`listRevokedSince: ${error.message}`)
      return (data ?? []).map((row: { code_hash: string; revoked_at: string }) => ({
        codeHash: row.code_hash,
        revokedAt: row.revoked_at
      }))
    }
  }
}

/** Un unico cliente por instancia de la funcion (la funcion es larga). */
let cachedStore: { key: string; store: LicenceStore } | null = null

function storeFor(url: string, serviceKey: string): LicenceStore {
  const key = `${url}|${serviceKey}`
  if (!cachedStore || cachedStore.key !== key) {
    cachedStore = { key, store: createStore(url, serviceKey) }
  }
  return cachedStore.store
}

function routeOf(requestUrl: string): string {
  const parts = new URL(requestUrl).pathname.split('/').filter(Boolean)
  const index = parts.lastIndexOf('licence')
  return index >= 0 ? '/' + parts.slice(index + 1).join('/') : '/'
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ ok: false, reason: 'payload_too_large' }, 413) }
  }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: json({ ok: false, reason: 'payload_too_large' }, 413) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, response: json({ ok: false, reason: 'invalid_json' }, 400) }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: json({ ok: false, reason: 'invalid_json' }, 400) }
  }
  return { ok: true, body: parsed as Record<string, unknown> }
}

function statusFor(reason: string): number {
  switch (reason) {
    case 'unknown_code':
      return 404
    case 'revoked':
    case 'suspended':
    case 'expired':
    case 'bad_signature':
    case 'unsupported_version':
    case 'unknown_plan':
      return 403
    case 'seats_exhausted':
      return 409
    case 'invalid_input':
    case 'malformed':
      return 400
    default:
      return 500
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const route = routeOf(request.url)

  if (route === '/health' && request.method === 'GET') {
    return json({ ok: true, version: LICENSE_FORMAT_VERSION })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    console.error('licence: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    return json({ ok: false, reason: 'server_misconfigured' }, 500)
  }

  try {
    if (route === '/activate' && request.method === 'POST') {
      const parsed = await readJsonBody(request)
      if (!parsed.ok) return parsed.response

      const code = parsed.body.code
      if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH) {
        return json({ ok: false, reason: 'invalid_input' }, 400)
      }

      const check = await verifyCode(code.trim(), EXPECTED)
      if (!check.ok) return json({ ok: false, reason: check.reason }, statusFor(check.reason))

      const result = await activate(
        {
          codeHash: await sha256Hex(code.trim()),
          machineId: String(parsed.body.machineId ?? ''),
          machineLabel: parsed.body.machineLabel as string | undefined,
          appVersion: parsed.body.appVersion as string | undefined,
          os: parsed.body.os as string | undefined
        },
        storeFor(url, serviceKey),
        new Date().toISOString()
      )

      return json(result, result.ok ? 200 : statusFor(result.reason))
    }

    if (route === '/deactivate' && request.method === 'POST') {
      const parsed = await readJsonBody(request)
      if (!parsed.ok) return parsed.response

      const code = parsed.body.code
      if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH) {
        return json({ ok: false, reason: 'invalid_input' }, 400)
      }

      const check = await verifyCode(code.trim(), EXPECTED)
      if (!check.ok) return json({ ok: false, reason: check.reason }, statusFor(check.reason))

      const result = await deactivate(
        { codeHash: await sha256Hex(code.trim()), machineId: String(parsed.body.machineId ?? '') },
        storeFor(url, serviceKey)
      )
      return json(result, result.ok ? 200 : statusFor(result.reason))
    }

    if (route === '/revocations' && request.method === 'GET') {
      const since = new URL(request.url).searchParams.get('since')
      const result = await revocations({ since }, storeFor(url, serviceKey), new Date().toISOString())
      return json(result)
    }

    return json({ ok: false, reason: 'not_found' }, 404)
  } catch (error) {
    console.error('licence: error interno', error instanceof Error ? error.message : 'desconocido')
    return json({ ok: false, reason: 'server_error' }, 500)
  }
})
