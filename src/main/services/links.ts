/**
 * RESALEVAULT - Servicio de enlaces externos.
 *
 * La interfaz nunca maneja URLs: pide un DESTINO por su nombre logico
 * (`discord_invite`) y este servicio resuelve la URL real desde la lista blanca
 * compartida (`@shared/links`). Asi:
 *  - El renderer no puede abrir ni copiar una direccion arbitraria.
 *  - Cambiar el enlace de compra es editar un solo archivo compartido.
 *  - La prueba puede comprobar que el destino es exactamente el esperado.
 */

import { clipboard, shell } from 'electron'
import { resolveLink, type LinkTarget } from '@shared/links'
import { appError } from '../errors'

export interface OpenLinkResult {
  opened: boolean
}

export interface CopyLinkResult {
  copied: boolean
  url: string
}

export class LinkService {
  /** Devuelve la URL permitida o lanza si el destino no existe. */
  resolve(target: string): { url: string; label: string } {
    const entry = resolveLink(target)
    if (!entry) {
      // Un destino desconocido es un intento de saltarse la lista blanca.
      throw appError('invalid_input', { field: 'target' })
    }
    return entry
  }

  /**
   * Abre el enlace en el navegador predeterminado del sistema.
   *
   * `shell.openExternal` no devuelve nada util en algunas plataformas: se
   * envuelve en try/catch para poder informar de un fallo real en lugar de
   * decir que se ha abierto cuando no ha sido asi.
   */
  async open(target: LinkTarget): Promise<OpenLinkResult> {
    const { url } = this.resolve(target)
    try {
      await shell.openExternal(url)
      return { opened: true }
    } catch (error) {
      throw appError('storage_error', { action: 'openLink' }, String(error))
    }
  }

  /** Copia el enlace al portapapeles. Alternativa cuando no se puede abrir. */
  copy(target: LinkTarget): CopyLinkResult {
    const { url } = this.resolve(target)
    try {
      clipboard.writeText(url)
      return { copied: true, url }
    } catch (error) {
      throw appError('storage_error', { action: 'copyLink' }, String(error))
    }
  }
}
