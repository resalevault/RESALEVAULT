// Declaraciones para que TypeScript pueda importar las funciones del preflight
// desde las pruebas (scripts/preflight.mjs).

export type PreflightFailureReason = 'no-package' | 'no-binary'

export interface PreflightFailure {
  ok: false
  reason: PreflightFailureReason
  message: string
}

export interface PreflightSuccess {
  ok: true
  version: string
}

export type PreflightResult = PreflightSuccess | PreflightFailure

/** Dobles del sistema de archivos para las pruebas. */
export interface PreflightFs {
  exists?: (path: string) => boolean
  read?: (path: string) => string
  joinPath?: (...parts: string[]) => string
}

export declare function resolveElectronDir(
  resolve?: (specifier: string) => string
): string | null

export declare function checkElectron(
  electronDir: string | null,
  fs?: PreflightFs
): PreflightResult
