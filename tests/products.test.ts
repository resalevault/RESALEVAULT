import { describe, expect, it } from 'vitest'
import { AppError } from '@main/errors'
import { createTestContext, daysAgoIso, type TestContext } from './helpers'

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio y no se lanzo ninguno')
}

function currentYyMm(): string {
  const now = new Date()
  return `${String(now.getFullYear() % 100).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`
}

describe('articulos: creacion', () => {
  it('genera un SKU automatico con el patron por defecto', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Camiseta basica' })
    expect(product.sku).toBe(`RV-GEN-${currentYyMm()}-0001`)
    ctx.close()
  })

  it('usa la categoria para el fragmento de SKU', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Camiseta', categoryId: 'cat-ropa-camisetas' })
    expect(product.sku).toBe(`RV-CAM-${currentYyMm()}-0001`)
    ctx.close()
  })

  it('incrementa la secuencia y nunca repite SKU', () => {
    const ctx = createTestContext()
    const first = ctx.repos.products.create({ name: 'Uno' })
    const second = ctx.repos.products.create({ name: 'Dos' })
    const third = ctx.repos.products.create({ name: 'Tres' })

    expect(first.sku).toBe(`RV-GEN-${currentYyMm()}-0001`)
    expect(second.sku).toBe(`RV-GEN-${currentYyMm()}-0002`)
    expect(third.sku).toBe(`RV-GEN-${currentYyMm()}-0003`)
    ctx.close()
  })

  it('respeta un SKU manual y lo normaliza', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Manual', sku: ' zapatilla-01 ' })
    expect(product.sku).toBe('ZAPATILLA-01')
    ctx.close()
  })

  it('rechaza SKU duplicados sin distinguir mayusculas', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'Primero', sku: 'ABC-001' })

    expect(codeOf(() => ctx.repos.products.create({ name: 'Segundo', sku: 'abc-001' }))).toBe(
      'sku_duplicate'
    )
    expect(ctx.repos.products.checkSku('ABC-001').available).toBe(false)
    expect(ctx.repos.products.checkSku('ABC-002').available).toBe(true)
    ctx.close()
  })

  it('rechaza articulos sin nombre', () => {
    const ctx = createTestContext()
    expect(codeOf(() => ctx.repos.products.create({ name: '   ' }))).toBe('invalid_input')
    ctx.close()
  })

  it('aplica el estado por defecto y conserva todos los campos', () => {
    const ctx = createTestContext()
    const location = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })

    const product = ctx.repos.products.create({
      name: 'Sudadera',
      description: 'Descripcion',
      categoryId: 'cat-ropa-sudaderas',
      brand: 'Marca',
      model: 'Modelo',
      size: 'L',
      color: 'Negro',
      condition: 'good',
      attributes: { temporada: 'invierno', capucha: true, precioObjetivo: 40 },
      purchaseDate: daysAgoIso(10),
      purchasePriceCents: 900,
      acquisitionFeesCents: 250,
      expectedSalePriceCents: 3800,
      locationId: location.id,
      privateNotes: 'Nota privada',
      tags: ['lote-nike', 'rebajas']
    })

    expect(product.status).toBe('to_prepare')
    expect(product.brand).toBe('Marca')
    expect(product.attributes).toEqual({ temporada: 'invierno', capucha: true, precioObjetivo: 40 })
    expect(product.purchasePriceCents).toBe(900)

    const detail = ctx.repos.products.get(product.id)
    expect(detail.tags.map((t) => t.name).sort()).toEqual(['lote-nike', 'rebajas'])
    expect(detail.history.some((h) => h.action === 'created')).toBe(true)
    ctx.close()
  })

  it('sugiere un SKU libre sin crear el articulo', () => {
    const ctx = createTestContext()
    const suggestion = ctx.repos.products.suggestSku('cat-ropa-camisetas')
    expect(suggestion).toBe(`RV-CAM-${currentYyMm()}-0001`)
    // Sugerir no consume la secuencia.
    const created = ctx.repos.products.create({ name: 'X', categoryId: 'cat-ropa-camisetas' })
    expect(created.sku).toBe(suggestion)
    ctx.close()
  })
})

