/**
 * RESALEVAULT - IPC del Shipping Tracker y del navegador integrado.
 *
 * Nota sobre "Track Now": la consulta NO se marca como confirmada. Abrir la
 * pagina del transportista solo deja `last_opened_at`; el estado sigue siendo
 * `none` (o `manual`) hasta que el usuario o una API autorizada digan otra cosa.
 * Es exactamente la distincion que pide el diseno del producto.
 */

import { clipboard } from 'electron'
import { CH_MODULES } from '@shared/api-modules'
import { buildTrackUrlForCarrier } from '@shared/tracking-url'
import { appError } from '../errors'
import { createHandle, type IpcBaseContext } from './guard'
import type { Repositories } from '../db/context'
import type { CarrierBrowser } from '../services/browser/carrier-browser'
import {
  zBrowserOpen,
  zCarrierCreate,
  zCarrierQuery,
  zCarrierUpdate,
  zDuplicateCheck,
  zResolveUrl,
  zTrackNow,
  zTrackcodeCreate,
  zTrackcodeQuery,
  zTrackcodeStatusPayload,
  zTrackcodeUpdate
} from '@shared/schemas-tracking'
import { zId, zIdList } from '@shared/schemas'

export interface TrackingContext extends IpcBaseContext {
  repos: Repositories
  browser: CarrierBrowser
}

export function registerTrackingHandlers(ctx: TrackingContext): void {
  const handle = createHandle(ctx)
  const tracking = ctx.repos.tracking

  // -------------------------------------------------------------------------
  // Transportistas
  // -------------------------------------------------------------------------

  handle(CH_MODULES.trackingCarriers, zCarrierQuery, (query) => tracking.listCarriers(query ?? {}))

  handle(CH_MODULES.trackingCarrierCreate, zCarrierCreate, (input) =>
    tracking.createCarrier({
      id: input.id ?? '',
      name: input.name,
      region: input.region,
      country: input.country,
      trackUrl: input.trackUrl,
      urlTemplate: input.urlTemplate,
      strategy: input.strategy,
      notes: input.notes
    }), { mutates: true, entity: 'carriers' })

  handle(CH_MODULES.trackingCarrierUpdate, zCarrierUpdate, ({ id, patch }) =>
    tracking.updateCarrier(id, patch), { mutates: true, entity: 'carriers' })

  handle(CH_MODULES.trackingCarrierRemove, zId, (id) => tracking.removeCarrier(id), {
    mutates: true,
    entity: 'carriers'
  })

  // -------------------------------------------------------------------------
  // Codigos
  // -------------------------------------------------------------------------

  handle(CH_MODULES.trackingList, zTrackcodeQuery, (query) => {
    const { from, to, ...rest } = query ?? {}
    return tracking.listTrackcodes({ ...rest, from: from ?? undefined, to: to ?? undefined })
  })

  handle(CH_MODULES.trackingGet, zId, (id) => tracking.getTrackcode(id))

  handle(CH_MODULES.trackingCreate, zTrackcodeCreate, (draft) => tracking.createTrackcode(draft), {
    mutates: true,
    entity: 'tracking'
  })

  handle(CH_MODULES.trackingUpdate, zTrackcodeUpdate, ({ id, patch }) =>
    tracking.updateTrackcode(id, patch), { mutates: true, entity: 'tracking' })

  handle(CH_MODULES.trackingSetStatus, zTrackcodeStatusPayload, ({ id, status }) =>
    tracking.setStatus(id, status), { mutates: true, entity: 'tracking' })

  handle(CH_MODULES.trackingArchive, zIdList, (ids) => tracking.archive(ids), {
    mutates: true,
    entity: 'tracking'
  })

  handle(CH_MODULES.trackingRestore, zIdList, (ids) => tracking.restore(ids), {
    mutates: true,
    entity: 'tracking'
  })

  handle(CH_MODULES.trackingRemove, zIdList, (ids) => tracking.remove(ids), {
    mutates: true,
    entity: 'tracking'
  })

  handle(CH_MODULES.trackingEvents, zId, (id) => tracking.listEvents(id))

  handle(CH_MODULES.trackingCheckDuplicate, zDuplicateCheck, ({ code, carrierId, exceptId }) => ({
    duplicate: tracking.findDuplicate(code, carrierId, exceptId ?? null)
  }))

  /** Construye la URL sin abrir nada: sirve para "copiar enlace" y pruebas. */
  handle(CH_MODULES.trackingResolveUrl, zResolveUrl, ({ carrierId, code }) => {
    const carrier = tracking.getCarrier(carrierId)
    const built = buildTrackUrlForCarrier(carrier, code)
    if (!built) throw appError('invalid_input', { field: 'trackCode', reason: 'https_required' })
    return built
  })

  // -------------------------------------------------------------------------
  // Track Now
  // -------------------------------------------------------------------------

  handle(CH_MODULES.trackingTrackNow, zTrackNow, ({ id }) => {
    const trackcode = tracking.getTrackcode(id)
    const carrier = tracking.getCarrier(trackcode.carrierId)

    const built = buildTrackUrlForCarrier(carrier, trackcode.code)
    if (!built) throw appError('invalid_input', { field: 'trackCode', reason: 'https_required' })

    const window = ctx.getMainWindow()
    if (!window || window.isDestroyed()) throw appError('internal_error', undefined, 'no_window')

    // Se registra que se ha abierto la pagina. NO se toca el estado.
    tracking.touchOpened(id)

    ctx.browser.open(window, {
      url: built.url,
      carrierId: carrier.id,
      carrierName: carrier.name
    })

    let copiedToClipboard = false
    if (!built.filledByUrl) {
      // El transportista no admite el codigo por URL: se copia para pegarlo.
      clipboard.writeText(trackcode.code)
      copiedToClipboard = true
    }

    ctx.broadcastDataChanged?.('tracking')

    return {
      carrierId: carrier.id,
      carrierName: carrier.name,
      strategy: carrier.strategy,
      url: built.url,
      code: trackcode.code,
      filledByUrl: built.filledByUrl,
      copiedToClipboard,
      noticeKey: built.filledByUrl ? undefined : 'tracking.copyPasteHint'
    }
  })

  // -------------------------------------------------------------------------
  // Navegador integrado
  // -------------------------------------------------------------------------

  handle(CH_MODULES.browserState, null, () => ctx.browser.getState())

  handle(CH_MODULES.browserOpen, zBrowserOpen, ({ url, carrierId, carrierName }) => {
    const window = ctx.getMainWindow()
    if (!window || window.isDestroyed()) throw appError('internal_error', undefined, 'no_window')
    return ctx.browser.open(window, { url, carrierId, carrierName })
  })

  handle(CH_MODULES.browserClose, null, () => ctx.browser.close())
  handle(CH_MODULES.browserBack, null, () => ctx.browser.back())
  handle(CH_MODULES.browserForward, null, () => ctx.browser.forward())
  handle(CH_MODULES.browserReload, null, () => ctx.browser.reload())
  handle(CH_MODULES.browserStop, null, () => ctx.browser.stop())

  ctx.logger.info('Manejadores de seguimiento registrados', {
    carriers: tracking.listCarriers().length
  })
}
