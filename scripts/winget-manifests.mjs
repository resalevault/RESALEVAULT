// RESALEVAULT - generador de manifiestos winget (esquema 1.12).
//
// Genera los tres ficheros YAML que exige el repositorio comunitario
// microsoft/winget-pkgs (version, defaultLocale e installer). No descarga nada
// ni envia nada: solo escribe los manifiestos en disco para que se validen con
// `winget validate --manifest <carpeta>` y se manden en un Pull Request.
//
// Esquema 1.12 (no 1.6, que esta obsoleto): es el que recomienda la plantilla
// de Pull Request de microsoft/winget-pkgs. Ademas, cada fichero lleva la
// cabecera `# yaml-language-server: $schema=...` que la guia de contribucion
// exige en TODOS los manifiestos.
//
// Uso:
//   node scripts/winget-manifests.mjs --url <url-del-release> [--sha256 <hex>]
//        [--id Publisher.Paquete] [--repo propietario/repositorio]
//
// Sin --sha256 se calcula desde release/RESALEVAULT-Setup-<version>.exe.
// Documentacion del proceso completo: docs/DISTRIBUCION.md

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ID = 'RESALEVAULT.RESALEVAULT'
// Version de esquema recomendada por la plantilla de PR de microsoft/winget-pkgs.
const MANIFEST_VERSION = '1.12.0'
const DEFAULT_LOCALE = 'en-US'

// Cabecera obligatoria en el repositorio comunitario (guia de contribucion,
// requisito 6). El formato exacto que espera el validador es el acortador
// `https://aka.ms/winget-manifest.<tipo>.<version>.schema.json`.
const SCHEMA_BASE = 'https://aka.ms/winget-manifest'
const SCHEMA_HEADERS = {
  version: `${SCHEMA_BASE}.version.${MANIFEST_VERSION}.schema.json`,
  defaultLocale: `${SCHEMA_BASE}.defaultLocale.${MANIFEST_VERSION}.schema.json`,
  installer: `${SCHEMA_BASE}.installer.${MANIFEST_VERSION}.schema.json`,
}

/** Antepone la cabecera de esquema que exige microsoft/winget-pkgs. */
function withSchemaHeader(kind, doc) {
  return `# yaml-language-server: $schema=${SCHEMA_HEADERS[kind]}\n${doc}`
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/

/** Escapa un valor escalar para que sea seguro dentro de comillas dobles YAML. */
function scalar(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** Convierte pares clave/valor en lineas YAML (orden fijo, determinista). */
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

/**
 * Valida las entradas y devuelve el contenido de los tres manifiestos.
 * Lanza Error con mensaje en espanol si algo no cumple el esquema.
 */
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

/** Calcula el nombre de fichero oficial de cada manifiesto. */
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
