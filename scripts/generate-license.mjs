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
 *   npm run license:list                                (registro de emision)
 *
 * Cada licencia emitida se anota en `tools/keys/issued-licenses.jsonl` (fichero
 * PRIVADO, excluido de Git): permite auditar quien tiene que y recuperar un
 * codigo si el cliente lo pierde.
 *
 * NO se generan las 400 licencias fundadoras de golpe: se emiten una a una
 * cuando haya clientes reales. Ejecuta `license:list` para ver el progreso.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify as verifyRaw } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KEY_DIR = join(process.cwd(), 'tools', 'keys')
const PRIVATE_KEY_FILE = join(KEY_DIR, 'license-private.pem')
const PUBLIC_KEY_FILE = join(KEY_DIR, 'license-public.txt')

/**
 * Registro de emision (auditoria). Una linea JSON por licencia emitida.
 *
 * Es un fichero PRIVADO: contiene los codigos completos entregados a clientes.
 * Vive junto a la clave privada, esta excluido de Git y no se empaqueta.
 *
 * Existe porque emitir codigos sin poder auditar quien tiene que es un riesgo
 * real: si un cliente dice "he perdido mi licencia" o hay que revocar una, este
 * registro es lo unico que lo permite.
 */
const REGISTRY_FILE = join(KEY_DIR, 'issued-licenses.jsonl')

/**
 * Cuotas fundadoras. DEBE coincidir con FOUNDER_QUOTA de src/shared/plans.ts.
 * Se duplica aqui porque este script es Node puro (sin compilar TypeScript).
 */
const FOUNDER_QUOTA = { pro: 200, business: 200 }

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

  const registered = registerIssued(payload, code)

  process.stdout.write('\nLicencia emitida\n================\n')
  process.stdout.write(`Identificador : ${payload.id}\n`)
  process.stdout.write(`Plan          : ${plan} (${kind})\n`)
  process.stdout.write(`Titular       : ${payload.holder || '-'}\n`)
  process.stdout.write(`Caduca        : ${payload.expiresAt ?? 'nunca (permanente)'}\n`)
  process.stdout.write(`Puestos       : ${payload.seats}\n\n`)
  process.stdout.write('Codigo de activacion (entregar al cliente):\n\n')
  process.stdout.write(code + '\n\n')
  process.stdout.write(
    registered
      ? `Registrada en ${REGISTRY_FILE}\n`
      : 'AVISO: no se ha podido escribir el registro de emision. Guarda el codigo a mano.\n'
  )
  process.stdout.write('Puedes recuperarla despues con: npm run license:list\n')
}

