/**
 * RESALEVAULT - Tipos del sistema de traducciones.
 *
 * `DictionaryShape` transforma el tipo del diccionario de referencia
 * (eliminando los literales concretos) para poder exigir que cualquier otro
 * idioma tenga EXACTAMENTE las mismas claves.
 */

export interface PluralForms {
  one: string
  other: string
}

export type Leaf = string | PluralForms

export type DictionaryShape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends PluralForms
      ? PluralForms
      : DictionaryShape<T[K]>
}

/**
 * Union de todas las rutas validas del diccionario, en notacion de puntos.
 * Permite que `t('inventory.title')` este tipado y que una clave inexistente
 * sea un error de compilacion.
 */
export type DictionaryPath<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${DictionaryPath<T[K]>}`
}[keyof T & string]
