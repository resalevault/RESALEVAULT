/**
 * RESALEVAULT - Copias de seguridad y restauracion.
 *
 * Decisiones que protegen los datos:
 *
 *  1. **Nunca se copia un SQLite activo.** Copiar el archivo mientras la app
 *     escribe puede producir una copia corrupta (especialmente con WAL). Se usa
 *     `VACUUM INTO`, que genera un archivo consistente en un instante concreto.
 *  2. La copia es **un solo ZIP** con la base de datos, un manifiesto y las
 *     fotografias/documentos. Un archivo se puede mover, enviar o guardar en
 *     cualquier sitio sin romper nada.
 *  3. **Se verifica antes de restaurar**: CRC de cada entrada del ZIP (lo hace
 *     el lector), `PRAGMA integrity_check` del SQLite extraido y comprobacion de
 *     que el esquema no sea MAS NUEVO que esta version del programa.
 *  4. La restauracion **no se hace en caliente**: se prepara, se reinicia y se
 *     aplica al arrancar. Asi no se reemplaza una base de datos abierta.
 *  5. Antes de sustituir nada, la base actual se aparta como
 *     `resalevault.antes-de-restaurar-<fecha>.sqlite`. Si algo sale mal, sigue
 *     estando.
 *  6. La rotacion no borra la copia mas reciente nunca.
 */

import { randomUUID } from 'node:crypto'
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
import { basename, join, relative, resolve } from 'node:path'
import type { Database } from '../../db/database'
import { Database as SqliteDatabase } from '../../db/database'
import { LATEST_SCHEMA_VERSION } from '../../db/migrations'
import { appError } from '../../errors'
import { logActivity } from '../../db/repositories/activity'
import { nowIso, toNumber, toStringValue } from '../../db/support'
import { createZip, crc32, readZip } from './zip'
import {
  DEFAULT_BACKUP_CONFIG,
  type BackupConfig,
  type BackupCreateResult,
  type BackupFileInfo,
  type BackupManifest,
  type BackupStatus,
  type BackupVerifyResult
} from '@shared/types-backup'

// Se reexportan para que el resto del proceso principal los use desde un solo sitio.
export type {
  BackupConfig,
  BackupCreateResult,
  BackupFileInfo,
  BackupManifest,
  BackupStatus,
  BackupVerifyResult
} from '@shared/types-backup'
export { DEFAULT_BACKUP_CONFIG } from '@shared/types-backup'

export interface RestorePreparation {
  ok: boolean
  reason?: BackupVerifyResult['reason']
  detail?: string
  manifest: BackupManifest | null
}

export interface RestoreApplied {
  restoredFrom: string
  appliedAt: string
  previousDatabase: string | null
  manifest: BackupManifest | null
}

const CONFIG_KEY = 'backup.config'
const BACKUP_PREFIX = 'resalevault-backup-'
const PENDING_DIR = 'restore-pending'
const PENDING_MARKER = 'restore-pending.json'
const DB_ENTRY = 'resalevault.sqlite'
const MANIFEST_ENTRY = 'manifest.json'

export interface BackupServiceOptions {
  appVersion: string
  /** Carpeta de datos (donde vive el SQLite). */
  dataDir: string
  /** Carpeta de originales. */
  mediaDir: string
  /** Carpeta por defecto para las copias. */
  backupsDir: string
  databaseFile: string
}

/** Rutas necesarias para aplicar una restauracion (sin base de datos abierta). */
export type BackupPathOptions = Pick<BackupServiceOptions, 'dataDir' | 'mediaDir' | 'databaseFile'>

/**
 * Aplica la restauracion pendiente leyendo del disco.
 *
 * Se exporta como funcion independiente porque debe ejecutarse ANTES de abrir
 * la base de datos: en ese momento todavia no hay conexion que pasarle a un
 * servicio.
 */
