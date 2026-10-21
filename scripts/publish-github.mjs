/**
 * RESALEVAULT - Publicacion de la version en GitHub (Ruta A, paso 1-2).
 *
 * QUE HACE
 *   1. Comprueba el estado local (rama, cambios sin commitear, artefactos).
 *   2. Crea el repositorio remoto si no existe (via API de GitHub).
 *   3. Sube el codigo (git push).
 *   4. Crea la Release vX.Y.Z adjuntando el instalador y SHA256SUMS.txt.
 *
 * SEGURIDAD
 *   - Por defecto NO hace nada: solo ENSENA lo que haria (modo simulacion).
 *     Hay que pasar --confirm para que ejecute de verdad.
 *   - Nunca imprime el token. Lo lee de la variable de entorno GH_TOKEN.
 *   - No fuerza nada: si el repo existe o la release ya esta, avisa y para.
 *   - No borra ni sobrescribe releases existentes.
 *
 * REQUISITOS
 *   - git en el PATH.
 *   - curl.exe (viene con Windows 10/11).
 *   - Un token de GitHub con permiso de repositorio en GH_TOKEN:
 *       PowerShell:  $env:GH_TOKEN = "ghp_..."
 *     (Se crea en https://github.com/settings/tokens - scope "repo".)
 *
 * USO
 *   node scripts/publish-github.mjs --repo 16ray/RESALEVAULT
 *   node scripts/publish-github.mjs --repo 16ray/RESALEVAULT --confirm
 *
 * Si no quieres usar un token, la alternativa manual (sin este script) esta en
 * docs/release/PUBLICACION_RUTA_A.md: subir con `git push` y crear la release
 * desde la web de GitHub.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/** Localiza git si no esta en el PATH (caso frecuente en Windows). */
function resolveGit() {
  if (process.env.GIT_EXE) return process.env.GIT_EXE
  try {
    execFileSync('git', ['--version'], { stdio: 'pipe' })
    return 'git'
  } catch {
    // Rutas tipicas de instalacion en Windows.
    const candidates = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    ]
    for (const c of candidates) {
      if (existsSync(c)) return c
    }
    return null
  }
}

const GIT_BIN = resolveGit()

function requireGit() {
  if (!GIT_BIN) {
    throw new Error(
      'No se encuentra git.\n' +
        'Instalalo desde https://git-scm.com/download/win, o indica la ruta con:\n' +
        '  $env:GIT_EXE = "C:\\Program Files\\Git\\cmd\\git.exe"',
    )
  }
  return GIT_BIN
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...options }).trim()
}

/** Ejecuta un comando mostrandolo; en simulacion, solo lo imprime. */
function runOrPrint(cmd, args, { confirm, cwd = ROOT } = {}) {
  const pretty = `${cmd} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
  if (!confirm) {
    console.log(`  [SIMULACION] ${pretty}`)
    return ''
  }
  console.log(`  [EJECUTANDO] ${pretty}`)
  return run(cmd, args, { cwd })
}

/** Llamada a la API de GitHub con curl.exe. Devuelve { status, body }. */
function api(token, method, path, { body, contentType = 'application/json' } = {}) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`
  const args = [
    '-sS',
    '-X', method,
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '-H', 'User-Agent: resalevault-publish',
    '-w', '\n__STATUS__%{http_code}',
    url,
  ]
  if (body) {
    args.push('-H', `Content-Type: ${contentType}`)
    if (contentType === 'application/json') args.push('-d', JSON.stringify(body))
  }
  const raw = run('curl.exe', args)
  const idx = raw.lastIndexOf('\n__STATUS__')
  const status = Number(raw.slice(idx + '__STATUS__'.length).trim())
  const text = raw.slice(0, idx)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status, body: parsed }
}

