/**
 * RESALEVAULT - Motor de traducciones.
 *
 * Sin dependencias externas: la aplicacion necesita interpolacion y plurales,
 * y ambas se resuelven con `Intl.PluralRules`, que ya forma parte del runtime.
 * Las claves estan tipadas a partir del diccionario de referencia.
 */

import type { LocaleCode } from '@shared/types'
import { es } from './es'
import { en } from './en'
import type { PluralForms } from './shape'
import type { DictionaryPath } from './shape'

export const DICTIONARIES: Record<LocaleCode, unknown> = { es, en }
export const AVAILABLE_LOCALES: LocaleCode[] = ['es', 'en']

export type MessageKey = DictionaryPath<typeof es>

export type TranslateParams = Record<string, string | number>

export type Translator = (key: MessageKey, params?: TranslateParams) => string

function isPluralForms(value: unknown): value is PluralForms {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PluralForms).one === 'string' &&
    typeof (value as PluralForms).other === 'string'
  )
}

/** Recorre el diccionario usando una clave con puntos. */
export function resolveMessage(dictionary: unknown, key: string): string | PluralForms | undefined {
  const segments = key.split('.')
  let current: unknown = dictionary
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  if (typeof current === 'string' || isPluralForms(current)) return current
  return undefined
}

/** Sustituye los marcadores {{nombre}} por el valor recibido. */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * Traduce una clave. Si falta en el idioma activo, cae al espanol; si tampoco
 * existe alli, devuelve la propia clave entre corchetes para que el fallo sea
 * visible durante el desarrollo en lugar de mostrar una cadena vacia.
 */
export function translate(
  locale: LocaleCode,
  key: MessageKey | string,
  params?: TranslateParams
): string {
  const dictionaries: Array<LocaleCode> = locale === 'es' ? ['es'] : [locale, 'es']

  for (const candidate of dictionaries) {
    const message = resolveMessage(DICTIONARIES[candidate], key)
    if (message === undefined) continue

    if (isPluralForms(message)) {
      const count = typeof params?.count === 'number' ? params.count : 0
      const category = new Intl.PluralRules(candidate).select(count)
      const form = category === 'one' ? message.one : message.other
      return interpolate(form, params)
    }

    return interpolate(message, params)
  }

  return `[${String(key)}]`
}

export function createTranslator(locale: LocaleCode): Translator {
  return (key, params) => translate(locale, key, params)
}

/**
 * Devuelve las claves que faltan en un diccionario respecto al de referencia.
 * Se usa en las pruebas automatizadas para garantizar la paridad de idiomas.
 */
export function missingKeys(reference: unknown, candidate: unknown, prefix = ''): string[] {
  const missing: string[] = []
  if (typeof reference !== 'object' || reference === null) return missing
  const candidateObject =
    typeof candidate === 'object' && candidate !== null ? (candidate as Record<string, unknown>) : {}

  for (const [key, value] of Object.entries(reference as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isPluralForms(value)) {
      const other = candidateObject[key]
      if (!isPluralForms(other) || other.one !== value.one || other.other !== value.other) {
        missing.push(path)
      }
      continue
    }
    if (typeof value === 'string') {
      if (typeof candidateObject[key] !== 'string') missing.push(path)
      continue
    }
    missing.push(...missingKeys(value, candidateObject[key], path))
  }

  return missing
}
