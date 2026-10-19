/**
 * RESALEVAULT - Diagnostico del entorno.
 *
 * Se ejecuta dentro de Electron para comprobar que la plataforma cumple los
 * requisitos reales de la aplicacion: version de Electron, version de Node,
 * disponibilidad de `node:sqlite` (SQLite embebido, sin dependencias nativas
 * que compilar), y permisos de escritura en la carpeta de datos del usuario.
 *
 * Uso:  npm run doctor
 */
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function line(label, value) {
  process.stdout.write(String(label).padEnd(28) + ' : ' + String(value) + '\n')
}

function main() {
  const results = []
  const check = (name, fn) => {
    try {
      const value = fn()
      results.push({ name, ok: true, value })
      line(name, value)
    } catch (error) {
      results.push({ name, ok: false, value: error && error.message ? error.message : String(error) })
      line(name, 'ERROR -> ' + (error && error.message ? error.message : String(error)))
    }
  }

  process.stdout.write('\nRESALEVAULT - diagnostico del entorno\n')
  process.stdout.write('===================================\n')

  check('electron', () => process.versions.electron)
  check('chrome', () => process.versions.chrome)
  check('node (electron)', () => process.versions.node)
  check('v8', () => process.versions.v8)

  let sqlite = null
  check('node:sqlite', () => {
    sqlite = require('node:sqlite')
    if (!sqlite || typeof sqlite.DatabaseSync !== 'function') {
      throw new Error('DatabaseSync no esta disponible en este runtime')
    }
    return 'disponible (DatabaseSync)'
  })

  if (sqlite) {
    check('sqlite version', () => {
      const db = new sqlite.DatabaseSync(':memory:')
      try {
        const row = db.prepare('SELECT sqlite_version() AS v').get()
        return row.v
      } finally {
        db.close()
      }
    })
    check('sqlite escritura en disco', () => {
      const dir = path.join(app.getPath('userData'), 'doctor')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'doctor.sqlite')
      const db = new sqlite.DatabaseSync(file)
      try {
        db.exec('PRAGMA journal_mode = WAL')
        db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)')
        db.prepare('INSERT INTO t (v) VALUES (?)').run('ok-' + Date.now())
        const row = db.prepare('SELECT COUNT(*) AS n FROM t').get()
        return file + ' (filas=' + row.n + ')'
      } finally {
        db.close()
      }
    })
  }

  check('userData', () => app.getPath('userData'))
  check('app.getVersion', () => app.getVersion())

  const failed = results.filter((r) => !r.ok)
  process.stdout.write('\nResultado: ' + (failed.length === 0 ? 'TODO CORRECTO' : failed.length + ' comprobacion(es) fallida(s)') + '\n\n')
  process.exitCode = failed.length === 0 ? 0 : 1
  app.exit(failed.length === 0 ? 0 : 1)
}

app.whenReady().then(main)
