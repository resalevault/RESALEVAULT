/**
 * RESALEVAULT - Constantes de maquetacion compartidas.
 *
 * Las usan DOS mundos que no se hablan directamente:
 *  - El proceso principal, para colocar la vista web nativa (`WebContentsView`)
 *    encima del area de contenido.
 *  - La hoja de estilos, para reservar el mismo espacio.
 *
 * Si estos numeros se desincronizan, la vista taparia la barra de navegacion o
 * dejaria un hueco. Por eso hay una prueba que compara estos valores con los
 * de `app.css`.
 */

export const LAYOUT = {
  /** Altura de la barra de titulo propia. */
  titlebarHeight: 38,
  /** Ancho de la navegacion lateral. */
  sidebarWidth: 232,
  /** Altura de la barra del navegador integrado (volver, recargar, URL...). */
  browserChromeHeight: 44
} as const
