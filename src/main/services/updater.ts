/**
 * RESALEVAULT - Auto-actualizacion (electron-updater + GitHub Releases).
 *
 * Comprueba en segundo plano si hay una version mas nueva publicada en GitHub.
 * Si la hay, pregunta al usuario y, si acepta, la descarga y la instala al
 * reiniciar. La verificacion de firma de codigo esta DESACTIVADA porque el
 * instalador no esta firmado por una CA (presupuesto 0 EUR): se confia en el
 * feed de GitHub y en el hash publicado en SHA256SUMS.txt.
 *
 * Es honesto sobre sus limites:
 *  - Solo funciona en el instalador NSIS (no en desarrollo ni en el .appx de
 *    la Store, que se actualiza por su propio canal).
 *  - La primera comprobacion se hace al arrancar; tambien se puede lanzar a
 *    mano desde Ajustes.
 */

import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

// electron-updater no exporta un logger propio; usamos console para no acoplar
// este servicio al Logger de la aplicacion (que se instancia mas tarde).
const log = (msg: string, data?: unknown) => console.warn('[updater]', msg, data ?? '')
const warn = (msg: string, data?: unknown) => console.warn('[updater]', msg, data ?? '')
const err = (msg: string, data?: unknown) => console.error('[updater]', msg, data ?? '')

let initialized = false

export function setupAutoUpdater(): void {
  if (initialized) return
  initialized = true

  // El instalador no esta firmado por una CA publica. Desactivamos la
  // verificacion de firma de codigo para que la actualizacion funcione igual.
  // Riesgo aceptado y documentado: docs/release/KNOWN_ISSUES.md.
  ;(autoUpdater as unknown as { verifyUpdateCodeSignature: unknown }).verifyUpdateCodeSignature = false
  // No descargar ni instalar sin confirmacion del usuario.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log('Comprobando actualizaciones...')
  })

  autoUpdater.on('update-available', (info) => {
    log('Actualizacion disponible', { version: info.version })
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      title: 'Actualizacion disponible',
      message: `Hay una nueva version de RESALEVAULT (${info.version}).`,
      detail: 'Puedes descargarla ahora y se instalara al reiniciar la aplicacion.',
      buttons: ['Descargar e instalar', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) {
      autoUpdater.downloadUpdate().catch((e) => {
        err('Error descargando la actualizacion', e)
        dialog.showErrorBox('Error al descargar', String(e))
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    log('La aplicacion esta actualizada')
  })

  autoUpdater.on('download-progress', (progress) => {
    log('Descargando actualizacion', { percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', () => {
    const choice = dialog.showMessageBoxSync({
      type: 'info',
      title: 'Actualizacion lista',
      message: 'La actualizacion se ha descargado.',
      detail: 'Se instalara al cerrar la aplicacion. ¿Reiniciar ahora?',
      buttons: ['Reiniciar ahora', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.on('error', (e) => {
    warn('Error en la comprobacion de actualizaciones', e)
  })

  // Comprobacion silenciosa al arrancar (no bloquea).
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => {
        warn('No se pudo comprobar actualizaciones', e)
      })
    }, 5000)
  }
}

export async function checkForUpdatesManually(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (!app.isPackaged) {
    return { available: false, error: 'No disponible en desarrollo' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) {
      return { available: true, version: result.updateInfo.version }
    }
    return { available: false }
  } catch (e) {
    return { available: false, error: String(e) }
  }
}