describe('articulos: actualizacion e historial', () => {
  it('actualiza campos y registra el cambio en el historial', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Original', expectedSalePriceCents: 1000 })

    const updated = ctx.repos.products.update(product.id, {
      name: 'Renombrado',
      expectedSalePriceCents: 2000,
      status: 'available'
    })

    expect(updated.name).toBe('Renombrado')
    expect(updated.expectedSalePriceCents).toBe(2000)
    expect(updated.status).toBe('available')

    const history = ctx.repos.products.get(product.id).history
    const nameChange = history.find((h) => h.field === 'name')
    expect(nameChange?.oldValue).toBe('Original')
    expect(nameChange?.newValue).toBe('Renombrado')

    const priceChange = history.find((h) => h.field === 'expected_sale_price_cents')
    expect(priceChange?.oldValue).toBe('1000')
    expect(priceChange?.newValue).toBe('2000')
    ctx.close()
  })

  it('no registra historial si el valor no cambia', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Igual' })
    ctx.repos.products.update(product.id, { name: 'Igual' })

    const history = ctx.repos.products.get(product.id).history
    expect(history.filter((h) => h.field === 'name')).toHaveLength(0)
    ctx.close()
  })

  it('permite cambiar el SKU si sigue siendo unico', () => {
    const ctx = createTestContext()
    const a = ctx.repos.products.create({ name: 'A', sku: 'A-1' })
    const b = ctx.repos.products.create({ name: 'B', sku: 'B-1' })

    expect(ctx.repos.products.update(b.id, { sku: 'B-2' }).sku).toBe('B-2')
    expect(codeOf(() => ctx.repos.products.update(b.id, { sku: 'A-1' }))).toBe('sku_duplicate')
    void a
    ctx.close()
  })

  it('actualiza etiquetas sustituyendo el conjunto completo', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Etiquetado', tags: ['uno', 'dos'] })
    ctx.repos.products.update(product.id, { tags: ['tres'] })

    const detail = ctx.repos.products.get(product.id)
    expect(detail.tags.map((t) => t.name)).toEqual(['tres'])
    ctx.close()
  })
})

