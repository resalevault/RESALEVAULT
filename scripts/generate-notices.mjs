/**
 * RESALEVAULT - Generador de THIRD-PARTY-NOTICES.md
 *
 * Por que existe: al distribuir el programa se incluye codigo de otros. Las
 * licencias MIT, BSD y Apache OBLIGAN a conservar el aviso de copyright y el
 * texto de la licencia. No es opcional y no cuesta dinero; simplemente hay que
 * hacerlo bien y de forma reproducible.
 *
 * Fuente de verdad: `package-lock.json` (versiones exactas instaladas) y el
 * propio `package.json` de cada paquete. No se inventa ninguna licencia.
 *
 * Uso:  npm run notices
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

/** Paquetes que SI se distribuyen dentro del instalador. */
const SHIPPED = new Set([
  'electron',
  'react',
  'react-dom',
  'scheduler',
  'zod',
  'bwip-js'
])

/** Paquetes propios del runtime de Electron que se documentan aparte. */
const RUNTIME_NOTES = [
  {
    name: 'Electron',
    purpose: 'Runtime de la aplicacion de escritorio.',
    note:
      'El instalador incluye Electron, que a su vez empaqueta Chromium y Node.js. ' +
      'electron-builder incluye automaticamente `LICENSE` y `LICENSES.chromium.html` ' +
      'dentro de la carpeta de instalacion.'
  },
  {
    name: 'Chromium',
    purpose: 'Motor de renderizado.',
    note:
      'Distribuido como parte de Electron bajo licencias BSD y otras. El texto completo ' +
      'viaja en `LICENSES.chromium.html` dentro de la instalacion.'
  },
  {
    name: 'Node.js',
    purpose: 'Runtime de JavaScript del proceso principal.',
    note: 'Distribuido como parte de Electron bajo licencia MIT.'
  }
]

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function findLicenseText(name) {
  const dir = join(root, 'node_modules', name)
  if (!existsSync(dir)) return null

  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'licence', 'LICENCE', 'COPYING']
  for (const file of candidates) {
    const path = join(dir, file)
    if (existsSync(path)) {
      try {
        return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim()
      } catch {
        return null
      }
    }
  }
  return null
}

function licenseOf(meta, lockEntry) {
  const raw = meta?.license ?? lockEntry?.license
  if (!raw) return { label: 'NO DECLARADA', texts: [] }
  if (typeof raw === 'string') return { label: raw, texts: [] }
  if (typeof raw === 'object' && raw.type) return { label: raw.type, texts: [] }
  return { label: 'NO DECLARADA', texts: [] }
}

const packages = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith('node_modules/'))
  .map(([path, entry]) => {
    const name = path.replace(/^node_modules\//, '')
    // Se ignoran los paquetes anidados de dependencias de desarrollo profundas.
    const meta = readJson(join(root, path, 'package.json'))
    const { label } = licenseOf(meta, entry)
    return {
      name,
      version: entry.version ?? meta?.version ?? '?',
      license: label,
      author: typeof meta?.author === 'string' ? meta.author : meta?.author?.name ?? '',
      homepage: meta?.homepage ?? (typeof meta?.repository === 'string' ? meta.repository : meta?.repository?.url) ?? '',
      dev: Boolean(entry.dev),
      text: findLicenseText(path)
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const distributed = packages.filter((pkg) => SHIPPED.has(pkg.name))
const development = packages.filter((pkg) => !SHIPPED.has(pkg.name))

const missingLicense = packages.filter((pkg) => pkg.license === 'NO DECLARADA')

const lines = []
lines.push('# RESALEVAULT — Avisos de terceros')
lines.push('')
lines.push(
  'Este archivo se genera automáticamente con `npm run notices` a partir de `package-lock.json`. ' +
    'No editar a mano: los cambios se perderán.'
)
lines.push('')
// Sin marca de tiempo: este archivo esta versionado y la CI comprueba que sigue
// actualizado con `git diff --exit-code`. Una fecha cambiaria en cada ejecucion
// y haria fallar la comprobacion siempre.
lines.push(
  `Contenido derivado de package-lock.json: ${distributed.length} componentes distribuidos, ` +
    `${packages.length} paquetes analizados.`
)
lines.push('')
lines.push('## 1. Componentes distribuidos con el programa')
lines.push('')
lines.push(
  'Estos paquetes forman parte del instalador y su licencia **debe** acompañar a la distribución.'
)
lines.push('')
lines.push('| Paquete | Versión | Licencia |')
lines.push('| --- | --- | --- |')
for (const pkg of distributed) {
  lines.push(`| ${pkg.name} | ${pkg.version} | ${pkg.license} |`)
}
lines.push('')
lines.push('### Componentes del runtime')
lines.push('')
lines.push('| Componente | Función | Nota |')
lines.push('| --- | --- | --- |')
for (const note of RUNTIME_NOTES) {
  lines.push(`| ${note.name} | ${note.purpose} | ${note.note} |`)
}
lines.push('')

lines.push('## 2. Textos de licencia de los componentes distribuidos')
lines.push('')
for (const pkg of distributed) {
  lines.push(`### ${pkg.name} ${pkg.version} — ${pkg.license}`)
  lines.push('')
  if (pkg.author) lines.push(`Autor: ${pkg.author}`)
  if (pkg.homepage) lines.push(`Origen: ${pkg.homepage}`)
  lines.push('')
  if (pkg.text) {
    lines.push('```text')
    lines.push(pkg.text)
    lines.push('```')
  } else {
    lines.push('_El paquete no incluye un archivo de licencia; consulte su repositorio oficial._')
  }
  lines.push('')
}

lines.push('## 3. Dependencias de desarrollo (no se distribuyen)')
lines.push('')
lines.push(
  'Se listan por transparencia. No forman parte del instalador, por lo que no se ' +
    'redistribuyen sus binarios.'
)
lines.push('')
lines.push('| Paquete | Versión | Licencia |')
lines.push('| --- | --- | --- |')
for (const pkg of development) {
  lines.push(`| ${pkg.name} | ${pkg.version} | ${pkg.license} |`)
}
lines.push('')
lines.push(
  `Total: ${packages.length} paquetes (${distributed.length} distribuidos, ${development.length} de desarrollo).`
)
lines.push('')

if (missingLicense.length > 0) {
  lines.push('## 4. Paquetes sin licencia declarada')
  lines.push('')
  lines.push(
    'Se revisan manualmente antes de cada release. Si alguno se distribuyera, habría que ' +
      'confirmar sus condiciones con el autor.'
  )
  lines.push('')
  for (const pkg of missingLicense) lines.push(`- ${pkg.name} ${pkg.version}`)
  lines.push('')
}

lines.push('## 5. Recursos propios')
lines.push('')
lines.push(
  [
    '- Icono, monograma RV, iconografía e ilustraciones: creados para RESALEVAULT.',
    '- Tipografías: se usan fuentes del sistema operativo; no se distribuye ninguna tipografía.',
    '- Logotipos de transportistas: **no se incluye ninguno**. Son marcas registradas sin',
    '  autorización de uso; la aplicación genera un distintivo propio con iniciales.',
    '- Imágenes de producto: las aporta el usuario y se almacenan solo en su equipo.'
  ].join('\n')
)
lines.push('')

writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), lines.join('\n'), 'utf8')

process.stdout.write(
  `THIRD-PARTY-NOTICES.md generado: ${packages.length} paquetes ` +
    `(${distributed.length} distribuidos, ${development.length} de desarrollo).\n`
)
if (missingLicense.length > 0) {
  process.stdout.write(`AVISO: ${missingLicense.length} paquete(s) sin licencia declarada.\n`)
}
