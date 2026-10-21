/**
 * RESALEVAULT - Construye la carpeta de entrega RESALEVAULT_RELEASE en el
 * escritorio REAL del usuario (no se asume C:\Users\Nombre\Desktop).
 *
 * Reglas que respeta este script:
 *  - Copia UNICAMENTE artefactos finales y documentacion de distribucion.
 *  - No copia temporales, caches, node_modules, el repositorio ni credenciales.
 *  - No inventa instaladores: si un artefacto no existe, lo dice y no lo copia.
 *  - Genera los SHA-256 leyendo los ficheros reales ya copiados.
 *  - Comprueba que lo copiado coincide byte a byte con el original.
 *  - NUNCA presenta un .exe de Windows como si fuera de macOS.
 *
 * Uso:  node scripts/build-release-folder.mjs
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version

// --- Escritorio real ------------------------------------------------------
// En Windows puede estar redirigido a OneDrive. Se pregunta al sistema.
function realDesktop() {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "[Environment]::GetFolderPath('Desktop')"
        ],
        { encoding: 'utf8' }
      ).trim()
      if (out && existsSync(out)) return out
    } catch {
      // Se intenta la ruta habitual como ultimo recurso.
    }
  }
  return join(homedir(), 'Desktop')
}

const desktop = realDesktop()
const releaseDir = join(desktop, 'RESALEVAULT_RELEASE')

const log = (msg) => process.stdout.write(`${msg}\n`)
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

// --- Utilidades de copia --------------------------------------------------
const reports = []

function copyVerified(from, to, label) {
  if (!existsSync(from)) {
    log(`  [OMITIDO] ${label}: no existe ${from}`)
    reports.push({ label, status: 'ausente', from })
    return null
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  const srcHash = sha256(from)
  const dstHash = sha256(to)
  const ok = srcHash === dstHash
  const size = statSync(to).size
  log(`  [${ok ? 'OK' : 'ERROR'}] ${label} — ${basename(to)} (${mb(size)})`)
  if (!ok) throw new Error(`La copia de ${label} no coincide con el original`)
  reports.push({ label, status: 'copiado', file: basename(to), bytes: size, sha256: dstHash })
  return { file: to, sha256: dstHash, bytes: size }
}

function writeText(relative, text, label) {
  const to = join(releaseDir, relative)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, text, 'utf8')
  log(`  [OK] ${label} — ${relative}`)
}

function sumsFile(entries, title) {
  const lines = entries
    .map((e) => `${e.sha256}  ${e.file}`)
    .join('\n')
  return `# ${title}\n# Generado leyendo los ficheros reales de esta carpeta.\n${lines}\n`
}

// --- Limpieza y estructura ------------------------------------------------
if (existsSync(releaseDir)) {
  // Solo se borra la carpeta de entrega que genera este script, nunca otra cosa.
  log(`Reconstruyendo ${releaseDir}`)
  rmSync(releaseDir, { recursive: true, force: true })
}
log(`Carpeta de entrega: ${releaseDir}`)

const setupExe = join(root, 'release', `RESALEVAULT-Setup-${version}.exe`)
const appx = join(root, 'release', `RESALEVAULT-Store-${version}.appx`)
const thirdParty = join(root, 'THIRD-PARTY-NOTICES.md')

// =========================================================================
// Windows
// =========================================================================
log('\nWindows')
const winEntries = []
const winSetup = copyVerified(setupExe, join(releaseDir, 'Windows', basename(setupExe)), 'Instalador NSIS')
if (winSetup) winEntries.push({ file: basename(setupExe), sha256: winSetup.sha256, bytes: winSetup.bytes })
const winAppx = copyVerified(appx, join(releaseDir, 'Windows', basename(appx)), 'Paquete AppX (Store)')
if (winAppx) winEntries.push({ file: basename(appx), sha256: winAppx.sha256, bytes: winAppx.bytes })

copyVerified(thirdParty, join(releaseDir, 'Windows', 'THIRD-PARTY-NOTICES.md'), 'Avisos de terceros')
copyVerified(
  join(root, 'scripts', 'verify-install.ps1'),
  join(releaseDir, 'Windows', 'verify-install.ps1'),
  'Kit de verificacion en maquina limpia'
)
copyVerified(
  join(root, 'docs', 'release', 'README-Windows.txt'),
  join(releaseDir, 'Windows', 'README-Windows.txt'),
  'README de Windows'
)

if (winEntries.length > 0) {
  writeText(
    'Windows/SHA256SUMS.txt',
    sumsFile(winEntries, `RESALEVAULT ${version} — Windows`),
    'SHA256SUMS'
  )
}

// =========================================================================
// macOS — solo lo que se pueda generar desde Windows
// =========================================================================
log('\nmacOS')
const macDir = join(releaseDir, 'macOS')
mkdirSync(macDir, { recursive: true })
// No existe ningun .dmg real: no se inventa ni se copia el .exe de Windows.
const macBuildable = existsSync(join(root, 'release', `RESALEVAULT-${version}-arm64.dmg`))
if (macBuildable) {
  copyVerified(
    join(root, 'release', `RESALEVAULT-${version}-arm64.dmg`),
    join(macDir, `RESALEVAULT-${version}-arm64.dmg`),
    'DMG macOS (arm64)'
  )
} else {
  log('  [BLOQUEADO] No hay .dmg: macOS no se puede compilar desde Windows.')
}
copyVerified(
  join(root, 'docs', 'release', 'README-macOS.txt'),
  join(macDir, 'README-macOS.txt'),
  'README de macOS'
)

// =========================================================================
// Documentation
// =========================================================================
log('\nDocumentation')
const docsDir = join(releaseDir, 'Documentation')
mkdirSync(docsDir, { recursive: true })
const docFiles = [
  'RELEASE_REPORT.md',
  'TEST_RESULTS.md',
  'KNOWN_ISSUES.md',
  'IP_PROTECTION_REPORT.md',
  'MACOS_STATUS.md',
  'STORE_LISTING.md',
  'PUBLICACION_RUTA_A.md',
  'WINGET_PR_BODY.md',
  'ENVIO_STORE.md',
  'CAPTURAS.md'
]
for (const name of docFiles) {
  const src = join(root, 'docs', 'release', name)
  if (existsSync(src)) {
    copyVerified(src, join(docsDir, name), `Documento ${name}`)
  } else {
    log(`  [OMITIDO] Falta docs/release/${name}`)
  }
}

// =========================================================================
// Comprobacion final: nada de secretos ni temporales en la entrega
// =========================================================================
log('\nComprobacion de la entrega')
const forbidden = ['.env', 'node_modules', '.git', 'coverage', 'dist-winget']
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}
const allFiles = walk(releaseDir)
const problems = []
for (const f of allFiles) {
  const rel = f.replace(releaseDir, '')
  if (forbidden.some((bad) => rel.includes(bad))) problems.push(`Ruta prohibida: ${rel}`)
  if (f.endsWith('.map')) problems.push(`Mapa de codigo: ${rel}`)
}

// Los ficheros de texto no deben contener VALORES de credenciales reales. Se
// buscan solo formas que serian un secreto de verdad, no la mera mencion del
// nombre del patron (la documentacion explica que se busco y no se encontro).
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/, // clave secreta real de Supabase
  /eyJhbGciOi[A-Za-z0-9_-]{20,}/, // JWT real
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/ // clave privada real
]
for (const f of allFiles) {
  if (/\.(txt|md|json|yml|yaml|ps1)$/i.test(f)) {
    const text = readFileSync(f, 'utf8')
    for (const p of secretPatterns) {
      if (p.test(text)) problems.push(`Posible credencial en ${f.replace(releaseDir, '')}`)
    }
  }
}

log(`  Archivos en la entrega: ${allFiles.length}`)
if (problems.length > 0) {
  for (const p of problems) log(`  [ERROR] ${p}`)
  process.exitCode = 1
} else {
  log('  [OK] Sin temporales, sin mapas y sin credenciales.')
}

log('\nResumen:')
for (const r of reports) {
  log(`  ${r.status === 'copiado' ? '•' : '·'} ${r.label}: ${r.status}${r.sha256 ? ` (${r.sha256.slice(0, 16)}…)` : ''}`)
}
log(`\nEntrega en: ${releaseDir}`)
