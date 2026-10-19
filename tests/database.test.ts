import { describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import { Database } from '@main/db/database'

function open(): Database {
  return new Database({ file: ':memory:', wal: false })
}

describe('conexion SQLite', () => {
  it('aplica los pragmas de integridad', () => {
    const db = open()
    expect(Number(db.pragma('foreign_keys'))).toBe(1)
    expect(String(db.pragma('journal_mode')).toLowerCase()).toBe('memory')
    expect(String(db.scalar('SELECT sqlite_version() AS v'))).toMatch(/^3\./)
    db.close()
  })

  it('devuelve filas y valores escalares', () => {
    const db = open()
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    db.run('INSERT INTO t (name) VALUES ($name)', { $name: 'uno' })
    db.run('INSERT INTO t (name) VALUES ($name)', { $name: 'dos' })

    expect(db.all<{ name: string }>('SELECT name FROM t ORDER BY id').map((r) => r.name)).toEqual([
      'uno',
      'dos'
    ])
    expect(db.get<{ name: string }>('SELECT name FROM t WHERE id = 2')?.name).toBe('dos')
    expect(db.scalar<number>('SELECT COUNT(*) AS v FROM t')).toBe(2)
    expect(db.get('SELECT name FROM t WHERE id = 999')).toBeUndefined()
    db.close()
  })

  it('confirma la transaccion cuando no hay errores', () => {
    const db = open()
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    db.transaction(() => {
      db.run("INSERT INTO t (v) VALUES ('a')")
      db.run("INSERT INTO t (v) VALUES ('b')")
    })
    expect(db.scalar<number>('SELECT COUNT(*) AS v FROM t')).toBe(2)
    db.close()
  })

  it('deshace TODO el bloque cuando una sentencia falla', () => {
    const db = open()
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL UNIQUE)')
    db.run("INSERT INTO t (v) VALUES ('existente')")

    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO t (v) VALUES ('nuevo')")
        // Falla por UNIQUE: no debe quedar rastro del insert anterior.
        db.run("INSERT INTO t (v) VALUES ('existente')")
      })
    ).toThrow()

    expect(db.scalar<number>('SELECT COUNT(*) AS v FROM t')).toBe(1)
    db.close()
  })

  it('soporta transacciones anidadas mediante SAVEPOINT', () => {
    const db = open()
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)')

    db.transaction(() => {
      db.run("INSERT INTO t (v) VALUES ('externa')")
      try {
        db.transaction(() => {
          db.run("INSERT INTO t (v) VALUES ('interna')")
          throw new Error('fallo interno')
        })
      } catch {
        // El fallo interno no debe cancelar la transaccion externa.
      }
      db.run("INSERT INTO t (v) VALUES ('posterior')")
    })

    expect(db.all<{ v: string }>('SELECT v FROM t ORDER BY id').map((r) => r.v)).toEqual([
      'externa',
      'posterior'
    ])
    db.close()
  })

  it('conserva el estado tras cerrar y reabrir el archivo', () => {
    const path = 'resalevault-test-persistencia.sqlite'
    const first = new Database({ file: path, wal: false })
    first.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    first.run("INSERT INTO t (v) VALUES ('persistido')")
    first.close()

    const second = new Database({ file: path, wal: false })
    expect(second.scalar<string>('SELECT v FROM t WHERE id = 1')).toBe('persistido')
    second.close()

    // Limpieza del archivo temporal.
    rmSync(path, { force: true })
  })

  it('rechaza operaciones despues de cerrar', () => {
    const db = open()
    db.close()
    expect(() => db.all('SELECT 1')).toThrow()
  })
})
