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

describe('categorias', () => {
  it('crea categorias de primer nivel y subcategorias', () => {
    const ctx = createTestContext()
    const parent = ctx.repos.categories.create({ name: 'Ropa de trabajo' })
    const child = ctx.repos.categories.create({ name: 'Uniformes', parentId: parent.id })

    expect(parent.parentId).toBeNull()
    expect(child.parentId).toBe(parent.id)
    expect(child.slug).toBe('uniformes')
    ctx.close()
  })

  it('genera slugs estables sin acentos', () => {
    const ctx = createTestContext()
    const category = ctx.repos.categories.create({ name: 'Niño y bebé' })
    expect(category.slug).toBe('nino-y-bebe')
    ctx.close()
  })

  it('impide nombres repetidos entre hermanas pero los permite en ramas distintas', () => {
    const ctx = createTestContext()
    // Ya existe "Camisetas" dentro de "Ropa".
    expect(codeOf(() => ctx.repos.categories.create({ name: 'Camisetas', parentId: 'cat-ropa' }))).toBe(
      'category_duplicate'
    )
    // El mismo nombre en otra rama si es valido.
    const created = ctx.repos.categories.create({ name: 'Camisetas', parentId: 'cat-hogar' })
    expect(created.parentId).toBe('cat-hogar')
    ctx.close()
  })

  it('rechaza nombres vacios', () => {
    const ctx = createTestContext()
    expect(codeOf(() => ctx.repos.categories.create({ name: '   ' }))).toBe('invalid_input')
    ctx.close()
  })

  it('no elimina categorias con subcategorias ni con articulos', () => {
    const ctx = createTestContext()

    expect(codeOf(() => ctx.repos.categories.remove('cat-ropa'))).toBe('cannot_delete_has_children')

    ctx.repos.products.create({ name: 'Camiseta', categoryId: 'cat-ropa-camisetas' })
    expect(codeOf(() => ctx.repos.categories.remove('cat-ropa-camisetas'))).toBe('cannot_delete_in_use')

    // Sin articulos si se elimina.
    ctx.db.run('UPDATE products SET category_id = NULL')
    expect(ctx.repos.categories.remove('cat-ropa-camisetas').affected).toBe(1)
    ctx.close()
  })

  it('permite renombrar y reordenar', () => {
    const ctx = createTestContext()
    const updated = ctx.repos.categories.update('cat-ropa-camisetas', { name: 'T-shirts', sortOrder: 5 })
    expect(updated.name).toBe('T-shirts')
    expect(updated.slug).toBe('t-shirts')
    expect(updated.sortOrder).toBe(5)
    ctx.close()
  })

  it('impide que una categoria sea su propia ancestra', () => {
    const ctx = createTestContext()
    const a = ctx.repos.categories.create({ name: 'A' })
    const b = ctx.repos.categories.create({ name: 'B', parentId: a.id })

    expect(codeOf(() => ctx.repos.categories.update(a.id, { parentId: b.id }))).toBe(
      'invalid_location_hierarchy'
    )
    expect(codeOf(() => ctx.repos.categories.update(a.id, { parentId: a.id }))).toBe(
      'invalid_location_hierarchy'
    )
    ctx.close()
  })

  it('cuenta los articulos del subarbol completo', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({ name: 'Camiseta', categoryId: 'cat-ropa-camisetas' })
    ctx.repos.products.create({ name: 'Sudadera', categoryId: 'cat-ropa-sudaderas' })
    ctx.repos.products.create({ name: 'Movil', categoryId: 'cat-tecnologia-moviles' })

    expect(ctx.repos.categories.countProductsInSubtree('cat-ropa')).toBe(2)
    expect(ctx.repos.categories.countProductsInSubtree('cat-tecnologia')).toBe(1)
    expect(ctx.repos.categories.countProductsInSubtree('cat-hogar')).toBe(0)
    ctx.close()
  })
})
