import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectMimeType,
  isAllowedMime,
  isInsideDirectory,
  mimeForExtension
} from '@main/services/media-detect'
import { renderBarcode } from '@main/services/labels'
import { MediaService } from '@main/services/media'
import { createTestContext } from './helpers'

/** Construye un buffer con una cabecera binaria concreta. */
function bufferWithMagic(bytes: number[], tail = 'resto del archivo'): Uint8Array {
  return new Uint8Array([...bytes, ...Buffer.from(tail, 'latin1')])
}

describe('deteccion del tipo real de archivo', () => {
  it('reconoce las imagenes por su firma', () => {
    expect(detectMimeType(bufferWithMagic([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectMimeType(bufferWithMagic([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(detectMimeType(bufferWithMagic([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
    expect(
      detectMimeType(bufferWithMagic([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))
    ).toBe('image/webp')
  })

  it('reconoce PDF y texto', () => {
    expect(detectMimeType(new Uint8Array(Buffer.from('%PDF-1.7 contenido')))).toBe('application/pdf')
    expect(detectMimeType(new Uint8Array(Buffer.from('solo texto plano\nsegunda linea')))).toBe('text/plain')
    expect(detectMimeType(new Uint8Array(Buffer.from('a,b,c\n1,2,3\n4,5,6')))).toBe('text/csv')
  })

  it('rechaza ejecutables aunque se llamen .jpg', () => {
    // Cabecera MZ de un ejecutable de Windows.
    expect(detectMimeType(new Uint8Array(Buffer.from('MZ\x90\x00\x03\x00\x00\x00')))).toBeNull()
    // Cabecera ELF de Linux.
    expect(detectMimeType(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]))).toBeNull()
  })

  it('rechaza contenido binario con bytes nulos', () => {
    expect(detectMimeType(new Uint8Array([0x41, 0x00, 0x42, 0x00]))).toBeNull()
  })

  it('rechaza archivos demasiado cortos', () => {
    expect(detectMimeType(new Uint8Array([0xff]))).toBeNull()
  })

  it('valida contra la lista de tipos admitidos', () => {
    expect(isAllowedMime('image/jpeg')).toBe(true)
    expect(isAllowedMime('application/pdf')).toBe(true)
    expect(isAllowedMime('application/x-msdownload')).toBe(false)
    expect(isAllowedMime(null)).toBe(false)
  })

  it('deduce el MIME por extension solo para servir archivos', () => {
    expect(mimeForExtension('foto.PNG')).toBe('image/png')
    expect(mimeForExtension('documento.pdf')).toBe('application/pdf')
    expect(mimeForExtension('cosa.exe')).toBe('application/octet-stream')
  })
})

describe('proteccion contra rutas fuera de la carpeta', () => {
  it('acepta rutas internas', () => {
    expect(isInsideDirectory('C:\\datos\\media', 'C:\\datos\\media\\ab\\x.jpg')).toBe(true)
    expect(isInsideDirectory('C:\\datos\\media', 'C:\\datos\\media')).toBe(true)
  })

  it('rechaza intentos de salir de la carpeta', () => {
    expect(isInsideDirectory('C:\\datos\\media', 'C:\\datos\\media\\..\\..\\windows\\system32\\cmd.exe')).toBe(false)
    expect(isInsideDirectory('C:\\datos\\media', 'C:\\otra\\cosa.jpg')).toBe(false)
    // Un prefijo parecido no debe colar.
    expect(isInsideDirectory('C:\\datos\\media', 'C:\\datos\\media-otra\\x.jpg')).toBe(false)
  })

  it('el servicio lanza un error si la ruta resuelta se sale', () => {
    const ctx = createTestContext()
    const dir = mkdtempSync(join(tmpdir(), 'resalevault-media-test-'))
    const service = new MediaService(ctx.db, { mediaDir: join(dir, 'media'), thumbnailsDir: join(dir, 'thumbs') })

    expect(() => service.resolveStoredPath('..\\..\\evil.jpg')).toThrow()
    expect(service.resolveStoredPath('ab\\hash.jpg')).toContain('ab')

    rmSync(dir, { recursive: true, force: true })
    ctx.close()
  })
})

describe('almacenamiento de archivos', () => {
  it('importa una imagen, la deduplica y marca la portada', () => {
    const ctx = createTestContext()
    const dir = mkdtempSync(join(tmpdir(), 'resalevault-import-'))
    const service = new MediaService(ctx.db, { mediaDir: join(dir, 'media'), thumbnailsDir: join(dir, 'thumbs') })
    const product = ctx.repos.products.create({ name: 'Con foto' })

    // PNG de 1x1 pixel valido.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    const file = join(dir, 'foto.png')
    writeFileSync(file, png)

    const first = service.importFiles(product.id, [file])
    expect(first.imported).toBe(1)
    expect(first.rejected).toHaveLength(0)

    const assets = service.listForProduct(product.id)
    expect(assets).toHaveLength(1)
    expect(assets[0]?.isCover).toBe(true)
    // Las dimensiones las aporta `nativeImage`, que solo existe dentro de
    // Electron. En las pruebas (Node puro) se guarda `null` y la importacion
    // sigue funcionando: la miniatura es una mejora, no un requisito.
    expect(assets[0]?.width === null || assets[0]?.width === 1).toBe(true)
    expect(assets[0]?.mimeType).toBe('image/png')

    // El mismo contenido otra vez: se rechaza por duplicado, no se duplica.
    const second = service.importFiles(product.id, [file])
    expect(second.imported).toBe(0)
    expect(second.rejected[0]?.reason).toBe('duplicate')
    expect(service.listForProduct(product.id)).toHaveLength(1)

    rmSync(dir, { recursive: true, force: true })
    ctx.close()
  })

  it('rechaza un archivo con extension de imagen pero contenido ejecutable', () => {
    const ctx = createTestContext()
    const dir = mkdtempSync(join(tmpdir(), 'resalevault-bad-'))
    const service = new MediaService(ctx.db, { mediaDir: join(dir, 'media'), thumbnailsDir: join(dir, 'thumbs') })
    const product = ctx.repos.products.create({ name: 'Peligro' })

    const file = join(dir, 'troyano.jpg')
    writeFileSync(file, Buffer.from('MZ\x90\x00 contenido ejecutable'))

    const result = service.importFiles(product.id, [file])
    expect(result.imported).toBe(0)
    expect(result.rejected[0]?.reason).toBe('unsupported')

    rmSync(dir, { recursive: true, force: true })
    ctx.close()
  })

  it('elimina el archivo solo cuando ningun registro lo usa', () => {
    const ctx = createTestContext()
    const dir = mkdtempSync(join(tmpdir(), 'resalevault-dedup-'))
    const service = new MediaService(ctx.db, { mediaDir: join(dir, 'media'), thumbnailsDir: join(dir, 'thumbs') })

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    const file = join(dir, 'compartida.png')
    writeFileSync(file, png)

    const a = ctx.repos.products.create({ name: 'A' })
    const b = ctx.repos.products.create({ name: 'B' })
    service.importFiles(a.id, [file])
    service.importFiles(b.id, [file])

    const assetA = service.listForProduct(a.id)[0]
    const assetB = service.listForProduct(b.id)[0]
    expect(assetA?.sha256).toBe(assetB?.sha256)

    service.remove(assetA?.id as string)
    // B sigue usando el archivo, asi que este no debe desaparecer.
    expect(service.storageReport().storedFiles).toBeGreaterThan(0)

    rmSync(dir, { recursive: true, force: true })
    ctx.close()
  })
})

describe('codigos de barras y QR', () => {
  it('genera un SVG de Code 128', () => {
    const result = renderBarcode('RV-CAM-2603-0001', 'code128')
    expect(result.usedSymbology).toBe('code128')
    expect(result.svg).toContain('<svg')
    expect(result.warning).toBeUndefined()
  })

  it('genera un SVG de QR', () => {
    const result = renderBarcode('https://example.com/x', 'qrcode')
    expect(result.usedSymbology).toBe('qrcode')
    expect(result.svg).toContain('<svg')
  })

  it('cae a Code 128 cuando EAN-13 recibe texto no numerico', () => {
    const result = renderBarcode('RV-CAM-1', 'ean13')
    expect(result.usedSymbology).toBe('code128')
    expect(result.warning).toBe('invalid_content_for_symbology')
    expect(result.svg).toContain('<svg')
  })

  it('acepta EAN-13 con 13 digitos', () => {
    const result = renderBarcode('1234567890128', 'ean13')
    expect(result.usedSymbology).toBe('ean13')
    expect(result.warning).toBeUndefined()
  })

  it('no rompe con contenido vacio', () => {
    const result = renderBarcode('   ', 'code128')
    expect(result.svg).toBe('')
    expect(result.warning).toBe('invalid_content_for_symbology')
  })

  it('genera DataMatrix', () => {
    expect(renderBarcode('RV-1', 'datamatrix').svg).toContain('<svg')
  })
})
