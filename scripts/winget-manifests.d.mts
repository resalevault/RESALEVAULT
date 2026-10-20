// Declaraciones para que TypeScript pueda importar el generador de manifiestos
// winget desde las pruebas (scripts/winget-manifests.mjs).

export interface WingetManifestOptions {
  id?: string
  version: string
  url: string
  sha256: string
  repo?: string
  description: string
  publisher?: string
  packageName?: string
  copyright?: string
  protocols?: string[]
  locale?: string
}

export interface WingetManifests {
  versionDoc: string
  defaultLocaleDoc: string
  installerDoc: string
}

export declare const DEFAULT_ID: string
export declare function buildManifests(options: WingetManifestOptions): WingetManifests
export declare function manifestFileNames(id: string): {
  versionFile: string
  defaultLocaleFile: string
  installerFile: string
}
