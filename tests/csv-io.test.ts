import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CsvService } from '@main/services/csv-io'
import { FinanceService } from '@main/services/finance'
import { createTestContext, type TestContext } from './helpers'

/**
 * Pruebas de importacion y exportacion CSV.
 *
 * Es dinero: lo que se comprueba aqui es que los importes se guardan en
 * CENTIMOS exactos, que nada se sobrescribe en silencio y que una categoria o
 * ubicacion inexistente NO se inventa.
 */
let ctx: TestContext
let csv: CsvService
let dir: string

beforeEach(() => {
  ctx = createTestContext('es')
  const finance = new FinanceService(ctx.db, [30, 60, 90], 25)
  csv = new CsvService(ctx.repos, finance, () => 'es')
  dir = mkdtempSync(join(tmpdir(), 'rv-csv-'))
})

afterEach(() => {
  ctx.close()
  rmSync(dir, { recursive: true, force: true })
})

function writeCsv(name: string, content: string): string {
  const path = join(dir, name)
  writeFileSync(path, content, 'utf8')
  return path
}

describe('vista previa', () => {
  it('lee cabeceras, separador y numero de filas', () => {
    const path = writeCsv('p.csv', 'nombre;sku;precio_compra\nCamiseta;SKU1;12,50\nPantalon;SKU2;8,00\n')
    const preview = csv.preview(path)
    expect(preview.delimiter).toBe(';')
    expect(preview.headers).toEqual(['nombre', 'sku', 'precio_compra'])
    expect(preview.totalRows).toBe(2)
    expect(preview.sampleRows.length).toBe(2)
    expect(preview.targetFields.length).toBeGreaterThan(0)
  })

  it('un fichero vacio es un error claro, no una vista previa en blanco', () => {
    const path = writeCsv('empty.csv', '')
    expect(() => csv.preview(path)).toThrow()
  })

  it('un fichero inexistente provoca un error, no un resultado vacio', () => {
    expect(() => csv.preview(join(dir, 'no-existe.csv'))).toThrow()
  })
})

describe('analisis previo (sin escribir)', () => {
  it('avisa de nombre ausente, importe invalido e importe negativo', () => {
    const path = writeCsv(
      'a.csv',
      ['nombre;precio_compra', 'Camiseta;12,50', ';10,00', 'Sudadera;abc', 'Pantalon;-3,00'].join('\n')
    )
    const report = csv.analyze(path, { name: 0, purchasePrice: 1 })
    const messages = report.issues.map((issue) => issue.message)
    expect(report.parsed).toBe(4)
    expect(report.valid).toBe(3)
    expect(report.invalid).toBe(1)
    expect(messages).toContain('import.nameRequired')
    expect(messages).toContain('import.invalidAmount')
    expect(messages).toContain('import.negativeAmount')
  })

  it('detecta un SKU repetido dentro del propio fichero', () => {
    const path = writeCsv('d.csv', 'nombre;sku\nCamiseta;SKU9\nSudadera;SKU9\n')
    const report = csv.analyze(path, { name: 0, sku: 1 })
    expect(report.issues.some((issue) => issue.message === 'import.duplicateInFile')).toBe(true)
  })

  it('marca un SKU ya existente como duplicado y muestra las diferencias', () => {
    ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU1', purchasePriceCents: 1000, expectedSalePriceCents: 3000 })
    const path = writeCsv('e.csv', 'nombre;sku;precio_compra;precio_previsto\nCamiseta;SKU1;15,00;35,00\n')
    const report = csv.analyze(path, { name: 0, sku: 1, purchasePrice: 2, expectedPrice: 3 })
    expect(report.duplicates.length).toBe(1)
    expect(report.duplicates[0]?.reason).toBe('sku_exists')
    const fields = report.duplicates[0]?.differences.map((difference) => difference.field) ?? []
    expect(fields).toContain('purchasePrice')
    expect(fields).toContain('expectedPrice')
  })

  it('una coincidencia probable por nombre y marca se distingue de un SKU repetido', () => {
    ctx.repos.products.create({ name: 'Camiseta Azul', brand: 'ACME', sku: 'OTRO' })
    const path = writeCsv('pm.csv', 'nombre;marca;sku\nCamiseta Azul;ACME;NUEVO\n')
    const report = csv.analyze(path, { name: 0, brand: 1, sku: 2 })
    expect(report.duplicates.some((duplicate) => duplicate.reason === 'possible_match')).toBe(true)
  })
})

