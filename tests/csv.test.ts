import { describe, expect, it } from 'vitest'
import {
  detectDelimiter,
  escapeCsvValue,
  normalizeHeader,
  parseCondition,
  parseCsv,
  parseLooseDate,
  parseStatus,
  serializeCsv,
  suggestMapping
} from '@shared/csv'

describe('lector de CSV', () => {
  it('separa campos y filas', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3']
    ])
  })

  it('respeta los campos entrecomillados con separadores dentro', () => {
    expect(parseCsv('nombre,descripcion\n"Camiseta, azul","Buena, como nueva"')).toEqual([
      ['nombre', 'descripcion'],
      ['Camiseta, azul', 'Buena, como nueva']
    ])
  })

  it('interpreta las comillas escapadas', () => {
    expect(parseCsv('a\n"dijo ""hola"""')).toEqual([['a'], ['dijo "hola"']])
  })

  it('admite saltos de linea dentro de un campo entrecomillado', () => {
    const result = parseCsv('a,b\n"linea1\nlinea2",x')
    expect(result[1]).toEqual(['linea1\nlinea2', 'x'])
  })

  it('funciona con CRLF y con LF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('descarta las filas completamente vacias', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('elimina la marca de orden de bytes', () => {
    expect(parseCsv('\ufeffa,b\n1,2')[0]).toEqual(['a', 'b'])
  })

  it('respeta un limite de filas', () => {
    expect(parseCsv('a\n1\n2\n3\n4', { limit: 3 })).toHaveLength(3)
  })

  it('detecta el separador por frecuencia', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    // Un separador dentro de comillas no debe confundir la deteccion.
    expect(detectDelimiter('a;b\n"x,y";z')).toBe(';')
  })

  it('escapa valores al escribir', () => {
    expect(escapeCsvValue('simple', ',')).toBe('simple')
    expect(escapeCsvValue('con,coma', ',')).toBe('"con,coma"')
    expect(escapeCsvValue('con "comillas"', ',')).toBe('"con ""comillas"""')
    expect(escapeCsvValue('con\nsalto', ',')).toBe('"con\nsalto"')
    expect(escapeCsvValue(' espacio ', ',')).toBe('" espacio "')
  })

  it('serializa y vuelve a leer sin perdida', () => {
    const rows = [
      ['nombre', 'descripcion'],
      ['Camiseta, azul', 'dijo "hola"'],
      ['Otra', 'linea1\nlinea2']
    ]
    const text = serializeCsv(rows, { delimiter: ',', eol: '\r\n' })
    expect(parseCsv(text)).toEqual(rows)
  })

  it('reconoce los encabezados habituales', () => {
    expect(normalizeHeader('  Precio de Compra (EUR) ')).toBe('precio de compra eur')
    const mapping = suggestMapping(['SKU', 'Nombre', 'Marca', 'Precio de compra', 'Fecha adquisición'])
    expect(mapping.sku).toBe(0)
    expect(mapping.name).toBe(1)
    expect(mapping.brand).toBe(2)
    expect(mapping.purchasePrice).toBe(3)
    expect(mapping.purchaseDate).toBe(4)
  })

  it('no confunde estado del articulo con estado del producto', () => {
    const mapping = suggestMapping(['estado del articulo', 'estado'])
    expect(mapping.condition).toBe(0)
    expect(mapping.status).toBe(1)
  })

  it('interpreta fechas de hoja de calculo', () => {
    expect(parseLooseDate('2026-03-07')).toBe('2026-03-07')
    expect(parseLooseDate('07/03/2026')).toBe('2026-03-07')
    expect(parseLooseDate('7-3-26')).toBe('2026-03-07')
    expect(parseLooseDate('2026/3/7')).toBe('2026-03-07')
    expect(parseLooseDate('')).toBeNull()
    expect(parseLooseDate('no es fecha')).toBeNull()
    expect(parseLooseDate('45/13/2026')).toBeNull()
  })

  it('traduce estados y condiciones escritos en lenguaje natural', () => {
    expect(parseStatus('Disponible')).toBe('available')
    expect(parseStatus('en venta')).toBe('available')
    expect(parseStatus('VENDIDO')).toBe('sold')
    expect(parseStatus('inventado')).toBeNull()
    expect(parseCondition('Como nuevo')).toBe('like_new')
    expect(parseCondition('for parts')).toBe('for_parts')
    expect(parseCondition('')).toBeNull()
  })
})
