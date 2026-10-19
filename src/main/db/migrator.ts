/**
 * RESALEVAULT - Ejecutor de migraciones versionadas.
 *
 * Reglas de diseno:
 *  1. Cada migracion tiene una version entera monotonica y un nombre.
 *  2. Se aplican en orden y dentro de una transaccion: si una falla, la base
 *     de datos queda exactamente como estaba.
 *  3. Se registran en la tabla `schema_migrations` (version, nombre, fecha).
 *  4. Si la base de datos tiene una version SUPERIOR a la que conoce el
 *     programa, se aborta en lugar de degradar: una version antigua del
 *     programa no debe tocar un esquema nuevo.
 *  5. Las migraciones no deben borrar datos del usuario. Los cambios
 *     destructivos requieren una migracion explicita y documentada.
 */

import type { Database } from './database'

export interface Migration {
  version: number
  name: string
  up: (db: Database) => void
}

export interface MigrationReport {
  applied: number[]
  alreadyApplied: number[]
  currentVersion: number
  fromVersion: number
}

export class MigrationError extends Error {
  readonly migration: Migration | null
  constructor(message: string, migration: Migration | null = null) {
    super(message)
    this.name = 'MigrationError'
    this.migration = migration
  }
}

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL
    );
  `)
}

export function getSchemaVersion(db: Database): number {
  ensureMigrationsTable(db)
  const value = db.scalar<number>('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
  return Number(value ?? 0)
}

export function listAppliedMigrations(db: Database): Array<{ version: number; name: string; appliedAt: string }> {
  ensureMigrationsTable(db)
  return db
    .all<{ version: number; name: string; applied_at: string }>(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC'
    )
    .map((row) => ({ version: row.version, name: row.name, appliedAt: row.applied_at }))
}

/** Valida la lista de migraciones antes de tocar nada. */
export function validateMigrations(migrations: readonly Migration[]): void {
  const seen = new Set<number>()
  let previous = 0
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new MigrationError(`Version de migracion invalida: ${String(migration.version)}`, migration)
    }
    if (seen.has(migration.version)) {
      throw new MigrationError(`Version de migracion duplicada: ${migration.version}`, migration)
    }
    if (migration.version <= previous) {
      throw new MigrationError('Las migraciones deben estar ordenadas por version ascendente', migration)
    }
    if (!migration.name.trim()) {
      throw new MigrationError(`La migracion ${migration.version} no tiene nombre`, migration)
    }
    seen.add(migration.version)
    previous = migration.version
  }
}

export function runMigrations(db: Database, migrations: readonly Migration[]): MigrationReport {
  validateMigrations(migrations)

  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const fromVersion = getSchemaVersion(db)
  const targetVersion = sorted.length > 0 ? (sorted[sorted.length - 1] as Migration).version : 0

  if (fromVersion > targetVersion) {
    throw new MigrationError(
      `La base de datos usa el esquema v${fromVersion} pero esta version de RESALEVAULT solo conoce hasta v${targetVersion}. ` +
        'Actualiza el programa o restaura una copia de seguridad anterior.'
    )
  }

  const pending = sorted.filter((migration) => migration.version > fromVersion)
  const applied: number[] = []
  const alreadyApplied = sorted.filter((m) => m.version <= fromVersion).map((m) => m.version)

  for (const migration of pending) {
    try {
      db.transaction(() => {
        migration.up(db)
        db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES ($version, $name, $at)', {
          $version: migration.version,
          $name: migration.name,
          $at: new Date().toISOString()
        })
      })
      applied.push(migration.version)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new MigrationError(
        `Fallo la migracion v${migration.version} (${migration.name}): ${detail}. ` +
          'La base de datos no se ha modificado.',
        migration
      )
    }
  }

  const currentVersion = getSchemaVersion(db)
  // `user_version` se mantiene sincronizado como metadato rapido consultable
  // sin abrir la tabla de migraciones.
  db.setPragma('user_version', currentVersion)

  return { applied, alreadyApplied, currentVersion, fromVersion }
}
