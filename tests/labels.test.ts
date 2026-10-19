import { describe, expect, it } from 'vitest'
import { DEFAULT_LABEL_OPTIONS, LabelService, renderBarcode } from '@main/services/labels'
import { createTestContext, createWarehouse } from './helpers'

/**
 * Etiquetas y codigos: el SVG se genera en el proceso principal y, si el
 * contenido no vale para la simbologia pedida, se avisa y se cae a Code 128 en
 * lugar de producir un codigo ilegible.
 */
describe('renderBarcode', () => {
  it('un texto vacio no genera codigo y avisa', () => {
    const result = renderBarcode('   ', 'code128')
    expect(result.svg).toBe('')
    expect(result.warning).toBe('invalid_content_for_symbology')
    expect(result.usedSymbology).toBe('code128')
  })

  it('genera un SVG valido para Code 128', () => {
    const result = renderBarcode('SKU-001', 'code128')
    expect(result.svg).toContain('<svg')
    expect(result.warning).toBeUndefined()
  })

  it('un contenido no numerico en EAN-13 cae a Code 128 con aviso', () => {
    const result = renderBarcode('ABC', 'ean13')
    expect(result.usedSymbology).toBe('code128')
    expect(result.warning).toBe('invalid_content_for_symbology')
    expect(result.svg).toContain('<svg')
  })

  it('un caracter no permitido en Code 39 cae a Code 128 con aviso', () => {
    const result = renderBarcode('Codigo', 'code39')
    expect(result.usedSymbology).toBe('code128')
    expect(result.warning).toBe('invalid_content_for_symbology')
  })

  it('genera codigos QR validos', () => {
    const result = renderBarcode('https://resalevault.local/p/1', 'qrcode')
    expect(result.svg).toContain('<svg')
    expect(result.warning).toBeUndefined()
  })
})

describe('LabelService', () => {
  it('las opciones por defecto son coherentes', () => {
    expect(DEFAULT_LABEL_OPTIONS.symbology).toBe('code128')
    expect(DEFAULT_LABEL_OPTIONS.target).toBe('product')
    expect(DEFAULT_LABEL_OPTIONS.showPrice).toBe(false)
  })

  it('normaliza y acota las opciones recibidas', () => {
    const ctx = createTestContext()
    const service = new LabelService(ctx.db)
    const options = service.normalizeOptions({
      widthMm: 5,
      heightMm: 9999,
      columns: 99,
      customPrefix: 'x'.repeat(100),
      title: 'y'.repeat(200)
    })
    expect(options.widthMm).toBe(20)
    expect(options.heightMm).toBe(200)
    expect(options.columns).toBe(6)
    expect((options.customPrefix ?? '').length).toBe(40)
    expect((options.title ?? '').length).toBe(80)
    ctx.close()
  })

  it('construye la hoja de un articulo con su codigo', () => {
    const ctx = createTestContext()
    const service = new LabelService(ctx.db)
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-LBL' })
    const sheet = service.buildProductSheet([product.id], {})
    expect(sheet.options.target).toBe('product')
    expect(sheet.items.length).toBe(1)
    expect(sheet.items[0]?.code).toBe('SKU-LBL')
    expect(sheet.items[0]?.barcodeSvg).toContain('<svg')
    ctx.close()
  })

  it('permite codificar la ubicacion o un prefijo propio', () => {
    const ctx = createTestContext()
    const service = new LabelService(ctx.db)
    const locationId = createWarehouse(ctx, 'ALM01')
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-LOC', locationId })
    expect(service.buildProductSheet([product.id], { encode: 'location' }).items[0]?.code).toBe('ALM01')
    expect(service.buildProductSheet([product.id], { encode: 'custom', customPrefix: 'RV-' }).items[0]?.code).toBe(
      'RV-SKU-LOC'
    )
    ctx.close()
  })

  it('rechaza una lista vacia o un articulo inexistente', () => {
    const ctx = createTestContext()
    const service = new LabelService(ctx.db)
    expect(() => service.buildProductSheet([], {})).toThrow()
    expect(() => service.buildProductSheet(['00000000-0000-4000-8000-000000000000'], {})).toThrow()
    ctx.close()
  })

  it('construye etiquetas de ubicacion', () => {
    const ctx = createTestContext()
    const service = new LabelService(ctx.db)
    const locationId = createWarehouse(ctx, 'ALM02')
    const sheet = service.buildLocationSheet([locationId], {})
    expect(sheet.options.target).toBe('location')
    expect(sheet.items[0]?.code).toBe('ALM02')
    expect(sheet.items[0]?.barcodeSvg).toContain('<svg')
    expect(() => service.buildLocationSheet([], {})).toThrow()
    ctx.close()
  })
})
