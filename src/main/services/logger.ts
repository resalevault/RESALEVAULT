/**
 * RESALEVAULT - Registro de diagnostico.
 *
 * Escribe en un archivo de texto dentro de la carpeta de datos. Reglas:
 *  - Nunca se registran claves de API, tokens ni contenido de campos privados.
 *  - Si el registro falla (disco lleno, permisos), la aplicacion NO se cae.
 *  - Rotacion simple al superar 2 MB para que el archivo no crezca sin limite.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_LOG_BYTES = 2 * 1024 * 1024

/** Patrones de datos que nunca deben acabar en el log. */
const REDACTED_KEYS = /(api[_-]?key|apikey|token|secret|password|authorization|bearer)/i

export interface LoggerOptions {
  file: string
  level: LogLevel
  /** Tambien escribe en la consola (util en desarrollo). */
  console: boolean
}

export class Logger {
  private readonly file: string
  private readonly level: LogLevel
  private readonly toConsole: boolean

  constructor(options: LoggerOptions) {
    this.file = options.file
    this.level = options.level
    this.toConsole = options.console
    try {
      mkdirSync(dirname(this.file), { recursive: true })
    } catch {
      // Si no se puede crear la carpeta, se seguira intentando en cada write.
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta)
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta)
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return

    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${
      meta ? ' ' + safeJson(redact(meta)) : ''
    }`

    if (this.toConsole) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](line)
    }

    try {
      this.rotateIfNeeded()
      appendFileSync(this.file, line + '\n', 'utf8')
    } catch {
      // Un fallo del log nunca debe interrumpir al usuario.
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.file)) return
      const stats = statSync(this.file)
      if (stats.size < MAX_LOG_BYTES) return
      renameSync(this.file, this.file + '.1')
    } catch {
      // Ignorado deliberadamente.
    }
  }
}

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.test(key)) {
      result[key] = '[REDACTADO]'
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>)
      continue
    }
    result[key] = value
  }
  return result
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[no serializable]"'
  }
}
