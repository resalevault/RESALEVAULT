/**
 * RESALEVAULT - Ajustes de la aplicacion.
 *
 * Se guardan como pares clave/valor. Solo se almacenan datos NO sensibles:
 * cualquier credencial (claves de API, tokens) va al almacen de credenciales
 * del sistema operativo, nunca a esta tabla ni al ejecutable.
 *
 * Cada lectura valida el valor guardado y cae al valor por defecto si esta
 * corrupto, para que un ajuste mal escrito no impida abrir la aplicacion.
 */

import type { AppSettings, LocaleCode, ThemeMode } from '@shared/types'
import { DEFAULT_SKU_PATTERN, validateSkuPattern } from '@shared/sku'
import type { Database } from '../db/database'
import { nowIso } from '../db/support'

const KEYS = {
  locale: 'app.locale',
  theme: 'app.theme',
  currency: 'app.currency',
  skuPattern: 'app.skuPattern',
  skuPrefix: 'app.skuPrefix',
  staleThresholds: 'inventory.staleThresholds',
  targetMarginPercent: 'finance.targetMarginPercent',
  minProfitCents: 'finance.minProfitCents',
  defaultFeePercent: 'finance.defaultFeePercent',
  defaultShippingCents: 'finance.defaultShippingCents'
} as const

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'es',
  theme: 'dark',
  currency: 'EUR',
  skuPattern: DEFAULT_SKU_PATTERN,
  skuPrefix: 'RV',
  staleThresholds: [30, 60, 90],
  targetMarginPercent: 25,
  minProfitCents: 500,
  defaultFeePercent: 10,
  defaultShippingCents: 400
}

function parseJson(raw: string | undefined): unknown {
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export class SettingsService {
  constructor(
    private readonly db: Database,
    private readonly fallbackLocale: LocaleCode = DEFAULT_SETTINGS.locale
  ) {}

  get(): AppSettings {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')
    const raw = new Map(rows.map((row) => [row.key, row.value]))

    return {
      locale: this.readLocale(raw.get(KEYS.locale)),
      theme: this.readTheme(raw.get(KEYS.theme)),
      currency: this.readCurrency(raw.get(KEYS.currency)),
      skuPattern: this.readSkuPattern(raw.get(KEYS.skuPattern)),
      skuPrefix: this.readSkuPrefix(raw.get(KEYS.skuPrefix)),
      staleThresholds: this.readThresholds(raw.get(KEYS.staleThresholds)),
      targetMarginPercent: this.readNumber(raw.get(KEYS.targetMarginPercent), 0, 99, DEFAULT_SETTINGS.targetMarginPercent),
      minProfitCents: Math.round(this.readNumber(raw.get(KEYS.minProfitCents), 0, 100_000_000, DEFAULT_SETTINGS.minProfitCents)),
      defaultFeePercent: this.readNumber(raw.get(KEYS.defaultFeePercent), 0, 100, DEFAULT_SETTINGS.defaultFeePercent),
      defaultShippingCents: Math.round(
        this.readNumber(raw.get(KEYS.defaultShippingCents), 0, 100_000_000, DEFAULT_SETTINGS.defaultShippingCents)
      )
    }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const entries: Array<[string, unknown]> = []
    if (patch.locale !== undefined) entries.push([KEYS.locale, patch.locale])
    if (patch.theme !== undefined) entries.push([KEYS.theme, patch.theme])
    if (patch.currency !== undefined) entries.push([KEYS.currency, patch.currency])
    if (patch.skuPattern !== undefined) entries.push([KEYS.skuPattern, patch.skuPattern])
    if (patch.skuPrefix !== undefined) entries.push([KEYS.skuPrefix, patch.skuPrefix])
    if (patch.staleThresholds !== undefined) entries.push([KEYS.staleThresholds, patch.staleThresholds])
    if (patch.targetMarginPercent !== undefined) entries.push([KEYS.targetMarginPercent, patch.targetMarginPercent])
    if (patch.minProfitCents !== undefined) entries.push([KEYS.minProfitCents, patch.minProfitCents])
    if (patch.defaultFeePercent !== undefined) entries.push([KEYS.defaultFeePercent, patch.defaultFeePercent])
    if (patch.defaultShippingCents !== undefined) {
      entries.push([KEYS.defaultShippingCents, patch.defaultShippingCents])
    }

    if (entries.length > 0) {
      this.db.transaction(() => {
        for (const [key, value] of entries) {
          this.db.run(
            `INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $at)
             ON CONFLICT(key) DO UPDATE SET value = $value, updated_at = $at`,
            { $key: key, $value: JSON.stringify(value), $at: nowIso() }
          )
        }
      })
    }

    return this.get()
  }

  private readLocale(value: string | undefined): LocaleCode {
    const parsed = parseJson(value)
    if (parsed === 'es' || parsed === 'en') return parsed
    return this.fallbackLocale
  }

  private readTheme(value: string | undefined): ThemeMode {
    const parsed = parseJson(value)
    return parsed === 'light' ? 'light' : 'dark'
  }

  private readCurrency(value: string | undefined): string {
    const parsed = parseJson(value)
    if (typeof parsed === 'string' && /^[A-Z]{3}$/.test(parsed)) return parsed
    return DEFAULT_SETTINGS.currency
  }

  private readSkuPattern(value: string | undefined): string {
    const parsed = parseJson(value)
    if (typeof parsed !== 'string' || !parsed.trim()) return DEFAULT_SETTINGS.skuPattern
    // Un patron invalido haria fallar la creacion de articulos: se descarta.
    if (!validateSkuPattern(parsed).ok) return DEFAULT_SETTINGS.skuPattern
    return parsed
  }

  private readSkuPrefix(value: string | undefined): string {
    const parsed = parseJson(value)
    if (typeof parsed !== 'string') return DEFAULT_SETTINGS.skuPrefix
    const clean = parsed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    return clean
  }

  private readThresholds(value: string | undefined): number[] {
    const parsed = parseJson(value)
    if (!Array.isArray(parsed)) return [...DEFAULT_SETTINGS.staleThresholds]
    const clean = parsed
      .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
      .map((item) => Math.round(item))
      .filter((item) => item >= 1 && item <= 3650)
    if (clean.length === 0) return [...DEFAULT_SETTINGS.staleThresholds]
    return [...new Set(clean)].sort((a, b) => a - b)
  }

  /** Lee un numero acotado, cayendo al valor por defecto si no es valido. */
  private readNumber(value: string | undefined, min: number, max: number, fallback: number): number {
    const parsed = parseJson(value)
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  }
}
