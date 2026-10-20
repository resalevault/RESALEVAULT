import { createHash, generateKeyPairSync, sign as signRaw, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  decodeBase64,
  sha256Hex,
  toHex,
  verifyCode,
  type CodeExpectations
} from '../supabase/functions/licence/code'

/**
 * Pruebas de la verificacion de firmas que ejecuta el backend.
 *
 * Se firman codigos REALES con un par Ed25519 generado aqui (nunca se usa la
 * clave privada del proyecto en las pruebas) y se comprueba que la logica del
 * servidor acepta lo autentico y rechaza todo lo demas.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const OTHER_KEY = generateKeyPairSync('ed25519')

const PUBLIC_KEY_BASE64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

const EXPECTED: CodeExpectations = {
  publicKeyBase64: PUBLIC_KEY_BASE64,
  formatVersion: 1,
  plans: ['free', 'pro', 'business'],
  kinds: ['perpetual', 'subscription', 'founder']
}

const BASE_PAYLOAD = {
  v: 1,
  id: 'lic_prueba_0001',
  plan: 'pro',
  kind: 'subscription',
  holder: 'Cliente de prueba',
  issuedAt: '2026-10-20T10:00:00.000Z',
  expiresAt: null,
  seats: 3
}

function issue(payload: unknown, signer: KeyObject = privateKey): string {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = signRaw(null, raw, signer)
  return `${raw.toString('base64url')}.${signature.toString('base64url')}`
}

function issueBytes(bytes: Buffer): string {
  const signature = signRaw(null, bytes, privateKey)
  return `${bytes.toString('base64url')}.${signature.toString('base64url')}`
}

function withPayload(code: string, replacement: Buffer): string {
  return `${replacement.toString('base64url')}.${code.slice(code.indexOf('.') + 1)}`
}

function withSignature(code: string, replacement: Buffer): string {
  return `${code.slice(0, code.indexOf('.'))}.${replacement.toString('base64url')}`
}

describe('verificacion de codigos (backend)', () => {
  it('acepta un codigo autentico y devuelve su payload', async () => {
    const result = await verifyCode(issue(BASE_PAYLOAD), EXPECTED)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.id).toBe(BASE_PAYLOAD.id)
      expect(result.payload.plan).toBe('pro')
      expect(result.payload.seats).toBe(3)
    }
  })

  it('acepta un codigo con caducidad', async () => {
    const code = issue({ ...BASE_PAYLOAD, expiresAt: '2026-12-31T00:00:00.000Z' })
    const result = await verifyCode(code, EXPECTED)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.expiresAt).toBe('2026-12-31T00:00:00.000Z')
  })

  it('rechaza un payload alterado conservando la firma original', async () => {
    const code = issue(BASE_PAYLOAD)
    const tampered = Buffer.from(JSON.stringify({ ...BASE_PAYLOAD, plan: 'business', seats: 99 }), 'utf8')
    const result = await verifyCode(withPayload(code, tampered), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rechaza una firma alterada', async () => {
    const code = issue(BASE_PAYLOAD)
    const signature = Buffer.from(code.slice(code.indexOf('.') + 1), 'base64url')
    signature[0] ^= 0xff
    const result = await verifyCode(withSignature(code, signature), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rechaza codigos firmados con otra clave publica', async () => {
    const result = await verifyCode(issue(BASE_PAYLOAD, OTHER_KEY.privateKey), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rechaza una version de formato no soportada', async () => {
    const result = await verifyCode(issue({ ...BASE_PAYLOAD, v: 99 }), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'unsupported_version' })
  })

  it('rechaza un plan fuera de la lista', async () => {
    const result = await verifyCode(issue({ ...BASE_PAYLOAD, plan: 'enterprise' }), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'unknown_plan' })
  })

  it('rechaza un tipo de licencia fuera de la lista', async () => {
    const result = await verifyCode(issue({ ...BASE_PAYLOAD, kind: 'trial' }), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza un codigo sin separador', async () => {
    await expect(verifyCode('sindominador', EXPECTED)).resolves.toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza separador al principio o al final', async () => {
    await expect(verifyCode(`.${'a'.repeat(64)}`, EXPECTED)).resolves.toEqual({ ok: false, reason: 'malformed' })
    await expect(verifyCode(`${'a'.repeat(64)}.`, EXPECTED)).resolves.toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza caracteres que no son base64', async () => {
    const result = await verifyCode('ññññ.ññññ', EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza bytes firmados que no son JSON', async () => {
    const result = await verifyCode(issueBytes(Buffer.from('esto no es json }{', 'utf8')), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza un payload firmado que es un array', async () => {
    const result = await verifyCode(issue(['free']), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza un payload firmado que es un numero', async () => {
    const result = await verifyCode(issue(42), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza un id vacio', async () => {
    const result = await verifyCode(issue({ ...BASE_PAYLOAD, id: '' }), EXPECTED)
    expect(result).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rechaza bytes aleatorios con una firma de otro contenido', async () => {
    const bytes = Buffer.alloc(48, 7)
    const foreign = signRaw(null, Buffer.from('otro contenido', 'utf8'), privateKey)
    const result = await verifyCode(
      `${bytes.toString('base64url')}.${foreign.toString('base64url')}`,
      EXPECTED
    )
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })
})

describe('codificacion y resumen', () => {
  it('sha256Hex coincide con la cadena SHA-256 de referencia', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('sha256Hex coincide con el SHA-256 de Node', async () => {
    const text = 'RVLT.licencia-0001'
    await expect(sha256Hex(text)).resolves.toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
  })

  it('decodeBase64 entiende ambos alfabetos y coincide con Buffer', () => {
    for (const sample of ['YWJj', '+/8=', '-_8=', '////', '____', 'aGVsbG8=', 'YQ==']) {
      expect(toHex(decodeBase64(sample).buffer)).toBe(Buffer.from(sample, 'base64').toString('hex'))
    }
  })

  it('decodeBase64 lanza ante entrada invalida', () => {
    expect(() => decodeBase64('!!!!')).toThrow()
  })
})
