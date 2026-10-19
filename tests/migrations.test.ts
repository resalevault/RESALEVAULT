import { describe, expect, it } from 'vitest'
import { Database } from '@main/db/database'
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@main/db/migrations'
import {
  MigrationError,
  getSchemaVersion,
  listAppliedMigrations,
  runMigrations,
  validateMigrations
} from '@main/db/migrator'
import { createTestContext } from './helpers'

describe('motor de migraciones', () => {
  it('aplica todas las migraciones en una base de datos nueva', () => {
    const db = new Database({ file: ':memory:', wal: false })
    const report = runMigrations(db, MIGRATIONS)

    expect(report.fromVersion).toBe(0)
    expect(report.applied).toEqual(MIGRATIONS.map((migration) => migration.version))
    expect(report.currentVersion).toBe(LATEST_SCHEMA_VERSION)
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(listAppliedMigrations(db)).toHaveLength(MIGRATIONS.length)
    expect(String(db.pragma('user_version'))).toBe(String(LATEST_SCHEMA_VERSION))
    db.close()
  })

  it('es idempotente: volver a ejecutar no aplica nada', () => {
    const db = new Database({ file: ':memory:', wal: false })
    runMigrations(db, MIGRATIONS)
    const second = runMigrations(db, MIGRATIONS)

    expect(second.applied).toEqual([])
    expect(second.alreadyApplied).toEqual(MIGRATIONS.map((migration) => migration.version))
    expect(listAppliedMigrations(db)).toHaveLength(MIGRATIONS.length)
    db.close()
  })

  it('aplica solo las migraciones pendientes', () => {
    const db = new Database({ file: ':memory:', wal: false })
    runMigrations(db, [MIGRATIONS[0]!])

    const report = runMigrations(db, MIGRATIONS)
    expect(report.fromVersion).toBe(1)
    expect(report.applied).toEqual(MIGRATIONS.slice(1).map((migration) => migration.version))
    db.close()
  })

  it('se niega a abrir una base de datos con un esquema mas nuevo', () => {
    const db = new Database({ file: ':memory:', wal: false })
    runMigrations(db, MIGRATIONS)
    // Simula que otra version (mas reciente) del programa ya migro el archivo.
    db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, 'futura', '2030-01-01T00:00:00.000Z')")

    expect(() => runMigrations(db, MIGRATIONS)).toThrow(MigrationError)
    expect(() => runMigrations(db, MIGRATIONS)).toThrow(/esquema v99/i)
    db.close()
  })

  it('rechaza listas de migraciones mal formadas', () => {
    expect(() => validateMigrations([{ version: 2, name: 'b', up: () => {} }, { version: 1, name: 'a', up: () => {} }])).toThrow()
    expect(() => validateMigrations([{ version: 1, name: 'a', up: () => {} }, { version: 1, name: 'b', up: () => {} }])).toThrow()
    expect(() => validateMigrations([{ version: 0, name: 'a', up: () => {} }])).toThrow()
    expect(() => validateMigrations([{ version: 1, name: '  ', up: () => {} }])).toThrow()
    expect(() => validateMigrations([{ version: 1, name: 'a', up: () => {} }])).not.toThrow()
  })

  it('no modifica la base de datos si una migracion falla', () => {
    const db = new Database({ file: ':memory:', wal: false })
    db.exec('CREATE TABLE keep (id INTEGER PRIMARY KEY, v TEXT)')
    db.run("INSERT INTO keep (v) VALUES ('intacto')")

    expect(() =>
      runMigrations(db, [
        {
          version: 1,
          name: 'rota',
          up: (database) => {
            database.exec('CREATE TABLE nueva (id INTEGER PRIMARY KEY)')
            database.exec('ESTA SENTENCIA NO ES SQL VALIDO')
          }
        }
      ])
    ).toThrow(MigrationError)

    // La tabla creada dentro de la migracion fallida no debe existir.
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((row) => row.name)
    expect(tables).toContain('keep')
    expect(tables).not.toContain('nueva')
    expect(db.scalar<number>('SELECT COUNT(*) AS v FROM keep')).toBe(1)
    db.close()
  })
})

describe('datos base del sistema', () => {
  it('inserta estados, plataformas y categorias utilizables', () => {
    const ctx = createTestContext()

    const statuses = ctx.db.all<{ code: string }>('SELECT code FROM product_statuses ORDER BY sort_order')
    expect(statuses.map((s) => s.code)).toEqual([
      'to_prepare',
      'available',
      'reserved',
      'sold',
      'shipped',
      'returned',
      'archived'
    ])

    const platforms = ctx.repos.platforms.list()
    expect(platforms.length).toBeGreaterThanOrEqual(12)
    expect(platforms.some((p) => p.code === 'vinted')).toBe(true)

    const categories = ctx.repos.categories.list()
    expect(categories.some((c) => c.id === 'cat-ropa')).toBe(true)
    expect(categories.some((c) => c.id === 'cat-ropa-camisetas' && c.parentId === 'cat-ropa')).toBe(true)

    // No se insertan articulos de ejemplo en el primer arranque.
    expect(ctx.db.scalar<number>('SELECT COUNT(*) AS v FROM products')).toBe(0)

    ctx.close()
  })

  it('crea la organizacion y el usuario local', () => {
    const ctx = createTestContext()
    expect(ctx.db.scalar<string>('SELECT id FROM organizations')).toBe('org-local')
    expect(ctx.db.scalar<string>('SELECT role FROM users')).toBe('owner')
    ctx.close()
  })
})