describe('articulos: consultas', () => {
  function seed(ctx: TestContext): void {
    const shelf = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    const box = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: shelf.id
    })

    ctx.repos.products.create({
      name: 'Camiseta negra',
      sku: 'RV-CAM-1',
      categoryId: 'cat-ropa-camisetas',
      locationId: box.id,
      status: 'available',
      purchaseDate: daysAgoIso(5),
      purchasePriceCents: 1000,
      acquisitionFeesCents: 200,
      expectedSalePriceCents: 3000,
      brand: 'MarcaUno'
    })
    ctx.repos.products.create({
      name: 'Sudadera gris',
      sku: 'RV-SUD-1',
      categoryId: 'cat-ropa-sudaderas',
      status: 'reserved',
      purchaseDate: daysAgoIso(45),
      purchasePriceCents: 2000,
      expectedSalePriceCents: 5000
    })
    ctx.repos.products.create({
      name: 'Movil usado',
      sku: 'RV-TEC-1',
      categoryId: 'cat-tecnologia-moviles',
      status: 'available',
      purchaseDate: daysAgoIso(95),
      purchasePriceCents: 9000,
      expectedSalePriceCents: 15000
    })
  }

  it('devuelve el total, la pagina y el numero de paginas', () => {
    const ctx = createTestContext()
    seed(ctx)

    const first = ctx.repos.products.list({ page: 1, pageSize: 2, sort: 'name_asc' })
    expect(first.total).toBe(3)
    expect(first.pageCount).toBe(2)
    expect(first.items).toHaveLength(2)
    expect(first.items.map((i) => i.name)).toEqual(['Camiseta negra', 'Movil usado'])

    const second = ctx.repos.products.list({ page: 2, pageSize: 2, sort: 'name_asc' })
    expect(second.items.map((i) => i.name)).toEqual(['Sudadera gris'])
    ctx.close()
  })

  it('busca por nombre, SKU, marca y notas privadas', () => {
    const ctx = createTestContext()
    seed(ctx)
    ctx.repos.products.create({ name: 'Otro', sku: 'RV-OTR-1', privateNotes: 'guardaespaldas exclusivo' })

    expect(ctx.repos.products.list({ search: 'camiseta' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: 'RV-SUD-1' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: 'marcauno' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: 'guardaespaldas' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: 'inexistente' }).total).toBe(0)
    ctx.close()
  })

  it('trata los comodines de LIKE como texto literal', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'Descuento 50%', sku: 'RV-PCT-1' })
    ctx.repos.products.create({ name: 'Sin comodin', sku: 'RV-OTR-2' })

    expect(ctx.repos.products.list({ search: '50%' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: '%' }).total).toBe(1)
    expect(ctx.repos.products.list({ search: '_' }).total).toBe(0)
    ctx.close()
  })

  it('filtra por estado y por condicion', () => {
    const ctx = createTestContext()
    seed(ctx)
    expect(ctx.repos.products.list({ status: ['available'] }).total).toBe(2)
    expect(ctx.repos.products.list({ status: ['reserved', 'sold'] }).total).toBe(1)
    expect(ctx.repos.products.list({ conditions: ['unknown'] }).total).toBe(3)
    ctx.close()
  })

  it('filtra por categoria incluyendo subcategorias', () => {
    const ctx = createTestContext()
    seed(ctx)
    // Filtrar por "Ropa" debe traer tambien sus subcategorias.
    expect(ctx.repos.products.list({ categoryIds: ['cat-ropa'] }).total).toBe(2)
    expect(ctx.repos.products.list({ categoryIds: ['cat-ropa-camisetas'] }).total).toBe(1)
    expect(ctx.repos.products.list({ categoryIds: ['cat-tecnologia'] }).total).toBe(1)
    ctx.close()
  })

  it('filtra por ubicacion incluyendo descendientes', () => {
    const ctx = createTestContext()
    seed(ctx)
    const warehouse = ctx.repos.locations.list().find((l) => l.code === 'ALM01')
    expect(warehouse).toBeDefined()
    // El articulo esta en la estanteria, no en el almacen.
    expect(ctx.repos.products.list({ locationIds: [warehouse!.id] }).total).toBe(1)
    ctx.close()
  })

  it('filtra por antiguedad (stock estancado)', () => {
    const ctx = createTestContext()
    seed(ctx)
    expect(ctx.repos.products.list({ minAgeDays: 30 }).total).toBe(2)
    expect(ctx.repos.products.list({ minAgeDays: 90 }).total).toBe(1)
    expect(ctx.repos.products.list({ maxAgeDays: 10 }).total).toBe(1)
    expect(ctx.repos.products.list({ minAgeDays: 30, maxAgeDays: 60 }).total).toBe(1)
    ctx.close()
  })

  it('ordena por los criterios permitidos', () => {
    const ctx = createTestContext()
    seed(ctx)

    expect(ctx.repos.products.list({ sort: 'name_asc' }).items.map((i) => i.name)).toEqual([
      'Camiseta negra',
      'Movil usado',
      'Sudadera gris'
    ])
    expect(ctx.repos.products.list({ sort: 'expected_desc' }).items[0]?.name).toBe('Movil usado')
    expect(ctx.repos.products.list({ sort: 'cost_desc' }).items[0]?.name).toBe('Movil usado')
    expect(ctx.repos.products.list({ sort: 'age_desc' }).items[0]?.name).toBe('Movil usado')
    ctx.close()
  })

  it('calcula coste total y margenes segun las formulas documentadas', () => {
    const ctx = createTestContext()
    seed(ctx)
    const camiseta = ctx.repos.products.list({ search: 'Camiseta negra' }).items[0]!

    expect(camiseta.totalCostCents).toBe(1200)
    expect(camiseta.estimatedMarginCents).toBe(1800)
    expect(camiseta.realizedMarginCents).toBeNull()
    ctx.close()
  })

  it('expone el margen realizado solo en articulos vendidos', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({
      name: 'Vendido',
      purchasePriceCents: 1000,
      acquisitionFeesCents: 200,
      expectedSalePriceCents: 3000,
      status: 'sold',
      finalSalePriceCents: 2800
    })

    const summary = ctx.repos.products.list({ search: 'Vendido' }).items[0]!
    expect(summary.totalCostCents).toBe(1200)
    expect(summary.realizedMarginCents).toBe(1600)
    void product
    ctx.close()
  })

  it('agrega capital y valor previsto', () => {
    const ctx = createTestContext()
    seed(ctx)
    const aggregate = ctx.repos.products.aggregate({ status: ['available'] })
    expect(aggregate.count).toBe(2)
    expect(aggregate.capitalCents).toBe(1000 + 200 + 9000)
    expect(aggregate.expectedCents).toBe(3000 + 15000)
    ctx.close()
  })
})

