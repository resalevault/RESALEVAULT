import { describe, expect, it } from 'vitest'
import { buildManifests, manifestFileNames, DEFAULT_ID } from '../scripts/winget-manifests.mjs'

const VALID = {
  version: '0.5.0',
  url: 'https://github.com/ejemplo/RESALEVAULT/releases/download/v0.5.0/RESALEVAULT-Setup-0.5.0.exe',
  sha256: 'd75a7b23ae068af141eef41947fe55853b2b4403a6af2ab2cbcd655aefbe8141',
  description: 'Gestion profesional de compraventa e inventario para resellers.',
}

describe('buildManifests', () => {
  it('genera los tres manifiestos del esquema 1.12 (el recomendado por la plantilla de PR)', () => {
    const { versionDoc, defaultLocaleDoc, installerDoc } = buildManifests(VALID)

    expect(versionDoc).toContain('ManifestType: "version"')
    expect(versionDoc).toContain('ManifestVersion: "1.12.0"')
    expect(defaultLocaleDoc).toContain('ManifestType: "defaultLocale"')
    expect(installerDoc).toContain('ManifestType: "installer"')
    expect(installerDoc).toContain('ManifestVersion: "1.12.0"')
    // El esquema 1.6 esta obsoleto: no debe aparecer en ningun fichero.
    for (const doc of [versionDoc, defaultLocaleDoc, installerDoc]) {
      expect(doc).not.toContain('1.6.0')
    }
  })

  it('antepone la cabecera yaml-language-server que exige el repositorio', () => {
    const { versionDoc, defaultLocaleDoc, installerDoc } = buildManifests(VALID)
    const cases = [
      [versionDoc, 'winget-manifest.version.1.12.0.schema.json'],
      [defaultLocaleDoc, 'winget-manifest.defaultLocale.1.12.0.schema.json'],
      [installerDoc, 'winget-manifest.installer.1.12.0.schema.json'],
    ]
    for (const [doc, schema] of cases) {
      expect(doc.startsWith('# yaml-language-server: $schema=')).toBe(true)
      expect(doc.split('\n')[0]).toContain(schema)
    }
  })

  it('usa el mismo identificador y version en los tres ficheros', () => {
    const { versionDoc, defaultLocaleDoc, installerDoc } = buildManifests(VALID)
    for (const doc of [versionDoc, defaultLocaleDoc, installerDoc]) {
      expect(doc).toContain(`PackageIdentifier: "${DEFAULT_ID}"`)
      expect(doc).toContain('PackageVersion: "0.5.0"')
    }
  })

  it('convierte el hash a mayusculas, como exige winget', () => {
    const { installerDoc } = buildManifests(VALID)
    expect(installerDoc).toContain(`InstallerSha256: "${VALID.sha256.toUpperCase()}"`)
    expect(installerDoc).not.toContain(VALID.sha256)
  })

  it('declara el instalador NSIS silencioso y el protocolo de la app', () => {
    const { installerDoc } = buildManifests(VALID)
    expect(installerDoc).toContain('InstallerType: "nullsoft"')
    expect(installerDoc).toContain('Scope: "user"')
    expect(installerDoc).toContain('Protocols:\n  - "rv-media"')
  })

  it('incluye PackageName en el locale (obligatorio)', () => {
    const { defaultLocaleDoc } = buildManifests(VALID)
    expect(defaultLocaleDoc).toContain('PackageName: "RESALEVAULT"')
  })

  it('anida URL y hash dentro de la lista Installers', () => {
    const { installerDoc } = buildManifests(VALID)
    expect(installerDoc).toContain('Installers:\n  - Architecture: "x64"\n')
    expect(installerDoc).toMatch(
      /Installers:\n {2}- Architecture: "x64"\n {4}InstallerUrl: "https:\/\/[^\n]+\n {4}InstallerSha256: "[0-9A-F]{64}"\n/,
    )
    // La URL y el hash NO van en la raiz del manifiesto.
    expect(installerDoc).not.toMatch(/^InstallerUrl:/m)
    expect(installerDoc).not.toMatch(/^InstallerSha256:/m)
  })

  it('es determinista: dos ejecuciones producen texto identico', () => {
    const a = buildManifests(VALID)
    const b = buildManifests(VALID)
    expect(a).toEqual(b)
  })

  it('escapa comillas dobles de la descripcion', () => {
    const { defaultLocaleDoc } = buildManifests({
      ...VALID,
      description: 'Titulo con "comillas" y \\ barra invertida',
    })
    expect(defaultLocaleDoc).toContain('Titulo con \\"comillas\\" y \\\\ barra invertida')
  })

  it('incluye las URLs del repositorio solo si se indican', () => {
    const conRepo = buildManifests({ ...VALID, repo: 'usuario/RESALEVAULT' })
    expect(conRepo.defaultLocaleDoc).toContain('https://github.com/usuario/RESALEVAULT')
    const sinRepo = buildManifests(VALID)
    expect(sinRepo.defaultLocaleDoc).not.toContain('github.com')
  })

  it('anade LicenseUrl (lo piden los revisores para paquetes propietarios)', () => {
    // Con repositorio: se deriva a los terminos publicados en el repo.
    const conRepo = buildManifests({ ...VALID, repo: 'usuario/RESALEVAULT' })
    expect(conRepo.defaultLocaleDoc).toContain(
      'LicenseUrl: "https://github.com/usuario/RESALEVAULT/blob/main/TERMS.md"'
    )
    // Se puede sobrescribir explicitamente.
    const propio = buildManifests({ ...VALID, licenseUrl: 'https://ejemplo.test/terminos' })
    expect(propio.defaultLocaleDoc).toContain('LicenseUrl: "https://ejemplo.test/terminos"')
    // Sin repositorio ni licenseUrl no se inventa ninguna URL.
    const sinNada = buildManifests(VALID)
    expect(sinNada.defaultLocaleDoc).not.toContain('LicenseUrl')
  })

  it('rechaza entradas invalidas con mensaje claro', () => {
    expect(() => buildManifests({ ...VALID, id: 'mal id' })).toThrow(/Identificador/)
    expect(() => buildManifests({ ...VALID, version: '1.0' })).toThrow(/Version/)
    expect(() => buildManifests({ ...VALID, url: 'http://insegura' })).toThrow(/HTTPS/)
    expect(() => buildManifests({ ...VALID, sha256: 'abc' })).toThrow(/SHA-256/)
    expect(() => buildManifests({ ...VALID, repo: 'sin-barras' })).toThrow(/Repositorio/)
    expect(() => buildManifests({ ...VALID, description: '' })).toThrow(/descripcion/)
  })
})

describe('manifestFileNames', () => {
  it('nombra los ficheros como exige el repositorio winget', () => {
    const names = manifestFileNames('Ejemplo.App')
    expect(names).toEqual({
      versionFile: 'Ejemplo.App.yaml',
      defaultLocaleFile: 'Ejemplo.App.en-US.yaml',
      installerFile: 'Ejemplo.App.installer.yaml',
    })
  })
})