/** Sube un fichero como asset de una release (subida binaria). */
function uploadAsset(token, uploadUrl, filePath, fileName) {
  const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`)
  const raw = run('curl.exe', [
    '-sS',
    '-X', 'POST',
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Content-Type: application/octet-stream',
    '-H', 'User-Agent: resalevault-publish',
    '--data-binary', `@${filePath}`,
    '-w', '\n__STATUS__%{http_code}',
    url,
  ])
  const idx = raw.lastIndexOf('\n__STATUS__')
  return Number(raw.slice(idx + '__STATUS__'.length).trim())
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function parseArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(name)
    return i === -1 ? undefined : argv[i + 1]
  }
  return {
    repo: get('--repo'),
    confirm: argv.includes('--confirm'),
    tag: get('--tag'),
    printNotes: argv.includes('--print-notes'),
  }
}

/**
 * Construye el texto de la release a partir de la seccion de la version en
 * docs/CHANGELOG.md, para que la release publicada diga lo mismo que el
 * changelog (una sola fuente de verdad). Si no se encuentra la seccion, se
 * avisa y se usa un texto minimo honesto en lugar de inventar contenido.
 */
function buildReleaseNotes(version, tag, installerHash) {
  const changelogPath = join(ROOT, 'docs', 'CHANGELOG.md')
  let section = ''
  if (existsSync(changelogPath)) {
    const md = readFileSync(changelogPath, 'utf8')
    const startRe = new RegExp(`^##\\s+${version.replace(/\./g, '\\.')}\\b.*$`, 'm')
    const start = md.match(startRe)
    if (start && start.index !== undefined) {
      const rest = md.slice(start.index + start[0].length)
      const endIdx = rest.search(/^##\s/m)
      section = (endIdx === -1 ? rest : rest.slice(0, endIdx)).trim()
      // Quita un separador horizontal final (evita un "---" colgando).
      section = section.replace(/\n+-{3,}\s*$/, '').trim()
    }
  }

  if (!section) {
    console.warn(`  AVISO: no hay una seccion "${version}" en docs/CHANGELOG.md; se usa un texto minimo.`)
    section = `Version ${version}. Consulta docs/CHANGELOG.md para el detalle.`
  }

  return [
    `# RESALEVAULT ${tag}`,
    '',
    'Instalador para **Windows 10 / 11 (x64)**. Los datos se guardan en tu equipo y',
    'la aplicacion funciona sin conexion.',
    '',
    `**SHA-256 del instalador:** \`${installerHash}\``,
    '',
    'Comprueba la integridad con el fichero `SHA256SUMS.txt` adjunto:',
    '',
    '```powershell',
    `Get-FileHash .\\RESALEVAULT-Setup-${version}.exe -Algorithm SHA256`,
    '```',
    '',
    '---',
    '',
    section,
    '',
    '---',
    '',
    '> **Aviso honesto:** el instalador no esta firmado por una autoridad de',
    '> certificacion de confianza, asi que Windows puede mostrar un aviso de',
    '> SmartScreen o "editor desconocido". **No hay que desactivar ninguna',
    '> proteccion de Windows** para instalarlo. Tambien esta previsto publicarlo',
    '> en la Microsoft Store (paquete `.appx` listo).',
  ].join('\n')
}

