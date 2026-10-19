/**
 * RESALEVAULT - Estado global de la interfaz.
 *
 * Concentra lo que necesita cualquier pantalla: informacion del entorno,
 * ajustes (idioma, tema, divisa), traductor, formateadores y un contador de
 * version de datos que provoca la recarga de los listados cuando el proceso
 * principal notifica un cambio.
 *
 * No se usa ninguna libreria de estado: con un contexto y `useState` es
 * suficiente y evita dependencias que haya que mantener.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  AppInfo,
  AppSettings,
  DatabaseHealth,
  LocaleCode,
  ThemeMode
} from '@shared/types'
import type { RouteName } from '@shared/api'
import type { CarrierBrowserState } from '@shared/types-tracking'
import { api, AppError, isBridgeAvailable } from './api'
import { createTranslator, type MessageKey, type TranslateParams, type Translator } from '../i18n'

export interface Route {
  name: RouteName | 'product' | 'product-new'
  productId?: string
}

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export interface AppContextValue {
  ready: boolean
  fatalError: string | null
  info: AppInfo | null
  settings: AppSettings
  health: DatabaseHealth | null
  route: Route
  dataVersion: number
  toasts: Toast[]

  t: Translator
  locale: LocaleCode
  theme: ThemeMode
  currency: string

  money: (cents: number) => string
  moneyCompact: (cents: number) => string
  number: (value: number) => string
  percent: (value: number) => string
  date: (value: string | null) => string
  dateTime: (value: string | null) => string
  /** Fecha local de hoy en formato YYYY-MM-DD. */
  today: string

  navigate: (route: Route) => void
  goBack: () => boolean

  /** Estado del navegador integrado de seguimientos. */
  browserState: CarrierBrowserState
  browserAction: (action: 'back' | 'forward' | 'reload' | 'close') => void

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  reloadHealth: () => Promise<void>
  refreshData: () => void
  notify: (message: string, tone?: ToastTone) => void
  dismissToast: (id: number) => void
}

