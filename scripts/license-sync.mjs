#!/usr/bin/env node
/**
 * Sube el registro local de licencias (`tools/keys/issued-licenses.jsonl`) al
 * proyecto de Supabase.
 *
 * Decisiones:
 *  - La firma se comprueba ANTES de subir. Un registro manipulado no entra.
 *  - Los datos que se publican salen del payload FIRMADO, no de los metadatos
 *    del JSONL: la fuente de verdad es el codigo.
 *  - No se envia `status`: al re-sincronizar no se resucita una licencia
 *    revocada.
 *  - La clave de servicio se lee del entorno (`.env.local`, ignorado por git) y
 *    nunca se imprime.
 *
 * Uso:
 *   npm run license:sync              sube el registro
 *   npm run license:sync -- --dry-run solo verifica, sin subir nada
 */

import { existsSync, readFileSync } from 'node:fs'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { join } from 'node:path'

const ROOT = process.cwd()
const REGISTRY_FILE = join(ROOT, 'tools', 'keys', 'issued-licenses.jsonl')
const APP_KEYS_FILE = join(ROOT, 'src', 'shared', 'license-keys.ts')
const CHUNK_SIZE = 50
/** Verifica el registro sin subir nada: sirve para comprobar sin credenciales. */
const DRY_RUN = process.argv.includes('--dry-run')

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!DRY_RUN) {
  if (!url) fail('Falta SUPABASE_URL. Define https://<ref>.supabase.co en .env.local')
  if (!serviceKey) fail('Falta SUPABASE_SERVICE_ROLE_KEY. Usa la clave SECRETA, no la publishable.')
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    fail('SUPABASE_URL no tiene el formato https://<ref>.supabase.co')
  }
}
if (!existsSync(REGISTRY_FILE)) {
  fail('No hay registro de emisiones. Emite una licencia con: npm run license:new -- --plan pro')
}

const keysSource = readFileSync(APP_KEYS_FILE, 'utf8')
const keyMatch = /LICENSE_PUBLIC_KEY_BASE64\s*=\s*'([^']+)'/.exec(keysSource)
if (!keyMatch) fail('No se pudo leer la clave publica de src/shared/license-keys.ts')

const publicKey = createPublicKey({
  key: Buffer.from(keyMatch[1], 'base64'),
  format: 'der',
  type: 'spki'
})

const lines = readFileSync(REGISTRY_FILE, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

if (lines.length === 0) fail('El registro esta vacio.')

const byId = new Map()

for (const [index, line] of lines.entries()) {
  const label = `linea ${index + 1}`
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    fail(`${label}: no es JSON valido`)
  }

  const code = typeof entry.code === 'string' ? entry.code.trim() : ''
  const separator = code.indexOf('.')
  if (separator <= 0 || separator === code.length - 1) fail(`${label}: codigo con formato invalido`)

  const payloadBytes = Buffer.from(code.slice(0, separator), 'base64url')
  const signature = Buffer.from(code.slice(separator + 1), 'base64url')

  if (!verify(null, payloadBytes, publicKey, signature)) {
    fail(`${label}: la firma no valida con la clave publica de la app`)
  }

  let payload
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'))
  } catch {
    fail(`${label}: payload firmado ilegible`)
  }

  if (typeof payload.id !== 'string' || payload.id.length === 0) fail(`${label}: payload sin id`)
  if (!['free', 'pro', 'business'].includes(payload.plan)) fail(`${label}: plan invalido`)
  if (!['perpetual', 'subscription', 'founder'].includes(payload.kind)) fail(`${label}: tipo invalido`)
  if (!payload.issuedAt || Number.isNaN(Date.parse(payload.issuedAt))) fail(`${label}: fecha de emision invalida`)

  const seats = Number(payload.seats ?? 1)
  if (!Number.isInteger(seats) || seats < 1) fail(`${label}: puestos invalidos`)

  byId.set(payload.id, {
    payload_id: payload.id,
    code,
    code_hash: createHash('sha256').update(code).digest('hex'),
    plan: payload.plan,
    kind: payload.kind,
    holder: String(payload.holder ?? ''),
    seats,
    issued_at: payload.issuedAt,
    expires_at: payload.expiresAt || null,
    updated_at: new Date().toISOString()
  })
}

const rows = [...byId.values()]
process.stdout.write(`Registro verificado: ${rows.length} licencia(s) con firma valida.\n`)

if (DRY_RUN) {
  for (const row of rows) {
    process.stdout.write(
      `  ${row.payload_id} plan=${row.plan} tipo=${row.kind} puestos=${row.seats} ` +
        `caduca=${row.expires_at ?? 'sin caducidad'} sha256=${row.code_hash.slice(0, 12)}...\n`
    )
  }
  process.stdout.write('Modo verificacion: no se ha enviado nada.\n')
  process.exit(0)
}

let uploaded = 0
for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
  const chunk = rows.slice(start, start + CHUNK_SIZE)
  let response
  try {
    response = await fetch(`${url}/rest/v1/licenses?on_conflict=payload_id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(chunk)
    })
  } catch (error) {
    fail(`No se pudo conectar con Supabase: ${error instanceof Error ? error.message : 'error de red'}`)
  }

  if (!response.ok) {
    const body = await response.text()
    fail(`Supabase respondio ${response.status}: ${body.slice(0, 400)}`)
  }
  uploaded += chunk.length
}

process.stdout.write(`Subidas/actualizadas: ${uploaded}.\n`)
process.stdout.write('Hecho. Las licencias ya pueden activarse contra el backend.\n')