export function applyPendingRestoreToPaths(options: BackupPathOptions): RestoreApplied | null {
  const pendingDir = join(options.dataDir, PENDING_DIR)
  const stagedDb = join(pendingDir, DB_ENTRY)
  const markerPath = join(options.dataDir, PENDING_MARKER)

  if (!existsSync(markerPath)) return null

  let marker: { source?: string; preparedAt?: string; manifest?: BackupManifest } = {}
  try {
    marker = JSON.parse(readFileSync(markerPath, 'utf8')) as typeof marker
  } catch {
    marker = {}
  }

  if (!existsSync(stagedDb)) {
    rmSync(markerPath, { force: true })
    rmSync(pendingDir, { recursive: true, force: true })
    return null
  }

  // Verificacion FINAL antes de pisar la base actual.
  const probe = new SqliteDatabase({ file: stagedDb, wal: false })
  let integrity = 'unknown'
  try {
    integrity = String(probe.scalar<string>('PRAGMA integrity_check') ?? 'unknown')
  } finally {
    probe.close()
  }

  if (integrity !== 'ok') {
    rmSync(markerPath, { force: true })
    rmSync(pendingDir, { recursive: true, force: true })
    return null
  }

  // La base actual se aparta, nunca se borra.
  let previousDatabase: string | null = null
  if (existsSync(options.databaseFile)) {
    previousDatabase = join(
      options.dataDir,
      `resalevault.antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`
    )
    copyFileSync(options.databaseFile, previousDatabase)
  }

  // Los auxiliares de WAL pertenecen a la base anterior.
  for (const suffix of ['-wal', '-shm']) {
    rmSync(options.databaseFile + suffix, { force: true })
  }

  copyFileSync(stagedDb, options.databaseFile)

  // Las fotografias se copian encima. Los archivos sobrantes quedan como
  // huerfanos, que el usuario puede retirar desde Ajustes.
  const stagedMedia = join(pendingDir, 'media')
  if (existsSync(stagedMedia)) {
    for (const file of walk(stagedMedia)) {
      const relativePath = relative(stagedMedia, file)
      const target = join(options.mediaDir, relativePath)
      mkdirSync(resolve(target, '..'), { recursive: true })
      copyFileSync(file, target)
    }
  }

  rmSync(markerPath, { force: true })
  rmSync(pendingDir, { recursive: true, force: true })

  return {
    restoredFrom: toStringValue(marker.source),
    appliedAt: nowIso(),
    previousDatabase,
    manifest: marker.manifest ?? null
  }
}

export class BackupService {
  constructor(
    private readonly db: Database,
    private readonly options: BackupServiceOptions
  ) {}

  // -------------------------------------------------------------------------
  // Configuracion
  // -------------------------------------------------------------------------

  config(): BackupConfig {
    const raw = this.db.scalar<string>('SELECT value FROM settings WHERE key = $key', { $key: CONFIG_KEY })
    if (!raw) return { ...DEFAULT_BACKUP_CONFIG }

    try {
      const parsed = JSON.parse(raw) as Partial<BackupConfig>
      return {
        enabled: parsed.enabled ?? DEFAULT_BACKUP_CONFIG.enabled,
        intervalDays: clamp(Number(parsed.intervalDays), 1, 365, DEFAULT_BACKUP_CONFIG.intervalDays),
        maxCopies: clamp(Number(parsed.maxCopies), 1, 200, DEFAULT_BACKUP_CONFIG.maxCopies),
        destination: typeof parsed.destination === 'string' ? parsed.destination : '',
        includeMedia: parsed.includeMedia ?? DEFAULT_BACKUP_CONFIG.includeMedia,
        lastBackupAt: typeof parsed.lastBackupAt === 'string' ? parsed.lastBackupAt : null,
        lastBackupPath: typeof parsed.lastBackupPath === 'string' ? parsed.lastBackupPath : null
      }
    } catch {
      return { ...DEFAULT_BACKUP_CONFIG }
    }
  }

