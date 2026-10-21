/**
 * RESALEVAULT - Ventana principal.
 *
 * Se usa una ventana SIN marco nativo para poder aplicar la identidad visual
 * (barra de titulo propia, negro carbon, monograma RV). Los controles de
 * minimizar/maximizar/cerrar siguen siendo reales: se invocan por IPC sobre la
 * ventana autentica, no se simulan desde la interfaz.
 */

import { BrowserWindow, app } from 'electron'
import { join } from 'node:path'
import { EV } from '@shared/api'
import { hardenWindow } from './services/security'
import type { Logger } from './services/logger'

export interface MainWindowResult {
  window: BrowserWindow
}

export function createMainWindow(logger: Logger): MainWindowResult {
  // En macOS conviene conservar los botones nativos (cerrar/minimizar/zoom) en
  // la barra: por eso se usa `hiddenInset`, que mantiene el semaforo del sistema
  // sobre una barra de titulo propia. En Windows/Linux se usa una ventana sin
  // marco con los controles dibujados por la aplicacion.
  const isMac = process.platform === 'darwin'

  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Espacio para el semaforo de macOS en la barra de titulo propia.
    trafficLightPosition: isMac ? { x: 14, y: 18 } : undefined,
    backgroundColor: '#0B0B0C',
    title: 'RESALEVAULT',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // --- Seguridad del renderer ---
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
      // Las herramientas de desarrollo solo existen fuera del paquete final.
      devTools: !app.isPackaged
    }
  })

  hardenWindow(window)

  // La ventana solo se muestra cuando el contenido esta listo: evita el
  // destello blanco inicial.
  window.once('ready-to-show', () => {
    window.show()
  })

  const notifyMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(EV.windowMaximizedChanged, window.isMaximized())
    }
  }
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)

  // -------------------------------------------------------------------------
  // Diagnostico: sin esto, un error en la interfaz es invisible para quien
  // tiene que resolverlo. Solo se registran mensajes, nunca datos de negocio.
  // -------------------------------------------------------------------------
  window.webContents.on('console-message', (...args: unknown[]) => {
    // Electron 44 entrega un objeto de evento; versiones anteriores, argumentos
    // posicionales. Se aceptan ambas formas por robustez.
    const first = args[0] as { level?: number | string; message?: string } | undefined
    if (first && typeof first === 'object' && 'message' in first) {
      logger.debug('[renderer] ' + String(first.message))
      return
    }
    logger.debug('[renderer] ' + String(args[1] ?? ''))
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    logger.error('La interfaz no se ha podido cargar', { errorCode, errorDescription, validatedUrl })
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('El proceso de la interfaz ha terminado de forma anomala', {
      reason: details.reason,
      exitCode: details.exitCode
    })
  })

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('Fallo el script de precarga', { preloadPath, detail: error.message })
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return { window }
}
