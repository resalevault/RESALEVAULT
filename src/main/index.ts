/**
 * RESALEVAULT - Punto de entrada del proceso principal.
 *
 * Orden de arranque (importa):
 *  1. Identidad de la aplicacion (define la carpeta de datos).
 *  2. Instancia unica (dos copias sobre la misma base de datos = corrupcion).
 *  3. Politica de seguridad del renderer.
 *  4. Apertura de la base de datos y migraciones. Si falla, se avisa y se sale
 *     en lugar de arrancar con el inventario a medias.
 *  5. Registro de los manejadores IPC.
 *  6. Creacion de la ventana.
 *  7. Al cerrar: se cierra la conexion limpiamente (vuelca el WAL).
 */

import { BrowserWindow, app, dialog, protocol, shell } from 'electron'
import { EV } from '@shared/api'
import { EV_TRACKING } from '@shared/api-modules'
import { registerIpcHandlers } from './ipc/register'
import { registerModuleHandlers } from './ipc/register-modules'
import { registerTrackingHandlers } from './ipc/register-tracking'
import { createMainWindow } from './window'
import { applySecurityPolicy } from './services/security'
import { configureAppIdentity, getAppPaths } from './services/paths'
import { Logger } from './services/logger'
import { openDatabase, type OpenedDatabase } from './services/bootstrap'
import { PRIVILEGED_SCHEMES, MediaService, registerMediaProtocol } from './services/media'
import { LabelService } from './services/labels'
import { FinanceService } from './services/finance'
import { CsvService } from './services/csv-io'
import { IntelligenceService } from './services/intelligence'
import { LicenseService } from './services/license'
import { LicenceOnlineClient } from './services/licence-online'
import { LinkService } from './services/links'
import { AiService } from './services/ai/service'
import { createOsSecretStore } from './services/ai/os-secret-store'
import { BackupService, applyPendingRestoreToPaths } from './services/backup/service'
import { CarrierBrowser } from './services/browser/carrier-browser'
import { setupAutoUpdater } from './services/updater'

let opened: OpenedDatabase | null = null
let mainWindow: BrowserWindow | null = null
let carrierBrowser: CarrierBrowser | null = null

// 0. Esquemas propios ANTES de que Electron este listo: sin esto, `rv-media:`
//    no podria servir imagenes.
protocol.registerSchemesAsPrivileged(
  PRIVILEGED_SCHEMES.map((scheme) => ({
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }))
)

// 1. Identidad ANTES de cualquier app.getPath().
configureAppIdentity()
// Windows: identificador necesario para notificaciones y para agrupar la
// aplicacion correctamente en la barra de tareas.
app.setAppUserModelId('com.resalevault.desktop')