  setConfig(patch: Partial<BackupConfig>): BackupConfig {
    const next = { ...this.config(), ...patch }
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)
       ON CONFLICT(key) DO UPDATE SET value = $value, updated_at = $at`,
      { $key: CONFIG_KEY, $value: JSON.stringify(next), $at: nowIso() }
    )
    return next
  }

  /** Carpeta efectiva: la configurada o la de datos. */
  destination(): string {
    const configured = this.config().destination.trim()
    return configured ? resolve(configured) : resolve(this.options.backupsDir)
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  status(): BackupStatus {
    const config = this.config()
    const destination = this.destination()
    const files = this.listIn(destination)
    const media = this.mediaStats()

    const last = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
    const nextDue = config.enabled ? last + config.intervalDays * 86_400_000 : null
    const due = config.enabled && (last === 0 || (nextDue !== null && Date.now() >= nextDue))

    return {
      config,
      destination,
      count: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      lastBackupAt: config.lastBackupAt,
      lastBackupPath: config.lastBackupPath,
      nextDueAt: nextDue === null ? null : new Date(nextDue).toISOString(),
      due,
      mediaFiles: media.files,
      mediaBytes: media.bytes
    }
  }

  /** Copias presentes en el destino, de la mas reciente a la mas antigua. */
  list(): BackupFileInfo[] {
    return this.listIn(this.destination())
  }

  private listIn(directory: string): BackupFileInfo[] {
    if (!existsSync(directory)) return []

    const files: BackupFileInfo[] = []
    for (const name of readdirSync(directory)) {
      if (!name.startsWith(BACKUP_PREFIX) || !name.endsWith('.zip')) continue
      const path = join(directory, name)
      try {
        const stats = statSync(path)
        const info = this.readManifestQuietly(path)
        files.push({
          path,
          name,
          bytes: stats.size,
          createdAt: info?.manifest.createdAt ?? stats.mtime.toISOString(),
          schemaVersion: info?.manifest.schemaVersion ?? null,
          products: info?.manifest.products ?? null,
          includesMedia: info?.manifest.includesMedia ?? false
        })
      } catch {
        // Un archivo ilegible no debe romper el listado.
      }
    }

    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private mediaStats(): { files: number; bytes: number } {
    let files = 0
    let bytes = 0
    for (const path of walk(this.options.mediaDir)) {
      files += 1
      try {
        bytes += statSync(path).size
      } catch {
        // Ignorado.
      }
    }
    return { files, bytes }
  }

  // -------------------------------------------------------------------------
  // Creacion
  // -------------------------------------------------------------------------

  /**
   * Crea una copia y la verifica inmediatamente releyendo el ZIP generado.
   * Si la verificacion falla, se borra el archivo y se informa del error: una
   * copia que no se puede restaurar es peor que no tener copia.
   */
  create(): BackupCreateResult {
    const started = Date.now()
    const config = this.config()
    const destination = this.destination()
    mkdirSync(destination, { recursive: true })

    const snapshotPath = join(this.options.dataDir, `snapshot-${randomUUID()}.sqlite`)
    const timestamp = new Date()
    const name = `${BACKUP_PREFIX}${timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`
    const target = join(destination, name)

    try {
      // 1. Instantanea CONSISTENTE de la base de datos.
      this.db.exec(`VACUUM INTO '${escapeSqlLiteral(snapshotPath)}'`)

      // 2. Manifiesto.
      const products = toNumber(this.db.scalar<number>('SELECT COUNT(*) AS v FROM products'))
      const mediaFiles = config.includeMedia ? walk(this.options.mediaDir) : []

      const manifest: BackupManifest = {
        format: 1,
        appVersion: this.options.appVersion,
        schemaVersion: LATEST_SCHEMA_VERSION,
        createdAt: timestamp.toISOString(),
        products,
        mediaFiles: mediaFiles.length,
        includesMedia: config.includeMedia
      }

      // 3. Entradas del ZIP.
      const entries = [
        { name: MANIFEST_ENTRY, data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
        { name: DB_ENTRY, data: readFileSync(snapshotPath), mtime: timestamp }
      ]

      if (config.includeMedia) {
        for (const file of mediaFiles) {
          const relativePath = relative(this.options.mediaDir, file).split('\\').join('/')
          entries.push({ name: `media/${relativePath}`, data: readFileSync(file) })
        }
      }

      const zip = createZip(entries)
      writeFileSync(target, zip)

      // 4. Verificacion real de lo que se acaba de escribir.
      const verification = this.verify(target)
      if (!verification.ok) {
        rmSync(target, { force: true })
        throw appError('storage_error', { reason: verification.reason ?? 'verify_failed' })
      }

      this.setConfig({ lastBackupAt: timestamp.toISOString(), lastBackupPath: target })
      this.prune()

      logActivity(this.db, {
        entity: 'backup',
        entityId: null,
        action: 'created',
        summary: `Copia de seguridad creada: ${name}`,
        details: { bytes: zip.length, products, mediaFiles: mediaFiles.length }
      })

      return { path: target, bytes: zip.length, manifest, durationMs: Date.now() - started }
    } finally {
      rmSync(snapshotPath, { force: true })
    }
  }

  /** Borra las copias mas antiguas dejando `maxCopies`. Nunca borra la ultima. */
  prune(): { removed: number } {
    const config = this.config()
    const files = this.list()
    let removed = 0

    // Se conserva intacta la copia referenciada como ultima.
    const keepPath = config.lastBackupPath

    while (files.length > 0 && files.length > config.maxCopies) {
      const oldest = files.pop()
      if (!oldest) break
      if (keepPath && oldest.path === keepPath) {
        // Se vuelve a insertar para no borrarla y se corta el bucle.
        files.push(oldest)
        break
      }
      try {
        rmSync(oldest.path, { force: true })
        removed += 1
      } catch {
        break
      }
    }

    return { removed }
  }

  /** Copia automatica si toca. No lanza: un fallo no debe impedir arrancar. */
  autoBackupIfDue(): { ran: boolean; path?: string; error?: string } {
    try {
      const status = this.status()
      if (!status.config.enabled || !status.due) return { ran: false }
      const result = this.create()
      return { ran: true, path: result.path }
    } catch (error) {
      return { ran: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // -------------------------------------------------------------------------
  // Verificacion
  // -------------------------------------------------------------------------

  verify(path: string): BackupVerifyResult {
    if (!existsSync(path)) {
      return { ok: false, reason: 'corrupt', detail: 'file_not_found', manifest: null, integrity: null, schemaVersion: null }
    }

    let entries: ReturnType<typeof readZip>
    try {
      entries = readZip(readFileSync(path))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        reason: message === 'not_a_zip' ? 'not_a_zip' : 'corrupt',
        detail: message,
        manifest: null,
        integrity: null,
        schemaVersion: null
      }
    }

    const manifestEntry = entries.entries.find((entry) => entry.name === MANIFEST_ENTRY)
    const dbEntry = entries.entries.find((entry) => entry.name === DB_ENTRY)

    if (!manifestEntry) {
      return { ok: false, reason: 'missing_manifest', manifest: null, integrity: null, schemaVersion: null }
    }
    if (!dbEntry) {
      return { ok: false, reason: 'missing_database', manifest: null, integrity: null, schemaVersion: null }
    }

    let manifest: BackupManifest
    try {
      manifest = JSON.parse(manifestEntry.data.toString('utf8')) as BackupManifest
      if (!manifest || typeof manifest.schemaVersion !== 'number' || typeof manifest.createdAt !== 'string') {
        throw new Error('invalid')
      }
    } catch {
      return { ok: false, reason: 'invalid_manifest', manifest: null, integrity: null, schemaVersion: null }
    }

    if (manifest.schemaVersion > LATEST_SCHEMA_VERSION) {
      return {
        ok: false,
        reason: 'schema_too_new',
        detail: `backup=${manifest.schemaVersion} app=${LATEST_SCHEMA_VERSION}`,
        manifest,
        integrity: null,
        schemaVersion: manifest.schemaVersion
      }
    }

    // Se extrae a un temporal y se comprueba la integridad REAL del SQLite.
    const checkPath = join(this.options.dataDir, `verify-${randomUUID()}.sqlite`)
    let integrity: string | null = null
    let schemaVersion: number | null = null

    try {
      writeFileSync(checkPath, dbEntry.data)
      const probe = new SqliteDatabase({ file: checkPath, wal: false })
      try {
        integrity = String(probe.scalar<string>('PRAGMA integrity_check') ?? 'unknown')
        schemaVersion = toNumber(probe.scalar<number>('PRAGMA user_version'))
      } finally {
        probe.close()
      }
    } catch (error) {
      rmSync(checkPath, { force: true })
      return {
        ok: false,
        reason: 'integrity_failed',
        detail: error instanceof Error ? error.message : String(error),
        manifest,
        integrity: null,
        schemaVersion: null
      }
    }

    rmSync(checkPath, { force: true })

    if (integrity !== 'ok') {
      return { ok: false, reason: 'integrity_failed', detail: integrity, manifest, integrity, schemaVersion }
    }

    return { ok: true, manifest, integrity, schemaVersion }
  }

  private readManifestQuietly(path: string): { manifest: BackupManifest } | null {
    try {
      const entries = readZip(readFileSync(path))
      const manifestEntry = entries.entries.find((entry) => entry.name === MANIFEST_ENTRY)
      if (!manifestEntry) return null
      return { manifest: JSON.parse(manifestEntry.data.toString('utf8')) as BackupManifest }
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------------------
  // Restauracion en dos fases
  // -------------------------------------------------------------------------

  /**
   * Deja la copia preparada y valida. NO sustituye nada todavia: eso ocurre al
   * reiniciar, antes de abrir la base de datos.
   */
  prepareRestore(path: string): RestorePreparation {
    const verification = this.verify(path)
    if (!verification.ok || !verification.manifest) {
      return { ok: false, reason: verification.reason, detail: verification.detail, manifest: null }
    }

    const pendingDir = join(this.options.dataDir, PENDING_DIR)
    rmSync(pendingDir, { recursive: true, force: true })
    mkdirSync(join(pendingDir, 'media'), { recursive: true })

    const entries = readZip(readFileSync(path))
    const dbEntry = entries.entries.find((entry) => entry.name === DB_ENTRY)
    if (!dbEntry) return { ok: false, reason: 'missing_database', manifest: null }

    writeFileSync(join(pendingDir, DB_ENTRY), dbEntry.data)

    for (const entry of entries.entries) {
      if (!entry.name.startsWith('media/')) continue
      const target = join(pendingDir, entry.name.split('/').join('\\'))
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, entry.data)
    }

    writeFileSync(
      join(this.options.dataDir, PENDING_MARKER),
      JSON.stringify(
        {
          source: basename(path),
          preparedAt: nowIso(),
          manifest: verification.manifest,
          checksum: crc32(dbEntry.data)
        },
        null,
        2
      ),
      'utf8'
    )

    return { ok: true, manifest: verification.manifest }
  }

  /** Indica si hay una restauracion pendiente de aplicar. */
  pendingRestore(): { source: string; preparedAt: string; manifest: BackupManifest | null } | null {
    const markerPath = join(this.options.dataDir, PENDING_MARKER)
    if (!existsSync(markerPath)) return null
    try {
      const parsed = JSON.parse(readFileSync(markerPath, 'utf8')) as {
        source?: string
        preparedAt?: string
        manifest?: BackupManifest
      }
      return {
        source: toStringValue(parsed.source),
        preparedAt: toStringValue(parsed.preparedAt),
        manifest: parsed.manifest ?? null
      }
    } catch {
      return null
    }
  }

  /** Cancela una restauracion preparada que aun no se ha aplicado. */
  cancelRestore(): void {
    rmSync(join(this.options.dataDir, PENDING_MARKER), { force: true })
    rmSync(join(this.options.dataDir, PENDING_DIR), { recursive: true, force: true })
  }

  /**
   * Aplica la restauracion pendiente. Se llama AL ARRANCAR, antes de abrir la
   * base de datos. Devuelve la informacion de lo aplicado o `null`.
   */
  applyPendingRestore(): RestoreApplied | null {
    return applyPendingRestoreToPaths(this.options)
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function walk(root: string): string[] {
  const result: string[] = []
  if (!existsSync(root)) return result

  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry)
      try {
        if (statSync(full).isDirectory()) stack.push(full)
        else result.push(full)
      } catch {
        // Ignorado.
      }
    }
  }
  return result
}
