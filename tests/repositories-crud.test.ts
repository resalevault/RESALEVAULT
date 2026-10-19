import { describe, expect, it } from 'vitest'
import { createTestContext } from './helpers'

/**
 * Repositorios de configuracion: plataformas de venta, atributos personalizados
 * y anuncios. Son datos que el usuario crea y que otras partes de la app usan
 * para calcular y para borrar con seguridad.
 */
const MISSING = '00000000-0000-4000-8000-000000000000'

describe('repositorio de plataformas', () => {
  it('create normaliza el codigo y rechaza duplicados y campos vacios', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: '  Mercadillo ', name: 'Mercadillo' })
    expect(platform.code).toBe('mercadillo')
    expect(platform.active).toBe(true)
    expect(platform.isBuiltin).toBe(false)
    expect(ctx.repos.platforms.findById(platform.id)?.name).toBe('Mercadillo')
    expect(() => ctx.repos.platforms.create({ code: 'MERCADILLO', name: 'Otro' })).toThrow()
    expect(() => ctx.repos.platforms.create({ code: '   ', name: 'X' })).toThrow()
    expect(() => ctx.repos.platforms.create({ code: 'x', name: '   ' })).toThrow()
    expect(ctx.repos.platforms.findById(MISSING)).toBeNull()
    ctx.close()
  })

  it('list(includeInactive) filtra por activo y update permite desactivar', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: 'zztest', name: 'Z Test' })
    expect(ctx.repos.platforms.list(false).some((item) => item.id === platform.id)).toBe(true)

    const updated = ctx.repos.platforms.update(platform.id, { active: false, name: 'Z Test 2', sortOrder: 5 })
    expect(updated.active).toBe(false)
    expect(updated.name).toBe('Z Test 2')
    expect(updated.sortOrder).toBe(5)
    expect(ctx.repos.platforms.list(false).some((item) => item.id === platform.id)).toBe(false)
    expect(ctx.repos.platforms.list(true).some((item) => item.id === platform.id)).toBe(true)

    expect(() => ctx.repos.platforms.update(MISSING, { name: 'x' })).toThrow()
    expect(() => ctx.repos.platforms.update(platform.id, { name: '   ' })).toThrow()
    ctx.close()
  })

  it('listingCount cuenta los anuncios de una plataforma', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: 'zzcount', name: 'Count' })
    expect(ctx.repos.platforms.listingCount(platform.id)).toBe(0)
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-CNT' })
    ctx.repos.listings.create({ productId: product.id, platformId: platform.id })
    expect(ctx.repos.platforms.listingCount(platform.id)).toBe(1)
    ctx.close()
  })
})