describe('importacion', () => {
  it('dryRun cuenta lo que haria pero no escribe nada', () => {
    const path = writeCsv('i.csv', 'nombre;sku;precio_compra\nCamiseta;SKU-A;12,50\n')
    const result = csv.importProducts({
      path,
      mapping: { name: 0, sku: 1, purchasePrice: 2 },
      duplicateStrategy: 'create_anyway',
      dryRun: true
    })
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0, issues: [] })
    expect(ctx.db.scalar<number>('SELECT COUNT(*) AS v FROM products')).toBe(0)
  })

  it('crea articulos y guarda el dinero en centimos exactos', () => {
    const path = writeCsv(
      'i2.csv',
      'nombre;sku;precio_compra;gastos_adquisicion;precio_previsto;etiquetas\nCamiseta;SKU-B;12,50;1,20;39,90;verano|nuevo\n'
    )
    const result = csv.importProducts({
      path,
      mapping: { name: 0, sku: 1, purchasePrice: 2, acquisitionFees: 3, expectedPrice: 4, tags: 5 },
      duplicateStrategy: 'create_anyway',
      dryRun: false
    })
    expect(result.created).toBe(1)
    const row = ctx.db.get<Record<string, unknown>>(
      'SELECT purchase_price_cents, acquisition_fees_cents, expected_sale_price_cents FROM products WHERE sku = $sku',
      { $sku: 'SKU-B' }
    )
    expect(row?.purchase_price_cents).toBe(1250)
    expect(row?.acquisition_fees_cents).toBe(120)
    expect(row?.expected_sale_price_cents).toBe(3990)
  })

  it('con la estrategia "skip" no toca el articulo existente', () => {
    ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-S', purchasePriceCents: 1000 })
    const path = writeCsv('s.csv', 'nombre;sku;precio_compra\nCamiseta;SKU-S;20,00\n')
    const result = csv.importProducts({
      path,
      mapping: { name: 0, sku: 1, purchasePrice: 2 },
      duplicateStrategy: 'skip',
      dryRun: false
    })
    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(0)
    const row = ctx.db.get<Record<string, unknown>>('SELECT purchase_price_cents FROM products WHERE sku = $sku', {
      $sku: 'SKU-S'
    })
    expect(row?.purchase_price_cents).toBe(1000)
  })

  it('con la estrategia "update" actualiza los precios del articulo existente', () => {
    ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-U', purchasePriceCents: 1000, expectedSalePriceCents: 3000 })
    const path = writeCsv('u.csv', 'nombre;sku;precio_compra;precio_previsto\nCamiseta;SKU-U;22,00;45,00\n')
    const result = csv.importProducts({
      path,
      mapping: { name: 0, sku: 1, purchasePrice: 2, expectedPrice: 3 },
      duplicateStrategy: 'update',
      dryRun: false
    })
    expect(result.updated).toBe(1)
    const row = ctx.db.get<Record<string, unknown>>(
      'SELECT purchase_price_cents, expected_sale_price_cents FROM products WHERE sku = $sku',
      { $sku: 'SKU-U' }
    )
    expect(row?.purchase_price_cents).toBe(2200)
    expect(row?.expected_sale_price_cents).toBe(4500)
  })

  it('una coincidencia probable se omite y avisa, nunca se fusiona', () => {
    ctx.repos.products.create({ name: 'Camiseta Azul', brand: 'ACME', sku: 'OTRO' })
    const path = writeCsv('pm2.csv', 'nombre;marca;sku\nCamiseta Azul;ACME;NUEVO\n')
    const result = csv.importProducts({
      path,
      mapping: { name: 0, brand: 1, sku: 2 },
      duplicateStrategy: 'create_anyway',
      dryRun: false
    })
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.issues.some((issue) => issue.message === 'import.possibleDuplicate')).toBe(true)
  })

  it('una categoria o ubicacion inexistente NO se inventa: se avisa y queda vacia', () => {
    const path = writeCsv('c.csv', 'nombre;categoria;ubicacion\nCamiseta;Inexistente;Inexistente\n')
    const result = csv.importProducts({
      path,
      mapping: { name: 0, category: 1, location: 2 },
      duplicateStrategy: 'create_anyway',
      dryRun: false
    })
    expect(result.created).toBe(1)
    expect(result.issues.some((issue) => issue.message === 'import.categoryNotFound')).toBe(true)
    expect(result.issues.some((issue) => issue.message === 'import.locationNotFound')).toBe(true)
    const row = ctx.db.get<Record<string, unknown>>(
      'SELECT category_id, location_id FROM products WHERE name = $name',
      { $name: 'Camiseta' }
    )
    expect(row?.category_id).toBeNull()
    expect(row?.location_id).toBeNull()
  })
})

describe('exportacion', () => {
  it('productos: escribe cabecera, filas, BOM e importes en texto decimal', () => {
    ctx.repos.products.create({ name: 'Camiseta', sku: 'SKU-X', purchasePriceCents: 1250 })
    const path = join(dir, 'out.csv')
    const result = csv.exportData({ path, format: 'products', delimiter: ',', includeArchived: false })
    expect(result.rows).toBe(1)
    expect(result.bytes).toBeGreaterThan(0)
    const text = readFileSync(path, 'utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain('SKU-X')
    expect(text).toContain('12.50')
  })

  it('pedidos: sin datos exporta solo la cabecera y calcula el beneficio neto', () => {
    const path = join(dir, 'o.csv')
    const result = csv.exportData({ path, format: 'orders', delimiter: ';' })
    expect(result.rows).toBe(0)
    expect(readFileSync(path, 'utf8')).toContain('beneficio_neto')
  })

  it('gastos y picking tambien escriben su cabecera', () => {
    const expenses = csv.exportData({ path: join(dir, 'g.csv'), format: 'expenses', delimiter: ',' })
    const picking = csv.exportData({ path: join(dir, 'k.csv'), format: 'picking', delimiter: ',' })
    expect(expenses.rows).toBe(0)
    expect(picking.rows).toBe(0)
    expect(readFileSync(expenses.path, 'utf8')).toContain('importe')
    expect(readFileSync(picking.path, 'utf8')).toContain('ubicacion')
  })

  it('un formato desconocido es un error de entrada', () => {
    expect(() =>
      csv.exportData({ path: join(dir, 'x.csv'), format: 'nope' as 'products', delimiter: ',' })
    ).toThrow()
  })
})

describe('utilidades', () => {
  it('cuenta pedidos abiertos y devuelve el rango del mes en curso', () => {
    expect(csv.openOrdersCount()).toBe(0)
    const month = csv.currentMonth()
    expect(month.from.endsWith('-01')).toBe(true)
    expect(month.to >= month.from).toBe(true)
    expect(csv.financeService).toBeDefined()
  })
})
