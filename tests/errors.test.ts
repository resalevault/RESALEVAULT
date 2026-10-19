import { describe, expect, it } from 'vitest'
import { AppError, appError, isAppError, toErrorPayload } from '@main/errors'

/**
 * Errores de dominio: el proceso principal NUNCA expone rutas ni SQL al
 * renderer, solo un codigo estable. Estas pruebas fijan ese contrato.
 */
describe('errores de dominio', () => {
  it('appError crea un error con codigo, parametros y detalle', () => {
    const error = appError('not_found', { entity: 'product' }, 'detalle interno')
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('not_found')
    expect(error.params).toEqual({ entity: 'product' })
    expect(error.detail).toBe('detalle interno')
    expect(isAppError(error)).toBe(true)
    expect(isAppError(new Error('x'))).toBe(false)
    expect(isAppError('x')).toBe(false)
  })

  it('un AppError se serializa tal cual', () => {
    expect(toErrorPayload(appError('invalid_input', { field: 'name' }))).toEqual({
      code: 'invalid_input',
      params: { field: 'name' },
      detail: undefined
    })
  })

  it('traduce el SKU duplicado de SQLite', () => {
    expect(toErrorPayload(new Error('UNIQUE constraint failed: products.sku')).code).toBe('sku_duplicate')
  })

  it('traduce la ruta o el codigo de ubicacion duplicados', () => {
    expect(toErrorPayload(new Error('UNIQUE constraint failed: locations.path')).code).toBe('location_path_duplicate')
    expect(toErrorPayload(new Error('UNIQUE constraint failed: locations.code')).code).toBe('location_path_duplicate')
  })

  it('traduce la clave foranea y el CHECK', () => {
    expect(toErrorPayload(new Error('FOREIGN KEY constraint failed')).code).toBe('conflict')
    expect(toErrorPayload(new Error('CHECK constraint failed: price')).code).toBe('invalid_input')
  })

  it('no filtra detalles internos: un error desconocido es internal_error con id corto', () => {
    const payload = toErrorPayload(new Error('SELECT * FROM algo_secreto'), 'abc123')
    expect(payload.code).toBe('internal_error')
    expect(payload.params).toEqual({ id: 'abc123' })
  })

  it('un valor que no es Error tambien se serializa sin romper', () => {
    const payload = toErrorPayload('algo raro')
    expect(payload.code).toBe('internal_error')
    expect(payload.params).toEqual({ id: '-' })
    expect(payload.detail).toBe('algo raro')
  })
})
