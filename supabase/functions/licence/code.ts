/**
 * Verificacion de codigos de licencia, sin Deno y sin base de datos.
 *
 * Se usa desde la Edge Function (`index.ts`) y se prueba con Vitest. Recibe las
 * constantes como parametro para no depender del sistema de modulos de Deno ni
 * del de Node: el codigo es identico en ambos entornos.
 */

export interface CodeExpectations {
  publicKeyBase64: string
  formatVersion: number
  plans: readonly string[]
  kinds: readonly string[]
}

export interface CodePayload {
  v: number
  id: string
  plan: string
  kind: string
  holder?: string
  issuedAt?: string
  expiresAt?: string | null
  seats?: number
}

export type CodeCheck =
  | { ok: true; payload: CodePayload }
  | { ok: false; reason: 'malformed' | 'unsupported_version' | 'bad_signature' | 'unknown_plan' }

/** Acepta base64 y base64url (la clave publica va en base64 estandar). */
export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return toHex(digest)
}

async function publicKey(base64: string) {
  return crypto.subtle.importKey(
    'spki',
    decodeBase64(base64),
    { name: 'Ed25519' },
    false,
    ['verify']
  )
}

/**
 * Verifica firma, version y campos minimos. No consulta la base de datos: que
 * un codigo sea autentico no significa que este registrado o vigente.
 */
export async function verifyCode(code: string, expected: CodeExpectations): Promise<CodeCheck> {
  const separator = code.indexOf('.')
  if (separator <= 0 || separator === code.length - 1) return { ok: false, reason: 'malformed' }

  const payloadPart = code.slice(0, separator)
  const signaturePart = code.slice(separator + 1)

  let payloadBytes: Uint8Array<ArrayBuffer>
  let signature: Uint8Array<ArrayBuffer>
  try {
    payloadBytes = decodeBase64(payloadPart)
    signature = decodeBase64(signaturePart)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  let valid = false
  try {
    valid = await crypto.subtle.verify('Ed25519', await publicKey(expected.publicKeyBase64), signature, payloadBytes)
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'bad_signature' }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' }
  }

  const payload = parsed as Partial<CodePayload>
  if (payload.v !== expected.formatVersion) return { ok: false, reason: 'unsupported_version' }
  if (typeof payload.id !== 'string' || payload.id.length === 0) return { ok: false, reason: 'malformed' }
  if (typeof payload.plan !== 'string' || !expected.plans.includes(payload.plan)) {
    return { ok: false, reason: 'unknown_plan' }
  }
  if (typeof payload.kind !== 'string' || !expected.kinds.includes(payload.kind)) {
    return { ok: false, reason: 'malformed' }
  }

  return { ok: true, payload: payload as CodePayload }
}
