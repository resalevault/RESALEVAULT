/**
 * RESALEVAULT - Politica de seguridad de contenido (CSP).
 *
 * Se define en un unico sitio porque se aplica por dos vias complementarias:
 *  1. Cabecera HTTP desde el proceso principal (`services/security.ts`).
 *  2. Etiqueta <meta> inyectada en el HTML al compilar, que cubre la carga por
 *     `file://` que no siempre pasa por el interceptor de peticiones.
 *
 * Cuando ambas existen, el navegador aplica la mas restrictiva, de modo que
 * duplicarlas solo refuerza el resultado.
 */

/** En desarrollo hay que permitir el cliente de recarga en caliente de Vite. */
export const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/**
 * En produccion no hay scripts en linea, ni eval, ni conexiones externas.
 * `rv-media:` es el protocolo propio que servira fotografias y documentos
 * desde la carpeta de datos del usuario (Fase 2).
 *
 * Nota: `frame-ancestors` NO se incluye aqui a proposito. Esa directiva se
 * ignora cuando la politica viaja en una etiqueta <meta> (el navegador avisa
 * por consola), asi que se anade solo a la cabecera HTTP, donde si tiene
 * efecto. Ver `services/security.ts`.
 */
export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: rv-media:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** Directivas que solo tienen sentido en la cabecera HTTP. */
export const HTTP_ONLY_CSP_DIRECTIVES = ["frame-ancestors 'none'"]
