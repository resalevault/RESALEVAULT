/**
 * RESALEVAULT - Apertura de la base de datos en el proceso principal.
 *
 * Secuencia: crear carpetas -> abrir conexion -> aplicar migraciones ->
 * comprobar integridad. Si algo falla, la aplicacion informa con un error
 * claro en lugar de arrancar con datos a medias.
 */

import { mkdirSync, statSync } from 'node:fs'
import type { DatabaseHealth, LocaleCode } from '@shared/types'
import { Database } from '../db/database'
import { createRepositories, type Repositories } from '../db/context'
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '../db/migrations'
import { getSchemaVersion, listAppliedMigrations, runMigrations, type MigrationReport } from '../db/migrator'
import type { AppPaths } from './paths'
import type { Logger } from './logger'

export interface OpenedDatabase {
  db: Database
  repos: Repositories
  migrationReport: MigrationReport
}

export interface OpenOptions {
  paths: AppPaths
  logger: Logger
  defaultLocale?: LocaleCode
}

export function openDatabase(options: OpenOptions): OpenedDatabase {
  const { paths, logger } = options

  for (const dir of [paths.userData, paths.data, paths.media, paths.thumbs, paths.backups, paths.logs, paths.temp]) {
    mkdirSync(dir, { recursive: true })
  }

  logger.info('Abriendo base de datos', { file: paths.database })
  const db = new Database({ file: paths.database })

  const before = getSchemaVersion(db)
  logger.info('Esquema detectado', { version: before, latest: LATEST_SCHEMA_VERSION })

  const migrationReport = runMigrations(db, MIGRATIONS)
  if (migrationReport.applied.length > 0) {
    logger.info('Migraciones aplicadas', { versions: migrationReport.applied })
  } else {
    logger.info('Esquema ya actualizado', { version: migrationReport.currentVersion })
  }

  const integrity = db.scalar<string>('PRAGMA integrity_check')
  if (integrity !== 'ok') {
    logger.error('La comprobacion de integridad ha fallado', { integrity })
    throw new Error(`integrity_check_failed: ${String(integrity)}`)
  }

  const repos = createRepositories(db, options.defaultLocale ?? 'es')

  // Catalogo de transportistas: idempotente. Anade los nuevos y respeta las
  // correcciones que haya hecho el usuario sobre los existentes.
  const carriers = repos.tracking.ensureSeed()
  logger.info('Capa de datos lista', {
    migrations: listAppliedMigrations(db).length,
    categories: repos.categories.list().length,
    carriersSeeded: carriers.inserted
  })

  return { db, repos, migrationReport }
}

export function readDatabaseHealth(db: Database, filePath: string): DatabaseHealth {
  let fileSizeBytes = 0
  try {
    fileSizeBytes = statSync(filePath).size
  } catch {
    fileSizeBytes = 0
  }

  return {
    ok: db.scalar<string>('PRAGMA integrity_check') === 'ok',
    schemaVersion: getSchemaVersion(db),
    foreignKeys: Number(db.pragma('foreign_keys')) === 1,
    journalMode: String(db.pragma('journal_mode') ?? ''),
    integrityCheck: String(db.scalar<string>('PRAGMA integrity_check') ?? 'unknown'),
    fileSizeBytes
  }
}
