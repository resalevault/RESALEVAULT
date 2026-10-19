/**
 * RESALEVAULT - Utilidades internas de la capa de datos.
 */

import { randomUUID } from 'node:crypto'
import type { SqlParam } from './database'

/** Usuario implicito de la version individual. */
export const ACTOR_USER_ID = 'user-local'

export function newId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Fecha local en formato YYYY-MM-DD (la que entiende el usuario como "hoy"). */
export function todayIso(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Convierte un nombre en un slug estable: "Ropa de niño" -> "ropa-de-nino". */
export function slugify(value: string): string {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.length > 0 ? base.slice(0, 64) : 'item'
}

/**
 * Escapa los comodines de LIKE para que buscar "50%" no devuelva todo.
 * Se usa junto a `ESCAPE '\'` en la consulta.
 */
export function likePattern(term: string): string {
  return '%' + term.replace(/[\\%_]/g, (match) => '\\' + match) + '%'
}

/** Construye una lista de parametros con nombre para clausulas IN. */
export function inClause(
  prefix: string,
  values: readonly (string | number)[],
  params: Record<string, SqlParam>
): string {
  const keys: string[] = []
  values.forEach((value, index) => {
    const key = `$${prefix}${index}`
    keys.push(key)
    params[key] = value
  })
  return keys.join(', ')
}

/** Selecciona los campos presentes en un objeto de parche. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>
): Array<{ key: keyof T; from: unknown; to: unknown }> {
  const changes: Array<{ key: keyof T; from: unknown; to: unknown }> = []
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const next = patch[key]
    if (next === undefined) continue
    const current = before[key]
    if (current !== next) changes.push({ key, from: current, to: next })
  }
  return changes
}

/** Serializa un valor para guardarlo en el historial de cambios. */
export function serializeForHistory(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Convierte un entero de SQLite (puede llegar como bigint) a number seguro. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

export function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return toNumber(value, 0) !== 0
}

/** DIAS desde una fecha hasta hoy, calculado en SQLite para no depender del reloj local. */
export const AGE_DAYS_SQL =
  "CAST(julianday('now') - julianday(COALESCE(p.purchase_date, p.created_at)) AS INTEGER)"
