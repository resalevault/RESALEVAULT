// RESALEVAULT - Generador de manifiestos de winget.
//
// Convierte los datos del release (version, URL del instalador, hash SHA-256) en
// los tres ficheros YAML que exige el esquema 1.12 de winget, con el encabezado
// `# yaml-language-server: $schema=...` que el repositorio microsoft/winget-pkgs
// pide en todos ellos.
//
// Uso:
//   node scripts/winget-manifests.mjs --url <URL> [--repo propietario/repo]
//                                     [--sha256 <hash>] [--id <ID>]
//
// Sin --sha256 se calcula del instalador en release/RESALEVAULT-Setup-<version>.exe.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_VERSION = '1.12.0'
export const DEFAULT_ID = 'RESALEVAULT.RESALEVAULT'
const DEFAULT_LOCALE = 'en-US'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/

function withSchemaHeader(type, body) {
  return `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${type}.1.12.0.schema.json\n${body}`
}

function yamlBlock(pairs) {
  return (
    pairs
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map((item) => `  - ${scalar(item)}`).join('\n')}`
        }
        return `${key}: ${scalar(value)}`
      })
      .join('\n') + '\n'
  )
}

function scalar(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

export const DEFAULT_ID_EXPORT = DEFAULT_ID

export function buildManifests(options) {
  const {
    id = DEFAULT_ID,
    version,
    url,
    sha256,
    repo,
    description,
    publisher = 'RESALEVAULT',
    packageName = 'RESALEVAULT',
    copyright = 'Copyright (c) RESALEVAULT',
    protocols = ['rv-media'],
    locale = DEFAULT_LOCALE,
  } = options

  if (!ID_PATTERN.test(id)) {
    throw new Error(`Identificador de paquete invalido: ${id}`)
  }
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Version invalida (se espera X.Y.Z): ${version}`)
  }
  if (!url || !url.startsWith('https://')) {
    throw new Error('La URL del instalador debe ser HTTPS y apuntar al release del autor')
  }
  if (!sha256 || !SHA256_PATTERN.test(sha256)) {
    throw new Error('Se necesita un hash SHA-256 valido (64 caracteres hexadecimales)')
  }
  if (!description || description.trim().length === 0) {
    throw new Error('Falta la descripcion corta de la aplicacion')
  }
  if (repo !== undefined && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`Repositorio invalido (se espera propietario/repositorio): ${repo}`)
  }

  const hash = sha256.toUpperCase()

  const homepage = repo ? `https://github.com/${repo}` : undefined

  const versionDoc = withSchemaHeader('version', yamlBlock([
    ['PackageIdentifier', id],
    ['PackageVersion', version],
    ['DefaultLocale', locale],
    ['ManifestType', 'version'],
    ['ManifestVersion', MANIFEST_VERSION],
  ]))

  const localePairs = [
    ['PackageIdentifier', id],
    ['PackageVersion', version],
    ['PackageLocale', locale],
    ['PackageName', packageName],
    ['Publisher', publisher],
  ]
  if (homepage) localePairs.push(['PublisherUrl', homepage], ['PackageUrl', homepage])
  localePairs.push(
    ['License', 'Proprietary'],
    ['Copyright', copyright],
    ['ShortDescription', description],
    ['ManifestType', 'defaultLocale'],
    ['ManifestVersion', MANIFEST_VERSION],
  )
  const defaultLocaleDoc = withSchemaHeader('defaultLocale', yamlBlock(localePairs))

  const installerPairs = [
    ['PackageIdentifier', id],
    ['PackageVersion', version],
    // NSIS: el cliente winget ya sabe que el modo silencioso es /S.
    ['InstallerType', 'nullsoft'],
    ['Scope', 'user'],
    ['UpgradeBehavior', 'install'],
  ]
  if (protocols.length > 0) {
    installerPairs.push(['Protocols', protocols])
  }
  // La lista `Installers` (obligatoria) lleva la URL y el hash de cada binario,
  // anidados con sangria de dos espacios por nivel.
  const installerHead = yamlBlock(installerPairs)
  const installerDoc = withSchemaHeader(
    'installer',
    `${installerHead}Installers:\n` +
      `  - Architecture: "x64"\n` +
      `    InstallerUrl: ${scalar(url)}\n` +
      `    InstallerSha256: ${scalar(hash)}\n` +
      yamlBlock([
        ['ManifestType', 'installer'],
        ['ManifestVersion', MANIFEST_VERSION],
      ]),
  )

  return { versionDoc, defaultLocaleDoc, installerDoc }
}

export function manifestFileNames(id) {
  return {
    versionFile: `${id}.yaml`,
    defaultLocaleFile: `${id}.${DEFAULT_LOCALE}.yaml`,
    installerFile: `${id}.installer.yaml`,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const get = (name) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(here, '..')
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))

  const id = get('--id') ?? DEFAULT_ID
  const url = get('--url')
  const repo = get('--repo')
  let sha256 = get('--sha256')

  if (!url) {
    throw new Error(
      'Falta --url. Ejemplo: --url https://github.com/<propietario>/RESALEVAULT/releases/download/v' +
        `${pkg.version}/RESALEVAULT-Setup-${pkg.version}.exe`,
    )
  }

  if (!sha256) {
    const installerPath = path.join(root, 'release', `RESALEVAULT-Setup-${pkg.version}.exe`)
    try {
      await access(installerPath)
    } catch {
      throw new Error(
        `No se encuentra ${installerPath}. Pasa el hash con --sha256 o genera antes el instalador (npm run dist).`,
      )
    }
    const bytes = await readFile(installerPath)
    sha256 = createHash('sha256').update(bytes).digest('hex')
  }

  const { versionDoc, defaultLocaleDoc, installerDoc } = buildManifests({
    id,
    version: pkg.version,
    url,
    sha256,
    repo,
    description: pkg.description,
  })

  const names = manifestFileNames(id)
  const outDir = path.join(root, 'dist-winget', id.split('.')[0], id.split('.')[1], pkg.version)
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, names.versionFile), versionDoc, 'utf8')
  await writeFile(path.join(outDir, names.defaultLocaleFile), defaultLocaleDoc, 'utf8')
  await writeFile(path.join(outDir, names.installerFile), installerDoc, 'utf8')

  process.stdout.write(`Manifiestos escritos en ${outDir}\n`)
  process.stdout.write(`  ${names.versionFile}\n`)
  process.stdout.write(`  ${names.defaultLocaleFile}\n`)
  process.stdout.write(`  ${names.installerFile}\n\n`)
  process.stdout.write('Siguiente paso (requiere winget en Windows):\n')
  process.stdout.write(`  winget validate --manifest "${outDir}"\n`)
  process.stdout.write(
    'Luego, siguiendo docs/DISTRIBUCION.md: fork de microsoft/winget-pkgs y Pull Request.\n',
  )
}

// Solo se ejecuta como script, no al importarlo desde las pruebas.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  })
}