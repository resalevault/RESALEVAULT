import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsService } from '@main/services/settings'
import { createTestContext } from './helpers'

/**
 * Ajustes: un valor corrupto jamas debe impedir abrir la aplicacion. Cada
 * lectura valida y cae al valor por defecto.
 */
function raw(key: string, value: string): { $key: string; $value: string; $at: string } {
  return { $key: key, $value: value, $at: '2026-01-01T00:00:00.000Z' }
}

describe('ajustes', () => {
  it('sin datos devuelve los valores por defecto', () => {
    const ctx = createTestContext()
    expect(new SettingsService(ctx.db).get()).toEqual(DEFAULT_SETTINGS)
    ctx.close()
  })

  it('usa el idioma de reserva cuando no hay valor guardado', () => {
    const ctx = createTestContext()
    expect(new SettingsService(ctx.db, 'en').get().locale).toBe('en')
    ctx.close()
  })

  it('guarda y vuelve a leer los ajustes', () => {
    const ctx = createTestContext()
    const service = new SettingsService(ctx.db)
    const updated = service.update({ locale: 'en', theme: 'light', currency: 'USD', staleThresholds: [10, 20] })
    expect(updated.locale).toBe('en')
    expect(updated.theme).toBe('light')
    expect(updated.currency).toBe('USD')
    expect(updated.staleThresholds).toEqual([10, 20])
    expect(new SettingsService(ctx.db).get().locale).toBe('en')
    ctx.close()
  })

  it('descarta un JSON corrupto y un valor fuera de formato', () => {
    const ctx = createTestContext()
    ctx.db.run('INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)', raw('app.locale', '{no-json'))
    ctx.db.run('INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)', raw('app.currency', JSON.stringify('eur')))
    const settings = new SettingsService(ctx.db).get()
    expect(settings.locale).toBe('es')
    expect(settings.currency).toBe('EUR')
    ctx.close()
  })

  it('sanea el prefijo de SKU y descarta un patron vacio', () => {
    const ctx = createTestContext()
    const service = new SettingsService(ctx.db)
    service.update({ skuPrefix: 'ab-12!!', skuPattern: '   ' })
    const settings = service.get()
    expect(settings.skuPrefix).toBe('AB12')
    expect(settings.skuPattern).toBe(DEFAULT_SETTINGS.skuPattern)
    ctx.close()
  })

  it('acota los numeros a su rango y redondea los centimos', () => {
    const ctx = createTestContext()
    const service = new SettingsService(ctx.db)
    service.update({ targetMarginPercent: 150, minProfitCents: -5, defaultShippingCents: 3.6 })
    const settings = service.get()
    expect(settings.targetMarginPercent).toBe(99)
    expect(settings.minProfitCents).toBe(0)
    expect(settings.defaultShippingCents).toBe(4)
    ctx.close()
  })

  it('limpia, deduplica y ordena los umbrales de antiguedad', () => {
    const ctx = createTestContext()
    const service = new SettingsService(ctx.db)
    service.update({ staleThresholds: [90, 0, 30, 30, 5000, 60] })
    expect(service.get().staleThresholds).toEqual([30, 60, 90])
    ctx.close()
  })

  it('un tipo incorrecto en los umbrales cae al valor por defecto', () => {
    const ctx = createTestContext()
    ctx.db.run(
      'INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)',
      raw('inventory.staleThresholds', JSON.stringify('nope'))
    )
    expect(new SettingsService(ctx.db).get().staleThresholds).toEqual([30, 60, 90])
    ctx.close()
  })

  it('un update sin campos no cambia nada', () => {
    const ctx = createTestContext()
    const service = new SettingsService(ctx.db)
    expect(service.update({})).toEqual(DEFAULT_SETTINGS)
    ctx.close()
  })
})
