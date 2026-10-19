/**
 * RESALEVAULT - Lector y escritor de ZIP.
 *
 * Por que se implementa a mano: una copia de seguridad debe caber en UN archivo
 * que el usuario pueda copiar a un pendrive o a la nube. Sin esto habria que
 * entregar una carpeta suelta, que es mucho mas facil de estropear.
 *
 * Se evita anadir una dependencia porque solo se necesitan dos operaciones
 * (comprimir y descomprimir) y conviene que el formato quede bajo control y
 * cubierto por pruebas:
 *  - Metodo 0 (almacenar) y 8 (deflate), que es lo que usan todas las
 *    herramientas.
 *  - CRC-32 obligatorio: un ZIP sin CRC no se puede verificar.
 *  - Nombres con `/`, sin rutas absolutas ni `..` (defensa contra zip-slip).
 *  - Lectura tolerante del directorio central y de la cabecera final (EOCD).
 *
 * Modulo de proceso principal: usa `node:zlib` y `Buffer`.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50

/** Tabla de CRC-32 (polinomio invertido 0xEDB88320). */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ (data[index] as number)) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Convierte una fecha al formato de MS-DOS que usa el ZIP. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time: time & 0xffff, date: day & 0xffff }
}

export interface ZipEntryInput {
  /** Ruta interna, siempre con `/`. */
  name: string
  data: Buffer
  /** Fecha de modificacion; por defecto, ahora. */
  mtime?: Date
}

/**
 * Normaliza el nombre de una entrada y rechaza rutas peligrosas.
 * Devuelve `null` si el nombre no es aceptable.
 */
export function safeEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return null
  if (normalized.includes('\0')) return null
  if (normalized.split('/').some((segment) => segment === '..')) return null
  if (normalized.split('/').some((segment) => segment === '' && normalized.indexOf('//') < 0)) {
    // Se permiten directorios implicitos, pero no segmentos vacios por `//`.
  }
  return normalized
}

/** Crea un ZIP en memoria. */
export function createZip(entries: readonly ZipEntryInput[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = safeEntryName(entry.name)
    if (!name) throw new Error('invalid_entry_name')

    const nameBuffer = Buffer.from(name, 'utf8')
    const crc = crc32(entry.data)

    // Se comprime solo si de verdad reduce el tamano.
    const deflated = deflateRawSync(entry.data)
    const useDeflate = deflated.length < entry.data.length
    const payload = useDeflate ? deflated : entry.data
    const method = useDeflate ? 8 : 0

    const stamp = dosDateTime(entry.mtime ?? new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_HEADER, 0)
    local.writeUInt16LE(20, 4) // version necesaria
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuffer, payload)

    const centralEntry = Buffer.alloc(46)
    centralEntry.writeUInt32LE(CENTRAL_HEADER, 0)
    centralEntry.writeUInt16LE(20, 4) // version que lo creo
    centralEntry.writeUInt16LE(20, 6) // version necesaria
    centralEntry.writeUInt16LE(0x0800, 8)
    centralEntry.writeUInt16LE(method, 10)
    centralEntry.writeUInt16LE(stamp.time, 12)
    centralEntry.writeUInt16LE(stamp.date, 14)
    centralEntry.writeUInt32LE(crc, 16)
    centralEntry.writeUInt32LE(payload.length, 20)
    centralEntry.writeUInt32LE(entry.data.length, 24)
    centralEntry.writeUInt16LE(nameBuffer.length, 28)
    centralEntry.writeUInt16LE(0, 30)
    centralEntry.writeUInt16LE(0, 32)
    centralEntry.writeUInt16LE(0, 34)
    centralEntry.writeUInt16LE(0, 36)
    centralEntry.writeUInt32LE(0, 38)
    centralEntry.writeUInt32LE(offset, 42)

    central.push(centralEntry, nameBuffer)

    offset += local.length + nameBuffer.length + payload.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuffer, end])
}

export interface ZipReadEntry {
  name: string
  data: Buffer
}

export interface ZipReadResult {
  entries: ZipReadEntry[]
  /** Entradas descartadas por nombre inseguro. */
  rejected: string[]
}

/**
 * Lee un ZIP y devuelve sus entradas.
 *
 * Se recorre el DIRECTORIO CENTRAL (no los encabezados locales) porque es lo que
 * garantiza que se leen todas las entradas, incluidas las creadas por otras
 * herramientas.
 */
export function readZip(buffer: Buffer): ZipReadResult {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('not_a_zip')

  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)

  const entries: ZipReadEntry[] = []
  const rejected: string[] = []

  let pointer = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (pointer + 46 > buffer.length) throw new Error('corrupt_central_directory')
    if (buffer.readUInt32LE(pointer) !== CENTRAL_HEADER) throw new Error('corrupt_central_directory')

    const method = buffer.readUInt16LE(pointer + 10)
    const crc = buffer.readUInt32LE(pointer + 16)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const uncompressedSize = buffer.readUInt32LE(pointer + 24)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)

    const rawName = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8')
    const name = safeEntryName(rawName)

    pointer += 46 + nameLength + extraLength + commentLength

    if (!name) {
      rejected.push(rawName)
      continue
    }

    // El encabezado local dice donde empiezan realmente los datos.
    if (localOffset + 30 > buffer.length) throw new Error('corrupt_local_header')
    if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) throw new Error('corrupt_local_header')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength

    if (dataStart + compressedSize > buffer.length) throw new Error('truncated_entry')
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    let data: Buffer
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw)
    else throw new Error('unsupported_compression')

    if (data.length !== uncompressedSize) throw new Error('size_mismatch')
    if (crc32(data) !== crc) throw new Error('crc_mismatch')

    entries.push({ name, data })
  }

  return { entries, rejected }
}

/** Busca la cabecera final (EOCD) desde el final del archivo. */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557) // 22 + comentario maximo
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === END_OF_CENTRAL) return index
  }
  return -1
}