/** Anota la emision en el registro. Devuelve false si no se pudo escribir. */
function registerIssued(payload, code) {
  try {
    mkdirSync(KEY_DIR, { recursive: true })
    const entry = {
      at: new Date().toISOString(),
      id: payload.id,
      plan: payload.plan,
      kind: payload.kind,
      holder: payload.holder || '',
      seats: payload.seats,
      expiresAt: payload.expiresAt,
      code
    }
    appendFileSync(REGISTRY_FILE, JSON.stringify(entry) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Carga la clave publica con la que se verifican las licencias.
 *
 * Se prefiere `tools/keys/license-public.txt`, pero si no existe se lee la
 * clave INCRUSTADA en la aplicacion (`src/shared/license-keys.ts`). Verificar
 * contra esa clave es de hecho lo mas util: demuestra que el codigo del
 * registro sera aceptado por la aplicacion que se distribuye.
 */
function loadVerificationKey() {
  if (existsSync(PUBLIC_KEY_FILE)) {
    return {
      key: createPublicKey({
        key: Buffer.from(readFileSync(PUBLIC_KEY_FILE, 'utf8').trim(), 'base64'),
        format: 'der',
        type: 'spki'
      }),
      source: PUBLIC_KEY_FILE,
      matchesApp: null
    }
  }

  const appKeysFile = join(process.cwd(), 'src', 'shared', 'license-keys.ts')
  if (existsSync(appKeysFile)) {
    const match = /LICENSE_PUBLIC_KEY_BASE64\s*=\s*'([^']+)'/.exec(readFileSync(appKeysFile, 'utf8'))
    if (match) {
      return {
        key: createPublicKey({
          key: Buffer.from(match[1], 'base64'),
          format: 'der',
          type: 'spki'
        }),
        source: `${appKeysFile} (clave incrustada en la aplicacion)`,
        matchesApp: true
      }
    }
  }

  return null
}

/**
 * Muestra el registro de emision y REVERIFICA la firma de cada licencia.
 * Sirve para responder "quien tiene que", "cuantas quedan" y "¿sigue siendo
 * valido lo que entregue?".
 */
function listIssued() {
  if (!existsSync(REGISTRY_FILE)) {
    process.stdout.write(`No hay registro de emision todavia (${REGISTRY_FILE}).\n`)
    process.stdout.write('Se creara al emitir la primera licencia con "new".\n')
    return
  }

  const lines = readFileSync(REGISTRY_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  const verificationKey = loadVerificationKey()

  const rows = []
  let corrupted = 0
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line))
    } catch {
      corrupted += 1
    }
  }

  process.stdout.write(`Registro: ${REGISTRY_FILE}\n`)
  process.stdout.write(`Total emitidas: ${rows.length}\n`)
  if (verificationKey) {
    process.stdout.write(`Verificando con: ${verificationKey.source}\n`)
  } else {
    process.stdout.write('AVISO: no hay clave publica disponible; no se verifican las firmas.\n')
  }
  if (corrupted > 0) {
    process.stdout.write(`AVISO: ${corrupted} linea(s) ilegible(s) en el registro.\n`)
  }
  process.stdout.write('\n')

  const header = ['Fecha', 'Identificador', 'Plan', 'Tipo', 'Titular', 'Puestos', 'Firma']
  process.stdout.write(header.join('\t') + '\n')

  let badSignatures = 0
  const counts = {}
  for (const row of rows) {
    counts[row.plan] = (counts[row.plan] ?? 0) + 1

    let signatureText = 'no comprobada'
    if (verificationKey && typeof row.code === 'string') {
      const separator = row.code.indexOf('.')
      const ok =
        separator > 0 &&
        verifyRawWrapper(
          Buffer.from(row.code.slice(0, separator).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
          Buffer.from(row.code.slice(separator + 1).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
          verificationKey.key
        )
      signatureText = ok ? 'OK' : 'ALTERADA'
      if (!ok) badSignatures += 1
    }

    process.stdout.write(
      [
        String(row.at ?? '').slice(0, 19).replace('T', ' '),
        row.id ?? '-',
        row.plan ?? '-',
        row.kind ?? '-',
        row.holder || '(sin titular)',
        row.seats ?? 1,
        signatureText
      ].join('\t') + '\n'
    )
  }

  process.stdout.write('\nResumen por plan:\n')
  for (const plan of ['pro', 'business']) {
    const issued = counts[plan] ?? 0
    process.stdout.write(`  ${plan}: ${issued} emitidas / ${FOUNDER_QUOTA[plan]} de la cuota fundadora\n`)
  }

  if (badSignatures > 0) {
    process.stdout.write(`\nATENCION: ${badSignatures} licencia(s) del registro NO validan.\n`)
    process.exitCode = 1
  }
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
  case 'list':
    listIssued()
    break
  default:
    process.stdout.write(
      'Uso:\n' +
        '  node scripts/generate-license.mjs keygen\n' +
        '  node scripts/generate-license.mjs new --plan pro --kind founder --holder "Nombre" [--expires 2027-01-01] [--seats 1]\n' +
        '  node scripts/generate-license.mjs verify --code <codigo>\n' +
        '  node scripts/generate-license.mjs list\n'
    )
}
