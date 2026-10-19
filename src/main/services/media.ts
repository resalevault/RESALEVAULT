/**
 * RESALEVAULT - Almacenamiento de fotografias y documentos.
 *
 * Decisiones:
 *
 *  1. **El tipo real manda.** No se cree la extension del archivo: se leen los
 *     primeros bytes y se compara con las firmas conocidas. Un `.jpg` que en
 *     realidad es un ejecutable se rechaza.
 *  2. **Los archivos se guardan por HASH.** El nombre en disco es el SHA-256
 *     del contenido. Asi, la misma foto subida dos veces ocupa un solo archivo,
 *     y se puede comprobar la integridad cuando se quiera.
 *  3. **El original NUNCA se modifica.** Se lee, se copia y se guarda. La
 *     miniatura es un archivo aparte; el original queda intacto.
 *  4. **Nada sale de la carpeta de datos.** El protocolo `rv-media:` valida
 *     cada ruta resuelta y solo sirve archivos de dentro de esa carpeta.
 *  5. Los archivos huerfanos (sin fila en `product_media`) se pueden localizar y
 *     retirar, pero nunca se borran solos.
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { nativeImage, protocol } from 'electron'
import type { MediaImportResult, MediaImportRejection, MediaStorageReport } from '@shared/types-modules'
import { ALLOWED_MEDIA_MIME, MEDIA_LIMITS } from '@shared/types-modules'
import { MIME_EXTENSION, detectMimeType, isInsideDirectory, mimeForExtension } from './media-detect'
import type { MediaAsset, MediaKind } from '@shared/types'
import type { Database } from '../db/database'
import { appError } from '../errors'
import { logActivity } from '../db/repositories/activity'
import { newId, nowIso, toNumber, toStringValue } from '../db/support'

export { detectMimeType }

export interface MediaServiceOptions {
  /** Carpeta raiz de originales. */
  mediaDir: string
  /** Carpeta de miniaturas (fuera de mediaDir para que no se sirva como original). */
  thumbnailsDir: string
}

export class MediaService {
  private readonly mediaDir: string
  private readonly thumbnailsDir: string

  constructor(
    private readonly db: Database,
    options: MediaServiceOptions
  ) {
    this.mediaDir = resolve(options.mediaDir)
    this.thumbnailsDir = resolve(options.thumbnailsDir)
    mkdirSync(this.mediaDir, { recursive: true })
    mkdirSync(this.thumbnailsDir, { recursive: true })
  }

  get roots(): { media: string; thumbnails: string } {
    return { media: this.mediaDir, thumbnails: this.thumbnailsDir }
  }

  /**
   * Comprueba que una ruta resuelta esta DENTRO de una carpeta permitida.
   * Es la defensa contra `..\..\windows\system32`.
   */
  isInside(root: string, candidate: string): boolean {
    return isInsideDirectory(root, candidate)
  }

  /** Ruta absoluta de un archivo almacenado, validada. */
  resolveStoredPath(relativeName: string, kind: 'media' | 'thumb' = 'media'): string {
    const root = kind === 'media' ? this.mediaDir : this.thumbnailsDir
    const candidate = resolve(root, relativeName)
    if (!this.isInside(root, candidate)) {
      throw appError('forbidden_origin', undefined, 'media_path_outside_root')
    }
    return candidate
  }

  /** MIME a partir de la extension, para servir el archivo por el protocolo. */
  mimeForPath(path: string): string {
    return mimeForExtension(path)
  }

  // -------------------------------------------------------------------------
  // Importacion
  // -------------------------------------------------------------------------

