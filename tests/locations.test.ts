import { describe, expect, it } from 'vitest'
import { AppError } from '@main/errors'
import { createTestContext } from './helpers'

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio y no se lanzo ninguno')
}

describe('ubicaciones fisicas', () => {
  it('construye el codigo completo de la jerarquia', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    expect(warehouse.path).toBe('ALM01')
    expect(warehouse.depth).toBe(0)

    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST03',
      name: 'Estanteria 3',
      parentId: warehouse.id
    })
    expect(shelf.path).toBe('ALM01-EST03')
    expect(shelf.depth).toBe(1)

    const box = ctx.repos.locations.create({
      kind: 'box',
      code: 'CAJA12',
      name: 'Caja 12',
      parentId: shelf.id
    })
    expect(box.path).toBe('ALM01-EST03-CAJA12')

    const compartment = ctx.repos.locations.create({
      kind: 'compartment',
      code: 'C1',
      name: 'Compartimento 1',
      parentId: box.id
    })
    expect(compartment.path).toBe('ALM01-EST03-CAJA12-C1')
    expect(compartment.depth).toBe(3)

    ctx.close()
  })

  it('exige el tipo de padre correcto', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })

    // Una estanteria necesita un almacen como padre.
    expect(codeOf(() => ctx.repos.locations.create({ kind: 'shelf', code: 'E1', name: 'E1' }))).toBe(
      'invalid_location_hierarchy'
    )
    // Una caja no puede colgar directamente de un almacen.
    expect(
      codeOf(() =>
        ctx.repos.locations.create({ kind: 'box', code: 'C1', name: 'C1', parentId: warehouse.id })
      )
    ).toBe('invalid_location_hierarchy')
    // Un almacen no puede tener padre.
    expect(
      codeOf(() =>
        ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM02', name: 'X', parentId: warehouse.id })
      )
    ).toBe('invalid_location_hierarchy')

    ctx.close()
  })

  it('no permite codigos ni rutas repetidas', () => {
    const ctx = createTestContext()
    ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    expect(codeOf(() => ctx.repos.locations.create({ kind: 'warehouse', code: 'alm01', name: 'Otro' }))).toBe(
      'location_code_duplicate'
    )
    ctx.close()
  })

  it('recalcula las rutas de todo el subarbol al renombrar un codigo', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: warehouse.id
    })
    ctx.repos.locations.create({ kind: 'box', code: 'C1', name: 'C1', parentId: shelf.id })

    ctx.repos.locations.update(warehouse.id, { code: 'BODEGA' })

    const paths = ctx.repos.locations.list().map((l) => l.path)
    expect(paths).toContain('BODEGA')
    expect(paths).toContain('BODEGA-EST01')
    expect(paths).toContain('BODEGA-EST01-C1')

    ctx.close()
  })

  it('recalcula rutas y profundidades al mover un subarbol', () => {
    const ctx = createTestContext()
    const first = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen 1' })
    const second = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM02', name: 'Almacen 2' })
    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: first.id
    })
    const box = ctx.repos.locations.create({ kind: 'box', code: 'C1', name: 'C1', parentId: shelf.id })

    const moved = ctx.repos.locations.move(shelf.id, second.id)
    expect(moved.path).toBe('ALM02-EST01')
    expect(moved.depth).toBe(1)

    const movedBox = ctx.repos.locations.findById(box.id)
    expect(movedBox?.path).toBe('ALM02-EST01-C1')
    expect(movedBox?.depth).toBe(2)

    ctx.close()
  })

  it('impide mover una ubicacion dentro de su propio descendiente', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: warehouse.id
    })

    expect(codeOf(() => ctx.repos.locations.move(warehouse.id, shelf.id))).toBe('invalid_location_hierarchy')
    expect(codeOf(() => ctx.repos.locations.move(warehouse.id, warehouse.id))).toBe(
      'invalid_location_hierarchy'
    )
    ctx.close()
  })

  it('no elimina ubicaciones con hijos ni con articulos asignados', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    const shelf = ctx.repos.locations.create({
      kind: 'shelf',
      code: 'EST01',
      name: 'E1',
      parentId: warehouse.id
    })

    expect(codeOf(() => ctx.repos.locations.remove(warehouse.id))).toBe('cannot_delete_has_children')

    ctx.repos.products.create({ name: 'Articulo', locationId: shelf.id })
    expect(codeOf(() => ctx.repos.locations.remove(shelf.id))).toBe('cannot_delete_in_use')

    // Sin articulos ni hijos si se puede eliminar.
    ctx.db.run('UPDATE products SET location_id = NULL')
    expect(ctx.repos.locations.remove(shelf.id).affected).toBe(1)
    expect(ctx.repos.locations.remove(warehouse.id).affected).toBe(1)

    ctx.close()
  })

  it('cuenta los articulos asignados a cada ubicacion', () => {
    const ctx = createTestContext()
    const warehouse = ctx.repos.locations.create({ kind: 'warehouse', code: 'ALM01', name: 'Almacen' })
    ctx.repos.products.create({ name: 'Uno', locationId: warehouse.id })
    ctx.repos.products.create({ name: 'Dos', locationId: warehouse.id })

    const listed = ctx.repos.locations.findById(warehouse.id)
    expect(listed?.productCount).toBe(2)
    ctx.close()
  })
})
