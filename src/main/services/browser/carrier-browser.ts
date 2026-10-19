/**
 * RESALEVAULT - Navegador integrado para seguimientos.
 *
 * DECISION TECNICA: se usa `WebContentsView` de Electron, NO la etiqueta
 * `<webview>`. Motivos:
 *  - Electron desaconseja `<webview>` (API inestable, problemas de seguridad y
 *    de rendimiento documentados por el propio proyecto).
 *  - `WebContentsView` es la API actual: un `WebContents` real, aislado, que se
 *    coloca sobre la ventana con coordenadas propias.
 *  - Al ser una vista nativa, queda FUERA del DOM: una pagina externa no puede
 *    leer ni tocar React, ni el puente `window.resalevault`.
 *
 * AISLAMIENTO (todo lo que se aplica aqui):
 *  - `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
 *  - Particion de sesion PROPIA (`persist:carrier-browser`): las cookies del
 *    transportista no se mezclan con nada de la aplicacion.
 *  - Sin preload: la pagina no recibe ningun puente.
 *  - Solo https. `file:`, `javascript:`, `data:` y `http:` se bloquean.
 *  - Ventanas emergentes: denegadas y avisadas al usuario para que decida.
 *  - Descargas: bloqueadas (se avisa). Evita guardar archivos sin querer.
 *  - Permisos (camara, microfono, geolocalizacion, portapapeles...): denegados.
 *  - Certificados TLS: NO se desactiva la validacion (no se toca
 *    `setCertificateVerifyProc`).
 *  - `devTools: false`: no se abre el inspector de una pagina ajena.
 */

import { BrowserWindow, WebContentsView, session, type Session } from 'electron'
import type { CarrierBrowserState } from '@shared/types-tracking'
import { LAYOUT } from '@shared/layout'
import type { Logger } from '../logger'

export const CARRIER_PARTITION = 'persist:carrier-browser'

export interface CarrierBrowserCallbacks {
  onStateChange: (state: CarrierBrowserState) => void
  /** La pagina intento abrir una ventana nueva (bloqueada). */
  onPopupBlocked: (url: string) => void
  /** La pagina intento descargar un archivo (bloqueado). */
  onDownloadBlocked: (filename: string) => void
}

export interface OpenOptions {
  url: string
  carrierId: string
  carrierName: string
}

const EMPTY_STATE: CarrierBrowserState = {
  open: false,
  carrierId: null,
  carrierName: '',
  url: '',
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  errorCode: null,
  errorDetail: null
}

export class CarrierBrowser {
  private view: WebContentsView | null = null
  private host: BrowserWindow | null = null
  private state: CarrierBrowserState = { ...EMPTY_STATE }
  private readonly onResize = (): void => this.layout()

  constructor(
    private readonly logger: Logger,
    private readonly callbacks: CarrierBrowserCallbacks
  ) {}

  getState(): CarrierBrowserState {
    return { ...this.state }
  }

  /**
   * Crea la sesion aislada y aplica la politica de permisos.
   * Se hace una sola vez y se reutiliza.
   */
  private carrierSession(): Session {
    const carrierSession = session.fromPartition(CARRIER_PARTITION)

    // Permisos: todo denegado. Esta vista solo sirve para LEER una pagina.
    carrierSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    carrierSession.setPermissionCheckHandler(() => false)

    // Sin validacion de certificados relajada: se deja el comportamiento por
    // defecto de Electron, que rechaza certificados invalidos.

    return carrierSession
  }

