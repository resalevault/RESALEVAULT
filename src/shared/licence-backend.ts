/**
 * RESALEVAULT - Configuracion del backend de licencias.
 *
 * La aplicacion habla UNICAMENTE con una Edge Function (`/functions/v1/licence`),
 * nunca con las tablas. La URL base del proyecto es publica (igual que la clave
 * publicable de Supabase): no es un secreto y por eso puede vivir en el codigo.
 *
 * Lo que NUNCA viaja aqui: claves `sb_secret_`, la clave de servicio ni la
 * contrasena de la base de datos. Esas solo existen en el servidor.
 *
 * Si el backend no responde, la app sigue funcionando en modo offline: una
 * licencia ya activada conserva su plan.
 */

/** Proyecto de Supabase del backend de licencias (URL publica). */
export const LICENCE_BACKEND_URL = 'https://ugfefewrikcghfwqhezi.supabase.co'

/** Ruta completa de la Edge Function. */
export const LICENCE_ENDPOINT = `${LICENCE_BACKEND_URL}/functions/v1/licence`

/**
 * Clave PUBLISHABLE de Supabase. Esta disenada para ser publica: viaja en la
 * aplicacion y solo permite llamar a la Edge Function (la base de datos tiene
 * RLS de denegacion total). NO es la clave de servicio: esa nunca sale del
 * servidor. Se envia como `Authorization: Bearer` porque la funcion exige
 * autenticacion (verify_jwt).
 */
export const LICENCE_PUBLISHABLE_KEY = 'sb_publishable__7OuDroDQkWAV-Nlwe7c3Q_wEMXlnLh'

/**
 * Cada cuanto se comprueba el estado online como maximo. Siete dias es un
 * equilibrio: una revocacion surte efecto en un plazo razonable sin castigar la
 * red ni la privacidad del usuario.
 */
export const ONLINE_RECHECK_DAYS = 7

/** Tiempo maximo de espera de una llamada. Pasado esto, se sigue sin conexion. */
export const ONLINE_TIMEOUT_MS = 8000

/** Resultado de la ultima comprobacion online, tal como se guarda en la base. */
export type LicenceOnlineState = 'unknown' | 'verified' | 'offline' | 'rejected'

/** Motivos que puede devolver el backend al rechazar una activacion. */
export type LicenceRejectReason =
  | 'unknown_code'
  | 'revoked'
  | 'suspended'
  | 'expired'
  | 'seats_exhausted'
  | 'bad_signature'
  | 'unsupported_version'
  | 'unknown_plan'
  | 'invalid_input'
  | 'server_error'
  | 'server_misconfigured'
  | 'network'

/** Traduce un motivo del backend a un mensaje que la interfaz pueda mostrar. */
export function rejectReasonIsBlocking(reason: LicenceRejectReason): boolean {
  return reason !== 'network' && reason !== 'server_error' && reason !== 'server_misconfigured'
}