// 2. Una sola instancia.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  const paths = getAppPaths()
  const logger = new Logger({
    file: paths.logFile,
    level: app.isPackaged ? 'info' : 'debug',
    console: !app.isPackaged
  })

  logger.info('Arrancando RESALEVAULT', {
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    packaged: app.isPackaged
  })

  try {
    // Una restauracion pendiente se aplica ANTES de abrir la base de datos: en
    // ese momento el archivo no esta en uso.
    const restored = applyPendingRestoreToPaths({
      dataDir: paths.data,
      mediaDir: paths.media,
      databaseFile: paths.database
    })
    if (restored) {
      logger.warn('Restauracion aplicada al arrancar', {
        from: restored.restoredFrom,
        previousDatabase: restored.previousDatabase
      })
    }

    opened = openDatabase({
      paths,
      logger,
      defaultLocale: app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en'
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.error('No se pudo abrir la base de datos', { detail })
    dialog.showErrorBox(
      'RESALEVAULT no puede arrancar',
      'No se ha podido preparar la base de datos local.\n\n' +
        `Carpeta de datos: ${paths.userData}\n\n` +
        `Detalle tecnico: ${detail}\n\n` +
        'Si el problema persiste, revisa que la carpeta sea accesible y que el disco tenga espacio libre.'
    )
    app.exit(1)
    return
  }

  // 3. Seguridad del renderer.
  applySecurityPolicy()

  // 3b. Servicios de los modulos de negocio.
  const media = new MediaService(opened.db, { mediaDir: paths.media, thumbnailsDir: paths.thumbs })
  const labels = new LabelService(opened.db)
  const settings = opened.repos.settings
  const finance = new FinanceService(
    opened.db,
    settings.get().staleThresholds,
    settings.get().targetMarginPercent ?? 25
  )
  const csv = new CsvService(opened.repos, finance, () => settings.get().locale)
  const intelligence = new IntelligenceService(opened.db)
  // Cliente online de licencias: confirma puestos y descarga revocaciones.
  // Es "mejor esfuerzo": si no hay red, la licencia sigue funcionando offline.
  const licenceOnline = new LicenceOnlineClient(opened.db, {
    appVersion: app.getVersion(),
    os: process.platform
  })
  const license = new LicenseService(opened.db, licenceOnline)
  // Enlaces externos permitidos (compra de licencia por Discord). El destino
  // real vive en la lista blanca compartida: la interfaz solo pide un nombre.
  const links = new LinkService()
  const ai = new AiService(opened.db, opened.repos.products, { secrets: createOsSecretStore() })
  const backups = new BackupService(opened.db, {
    appVersion: app.getVersion(),
    dataDir: paths.data,
    mediaDir: paths.media,
    backupsDir: paths.backups,
    databaseFile: paths.database
  })

  // Copia automatica: se intenta al arrancar y NUNCA impide abrir la app.
  const autoBackup = backups.autoBackupIfDue()
  if (autoBackup.ran) {
    logger.info('Copia de seguridad automatica creada', { path: autoBackup.path })
  } else if (autoBackup.error) {
    logger.warn('No se pudo crear la copia automatica', { error: autoBackup.error })
  }

  // Navegador integrado de seguimientos. Es una vista nativa aislada: no puede
  // tocar React ni el puente privilegiado.
  const browser = new CarrierBrowser(logger, {
    onStateChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EV_TRACKING.browserStateChanged, state)
      }
    },
    onPopupBlocked: (url) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EV_TRACKING.browserPopupBlocked, {
          url,
          carrierName: browser.getState().carrierName
        })
      }
    },
    onDownloadBlocked: (filename) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EV_TRACKING.browserDownloadBlocked, filename)
      }
    }
  })
  carrierBrowser = browser

  // 3c. Protocolo `rv-media:` para servir adjuntos desde la carpeta de datos.
  registerMediaProtocol(media)

  // 4. IPC.
  const ipcContext = {
    repos: opened.repos,
    paths,
    logger,
    version: app.getVersion(),
    getMainWindow: () => mainWindow,
    broadcastDataChanged: (entity: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EV.dataChanged, entity)
      }
    }
  }

  registerIpcHandlers({ ...ipcContext, license })
  registerModuleHandlers({ ...ipcContext, media, labels, finance, csv, intelligence, license, links, ai, backups })
  registerTrackingHandlers({ ...ipcContext, browser })
  // Auto-actualizacion: comprobacion silenciosa al arrancar (solo en produccion).
  setupAutoUpdater()

  // 5. Ventana.
  const created = createMainWindow(logger)
  mainWindow = created.window
  browser.attachToWindow(mainWindow)

  mainWindow.on('closed', () => {
    carrierBrowser?.detachFromWindow()
    mainWindow = null
  })

  // Enlaces externos: siempre en el navegador del sistema, nunca dentro.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(logger).window
      carrierBrowser?.attachToWindow(mainWindow)
    }
  })

  // Comprobacion online de la licencia: perezosa y en segundo plano. No bloquea
  // el arranque y NUNCA impide usar la aplicacion sin conexion.
  if (license.onlineEnabled) {
    mainWindow.webContents.once('did-finish-load', () => {
      void license
        .refreshOnline()
        .then((state) => {
          if (state.online.state !== 'unknown') {
            logger.info('Licencia: estado online', {
              state: state.online.state,
              reason: state.online.reason
            })
          }
        })
        .catch((error: unknown) => {
          logger.warn('Licencia: la comprobacion online fallo (se sigue en offline)', {
            error: error instanceof Error ? error.message : 'desconocido'
          })
        })
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Cierre limpio: consolida el WAL y libera el archivo.
  if (opened) {
    try {
      opened.db.close()
    } catch {
      // Nada util que hacer en el cierre.
    }
    opened = null
  }
})

// Fallos no controlados: se registran para diagnostico en lugar de desaparecer.
process.on('uncaughtException', (error) => {
  console.error('[RESALEVAULT] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[RESALEVAULT] unhandledRejection', reason)
})
