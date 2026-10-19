import { describe, expect, it } from 'vitest'
import { createZip, crc32, readZip, safeEntryName } from '@main/services/backup/zip'

const text = (value: string): Buffer => Buffer.from(value, 'utf8')

describe('CRC-32', () => {
  it('coincide con los valores de referencia conocidos', () => {
    // Valores publicos del CRC-32 (algoritmo estandar).
    expect(crc32(text(''))).toBe(0)
    expect(crc32(text('a'))).toBe(0xe8b7be43)
    expect(crc32(text('abc'))).toBe(0x352441c2)
    expect(crc32(text('123456789'))).toBe(0xcbf43926)
  })
})

describe('nombres de entrada', () => {
  it('acepta rutas internas normales', () => {
    expect(safeEntryName('resalevault.sqlite')).toBe('resalevault.sqlite')
    expect(safeEntryName('media/ab/hash.jpg')).toBe('media/ab/hash.jpg')
    expect(safeEntryName('media\\ab\\hash.jpg')).toBe('media/ab/hash.jpg')
    expect(safeEntryName('/absoluta.txt')).toBe('absoluta.txt')
  })

  it('rechaza rutas que intentan salir del destino', () => {
    expect(safeEntryName('../evil.txt')).toBeNull()
    expect(safeEntryName('a/../../evil.txt')).toBeNull()
    expect(safeEntryName('a\0b')).toBeNull()
    expect(safeEntryName('')).toBeNull()
  })
})

describe('escritura y lectura de ZIP', () => {
  it('conserva el contenido exacto de varios archivos', () => {
    const binary = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255])

    const zip = createZip([
      { name: 'manifest.json', data: text('{"version":1}') },
      { name: 'datos/binario.bin', data: binary },
      { name: 'vacio.txt', data: text('') }
    ])

    const result = readZip(zip)
    expect(result.rejected).toEqual([])
    expect(result.entries).toHaveLength(3)

    const byName = new Map(result.entries.map((entry) => [entry.name, entry.data]))
    expect(byName.get('manifest.json')?.toString('utf8')).toBe('{"version":1}')
    expect(byName.get('datos/binario.bin')).toEqual(binary)
    expect(byName.get('vacio.txt')?.length).toBe(0)
  })

  it('comprime contenido repetitivo y no lo empeora', () => {
    const repetitive = text('a'.repeat(50_000))
    const zip = createZip([{ name: 'grande.txt', data: repetitive }])

    // Un ZIP con deflate debe ser mucho menor que el original.
    expect(zip.length).toBeLessThan(repetitive.length / 10)

    const result = readZip(zip)
    expect(result.entries[0]?.data.length).toBe(repetitive.length)
    expect(result.entries[0]?.data.toString('utf8')).toBe(repetitive.toString('utf8'))
  })

  it('detecta un archivo corrupto por CRC', () => {
    const zip = createZip([{ name: 'a.txt', data: text('contenido original') }])

    // Se altera un byte del contenido comprimido.
    const corrupted = Buffer.from(zip)
    corrupted[40] = corrupted[40]! ^ 0xff

    expect(() => readZip(corrupted)).toThrow()
  })

  it('rechaza algo que no es un ZIP', () => {
    expect(() => readZip(text('esto no es un zip'))).toThrow('not_a_zip')
  })

  it('rechaza nombres peligrosos al escribir', () => {
    expect(() => createZip([{ name: '../evil', data: text('x') }])).toThrow()
  })

  it('soporta muchos archivos', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      name: `media/f${index}.txt`,
      data: text(`archivo ${index}`)
    }))

    const result = readZip(createZip(entries))
    expect(result.entries).toHaveLength(200)
    expect(result.entries[199]?.data.toString('utf8')).toBe('archivo 199')
  })
})
