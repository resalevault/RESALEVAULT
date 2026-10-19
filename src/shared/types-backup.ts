/**
 * RESALEVAULT - Tipos de copias de seguridad.
 *
 * Viven en `shared` porque los usan el proceso principal y la interfaz. La
 * implementacion (ZIP, VACUUM INTO, restauracion) esta en el proceso principal.
 */

export interface BackupConfig {
  enabled: boolean
  /** Cada cuantos dias se hace una copia automatica al arrancar. */
  intervalDays: number
  /** Cuantas copias se conservan. La mas reciente no se borra nunca. */
  maxCopies: number
  /** Carpeta destino. Vacio = carpeta de datos de la app. */
  destination: string
  includeMedia: boolean
  lastBackupAt: string | null
  lastBackupPath: string | null
}

export interface BackupManifest {
  format: number
  appVersion: string
  schemaVersion: number
  createdAt: string
  products: number
  mediaFiles: number
  includesMedia: boolean
}

export interface BackupStatus {
  config: BackupConfig
  destination: string
  count: number
  totalBytes: number
  lastBackupAt: string | null
  lastBackupPath: string | null
  /** Cuando toca la proxima automatica, o null si esta desactivada. */
  nextDueAt: string | null
  due: boolean
  mediaFiles: number
  mediaBytes: number
}

export interface BackupFileInfo {
  path: string
  name: string
  bytes: number
  createdAt: string
  schemaVersion: number | null
  products: number | null
  includesMedia: boolean
}

export interface BackupCreateResult {
  path: string
  bytes: number
  manifest: BackupManifest
  durationMs: number
}

export interface BackupVerifyResult {
  ok: boolean
  reason?:
    | 'not_a_zip'
    | 'missing_database'
    | 'missing_manifest'
    | 'invalid_manifest'
    | 'integrity_failed'
    | 'schema_too_new'
    | 'corrupt'
  detail?: string
  manifest: BackupManifest | null
  integrity: string | null
  schemaVersion: number | null
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  intervalDays: 7,
  maxCopies: 10,
  destination: '',
  includeMedia: true,
  lastBackupAt: null,
  lastBackupPath: null
}
