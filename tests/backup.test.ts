import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from '@main/db/database'
import { MIGRATIONS, LATEST_SCHEMA_VERSION } from '@main/db/migrations'
import { runMigrations } from '@main/db/migrator'
import { createRepositories } from '@main/db/context'
import { BackupService } from '@main/services/backup/service'
import { readZip } from '@main/services/backup/zip'

interface Fixture {
  root: string
  dataDir: string
  mediaDir: string
  backupsDir: string
  databaseFile: string
  open: () => Database
  service: (db: Database) => BackupService
  close: () => void
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'resalevault-backup-'))
  const dataDir = join(root, 'data')
  const mediaDir = join(root, 'media')
  const backupsDir = join(root, 'backups')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(mediaDir, { recursive: true })
  const databaseFile = join(dataDir, 'resalevault.sqlite')

  let current: Database | null = null

  return {
    root,
    dataDir,
    mediaDir,
    backupsDir,
    databaseFile,
    open: () => {
      const db = new Database({ file: databaseFile })
      runMigrations(db, MIGRATIONS)
      current = db
      return db
    },
    service: (db) =>
      new BackupService(db, {
        appVersion: '0.3.0-test',
        dataDir,
        mediaDir,
        backupsDir,
        databaseFile
      }),
    close: () => {
      current?.close()
      current = null
    }
  }
}

describe('copias de seguridad', () => {
  it('crea un ZIP con base de datos, manifiesto y fotografias', () => {
    const f = fixture()
    const db = f.open()
    const repos = createRepositories(db)
    repos.products.create({ name: 'Camiseta respaldada' })

    // Una "fotografia" simulada dentro de la carpeta de medios.
    mkdirSync(join(f.mediaDir, 'ab'), { recursive: true })
    writeFileSync(join(f.mediaDir, 'ab', 'foto.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00]))

    const service = f.service(db)
    const result = service.create()

    expect(existsSync(result.path)).toBe(true)
    expect(result.manifest.products).toBe(1)
    expect(result.manifest.includesMedia).toBe(true)
    expect(result.manifest.mediaFiles).toBe(1)
    expect(result.bytes).toBeGreaterThan(0)

    const entries = readZip(readFileSync(result.path)).entries.map((entry) => entry.name)
    expect(entries).toContain('resalevault.sqlite')
    expect(entries).toContain('manifest.json')
    expect(entries).toContain('media/ab/foto.jpg')

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('verifica la integridad real del SQLite de la copia', () => {
    const f = fixture()
    const db = f.open()
    createRepositories(db).products.create({ name: 'Verificable' })

    const service = f.service(db)
    const { path } = service.create()

    const verification = service.verify(path)
    expect(verification.ok).toBe(true)
    expect(verification.integrity).toBe('ok')
    expect(verification.schemaVersion).toBe(LATEST_SCHEMA_VERSION)

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('rechaza un archivo corrupto y no lo da por bueno', () => {
    const f = fixture()
    const db = f.open()
    const service = f.service(db)

    const bogus = join(f.backupsDir, 'resalevault-backup-bogus.zip')
    mkdirSync(f.backupsDir, { recursive: true })
    writeFileSync(bogus, Buffer.from('esto no es un zip'))

    const verification = service.verify(bogus)
    expect(verification.ok).toBe(false)
    expect(verification.reason).toBe('not_a_zip')

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('restaura los datos en dos fases, apartando la base anterior', () => {
    const f = fixture()
    let db = f.open()
    let repos = createRepositories(db)
    repos.products.create({ name: 'Antes de la copia' })

    const service = f.service(db)
    const { path } = service.create()

    // Se anaden mas datos DESPUES de la copia.
    repos.products.create({ name: 'Despues de la copia' })
    expect(repos.products.list({ includeArchived: true }).total).toBe(2)

    // Fase 1: preparar.
    const preparation = service.prepareRestore(path)
    expect(preparation.ok).toBe(true)
    expect(service.pendingRestore()?.source).toContain('resalevault-backup-')

    // Fase 2: se cierra la base y se aplica al "arrancar".
    f.close()
    const applied = service.applyPendingRestore()
    expect(applied).not.toBeNull()
    expect(applied?.previousDatabase).toBeTruthy()
    expect(existsSync(applied?.previousDatabase as string)).toBe(true)
    expect(service.pendingRestore()).toBeNull()

    // Se vuelve a abrir: solo debe estar el articulo de la copia.
    db = f.open()
    repos = createRepositories(db)
    const products = repos.products.list({ includeArchived: true })
    expect(products.total).toBe(1)
    expect(products.items[0]?.name).toBe('Antes de la copia')

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('restaura tambien las fotografias', () => {
    const f = fixture()
    const db = f.open()
    createRepositories(db).products.create({ name: 'Con foto' })
    mkdirSync(join(f.mediaDir, 'ab'), { recursive: true })
    writeFileSync(join(f.mediaDir, 'ab', 'original.jpg'), Buffer.from('contenido original'))

    const service = f.service(db)
    const { path } = service.create()

    // Se borra la foto y se prepara la restauracion.
    rmSync(join(f.mediaDir, 'ab', 'original.jpg'))
    service.prepareRestore(path)
    f.close()
    service.applyPendingRestore()

    expect(existsSync(join(f.mediaDir, 'ab', 'original.jpg'))).toBe(true)
    expect(readFileSync(join(f.mediaDir, 'ab', 'original.jpg'), 'utf8')).toBe('contenido original')

    rmSync(f.root, { recursive: true, force: true })
  })

  it('la rotacion conserva el numero configurado y nunca borra la ultima', () => {
    const f = fixture()
    const db = f.open()
    const service = f.service(db)
    service.setConfig({ maxCopies: 2 })

    service.create()
    service.create()
    service.create()

    const list = service.list()
    expect(list.length).toBeLessThanOrEqual(2)
    expect(list.length).toBeGreaterThan(0)

    // La copia referenciada como ultima sigue existiendo.
    const config = service.config()
    if (config.lastBackupPath) expect(existsSync(config.lastBackupPath)).toBe(true)

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('la copia automatica respeta el intervalo configurado', () => {
    const f = fixture()
    const db = f.open()
    const service = f.service(db)

    // Sin copia previa, toca hacerla.
    expect(service.status().due).toBe(true)
    expect(service.autoBackupIfDue().ran).toBe(true)

    // Recien hecha, no toca otra vez.
    expect(service.status().due).toBe(false)
    expect(service.autoBackupIfDue().ran).toBe(false)

    // Desactivada, nunca se hace sola.
    service.setConfig({ enabled: false })
    expect(service.status().due).toBe(false)
    expect(service.autoBackupIfDue().ran).toBe(false)

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })

  it('respeta una carpeta destino propia', () => {
    const f = fixture()
    const db = f.open()
    const service = f.service(db)

    const custom = join(f.root, 'mi-carpeta')
    service.setConfig({ destination: custom })
    const result = service.create()

    expect(result.path.startsWith(custom)).toBe(true)
    expect(service.destination()).toBe(custom)

    f.close()
    rmSync(f.root, { recursive: true, force: true })
  })
})
