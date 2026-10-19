import { describe, expect, it } from 'vitest'
import {
  zAttributeCreate,
  zBulkUpdate,
  zCategoryCreate,
  zCheckSkuPayload,
  zListingUpdatePayload,
  zLocationCode,
  zLocationCreate,
  zProductCreate,
  zProductQuery,
  zProductUpdatePayload,
  zSettingsPatch
} from '@shared/schemas'

describe('validacion de entrada (frontera IPC)', () => {
  it('acepta una entrada de articulo valida y normaliza el SKU', () => {
    const parsed = zProductCreate.parse({ name: '  Camiseta  ', sku: ' rv-001 ', purchasePriceCents: 1500 })
    expect(parsed.name).toBe('Camiseta')
    expect(parsed.sku).toBe('RV-001')
    expect(parsed.purchasePriceCents).toBe(1500)
  })

  it('rechaza nombres vacios y campos demasiado largos', () => {
    expect(zProductCreate.safeParse({ name: '' }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: '   ' }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'x'.repeat(201) }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'Correcto' }).success).toBe(true)
  })

  it('rechaza importes no enteros o fuera de rango', () => {
    expect(zProductCreate.safeParse({ name: 'A', purchasePriceCents: 10.5 }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'A', purchasePriceCents: 1e15 }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'A', purchasePriceCents: -1e15 }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'A', purchasePriceCents: -500 }).success).toBe(true)
  })

  it('valida el orden de las fechas ISO', () => {
    expect(zProductCreate.safeParse({ name: 'A', purchaseDate: '2026-02-30' }).success).toBe(false)
    expect(zProductCreate.safeParse({ name: 'A', purchaseDate: '2026-02-28' }).success).toBe(true)
    expect(zProductCreate.safeParse({ name: 'A', purchaseDate: '28/02/2026' }).success).toBe(false)
    expect(zProductCreate.parse({ name: 'A', purchaseDate: '' }).purchaseDate).toBeNull()
  })

  it('limita los parametros de consulta a valores razonables', () => {
    expect(zProductQuery.safeParse({ pageSize: 10_000 }).success).toBe(false)
    expect(zProductQuery.safeParse({ page: 0 }).success).toBe(false)
    expect(zProductQuery.safeParse({ sort: 'inventado' }).success).toBe(false)
    expect(zProductQuery.safeParse({ sort: 'name_asc', pageSize: 100 }).success).toBe(true)
  })

  it('exige cambios reales en la edicion masiva', () => {
    expect(zBulkUpdate.safeParse({ ids: ['a'] }).success).toBe(false)
    expect(zBulkUpdate.safeParse({ ids: [], status: 'sold' }).success).toBe(false)
    expect(zBulkUpdate.safeParse({ ids: ['a'], status: 'sold' }).success).toBe(true)
    expect(
      zBulkUpdate.safeParse({ ids: ['a'], priceAdjustment: { mode: 'percent', value: 10 } }).success
    ).toBe(true)
  })

  it('valida los payloads compuestos de identificador y datos', () => {
    expect(zProductUpdatePayload.safeParse({ id: 'p1', patch: { name: 'Nuevo' } }).success).toBe(true)
    expect(zProductUpdatePayload.safeParse({ id: '', patch: {} }).success).toBe(false)
    expect(zProductUpdatePayload.safeParse({ patch: {} }).success).toBe(false)
    expect(zListingUpdatePayload.safeParse({ id: 'l1', patch: { status: 'sold' } }).success).toBe(true)
    expect(zListingUpdatePayload.safeParse({ id: 'l1', patch: { status: 'inventado' } }).success).toBe(false)
  })

  it('normaliza y valida codigos de ubicacion', () => {
    expect(zLocationCode.parse(' alm01 ')).toBe('ALM01')
    expect(zLocationCode.safeParse('ALM 01').success).toBe(false)
    expect(zLocationCode.safeParse('').success).toBe(false)
    expect(zLocationCreate.safeParse({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' }).success).toBe(true)
    expect(zLocationCreate.safeParse({ kind: 'palet', code: 'X', name: 'Y' }).success).toBe(false)
  })

  it('valida categorias y atributos', () => {
    expect(zCategoryCreate.safeParse({ name: 'Nueva' }).success).toBe(true)
    expect(zCategoryCreate.safeParse({ name: '' }).success).toBe(false)
    expect(
      zAttributeCreate.safeParse({ key: 'temporada', name: 'Temporada', type: 'select', options: ['Verano'] })
        .success
    ).toBe(true)
    expect(zAttributeCreate.safeParse({ key: 'Temporada Ñ', name: 'X', type: 'text' }).success).toBe(false)
    expect(zAttributeCreate.safeParse({ key: 'x', name: 'X', type: 'inventado' }).success).toBe(false)
  })

  it('valida los ajustes de la aplicacion', () => {
    expect(zSettingsPatch.safeParse({ locale: 'es', theme: 'dark' }).success).toBe(true)
    expect(zSettingsPatch.safeParse({ locale: 'de' }).success).toBe(false)
    expect(zSettingsPatch.parse({ currency: 'eur' }).currency).toBe('EUR')
    expect(zSettingsPatch.safeParse({ currency: 'EURO' }).success).toBe(false)
    expect(zSettingsPatch.safeParse({ staleThresholds: [30, 60] }).success).toBe(true)
    expect(zSettingsPatch.safeParse({ staleThresholds: [] }).success).toBe(false)
    expect(zSettingsPatch.parse({ skuPrefix: 'rv-9!' }).skuPrefix).toBe('RV9')
  })

  it('valida la comprobacion de SKU', () => {
    expect(zCheckSkuPayload.parse({ sku: 'rv-1' }).sku).toBe('RV-1')
    expect(zCheckSkuPayload.safeParse({ sku: '' }).success).toBe(false)
    expect(zCheckSkuPayload.safeParse({ sku: 'A', exceptId: null }).success).toBe(true)
  })
})
