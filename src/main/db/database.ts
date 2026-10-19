/**
 * RESALEVAULT - Conexion a SQLite.
 *
 * Se usa `node:sqlite`, el modulo SQLite integrado en Node 24 (incluido en
 * Electron 44). Motivo de la decision:
 *  - No hay modulos nativos que compilar: la aplicacion no necesita Visual
 *    Studio ni Python para instalarse o compilarse.
 *  - El MISMO codigo funciona en el proceso principal de Electron y en las
 *    pruebas automatizadas ejecutadas con Node, sin capas de abstraccion.
 *  - SQLite 3.53 con soporte de WAL, claves foraneas y transacciones reales.
 *
 * Este modulo NO importa `electron`: recibe la ruta del archivo. Asi las
 * pruebas pueden instanciarlo con ':memory:' sin arrancar Electron.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** Tipos aceptados como parametros de sentencia. */
export type SqlParam = string | number | bigint | null | Uint8Array
export type SqlParams = readonly SqlParam[] | Record<string, SqlParam>

/** Forma minima que necesitamos de StatementSync, tipada de forma explicita. */
interface RawStatement {
  run(...args: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export interface DatabaseOptions {
  /** Ruta del archivo, o ':memory:' para una base de datos efimera. */
  file: string
  /** Tiempo de espera ante bloqueos, en milisegundos. */
  busyTimeoutMs?: number
  /** Desactiva WAL (util en algunos volumenes de red o en pruebas). */
  wal?: boolean
}

/**
 * Envoltorio fino sobre DatabaseSync que aporta:
 *  - Tipado de filas y parametros.
 *  - Cache acotada de sentencias preparadas.
 *  - Transacciones con soporte de anidamiento mediante SAVEPOINT.
 *  - Parametros con nombre `$nombre` (sin ambiguedad de prefijos).
 */
export class Database {
  private readonly db: DatabaseSync
  private readonly statements = new Map<string, RawStatement>()
  private depth = 0
  private readonly maxCachedStatements = 300
  private closed = false

  constructor(options: DatabaseOptions) {
    const { file, busyTimeoutMs = 5000, wal = true } = options

    if (file !== ':memory:') {
      mkdirSync(dirname(file), { recursive: true })
    }

    this.db = new DatabaseSync(file, {
      open: true,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
      timeout: busyTimeoutMs
    })

    if (wallEnabled(wal, file)) {
      // WAL mejora la concurrencia y la resistencia a fallos. No aplica a
      // bases de datos en memoria.
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
    } else {
      this.db.exec('PRAGMA journal_mode = DELETE')
      this.db.exec('PRAGMA synchronous = FULL')
    }
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(`PRAGMA busy_timeout = ${Number(busyTimeoutMs)}`)
    this.db.exec('PRAGMA temp_store = MEMORY')
  }

  get isClosed(): boolean {
    return this.closed
  }

  /** Ejecuta una o varias sentencias sin devolver filas. */
  exec(sql: string): void {
    this.assertOpen()
    this.db.exec(sql)
  }

  all<T>(sql: string, params?: SqlParams): T[] {
    const statement = this.prepare(sql)
    const rows = Array.isArray(params) ? statement.all(...params) : statement.all(params ?? {})
    return rows as T[]
  }

  get<T>(sql: string, params?: SqlParams): T | undefined {
    const statement = this.prepare(sql)
    const row = Array.isArray(params) ? statement.get(...params) : statement.get(params ?? {})
    return (row as T | undefined) ?? undefined
  }

  run(sql: string, params?: SqlParams): RunResult {
    const statement = this.prepare(sql)
    const result = Array.isArray(params) ? statement.run(...params) : statement.run(params ?? {})
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid)
    }
  }

  /** Devuelve el primer valor de la primera fila, o `undefined`. */
  scalar<T>(sql: string, params?: SqlParams): T | undefined {
    const row = this.get<Record<string, unknown>>(sql, params)
    if (!row) return undefined
    const keys = Object.keys(row)
    if (keys.length === 0) return undefined
    return row[keys[0] as string] as T
  }

  /**
   * Ejecuta `fn` dentro de una transaccion. Las llamadas anidadas usan
   * SAVEPOINT, de modo que un repositorio puede invocarse desde otro sin
   * romper la atomicidad ni provocar "cannot start a transaction within a
   * transaction".
   */
  transaction<T>(fn: () => T): T {
    this.assertOpen()
    const isOuter = this.depth === 0
    const savepoint = `sp_${this.depth}`

    if (isOuter) this.db.exec('BEGIN IMMEDIATE')
    else this.db.exec(`SAVEPOINT ${savepoint}`)

    this.depth += 1
    try {
      const result = fn()
      this.depth -= 1
      if (isOuter) this.db.exec('COMMIT')
      else this.db.exec(`RELEASE ${savepoint}`)
      return result
    } catch (error) {
      this.depth -= 1
      try {
        if (isOuter) this.db.exec('ROLLBACK')
        else this.db.exec(`ROLLBACK TO ${savepoint}`)
      } catch {
        // Si el rollback falla la conexion ya esta comprometida; se propaga el
        // error original, que es mas informativo.
      }
      throw error
    }
  }

  /** Lee un pragma simple. */
  pragma(name: string): unknown {
    return this.scalar(`PRAGMA ${name}`)
  }

  setPragma(name: string, value: string | number): void {
    this.exec(`PRAGMA ${name} = ${value}`)
  }

  close(): void {
    if (this.closed) return
    this.statements.clear()
    try {
      if (this.depth === 0) this.db.exec('PRAGMA optimize')
    } catch {
      // `optimize` es una mejora, no un requisito.
    }
    this.db.close()
    this.closed = true
  }

  private prepare(sql: string): RawStatement {
    this.assertOpen()
    const cached = this.statements.get(sql)
    if (cached) return cached

    const statement = this.db.prepare(sql) as unknown as RawStatement
    if (this.statements.size >= this.maxCachedStatements) {
      // Desalojo simple del primer elemento insertado (los mapas de JS
      // conservan el orden de insercion).
      const oldest = this.statements.keys().next()
      if (!oldest.done) this.statements.delete(oldest.value)
    }
    this.statements.set(sql, statement)
    return statement
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('database_closed')
  }
}

function wallEnabled(wal: boolean, file: string): boolean {
  return wal && file !== ':memory:'
}