async function main() {
  const { repo, confirm, tag: tagArg, printNotes } = parseArgs(process.argv.slice(2))
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const version = pkg.version
  const tag = tagArg ?? `v${version}`

  // Modo de solo lectura: imprime el texto de la release y termina. No toca
  // nada. Calcula el hash del instalador si existe; si no, usa un marcador.
  if (printNotes) {
    const installerPath = join(ROOT, 'release', `RESALEVAULT-Setup-${version}.exe`)
    const hash = existsSync(installerPath) ? sha256(installerPath) : '(instalador no encontrado)'
    console.log(buildReleaseNotes(version, tag, hash))
    return
  }

  console.log('RESALEVAULT - publicacion en GitHub')
  console.log(`  version : ${version}`)
  console.log(`  etiqueta: ${tag}`)
  console.log(`  modo    : ${confirm ? 'REAL (--confirm)' : 'SIMULACION (nada se ejecuta)'}`)
  console.log('')

  // ---------------------------------------------------------------------
  // 0. Comprobaciones previas (siempre, tambien en simulacion)
  // ---------------------------------------------------------------------
  console.log('1) Comprobaciones previas')

  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Falta --repo con formato propietario/repositorio, p. ej. --repo 16ray/RESALEVAULT')
  }

  const branch = run(requireGit(), ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT })
  console.log(`  rama actual: ${branch}`)

  const dirty = run(requireGit(), ['status', '--porcelain'], { cwd: ROOT })
  if (dirty) {
    console.log('  AVISO: hay cambios sin commitear:')
    for (const line of dirty.split('\n')) console.log(`    ${line}`)
    if (confirm) throw new Error('Hay cambios sin commitear. Haz commit antes de publicar.')
  } else {
    console.log('  arbol de trabajo limpio: OK')
  }

  const installer = join(ROOT, 'release', `RESALEVAULT-Setup-${version}.exe`)
  const sums = join(ROOT, 'release', 'SHA256SUMS.txt')
  if (!existsSync(installer)) {
    throw new Error(
      `No existe el instalador ${installer}.\nGenera antes con: npm run dist:signed`,
    )
  }
  const hash = sha256(installer)
  console.log(`  instalador: ${installer}`)
  console.log(`  SHA-256   : ${hash}`)
  console.log(`  SHA256SUMS.txt en release/: ${existsSync(sums) ? 'si' : 'NO (se subira solo el instalador)'}`)

  const token = process.env.GH_TOKEN
  if (!token) {
    console.log('')
    console.log('  No hay GH_TOKEN en el entorno.')
    console.log('  Sin token, este script no puede crear el repo ni la release.')
    console.log('  Alternativa manual: docs/release/PUBLICACION_RUTA_A.md')
    if (confirm) throw new Error('Falta GH_TOKEN para el modo --confirm.')
    console.log('')
    console.log('  (En simulacion se muestra el resto del plan igualmente.)')
  }

  // ---------------------------------------------------------------------
  // 2. Repositorio remoto
  // ---------------------------------------------------------------------
  console.log('')
  console.log('2) Repositorio remoto')
  let remoteExists = false
  if (token) {
    const res = api(token, 'GET', `/repos/${repo}`)
    remoteExists = res.status === 200
    if (res.status === 404) console.log('  el repositorio NO existe todavia')
    else if (res.status === 200) console.log('  el repositorio ya existe')
    else if (res.status === 401) {
      console.log('  ERROR: el token no es valido (401)')
      if (confirm) throw new Error('Token invalido.')
    } else console.log(`  respuesta inesperada: ${res.status}`)
  } else {
    console.log('  [SIMULACION] se comprobaria si existe el repositorio')
  }

  if (!remoteExists) {
    if (token && confirm) {
      const res = api(token, 'POST', '/user/repos', {
        body: { name: repo.split('/')[1], private: false, description: 'RESALEVAULT', has_issues: true },
      })
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(`No se pudo crear el repositorio: ${res.status} ${JSON.stringify(res.body)}`)
      }
      console.log('  repositorio creado: OK')
    } else {
      console.log('  [SIMULACION] se crearia el repositorio publico')
    }
  }

  // ---------------------------------------------------------------------
  // 3. Remoto de git y push
  // ---------------------------------------------------------------------
  console.log('')
  console.log('3) Subida del codigo')
  const remotes = run(requireGit(), ['remote'], { cwd: ROOT }).split('\n').filter(Boolean)
  const url = `https://github.com/${repo}.git`
  if (!remotes.includes('origin')) {
    runOrPrint(requireGit(), ['remote', 'add', 'origin', url], { confirm })
  } else {
    const current = run(requireGit(), ['remote', 'get-url', 'origin'], { cwd: ROOT })
    console.log(`  origin ya existe: ${current}`)
    if (current !== url) {
      console.log(`  AVISO: origin apunta a otra URL. No se cambia automaticamente.`)
    }
  }
  runOrPrint(requireGit(), ['push', '-u', 'origin', branch], { confirm })

  // ---------------------------------------------------------------------
  // 4. Release
  // ---------------------------------------------------------------------
  console.log('')
  console.log(`4) Release ${tag}`)
  if (token) {
    const existing = api(token, 'GET', `/repos/${repo}/releases/tags/${tag}`)
    if (existing.status === 200) {
      console.log(`  la release ${tag} YA existe. No se toca.`)
      console.log('  Si quieres republicar, borrala a mano y vuelve a lanzar esto.')
      console.log('')
      console.log('Listo. No se ha modificado nada mas.')
      return
    }
    console.log('  la release no existe todavia: se puede crear')
  } else {
    console.log('  [SIMULACION] se comprobaria si la release ya existe')
  }

  if (!confirm) {
    console.log('')
    console.log('  [SIMULACION] se crearia la release con:')
    console.log(`    - cuerpo: seccion ${version} de docs/CHANGELOG.md + aviso de firma`)
    console.log(`    - asset : RESALEVAULT-Setup-${version}.exe`)
    if (existsSync(sums)) console.log('    - asset : SHA256SUMS.txt')
    console.log('')
    console.log('Simulacion terminada. Nada se ha ejecutado. Repite con --confirm para publicar.')
    return
  }

  const notes = buildReleaseNotes(version, tag, hash)
  const rel = api(token, 'POST', `/repos/${repo}/releases`, {
    body: { tag_name: tag, name: `RESALEVAULT ${tag}`, body: notes, draft: false, prerelease: false },
  })
  if (rel.status !== 201) {
    throw new Error(`No se pudo crear la release: ${rel.status} ${JSON.stringify(rel.body)}`)
  }
  console.log('  release creada: OK')

  const uploadUrl = rel.body.upload_url
  const s1 = uploadAsset(token, uploadUrl, installer, `RESALEVAULT-Setup-${version}.exe`)
  console.log(`  instalador subido: ${s1 === 201 ? 'OK' : `estado ${s1}`}`)
  if (existsSync(sums)) {
    const s2 = uploadAsset(token, uploadUrl, sums, 'SHA256SUMS.txt')
    console.log(`  SHA256SUMS.txt subido: ${s2 === 201 ? 'OK' : `estado ${s2}`}`)
  }

  console.log('')
  console.log('Publicado. Comprueba la release en:')
  console.log(`  https://github.com/${repo}/releases/tag/${tag}`)
  console.log('')
  console.log('Siguiente paso (winget), tras confirmar que la descarga funciona:')
  console.log(`  npm run winget:manifests -- --url "https://github.com/${repo}/releases/download/${tag}/RESALEVAULT-Setup-${version}.exe" --repo ${repo}`)
  console.log('  winget validate --manifest ".\\dist-winget\\RESALEVAULT\\RESALEVAULT\\' + version + '"')
  console.log('  (luego, PR a microsoft/winget-pkgs: docs/release/PUBLICACION_RUTA_A.md)')
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`)
  process.exit(1)
})
