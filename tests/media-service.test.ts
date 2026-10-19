import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '@main/errors'
import { MediaService, copyFileInto } from '@main/services/media'
import { createTestContext } from './helpers'

/**
 * Almacenamiento de archivos: el original nunca se modifica, nada sale de la
 * carpeta de datos y los huerfanos solo se retiran bajo peticion explicita.
 */
const MISSING = '00000000-0000-4000-8000-000000000000'
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio')
}

function setup(): {
  dir: string
  service: MediaService
  productId: string
  close: () => void
} {
  const ctx = createTestContext()
  const dir = mkdtempSync(join(tmpdir(), 'rv-media-'))
  const service = new MediaService(ctx.db, { mediaDir: join(dir, 'media'), thumbnailsDir: join(dir, 'thumbs') })
  const productId = ctx.repos.products.create({ name: 'Con fotos' }).id
  return {
    dir,
    service,
    productId,
    close: () => {
      ctx.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

function writePng(dir: string, name: string, tail: string): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.concat([Buffer.from(PNG_MAGIC), Buffer.from(tail)]))
  return path
}

function writePdf(dir: string, name: string): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from('%PDF-1.7 ficha'))
  return path
}

describe('rutas y tipos', () => {
  it('no permite resolver una ruta fuera de la carpeta de datos', () => {
    const { service, close } = setup()
    const roots = service.roots
    expect(service.isInside(roots.media, join(roots.media, 'a.png'))).toBe(true)
    expect(service.isInside(roots.media, join(roots.media, '..', 'x.png'))).toBe(false)
    expect(codeOf(() => service.resolveStoredPath('..\\..\\windows\\system32\\cmd.exe'))).toBe('forbidden_origin')
    expect(service.resolveStoredPath('ab/hash.png')).toContain('hash.png')
    expect(service.mimeForPath('foto.png')).toMatch(/^image\//)
    close()
  })
})

describe('importacion', () => {
  it('guarda fotos y documentos y marca la primera foto como portada', () => {
    const { dir, service, productId, close } = setup()
    const result = service.importFiles(productId, [
      writePng(dir, 'a.png', 'A'),
      writePng(dir, 'b.png', 'B'),
      writePdf(dir, 'ficha.pdf')
    ])
    expect(result.imported).toBe(3)

    const assets = service.listForProduct(productId)
    const photos = assets.filter((asset) => asset.kind === 'photo')
    expect(photos.length).toBe(2)
    expect(photos[0]?.isCover).toBe(true)
    expect(photos[1]?.isCover).toBe(false)
    expect(assets.some((asset) => asset.kind === 'document')).toBe(true)
    close()
  })

  it('avisa si el articulo no existe y rechaza una ruta que no es un archivo', () => {
    const { dir, service, productId, close } = setup()
    expect(codeOf(() => service.importFiles(MISSING, []))).toBe('not_found')

    const result = service.importFiles(productId, [dir])
    expect(result.imported).toBe(0)
    expect(result.rejected[0]?.reason).toBe('error')
    expect(result.rejected[0]?.detail).toBe('not_a_file')
    close()
  })

  it('no registra la misma foto dos veces en el mismo articulo', () => {
    const { dir, service, productId, close } = setup()
    const file = writePng(dir, 'dup.png', 'D')
    expect(service.importFiles(productId, [file]).imported).toBe(1)
    const again = service.importFiles(productId, [file])
    expect(again.imported).toBe(0)
    expect(again.rejected[0]?.reason).toBe('duplicate')
    close()
  })
})

describe('gestion', () => {
  it('al quitar la portada se promociona la siguiente foto', () => {
    const { dir, service, productId, close } = setup()
    service.importFiles(productId, [writePng(dir, 'a.png', 'A'), writePng(dir, 'b.png', 'B')])

    const coverId = service.listForProduct(productId).find((asset) => asset.isCover)?.id ?? ''
    expect(coverId).not.toBe('')
    expect(service.remove(coverId).affected).toBe(1)

    const remaining = service.listForProduct(productId)
    expect(remaining.length).toBe(1)
    expect(remaining[0]?.isCover).toBe(true)
    expect(codeOf(() => service.remove(MISSING))).toBe('not_found')
    close()
  })

  it('reordena y cambia la portada; rechaza una portada que no sea foto', () => {
    const { dir, service, productId, close } = setup()
    service.importFiles(productId, [writePng(dir, 'a.png', 'A'), writePng(dir, 'b.png', 'B'), writePdf(dir, 'd.pdf')])

    const assets = service.listForProduct(productId)
    const photoIds = assets.filter((asset) => asset.kind === 'photo').map((asset) => asset.id)
    const documentId = assets.find((asset) => asset.kind === 'document')?.id ?? ''

    const reversed = service.reorder(productId, [...photoIds].reverse())
    expect(reversed[0]?.id).toBe(photoIds[1])

    const covered = service.setCover(productId, photoIds[1] ?? '')
    expect(covered.find((asset) => asset.id === photoIds[1])?.isCover).toBe(true)
    expect(codeOf(() => service.setCover(productId, documentId))).toBe('invalid_input')
    expect(codeOf(() => service.setCover(productId, MISSING))).toBe('not_found')
    close()
  })
})

describe('mantenimiento', () => {
  it('informe de almacenamiento, huerfanos y nombres de archivo', () => {
    const { dir, service, productId, close } = setup()
    service.importFiles(productId, [writePng(dir, 'a.png', 'A')])
    expect(service.fileNamesForProduct(productId).length).toBe(1)

    // Archivo suelto en la carpeta de medios: nadie lo referencia.
    mkdirSync(join(service.roots.media, 'zz'), { recursive: true })
    writeFileSync(join(service.roots.media, 'zz', 'huerfano.png'), Buffer.from('x'))

    const report = service.storageReport()
    expect(report.referencedFiles).toBe(1)
    expect(report.orphanFiles).toContain('zz/huerfano.png')
    expect(report.totalBytes).toBeGreaterThan(0)

    const cleaned = service.cleanupOrphans()
    expect(cleaned.removed).toBe(1)
    expect(cleaned.freedBytes).toBeGreaterThan(0)
    expect(service.storageReport().orphanFiles).toEqual([])
    close()
  })

  it('detecta un archivo registrado que falta en disco', () => {
    const { dir, service, productId, close } = setup()
    service.importFiles(productId, [writePng(dir, 'a.png', 'A')])
    const stored = join(service.roots.media, service.fileNamesForProduct(productId)[0] ?? '')
    rmSync(stored, { force: true })
    expect(service.storageReport().missingFiles.length).toBe(1)
    close()
  })

  it('copyFileInto copia un archivo creando las carpetas necesarias', () => {
    const { dir, close } = setup()
    const destination = join(dir, 'copia', 'sub', 'dst.png')
    copyFileInto(writePng(dir, 'src.png', 'A'), destination)
    expect(existsSync(destination)).toBe(true)
    close()
  })
})
