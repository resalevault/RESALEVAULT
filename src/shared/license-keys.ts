/**
 * RESALEVAULT - Clave PUBLICA de verificacion de licencias.
 *
 * Aqui solo hay una clave PUBLICA. Con ella se pueden VERIFICAR firmas, pero no
 * generarlas. La clave privada correspondiente vive fuera del programa
 * (`tools/keys/license-private.pem`, excluida del paquete) y solo la usa la
 * herramienta administrativa `scripts/generate-license.mjs`.
 *
 * Consecuencia de seguridad: aunque alguien inspeccione el ejecutable, no puede
 * emitir licencias validas. Por eso mismo, esta lista de claves publicas no
 * revela ningun secreto.
 *
 * Para rotar la clave: generar un par nuevo con
 * `npm run license:keygen`, sustituir el valor de abajo y volver a emitir las
 * licencias. Las antiguas dejarian de validar, asi que la rotacion debe hacerse
 * solo si hay sospecha de compromiso.
 */

/** Formato SPKI en DER, codificado en base64. */
export const LICENSE_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAytExp1lfGmhRRw6V2ShlASFYuwmBfNQcE7KoghAveD0='

/**
 * Version del formato de licencia. Si cambia la estructura del payload, se
 * incrementa y el verificador rechaza las versiones que no conoce en lugar de
 * interpretarlas mal.
 */
export const LICENSE_FORMAT_VERSION = 1