describe('articulos: archivado, restauracion y borrado', () => {
  it('archiva y restaura conservando el estado anterior', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Reservado', status: 'reserved' })

    expect(ctx.repos.products.archive([product.id]).affected).toBe(1)
    const archived = ctx.repos.products.get(product.id).product
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).not.toBeNull()

    // Por defecto los archivados no aparecen en el listado.
    expect(ctx.repos.products.list().total).toBe(0)
    expect(ctx.repos.products.list({ onlyArchived: true }).total).toBe(1)
    expect(ctx.repos.products.list({ includeArchived: true }).total).toBe(1)

    expect(ctx.repos.products.restore([product.id]).affected).toBe(1)
    const restored = ctx.repos.products.get(product.id).product
    expect(restored.status).toBe('reserved')
    expect(restored.archivedAt).toBeNull()
    ctx.close()
  })

  it('archivar dos veces el mismo articulo no duplica operaciones', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Una vez' })
    expect(ctx.repos.products.archive([product.id]).affected).toBe(1)
    expect(ctx.repos.products.archive([product.id]).affected).toBe(0)
    ctx.close()
  })

  it('solo permite eliminar definitivamente articulos archivados', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Con salvaguarda' })

    expect(codeOf(() => ctx.repos.products.remove([product.id]))).toBe('conflict')

    ctx.repos.products.archive([product.id])
    expect(ctx.repos.products.remove([product.id]).affected).toBe(1)
    expect(codeOf(() => ctx.repos.products.get(product.id))).toBe('not_found')
    ctx.close()
  })
})

describe('articulos: edicion masiva', () => {
  it('previsualiza los cambios sin aplicarlos', () => {
    const ctx = createTestContext()
    const a = ctx.repos.products.create({ name: 'A', status: 'available', expectedSalePriceCents: 1000 })
    const b = ctx.repos.products.create({ name: 'B', status: 'available', expectedSalePriceCents: 2000 })

    const preview = ctx.repos.products.bulkPreview({
      ids: [a.id, b.id],
      status: 'reserved',
      priceAdjustment: { mode: 'percent', value: 10 }
    })

    expect(preview.affected).toBe(2)
    expect(preview.requested).toBe(2)
    expect(preview.totalFields).toBe(4)
    expect(preview.changes[0]?.fields.map((f) => f.field).sort()).toEqual([
      'expected_sale_price_cents',
      'status'
    ])
    // Nada se ha modificado todavia.
    expect(ctx.repos.products.get(a.id).product.status).toBe('available')
    ctx.close()
  })

  it('aplica los cambios y escribe historial', () => {
    const ctx = createTestContext()
    const a = ctx.repos.products.create({ name: 'A', status: 'available', expectedSalePriceCents: 10000 })

    const result = ctx.repos.products.bulkUpdate({
      ids: [a.id],
      status: 'reserved',
      locationId: null,
      priceAdjustment: { mode: 'percent', value: 10 }
    })

    expect(result.affected).toBe(1)
    const updated = ctx.repos.products.get(a.id).product
    expect(updated.status).toBe('reserved')
    expect(updated.expectedSalePriceCents).toBe(11000)
    expect(ctx.repos.products.get(a.id).history.some((h) => h.action === 'bulk_update')).toBe(true)
    ctx.close()
  })

  it('aplica ajustes de precio fijos y por diferencia sin bajar de cero', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({ name: 'Precio', expectedSalePriceCents: 5000 })

    ctx.repos.products.bulkUpdate({ ids: [product.id], priceAdjustment: { mode: 'set', value: 9500 } })
    expect(ctx.repos.products.get(product.id).product.expectedSalePriceCents).toBe(9500)

    ctx.repos.products.bulkUpdate({ ids: [product.id], priceAdjustment: { mode: 'delta', value: -500 } })
    expect(ctx.repos.products.get(product.id).product.expectedSalePriceCents).toBe(9000)

    ctx.repos.products.bulkUpdate({ ids: [product.id], priceAdjustment: { mode: 'delta', value: -999999 } })
    expect(ctx.repos.products.get(product.id).product.expectedSalePriceCents).toBe(0)
    ctx.close()
  })

  it('anade y quita etiquetas en lote', () => {
    const ctx = createTestContext()
    const a = ctx.repos.products.create({ name: 'A', tags: ['base'] })
    const b = ctx.repos.products.create({ name: 'B' })

    ctx.repos.products.bulkUpdate({ ids: [a.id, b.id], addTags: ['rebajas'] })
    expect(ctx.repos.products.get(a.id).tags.map((t) => t.name).sort()).toEqual(['base', 'rebajas'])
    expect(ctx.repos.products.get(b.id).tags.map((t) => t.name)).toEqual(['rebajas'])

    ctx.repos.products.bulkUpdate({ ids: [a.id, b.id], removeTags: ['rebajas'] })
    expect(ctx.repos.products.get(a.id).tags.map((t) => t.name)).toEqual(['base'])
    expect(ctx.repos.products.get(b.id).tags).toHaveLength(0)
    ctx.close()
  })
})
