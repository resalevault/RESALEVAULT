/**
 * RESALEVAULT - Politica de seguridad del proceso de renderizado.
 *
 * Electron no es seguro por defecto: la seguridad se construye con decisiones
 * explicitas. Estas son las que aplica RESALEVAULT:
 *
 *  1. Content-Security-Policy estricta. En produccion no se permite `unsafe-eval`
 *     ni scripts de terceros. En desarrollo se relaja lo minimo para que el
 *     servidor de Vite pueda inyectar el cliente de recarga en caliente.
 *  2. Ninguna ventana nueva dentro de la aplicacion. Los enlaces externos se
 *     abren en el navegador del sistema, y solo si son https.
 *  3. Navegacion bloqueada: la ventana no puede salir de la aplicacion.
 *  4. Permisos del navegador denegados por defecto (camara, microfono, etc. se
 *     habilitaran de forma explicita cuando exista una funcion que los use).
 *  5. Sin `webview` ni `nodeIntegration` en el renderer.
 */

import { app, session, shell, type BrowserWindow, type Session } from 'electron'
import { DEV_CSP, HTTP_ONLY_CSP_DIRECTIVES, PROD_CSP } from '@shared/csp'

export function applySecurityPolicy(targetSession: Session = session.defaultSession): void {
  const isDev = !app.isPackaged
  // `frame-ancestors` solo funciona por cabecera, nunca en una etiqueta <meta>.
  const csp = [isDev ? DEV_CSP : PROD_CSP, ...HTTP_ONLY_CSP_DIRECTIVES].join('; ')

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // Permisos del navegador: denegados salvo los que una funcion concreta
  // necesite. `clipboard-read` se concede porque la interfaz permite pegar
  // codigos de barras y textos de anuncios.
  targetSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['clipboard-sanitized-write'])
    callback(allowed.has(permission))
  })

  targetSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'clipboard-sanitized-write'
  })
}

/** Aplica las restricciones de navegacion a una ventana concreta. */
export function hardenWindow(window: BrowserWindow): void {
  // Los enlaces externos nunca se abren dentro de la aplicacion.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    // Solo se permite la navegacion interna del servidor de desarrollo.
    const sameOrigin = safeOrigin(url) === safeOrigin(current)
    if (!sameOrigin) {
      event.preventDefault()
    }
  })

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // Ningun renderer puede pedir privilegios adicionales.
  window.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write')
  })
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
