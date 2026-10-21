/**
 * RESALEVAULT - Enlaces externos permitidos.
 *
 * El proceso principal NO abre ni copia una URL cualquiera que le pase la
 * interfaz: solo acepta los destinos declarados en esta tabla, por su nombre.
 * Asi un renderer comprometido no puede usar la app para abrir un sitio
 * arbitrario ni para copiar enlaces enganosos al portapapeles del usuario.
 *
 * Esta tabla es la unica fuente de verdad: la usan el proceso principal (para
 * validar), la interfaz (para mostrar el destino) y las pruebas.
 */

/** Nombre con el que la interfaz pide un enlace. */
export type LinkTarget = 'discord_invite'

export interface LinkDefinition {
  /** URL exacta y completa. Debe ser https. */
  url: string
  /** Se muestra al usuario para que sepa a donde va antes de pulsar. */
  label: string
}

/**
 * Enlace oficial de Discord de RESALEVAULT para comprar o solicitar una
 * licencia. La gestion comercial ocurre integramente en ese servidor: la
 * aplicacion NO cobra, NO pide datos de pago y NO activa nada por si sola.
 */
export const ALLOWED_LINKS: Record<LinkTarget, LinkDefinition> = {
  discord_invite: {
    url: 'https://discord.gg/9bMhnGvjrx',
    label: 'Discord'
  }
}

/** Devuelve la definicion de un destino, o `null` si no esta permitido. */
export function resolveLink(target: string): LinkDefinition | null {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_LINKS, target)) return null
  return ALLOWED_LINKS[target as LinkTarget]
}

/**
 * Comprueba que una URL es exactamente una de las permitidas. Se usa como
 * segunda barrera antes de abrir cualquier cosa.
 */
export function isAllowedUrl(url: string): boolean {
  return Object.values(ALLOWED_LINKS).some((entry) => entry.url === url)
}
