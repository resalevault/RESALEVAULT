/**
 * RESALEVAULT - Rutas de datos de la aplicacion.
 *
 * Todo vive bajo la carpeta de datos del usuario que devuelve Electron
 * (`%APPDATA%\RESALEVAULT` en Windows). Nunca se escribe dentro de la carpeta
 * de instalacion del programa: eso evita perder datos al actualizar y evita
 * necesitar permisos de administrador.
 *
 * En desarrollo se usa un sufijo `-dev` para no mezclar el inventario real del
 * usuario con datos de prueba.
 */

import { app } from 'electron'
import { join } from 'node:path'

export const APP_DISPLAY_NAME = 'RESALEVAULT'

export interface AppPaths {
  /** Raiz de datos del usuario. */
  userData: string
  /** Base de datos SQLite y sus archivos WAL. */
  data: string
  /** Fotografias y documentos adjuntos. */
  media: string
  /** Miniaturas generadas (fuera de `media` para que no se sirvan como original). */
  thumbs: string
  /** Copias de seguridad. */
  backups: string
  /** Registros de diagnostico. */
  logs: string
  /** Archivos temporales de la aplicacion. */
  temp: string
  /** Ruta completa del archivo de base de datos. */
  database: string
  /** Archivo de log principal. */
  logFile: string
}

/**
 * Debe llamarse ANTES de cualquier `app.getPath('userData')`. Electron cachea
 * la ruta la primera vez que se consulta.
 */
export function configureAppIdentity(): void {
  app.setName(app.isPackaged ? APP_DISPLAY_NAME : `${APP_DISPLAY_NAME} (dev)`)
}

export function getAppPaths(): AppPaths {
  const userData = app.getPath('userData')
  return {
    userData,
    data: join(userData, 'data'),
    media: join(userData, 'media'),
    thumbs: join(userData, 'thumbs'),
    backups: join(userData, 'backups'),
    logs: join(userData, 'logs'),
    temp: join(userData, 'temp'),
    database: join(userData, 'data', 'resalevault.sqlite'),
    logFile: join(userData, 'logs', 'resalevault.log')
  }
}