  importFiles(productId: string, filePaths: readonly string[]): MediaImportResult {
    const product = this.db.get<{ id: string }>('SELECT id FROM products WHERE id = $id', { $id: productId })
    if (!product) throw appError('not_found', { entity: 'product' })

    const rejected: MediaImportRejection[] = []
    const assets: MediaImportResult['assets'] = []

    this.db.transaction(() => {
      const existingPhotos = this.countByKind(productId, 'photo')
      const existingDocuments = this.countByKind(productId, 'document')
      let photos = existingPhotos
      let documents = existingDocuments
      let nextOrder = this.nextSortOrder(productId)

      for (const filePath of filePaths) {
        const originalName = filePath.split(/[\\/]/).pop() ?? filePath

        try {
          const stats = statSync(filePath)
          if (!stats.isFile()) {
            rejected.push({ originalName, reason: 'error', detail: 'not_a_file' })
            continue
          }
          if (stats.size > MEDIA_LIMITS.maxFileBytes) {
            rejected.push({ originalName, reason: 'too_large', detail: String(stats.size) })
            continue
          }

          const buffer = readFileSync(filePath)
          const mime = detectMimeType(buffer)
          if (!mime || !(ALLOWED_MEDIA_MIME as readonly string[]).includes(mime)) {
            rejected.push({ originalName, reason: 'unsupported' })
            continue
          }

          const kind: MediaKind = mime.startsWith('image/') ? 'photo' : 'document'
          if (kind === 'photo' && photos >= MEDIA_LIMITS.maxPhotosPerProduct) {
            rejected.push({ originalName, reason: 'limit', detail: 'photos' })
            continue
          }
          if (kind === 'document' && documents >= MEDIA_LIMITS.maxDocumentsPerProduct) {
            rejected.push({ originalName, reason: 'limit', detail: 'documents' })
            continue
          }

          const sha256 = createHash('sha256').update(buffer).digest('hex')
          const extension = MIME_EXTENSION[mime]
          const relativeName = join(sha256.slice(0, 2), `${sha256}.${extension}`)
          const absolutePath = this.resolveStoredPath(relativeName)
          mkdirSync(join(this.mediaDir, sha256.slice(0, 2)), { recursive: true })

          // El contenido identico no se duplica: se reutiliza el archivo.
          const alreadyStored = existsSync(absolutePath)
          if (!alreadyStored) writeFileSync(absolutePath, buffer)

          let width: number | null = null
          let height: number | null = null
          if (kind === 'photo' && mime !== 'image/gif') {
            const dimensions = this.writeThumbnail(sha256, buffer)
            width = dimensions.width
            height = dimensions.height
          }

          // Una misma foto no se registra dos veces en el mismo articulo.
          const duplicate = this.db.get<{ id: string }>(
            'SELECT id FROM product_media WHERE product_id = $product AND sha256 = $sha',
            { $product: productId, $sha: sha256 }
          )
          if (duplicate) {
            rejected.push({ originalName, reason: 'duplicate' })
            continue
          }

          const id = newId()
          const isCover = kind === 'photo' && photos === 0 ? 1 : 0

          this.db.run(
            `INSERT INTO product_media (id, product_id, kind, file_name, original_name, mime_type,
                size_bytes, sha256, width, height, sort_order, is_cover, created_at)
             VALUES ($id, $product, $kind, $fileName, $originalName, $mime, $size, $sha,
                $width, $height, $order, $cover, $at)`,
            {
              $id: id,
              $product: productId,
              $kind: kind,
              $fileName: relativeName,
              $originalName: originalName,
              $mime: mime,
              $size: stats.size,
              $sha: sha256,
              $width: width,
              $height: height,
              $order: nextOrder,
              $cover: isCover,
              $at: nowIso()
            }
          )

          nextOrder += 1
          if (kind === 'photo') photos += 1
          else documents += 1

          assets.push({
            id,
            productId,
            kind,
            originalName,
            mimeType: mime,
            sizeBytes: stats.size,
            width,
            height
          })
        } catch (error) {
          rejected.push({
            originalName,
            reason: 'error',
            detail: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (assets.length > 0) {
        logActivity(this.db, {
          entity: 'product',
          entityId: productId,
          action: 'media_added',
          summary: `Anadidos ${assets.length} archivo(s) al articulo`,
          details: { rejected: rejected.length }
        })
      }
    })

    return { imported: assets.length, assets, rejected }
  }

  /** Genera la miniatura y devuelve las dimensiones del original. */
  private writeThumbnail(sha256: string, buffer: Buffer): { width: number | null; height: number | null } {
    try {
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) return { width: null, height: null }

      const size = image.getSize()
      const longest = Math.max(size.width, size.height)
      const target =
        longest > MEDIA_LIMITS.thumbnailSize
          ? image.resize({
              width: Math.round((size.width * MEDIA_LIMITS.thumbnailSize) / longest),
              height: Math.round((size.height * MEDIA_LIMITS.thumbnailSize) / longest),
              quality: 'good'
            })
          : image

      const directory = join(this.thumbnailsDir, sha256.slice(0, 2))
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, `${sha256}.jpg`), target.toJPEG(82))

      return { width: size.width, height: size.height }
    } catch {
      // Una miniatura fallida no debe impedir guardar el original.
      return { width: null, height: null }
    }
  }

  // -------------------------------------------------------------------------
  // Gestion
  // -------------------------------------------------------------------------

  listForProduct(productId: string): MediaAsset[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT id, product_id, kind, file_name, original_name, mime_type, size_bytes, sha256,
                width, height, sort_order, is_cover, created_at
         FROM product_media WHERE product_id = $id ORDER BY sort_order ASC, created_at ASC`,
        { $id: productId }
      )
      .map(mapMediaRow)
  }

  remove(mediaId: string): { affected: number; fileRemoved: boolean } {
    const row = this.db.get<{ product_id: string; file_name: string; sha256: string }>(
      'SELECT product_id, file_name, sha256 FROM product_media WHERE id = $id',
      { $id: mediaId }
    )
    if (!row) throw appError('not_found', { entity: 'media' })

    this.db.transaction(() => {
      this.db.run('DELETE FROM product_media WHERE id = $id', { $id: mediaId })

      // El archivo solo se borra si NINGUN otro registro lo usa (deduplicacion).
      const stillUsed = toNumber(
        this.db.scalar<number>('SELECT COUNT(*) AS v FROM product_media WHERE sha256 = $sha', {
          $sha: row.sha256
        })
      )
      if (stillUsed === 0) {
        this.safeRemoveFile(row.file_name)
        this.safeRemoveFile(join(row.sha256.slice(0, 2), `${row.sha256}.jpg`), 'thumb')
      }

      // Si se ha quitado la portada, se promociona la siguiente foto.
      const cover = toNumber(
        this.db.scalar<number>(
          "SELECT COUNT(*) AS v FROM product_media WHERE product_id = $id AND is_cover = 1",
          { $id: row.product_id }
        )
      )
      if (cover === 0) {
        const next = this.db.get<{ id: string }>(
          "SELECT id FROM product_media WHERE product_id = $id AND kind = 'photo' ORDER BY sort_order ASC LIMIT 1",
          { $id: row.product_id }
        )
        if (next) this.db.run('UPDATE product_media SET is_cover = 1 WHERE id = $id', { $id: next.id })
      }
    })

    return { affected: 1, fileRemoved: true }
  }

  /** Reordena los archivos segun la lista de identificadores recibida. */
  reorder(productId: string, orderedIds: readonly string[]): MediaAsset[] {
    this.db.transaction(() => {
      orderedIds.forEach((id, index) => {
        this.db.run(
          'UPDATE product_media SET sort_order = $order WHERE id = $id AND product_id = $product',
          { $order: index, $id: id, $product: productId }
        )
      })
    })
    return this.listForProduct(productId)
  }

  setCover(productId: string, mediaId: string): MediaAsset[] {
    const target = this.db.get<{ kind: string }>(
      'SELECT kind FROM product_media WHERE id = $id AND product_id = $product',
      { $id: mediaId, $product: productId }
    )
    if (!target) throw appError('not_found', { entity: 'media' })
    if (target.kind !== 'photo') throw appError('invalid_input', { field: 'kind' })

    this.db.transaction(() => {
      this.db.run('UPDATE product_media SET is_cover = 0 WHERE product_id = $product', {
        $product: productId
      })
      this.db.run('UPDATE product_media SET is_cover = 1 WHERE id = $id', { $id: mediaId })
    })
    return this.listForProduct(productId)
  }

  private countByKind(productId: string, kind: MediaKind): number {
    return toNumber(
      this.db.scalar<number>(
        'SELECT COUNT(*) AS v FROM product_media WHERE product_id = $id AND kind = $kind',
        { $id: productId, $kind: kind }
      )
    )
  }

  private nextSortOrder(productId: string): number {
    return (
      toNumber(
        this.db.scalar<number>(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS v FROM product_media WHERE product_id = $id',
          { $id: productId }
        )
      ) || 0
    )
  }

  private safeRemoveFile(relativeName: string, kind: 'media' | 'thumb' = 'media'): void {
    try {
      const absolute = this.resolveStoredPath(relativeName, kind)
      if (existsSync(absolute)) rmSync(absolute, { force: true })
    } catch {
      // Nunca se borra fuera de las carpetas permitidas ni se interrumpe por esto.
    }
  }

  // -------------------------------------------------------------------------
  // Mantenimiento
  // -------------------------------------------------------------------------

  /**
   * Informe de salud del almacenamiento: archivos registrados que faltan en
   * disco y archivos en disco que no estan referenciados por nadie.
   */
  storageReport(): MediaStorageReport {
    const rows = this.db.all<{ file_name: string }>('SELECT file_name FROM product_media')
    const referenced = new Set(rows.map((row) => normalizeRelative(row.file_name)))

    const onDisk = new Set<string>()
    let totalBytes = 0
    for (const file of walk(this.mediaDir)) {
      const relativeName = normalizeRelative(relative(this.mediaDir, file))
      onDisk.add(relativeName)
      try {
        totalBytes += statSync(file).size
      } catch {
        // Ignorado.
      }
    }

    return {
      rootPath: this.mediaDir,
      thumbnailsPath: this.thumbnailsDir,
      referencedFiles: referenced.size,
      storedFiles: onDisk.size,
      orphanFiles: [...onDisk].filter((file) => !referenced.has(file)).slice(0, 500),
      missingFiles: [...referenced].filter((file) => !onDisk.has(file)).slice(0, 500),
      totalBytes
    }
  }

  /** Retira los archivos huerfanos. Solo bajo peticion explicita del usuario. */
  cleanupOrphans(): { removed: number; freedBytes: number } {
    const report = this.storageReport()
    let removed = 0
    let freedBytes = 0

    for (const relativeName of report.orphanFiles) {
      try {
        const absolute = this.resolveStoredPath(relativeName)
        const size = statSync(absolute).size
        rmSync(absolute, { force: true })
        removed += 1
        freedBytes += size
      } catch {
        // El archivo pudo desaparecer entre el informe y la limpieza.
      }
    }

    logActivity(this.db, {
      entity: 'system',
      entityId: null,
      action: 'media_cleanup',
      summary: `Archivos huerfanos retirados: ${removed}`,
      details: { freedBytes }
    })

    return { removed, freedBytes }
  }

  /** Nombres de archivo de todos los adjuntos de un articulo (para borrados). */
  fileNamesForProduct(productId: string): string[] {
    return this.db
      .all<{ file_name: string }>('SELECT file_name FROM product_media WHERE product_id = $id', {
        $id: productId
      })
      .map((row) => row.file_name)
  }
}

function normalizeRelative(value: string): string {
  return value.split(/[\\/]/).join('/')
}

/** Recorre un directorio de forma recursiva. */
function walk(root: string): string[] {
  const result: string[] = []
  if (!existsSync(root)) return result

  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry)
      try {
        const stats = statSync(full)
        if (stats.isDirectory()) stack.push(full)
        else result.push(full)
      } catch {
        // Entrada inaccesible: se ignora.
      }
    }
  }
  return result
}

function mapMediaRow(row: Record<string, unknown>): MediaAsset {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    kind: String(row.kind) as MediaKind,
    fileName: toStringValue(row.file_name),
    originalName: toStringValue(row.original_name),
    mimeType: toStringValue(row.mime_type),
    sizeBytes: toNumber(row.size_bytes),
    sha256: toStringValue(row.sha256),
    width: row.width === null || row.width === undefined ? null : toNumber(row.width),
    height: row.height === null || row.height === undefined ? null : toNumber(row.height),
    sortOrder: toNumber(row.sort_order),
    isCover: toNumber(row.is_cover) === 1,
    createdAt: toStringValue(row.created_at)
  }
}

/** Copia de un archivo a una ruta destino, usada por las copias de seguridad. */
export function copyFileInto(source: string, destination: string): void {
  mkdirSync(resolve(destination, '..'), { recursive: true })
  copyFileSync(source, destination)
}

// ---------------------------------------------------------------------------
// Protocolo propio para servir los archivos a la interfaz
// ---------------------------------------------------------------------------

/**
 * Esquemas que deben declararse ANTES de que Electron este listo. Sin
 * `registerSchemesAsPrivileged`, el protocolo se trataria como opaco y no
 * serviria para `<img src>`.
 */
export const PRIVILEGED_SCHEMES = ['rv-media'] as const

/**
 * Registra `rv-media://`, el unico camino por el que la interfaz puede leer un
 * archivo del disco.
 *
 * Formato admitido:
 *   rv-media://media/<ruta relativa>   -> original
 *   rv-media://thumb/<ruta relativa>   -> miniatura
 *
 * Cada peticion se resuelve y se comprueba que el resultado siga DENTRO de la
 * carpeta permitida. Si no, se responde 403. Asi, aunque alguien fabricase una
 * ruta con `..`, no saldria de la carpeta de datos.
 */
export function registerMediaProtocol(media: MediaService): void {
  protocol.handle('rv-media', async (request) => {
    try {
      const url = new URL(request.url)
      const host = url.hostname
      const relativeName = decodeURIComponent(url.pathname).replace(/^\/+/, '')

      if (relativeName.length === 0 || relativeName.includes('\0')) {
        return new Response('Bad request', { status: 400 })
      }

      const kind: 'media' | 'thumb' = host === 'thumb' ? 'thumb' : 'media'
      const absolute = media.resolveStoredPath(relativeName, kind)

      // Solo extensiones conocidas: nada de servir un .exe o un .js.
      if (kind === 'media' && media.mimeForPath(absolute) === 'application/octet-stream') {
        return new Response('Unsupported media type', { status: 415 })
      }

      if (!existsSync(absolute)) {
        return new Response('Not found', { status: 404 })
      }

      const body = readFileSync(absolute)
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: {
          // Los archivos son inmutables (el nombre es su hash): se pueden cachear.
          'Content-Type': kind === 'thumb' ? 'image/jpeg' : media.mimeForPath(absolute),
          'Cache-Control': 'private, max-age=31536000, immutable',
          'Content-Length': String(body.byteLength),
          'X-Content-Type-Options': 'nosniff'
        }
      })
    } catch {
      // Cualquier ruta fuera de la carpeta permitida acaba aqui.
      return new Response('Forbidden', { status: 403 })
    }
  })
}
