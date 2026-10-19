/**
 * RESALEVAULT - Errores de dominio.
 *
 * El proceso principal nunca devuelve mensajes de error en texto libre al
 * usuario: devuelve un CODIGO estable mas parametros. El renderer traduce ese
 * codigo con el idioma activo. Asi los mensajes son consistentes, traducibles
 * y no filtran detalles internos (rutas, SQL, etc.).
 */

import type { AppErrorPayload, ErrorCode } from '@shared/types'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly params: Record<string, string | number> | undefined
  readonly detail: string | undefined

  constructor(code: ErrorCode, params?: Record<string, string | number>, detail?: string) {
    super(code)
    this.name = 'AppError'
    this.code = code
    this.params = params
    this.detail = detail
  }
}

export function appError(
  code: ErrorCode,
  params?: Record<string, string | number>,
  detail?: string
): AppError {
  return new AppError(code, params, detail)
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/**
 * Convierte cualquier excepcion en un payload serializable.
 *
 * Importante: los errores desconocidos se registran completos en el log local
 * pero al renderer solo le llega `internal_error` con un identificador corto,
 * para no exponer rutas del sistema ni sentencias SQL.
 */
export function toErrorPayload(error: unknown, correlationId?: string): AppErrorPayload {
  if (isAppError(error)) {
    return {
      code: error.code,
      params: error.params,
      detail: error.detail
    }
  }

  if (error instanceof Error) {
    // Los errores de SQLite que conocemos se traducen a codigos de dominio.
    if (/UNIQUE constraint failed: products\.sku/i.test(error.message)) {
      return { code: 'sku_duplicate' }
    }
    if (/UNIQUE constraint failed: locations\.(path|code)/i.test(error.message)) {
      return { code: 'location_path_duplicate' }
    }
    if (/FOREIGN KEY constraint failed/i.test(error.message)) {
      return { code: 'conflict', detail: error.message }
    }
    if (/CHECK constraint failed/i.test(error.message)) {
      return { code: 'invalid_input', detail: error.message }
    }
    return { code: 'internal_error', params: { id: correlationId ?? '-' }, detail: error.message }
  }

  return { code: 'internal_error', params: { id: correlationId ?? '-' }, detail: String(error) }
}