describe('repositorio de atributos', () => {
  it('create normaliza la clave y exige opciones en los "select"', () => {
    const ctx = createTestContext()
    const attribute = ctx.repos.attributes.create({ key: '  Temporada ', name: 'Temporada', type: 'text' })
    expect(attribute.key).toBe('temporada')
    expect(attribute.options).toEqual([])

    expect(() => ctx.repos.attributes.create({ key: 'temporada', name: 'Otro', type: 'text' })).toThrow()
    expect(() => ctx.repos.attributes.create({ key: '', name: 'X', type: 'text' })).toThrow()
    expect(() => ctx.repos.attributes.create({ key: 'k', name: '', type: 'text' })).toThrow()
    expect(() =>
      ctx.repos.attributes.create({ key: 'color', name: 'Color', type: 'select', options: [] })
    ).toThrow()

    const select = ctx.repos.attributes.create({
      key: 'material',
      name: 'Material',
      type: 'select',
      options: ['algodon', 'lana']
    })
    expect(select.options).toEqual(['algodon', 'lana'])
    expect(ctx.repos.attributes.list().some((item) => item.id === select.id)).toBe(true)
    expect(ctx.repos.attributes.findById(MISSING)).toBeNull()
    ctx.close()
  })

  it('update cambia nombre, tipo y opciones con control de existencia', () => {
    const ctx = createTestContext()
    const attribute = ctx.repos.attributes.create({ key: 'talla2', name: 'Talla', type: 'text' })
    const updated = ctx.repos.attributes.update(attribute.id, {
      name: 'Talla real',
      type: 'select',
      options: ['S', 'M']
    })
    expect(updated.name).toBe('Talla real')
    expect(updated.type).toBe('select')
    expect(updated.options).toEqual(['S', 'M'])
    expect(() => ctx.repos.attributes.update(attribute.id, { type: 'select', options: [] })).toThrow()
    expect(() => ctx.repos.attributes.update(MISSING, { name: 'x' })).toThrow()
    ctx.close()
  })

  it('remove borra la definicion y avisa si no existe', () => {
    const ctx = createTestContext()
    const attribute = ctx.repos.attributes.create({ key: 'edicion', name: 'Edicion', type: 'number' })
    expect(ctx.repos.attributes.remove(attribute.id)).toEqual({ affected: 1 })
    expect(ctx.repos.attributes.findById(attribute.id)).toBeNull()
    expect(() => ctx.repos.attributes.remove(attribute.id)).toThrow()
    ctx.close()
  })

  it('un JSON de opciones corrupto no rompe la lectura', () => {
    const ctx = createTestContext()
    ctx.db.run(
      `INSERT INTO attributes (id, key, name, type, options, sort_order, created_at, updated_at)
       VALUES ($id, 'roto', 'Roto', 'select', '{no-json', 0, $at, $at)`,
      { $id: MISSING, $at: '2026-01-01T00:00:00.000Z' }
    )
    expect(ctx.repos.attributes.findById(MISSING)?.options).toEqual([])
    ctx.close()
  })
})

describe('repositorio de anuncios', () => {
  it('create valida articulo y plataforma, y evita anuncios externos duplicados', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: 'zzlist', name: 'List' })
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-LST' })
    const listing = ctx.repos.listings.create({
      productId: product.id,
      platformId: platform.id,
      externalId: 'EXT-1',
      listedPriceCents: 2500
    })
    expect(listing.externalId).toBe('EXT-1')
    expect(listing.listedPriceCents).toBe(2500)
    expect(listing.status).toBe('draft')
    expect(ctx.repos.listings.listForProduct(product.id).length).toBe(1)
    expect(ctx.repos.listings.findById(listing.id)?.platformCode).toBe('zzlist')

    expect(() =>
      ctx.repos.listings.create({ productId: product.id, platformId: platform.id, externalId: 'EXT-1' })
    ).toThrow()
    expect(() => ctx.repos.listings.create({ productId: MISSING, platformId: platform.id })).toThrow()
    expect(() => ctx.repos.listings.create({ productId: product.id, platformId: MISSING })).toThrow()
    ctx.close()
  })

  it('update cambia estado, precio y URL con control de duplicados', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: 'zzupd', name: 'Upd' })
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-UPD' })
    const first = ctx.repos.listings.create({ productId: product.id, platformId: platform.id, externalId: 'A' })
    ctx.repos.listings.create({ productId: product.id, platformId: platform.id, externalId: 'B' })

    const updated = ctx.repos.listings.update(first.id, {
      status: 'sold',
      listedPriceCents: 1999,
      url: 'https://x/1',
      externalId: 'A2'
    })
    expect(updated.status).toBe('sold')
    expect(updated.listedPriceCents).toBe(1999)
    expect(updated.url).toBe('https://x/1')
    expect(() => ctx.repos.listings.update(first.id, { externalId: 'B' })).toThrow()
    expect(() => ctx.repos.listings.update(MISSING, { status: 'sold' })).toThrow()
    ctx.close()
  })

  it('remove elimina el anuncio y avisa si no existe', () => {
    const ctx = createTestContext()
    const platform = ctx.repos.platforms.create({ code: 'zzrem', name: 'Rem' })
    const product = ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-REM' })
    const listing = ctx.repos.listings.create({ productId: product.id, platformId: platform.id })
    expect(ctx.repos.listings.remove(listing.id)).toEqual({ affected: 1 })
    expect(ctx.repos.listings.findById(listing.id)).toBeNull()
    expect(() => ctx.repos.listings.remove(listing.id)).toThrow()
    ctx.close()
  })
})