const DEFAULT_SETTINGS: AppSettings = {
  locale: 'es',
  theme: 'dark',
  currency: 'EUR',
  skuPattern: '{PREFIX}-{CAT}-{YY}{MM}-{SEQ:4}',
  skuPrefix: 'RV',
  staleThresholds: [30, 60, 90],
  targetMarginPercent: 25,
  minProfitCents: 500,
  defaultFeePercent: 10,
  defaultShippingCents: 400
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp debe usarse dentro de AppProvider')
  return value
}

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [health, setHealth] = useState<DatabaseHealth | null>(null)
  const [route, setRoute] = useState<Route>({ name: 'dashboard' })
  const [dataVersion, setDataVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [browserState, setBrowserState] = useState<CarrierBrowserState>({
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
  })
  const historyRef = useRef<Route[]>([])
  const toastId = useRef(1)

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = toastId.current
    toastId.current += 1
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const refreshData = useCallback(() => {
    setDataVersion((version) => version + 1)
  }, [])

  // Carga inicial: entorno, ajustes y estado de la base de datos.
  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      if (!isBridgeAvailable()) {
        setFatalError('preload_bridge_missing')
        return
      }
      try {
        const [appInfo, appSettings, databaseHealth] = await Promise.all([
          api.app.getInfo(),
          api.app.getSettings(),
          api.app.getDatabaseHealth()
        ])
        if (cancelled) return
        setInfo(appInfo)
        setSettings(appSettings)
        setHealth(databaseHealth)
        setReady(true)
      } catch (error) {
        if (cancelled) return
        setFatalError(error instanceof AppError ? error.code : 'internal_error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // El proceso principal avisa cuando algo cambia: se refrescan los listados.
  useEffect(() => {
    if (!ready || !isBridgeAvailable()) return undefined
    return api.app.onDataChanged(() => {
      setDataVersion((version) => version + 1)
    })
  }, [ready])

  // Estado del navegador integrado: se sincroniza con el proceso principal.
  useEffect(() => {
    if (!ready || !isBridgeAvailable()) return undefined
    void api.browser.state().then(setBrowserState).catch(() => undefined)
    return api.browser.onStateChanged((state) => setBrowserState(state))
  }, [ready])

  const browserAction = useCallback((action: 'back' | 'forward' | 'reload' | 'close') => {
    const call =
      action === 'back'
        ? api.browser.back
        : action === 'forward'
          ? api.browser.forward
          : action === 'reload'
            ? api.browser.reload
            : api.browser.close
    void call()
      .then(setBrowserState)
      .catch(() => undefined)
  }, [])

  // Tema e idioma se reflejan en el documento para que el CSS y los lectores
  // de pantalla usen el valor correcto.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.lang = settings.locale
  }, [settings.theme, settings.locale])

  const t = useMemo(() => createTranslator(settings.locale), [settings.locale])

  const money = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(settings.locale, {
        style: 'currency',
        currency: settings.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(cents / 100),
    [settings.locale, settings.currency]
  )

  const moneyCompact = useCallback(
    (cents: number) =>
      new Intl.NumberFormat(settings.locale, {
        style: 'currency',
        currency: settings.currency,
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(cents / 100),
    [settings.locale, settings.currency]
  )

  const number = useCallback(
    (value: number) => new Intl.NumberFormat(settings.locale, { maximumFractionDigits: 0 }).format(value),
    [settings.locale]
  )

  const percent = useCallback(
    (value: number) =>
      new Intl.NumberFormat(settings.locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value / 100),
    [settings.locale]
  )

  const date = useCallback(
    (value: string | null) => {
      if (!value) return ''
      const parsed = new Date(value.length === 10 ? value + 'T00:00:00' : value)
      if (Number.isNaN(parsed.getTime())) return ''
      return new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(parsed)
    },
    [settings.locale]
  )

  const dateTime = useCallback(
    (value: string | null) => {
      if (!value) return ''
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return ''
      return new Intl.DateTimeFormat(settings.locale, {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(parsed)
    },
    [settings.locale]
  )

  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])

  const navigate = useCallback((next: Route) => {
    setRoute((current) => {
      // No se apila la misma ruta dos veces seguidas.
      if (current.name !== next.name || current.productId !== next.productId) {
        historyRef.current = [...historyRef.current.slice(-19), current]
      }
      return next
    })
  }, [])

  const goBack = useCallback((): boolean => {
    const previous = historyRef.current.pop()
    if (!previous) return false
    setRoute(previous)
    return true
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const updated = await api.app.updateSettings(patch)
      setSettings(updated)
    },
    []
  )

  const reloadHealth = useCallback(async () => {
    setHealth(await api.app.getDatabaseHealth())
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      fatalError,
      info,
      settings,
      health,
      route,
      dataVersion,
      toasts,
      t,
      locale: settings.locale,
      theme: settings.theme,
      currency: settings.currency,
      money,
      moneyCompact,
      number,
      percent,
      date,
      dateTime,
      today,
      navigate,
      goBack,
      browserState,
      browserAction,
      updateSettings,
      reloadHealth,
      refreshData,
      notify,
      dismissToast
    }),
    [
      ready,
      fatalError,
      info,
      settings,
      health,
      route,
      dataVersion,
      toasts,
      t,
      money,
      moneyCompact,
      number,
      percent,
      date,
      dateTime,
      today,
      navigate,
      goBack,
      browserState,
      browserAction,
      updateSettings,
      reloadHealth,
      refreshData,
      notify,
      dismissToast
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Mensaje traducido de un error de dominio. */
export function errorMessage(t: Translator, error: unknown): string {
  if (error instanceof AppError) {
    const params: TranslateParams = { ...(error.params ?? {}) }
    return t(('errors.' + error.code) as MessageKey, params)
  }
  if (error instanceof Error) return error.message
  return t('errors.internal_error', { id: '-' })
}
