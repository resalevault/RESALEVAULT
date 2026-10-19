/**
 * RESALEVAULT - Herramienta administrativa de licencias.
 *
 * IMPORTANTE: este script es el UNICO sitio del proyecto que usa la clave
 * PRIVADA. No forma parte de la aplicacion, no se empaqueta y no debe
 * distribuirse a los clientes.
 *
 * La clave privada vive en `tools/keys/license-private.pem`, que esta excluido
 * del paquete (`electron-builder.yml` solo incluye `out/` y `package.json`) y
 * anotado en `.gitignore`.
 *
 * Uso:
 *   npm run license:keygen                              (genera un par nuevo)
 *   npm run license:new -- --plan pro --kind founder --holder "Nombre"
 *   npm run license:verify -- --code <codigo>
 *
 * NO se generan las 400 licencias fundadoras de golpe: se emiten una a una
 * cuando el sistema de licencias este probado y haya clientes reales.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify as verifyRaw } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const KEY_DIR = join(process.cwd(), 'tools', 'keys')
const PRIVATE_KEY_FILE = join(KEY_DIR, 'license-private.pem')
const PUBLIC_KEY_FILE = join(KEY_DIR, 'license-public.txt')

const FORMAT_VERSION = 1
const ALLOWED_PLANS = ['free', 'pro', 'business']
const ALLOWED_KINDS = ['perpetual', 'subscription', 'founder']

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      index += 1
    }
  }
  return args
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateKeys() {
  mkdirSync(KEY_DIR, { recursive: true })
  if (existsSync(PRIVATE_KEY_FILE)) {
    process.stderr.write(
      `Ya existe una clave privada en ${PRIVATE_KEY_FILE}.\n` +
        'Si la sustituyes, TODAS las licencias ya emitidas dejaran de validar.\n' +
        'Borrala a mano si de verdad quieres rotar la clave.\n'
    )
    process.exitCode = 1
    return
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(PRIVATE_KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8')
  const publicDer = publicKey.export({ type: 'spki', format: 'der' })
  writeFileSync(PUBLIC_KEY_FILE, publicDer.toString('base64'), 'utf8')

  process.stdout.write(`Clave privada: ${PRIVATE_KEY_FILE}\n`)
  process.stdout.write(`Clave publica: ${PUBLIC_KEY_FILE}\n\n`)
  process.stdout.write('Copia este valor en src/shared/license-keys.ts:\n')
  process.stdout.write(`LICENSE_PUBLIC_KEY_BASE64 = '${publicDer.toString('base64')}'\n`)
}

function loadPrivateKey() {
  if (!existsSync(PRIVATE_KEY_FILE)) {
    process.stderr.write(`No se encuentra la clave privada en ${PRIVATE_KEY_FILE}.\nEjecuta: npm run license:keygen\n`)
    process.exit(1)
  }
  return createPrivateKey(readFileSync(PRIVATE_KEY_FILE, 'utf8'))
}

function issue(args) {
  const plan = String(args.plan ?? '').toLowerCase()
  const kind = String(args.kind ?? '').toLowerCase()

  if (!ALLOWED_PLANS.includes(plan)) {
    process.stderr.write(`Plan invalido: "${plan}". Valores: ${ALLOWED_PLANS.join(', ')}\n`)
    process.exit(1)
  }
  if (!ALLOWED_KINDS.includes(kind)) {
    process.stderr.write(`Tipo invalido: "${kind}". Valores: ${ALLOWED_KINDS.join(', ')}\n`)
    process.exit(1)
  }

  const payload = {
    v: FORMAT_VERSION,
    id: `lic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    plan,
    kind,
    holder: args.holder ? String(args.holder) : '',
    issuedAt: new Date().toISOString(),
    expiresAt: args.expires ? new Date(String(args.expires)).toISOString() : null,
    seats: args.seats ? Number(args.seats) : 1,
    notes: args.notes ? String(args.notes) : ''
  }

  const raw = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = sign(null, raw, loadPrivateKey())
  const code = `${toBase64Url(raw)}.${toBase64Url(signature)}`

  process.stdout.write('\nLicencia emitida\n================\n')
  process.stdout.write(`Identificador : ${payload.id}\n`)
  process.stdout.write(`Plan          : ${plan} (${kind})\n`)
  process.stdout.write(`Titular       : ${payload.holder || '-'}\n`)
  process.stdout.write(`Caduca        : ${payload.expiresAt ?? 'nunca (permanente)'}\n`)
  process.stdout.write(`Puestos       : ${payload.seats}\n\n`)
  process.stdout.write('Codigo de activacion (entregar al cliente):\n\n')
  process.stdout.write(code + '\n\n')
}

function verify(args) {
  const code = String(args.code ?? '')
  if (!code) {
    process.stderr.write('Falta --code\n')
    process.exit(1)
  }

  const separator = code.indexOf('.')
  const raw = Buffer.from(code.slice(0, separator).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const signature = Buffer.from(code.slice(separator + 1).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  if (!existsSync(PUBLIC_KEY_FILE)) {
    process.stderr.write('No hay clave publica guardada en tools/keys.\n')
    process.exit(1)
  }

  const publicKey = createPublicKey({
    key: Buffer.from(readFileSync(PUBLIC_KEY_FILE, 'utf8').trim(), 'base64'),
    format: 'der',
    type: 'spki'
  })

  const ok = verifyRawWrapper(raw, signature, publicKey)
  process.stdout.write(ok ? 'Firma CORRECTA\n' : 'Firma INVALIDA\n')
  process.stdout.write(raw.toString('utf8') + '\n')
  process.exitCode = ok ? 0 : 1
}

function verifyRawWrapper(data, signature, publicKey) {
  try {
    return verifyRaw(null, data, publicKey, signature)
  } catch {
    return false
  }
}

const [command, ...rest] = process.argv.slice(2)
const args = parseArgs(rest)

switch (command) {
  case 'keygen':
    generateKeys()
    break
  case 'new':
    issue(args)
    break
  case 'verify':
    verify(args)
    break
  default:
    process.stdout.write(
      'Uso:\n' +
        '  node scripts/generate-license.mjs keygen\n' +
        '  node scripts/generate-license.mjs new --plan pro --kind founder --holder "Nombre" [--expires 2027-01-01] [--seats 1]\n' +
        '  node scripts/generate-license.mjs verify --code <codigo>\n'
    )
}
