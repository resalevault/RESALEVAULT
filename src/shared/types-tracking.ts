/**
 * RESALEVAULT - Tipos del módulo Shipping Tracker.
 *
 * Distinción importante y deliberada (la exige el diseño del producto):
 *   - `statusSource: 'none'`    -> solo se abrió la página del transportista.
 *   - `statusSource: 'manual'`  -> el usuario escribió el estado a mano.
 *   - `statusSource: 'confirmed'` -> lo dijo una fuente real (hoy no hay
 *     ninguna integración de API activa, así que este valor no se usa todavía).
 *
 * Nunca se presenta como "confirmado" algo que solo se ha abierto en el
 * navegador.
 */

export const TRACKCODE_STATUSES = [
  'pending',
  'in_transit',
  'delivered',
  'incident',
  'archived'
] as const
export type TrackcodeStatus = (typeof TRACKCODE_STATUSES)[number]

export const STATUS_SOURCES = ['none', 'manual', 'confirmed'] as const
export type StatusSource = (typeof STATUS_SOURCES)[number]

export const CARRIER_REGIONS = ['ES', 'EU', 'INT'] as const
export type CarrierRegion = (typeof CARRIER_REGIONS)[number]

/**
 * Estrategia para abrir un seguimiento:
 *  - `url`:  el código viaja en la propia URL oficial (se rellena solo).
 *  - `copy`: se abre el buscador oficial y se copia el código al portapapeles
 *            para que el usuario lo pegue. Es el método honesto cuando la web
 *            no admite el código por URL.
 */
export const CARRIER_STRATEGIES = ['url', 'copy'] as const
export type CarrierStrategy = (typeof CARRIER_STRATEGIES)[number]

export interface Carrier {
  id: string
  name: string
  region: CarrierRegion
  country: string
  /** Página oficial de seguimiento (o de inicio si no se conoce la exacta). */
  trackUrl: string
  /** Plantilla con `{code}`. Vacio cuando la estrategia es `copy`. */
  urlTemplate: string
  strategy: CarrierStrategy
  /** El dominio respondió en la comprobación realizada al desarrollar. */
  verified: boolean
  /** Integración prevista: navegador (siempre) y API (futuro). */
  integration: 'browser' | 'api'
  notes: string
  enabled: boolean
  /** true = añadido por el usuario, no viene en el catálogo. */
  custom: boolean
  sortOrder: number
}

export interface Trackcode {
  id: string
  code: string
  carrierId: string
  carrierName: string
  carrierRegion: CarrierRegion
  name: string
  orderRef: string
  orderId: string | null
  purchaseDate: string | null
  expectedDate: string | null
  status: TrackcodeStatus
  statusSource: StatusSource
  lastOpenedAt: string | null
  lastCheckedAt: string | null
  notes: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  eventCount: number
}

export interface TrackcodeDraft {
  code: string
  carrierId: string
  name?: string
  orderRef?: string
  orderId?: string | null
  purchaseDate?: string | null
  expectedDate?: string | null
  status?: TrackcodeStatus
  notes?: string
}

export interface TrackcodeQuery {
  search?: string
  carrierIds?: string[]
  statuses?: TrackcodeStatus[]
  from?: string
  to?: string
  /** Incluir archivados. */
  includeArchived?: boolean
  /** Solo archivados. */
  onlyArchived?: boolean
  sort?: 'created_desc' | 'created_asc' | 'expected_asc' | 'code_asc' | 'carrier_asc'
  page?: number
  pageSize?: number
}

export interface CarrierQuery {
  search?: string
  region?: CarrierRegion | 'ALL'
}

export interface CarrierDraft {
  id: string
  name: string
  region: CarrierRegion
  country?: string
  trackUrl: string
  urlTemplate?: string
  strategy?: CarrierStrategy
  notes?: string
}

export interface TrackingEvent {
  id: string
  trackcodeId: string
  /** Cuando se recibió el evento. */
  at: string
  /** Cuando ocurrió según el transportista, si lo informa. */
  occurredAt: string | null
  description: string
  location: string
  statusCode: string
  source: 'api' | 'manual'
}

/** Resultado de resolver "Track Now": qué se ha abierto y cómo. */
export interface TrackNowResult {
  carrierId: string
  carrierName: string
  strategy: CarrierStrategy
  /** URL que se ha abierto (o se intentaría abrir). */
  url: string
  code: string
  /** true si el código queda escrito en la URL. */
  filledByUrl: boolean
  /** true si se ha copiado el código al portapapeles para pegarlo a mano. */
  copiedToClipboard: boolean
  /** Clave de aviso para la interfaz, si hace falta explicar algo. */
  noticeKey?: string
}

export interface CarrierBrowserState {
  open: boolean
  carrierId: string | null
  carrierName: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Mensaje de error comprensible, ya traducido por código en la interfaz. */
  errorCode: string | null
  errorDetail: string | null
}

/** Aviso de la página al intentar abrir una ventana nueva (bloqueada). */
export interface BrowserPopupNotice {
  url: string
  carrierName: string
}