  /** Abre (o reutiliza) la vista y navega a la URL indicada. */
  open(host: BrowserWindow, options: OpenOptions): CarrierBrowserState {
    if (!isHttps(options.url)) {
      this.logger.warn('Intento de abrir una URL no segura en el navegador de seguimientos', {
        url: options.url
      })
      this.state = { ...EMPTY_STATE, open: false, errorCode: 'unsafe_url' }
      this.callbacks.onStateChange(this.getState())
      return this.getState()
    }

    this.host = host

    if (!this.view || this.view.webContents.isDestroyed()) {
      this.carrierSession()
      const view = new WebContentsView({
        webPreferences: {
          partition: CARRIER_PARTITION,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          experimentalFeatures: false,
          spellcheck: false,
          devTools: false
          // Sin `preload`: la pagina externa no tiene ningun puente.
        }
      })

      this.view = view
      host.contentView.addChildView(view)
      this.attachNavigationGuards(view)

      view.webContents.on('did-start-loading', () => {
        this.state = { ...this.state, loading: true, errorCode: null, errorDetail: null }
        // Al reintentar, la vista vuelve a mostrarse.
        view.setVisible(true)
        this.emit()
      })
      view.webContents.on('did-stop-loading', () => {
        this.state = { ...this.state, loading: false, ...this.navigationFlags() }
        this.emit()
      })
      view.webContents.on('did-navigate', (_event, url) => {
        this.state = { ...this.state, url, ...this.navigationFlags() }
        this.emit()
      })
      view.webContents.on('did-navigate-in-page', (_event, url) => {
        this.state = { ...this.state, url, ...this.navigationFlags() }
        this.emit()
      })
      view.webContents.on('page-title-updated', (_event, title) => {
        this.state = { ...this.state, title }
        this.emit()
      })
      view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
        // -3 = ERR_ABORTED: ocurre al cancelar una navegacion; no es un error real.
        if (errorCode === -3) return
        this.logger.warn('Fallo al cargar la pagina del transportista', {
          errorCode,
          errorDescription,
          url: validatedUrl
        })
        this.state = {
          ...this.state,
          loading: false,
          errorCode: String(errorCode),
          errorDetail: errorDescription
        }
        // Se oculta la vista nativa para que la interfaz pueda mostrar el error
        // encima (una vista nativa siempre pinta por delante del DOM).
        view.setVisible(false)
        this.emit()
      })
      view.webContents.on('render-process-gone', (_event, details) => {
        this.logger.error('El navegador de seguimientos se ha cerrado de forma anomala', {
          reason: details.reason
        })
        this.state = { ...this.state, loading: false, errorCode: 'crashed' }
        this.emit()
      })
    }

    this.state = {
      open: true,
      carrierId: options.carrierId,
      carrierName: options.carrierName,
      url: options.url,
      title: '',
      loading: true,
      canGoBack: false,
      canGoForward: false,
      errorCode: null,
      errorDetail: null
    }

    this.layout()
    this.view.setVisible(true)

    void this.view.webContents.loadURL(options.url).catch((error: unknown) => {
      this.logger.warn('No se pudo iniciar la carga de la pagina', {
        detail: error instanceof Error ? error.message : String(error)
      })
    })

    this.emit()
    return this.getState()
  }

  /** Bloquea navegacion no segura, emergentes y descargas. */
  private attachNavigationGuards(view: WebContentsView): void {
    const guard = (event: { preventDefault: () => void }, url: string): void => {
      if (!isHttps(url)) {
        event.preventDefault()
        this.logger.warn('Navegacion bloqueada por no ser https', { url })
      }
    }

    view.webContents.on('will-navigate', (event, url) => guard(event, url))
    view.webContents.on('will-redirect', (event, url) => guard(event, url))

    // Las ventanas emergentes NUNCA se abren solas: se avisa al usuario y decide.
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.callbacks.onPopupBlocked(url)
      return { action: 'deny' }
    })

    // Descargas: bloqueadas. Se avisa para que el usuario sepa por que no pasa nada.
    view.webContents.session.on('will-download', (event, item) => {
      event.preventDefault()
      this.callbacks.onDownloadBlocked(item.getFilename())
    })
  }

  /** Ajusta la vista al hueco del area de contenido. */
  layout(): void {
    if (!this.view || !this.host || this.host.isDestroyed()) return

    const [width, height] = this.host.getContentSize()
    const x = LAYOUT.sidebarWidth
    const y = LAYOUT.titlebarHeight + LAYOUT.browserChromeHeight
    const viewWidth = Math.max(1, width - LAYOUT.sidebarWidth)
    const viewHeight = Math.max(1, height - y)

    this.view.setBounds({ x, y, width: viewWidth, height: viewHeight })
  }

  back(): CarrierBrowserState {
    if (this.view?.webContents.canGoBack()) this.view.webContents.goBack()
    return this.getState()
  }

  forward(): CarrierBrowserState {
    if (this.view?.webContents.canGoForward()) this.view.webContents.goForward()
    return this.getState()
  }

  reload(): CarrierBrowserState {
    this.view?.webContents.reload()
    return this.getState()
  }

  stop(): CarrierBrowserState {
    this.view?.webContents.stop()
    return this.getState()
  }

  /** Navega a una URL concreta (por ejemplo, una ventana emergente autorizada). */
  navigate(url: string): CarrierBrowserState {
    if (!this.view || !isHttps(url)) return this.getState()
    void this.view.webContents.loadURL(url).catch(() => undefined)
    return this.getState()
  }

  /**
   * Cierra la vista y libera sus recursos. El estado de los codigos vive en
   * SQLite, asi que cerrar el navegador no pierde nada.
   */
  close(): CarrierBrowserState {
    if (this.view && this.host && !this.host.isDestroyed()) {
      try {
        this.host.contentView.removeChildView(this.view)
      } catch {
        // La vista pudo desmontarse ya.
      }
      this.view.webContents.close()
    }

    this.view = null
    this.state = { ...EMPTY_STATE }
    this.emit()
    return this.getState()
  }

  /** Se engancha una sola vez a la ventana para recolocar la vista. */
  attachToWindow(window: BrowserWindow): void {
    this.host = window
    window.on('resize', this.onResize)
    window.on('maximize', this.onResize)
    window.on('unmaximize', this.onResize)
    window.on('enter-full-screen', this.onResize)
    window.on('leave-full-screen', this.onResize)
  }

  detachFromWindow(): void {
    const host = this.host
    if (host && !host.isDestroyed()) {
      host.off('resize', this.onResize)
      host.off('maximize', this.onResize)
      host.off('unmaximize', this.onResize)
      host.off('enter-full-screen', this.onResize)
      host.off('leave-full-screen', this.onResize)
    }
    this.close()
    this.host = null
  }

  private navigationFlags(): { canGoBack: boolean; canGoForward: boolean } {
    const contents = this.view?.webContents
    if (!contents) return { canGoBack: false, canGoForward: false }
    return { canGoBack: contents.canGoBack(), canGoForward: contents.canGoForward() }
  }

  private emit(): void {
    this.callbacks.onStateChange(this.getState())
  }
}

/** Solo se admite https en el navegador de seguimientos. */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
