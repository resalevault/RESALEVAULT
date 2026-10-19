/**
 * RESALEVAULT - Fabrica de manejadores IPC.
 *
 * Vive en su propio archivo porque la usan dos registros distintos (el nucleo y
 * los modulos). Duplicar la logica de validacion y de control de origen seria
 * la forma mas rapida de dejar un canal sin proteger.
 *
 * Reglas que aplica TODA llamada:
 *  1. Solo la ventana principal puede invocar (comparando `webContents.id`).
 *  2. El payload se valida con zod antes de tocar nada.
 *  3. El resultado siempre es `Result<T>`; nunca se propaga una excepcion.
 *  4. Los errores desconocidos se registran completos y se devuelven como
 *     `internal_error` con un identificador, sin filtrar rutas ni SQL.
 */

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import type { Result } from '@shared/types'
import { appError, toErrorPayload } from '../errors'
import type { Logger } from '../services/logger'

export interface IpcBaseContext {
  logger: Logger
  getMainWindow: () => BrowserWindow | null
  /** Notifica al renderer que los datos han cambiado (invalidacion de cache). */
  broadcastDataChanged?: (entity: string) => void
}

export interface MutateOptions {
  mutates?: boolean
  entity?: string
}

export type Handler<TIn, TOut> = (input: TIn, event: IpcMainInvokeEvent) => TOut | Promise<TOut>
export type HandleFactory = <TIn, TOut>(
  channel: string,
  schema: ZodType<TIn> | null,
  handler: Handler<TIn, TOut>,
  options?: MutateOptions
) => void

export function assertTrustedSender(ctx: IpcBaseContext, event: IpcMainInvokeEvent): void {
  const main = ctx.getMainWindow()
  if (!main || main.isDestroyed() || event.sender.id !== main.webContents.id) {
    throw appError('forbidden_origin', undefined, `webContents ${event.sender.id}`)
  }
}

export function createHandle(ctx: IpcBaseContext): HandleFactory {
  return function handle<TIn, TOut>(
    channel: string,
    schema: ZodType<TIn> | null,
    handler: Handler<TIn, TOut>,
    options: MutateOptions = {}
  ): void {
    ipcMain.handle(channel, async (event, raw: unknown): Promise<Result<TOut>> => {
      const correlationId = randomUUID().slice(0, 8)
      const started = Date.now()

      try {
        assertTrustedSender(ctx, event)

        let input: TIn
        if (schema) {
          const parsed = schema.safeParse(raw)
          if (!parsed.success) {
            const issue = parsed.error.issues[0]
            ctx.logger.warn('Entrada IPC invalida', {
              channel,
              path: issue?.path.join('.'),
              code: issue?.code
            })
            return {
              ok: false,
              error: {
                code: 'invalid_input',
                params: { field: issue?.path.join('.') || 'payload' },
                detail: parsed.error.issues
                  .map((entry) => `${entry.path.join('.')}: ${entry.message}`)
                  .join('; ')
              }
            }
          }
          input = parsed.data
        } else {
          input = undefined as TIn
        }

        const data = await handler(input, event)

        if (options.mutates && options.entity) {
          try {
            ctx.broadcastDataChanged?.(options.entity)
          } catch {
            // La notificacion es una mejora, no un requisito.
          }
        }

        return { ok: true, data }
      } catch (error) {
        const payload = toErrorPayload(error, correlationId)
        if (payload.code === 'internal_error' || payload.code === 'db_error') {
          ctx.logger.error('Fallo en operacion IPC', {
            channel,
            correlationId,
            code: payload.code,
            detail: payload.detail
          })
        } else {
          ctx.logger.warn('Operacion IPC rechazada', { channel, code: payload.code })
        }
        void started
        return { ok: false, error: payload }
      }
    })
  }
}

/** Quita los manejadores de una lista de canales (usado al cerrar). */
export function removeHandlers(channels: Record<string, string>): void {
  for (const channel of Object.values(channels)) {
    ipcMain.removeHandler(channel)
  }
}
