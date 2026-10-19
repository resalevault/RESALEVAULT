import { describe, expect, it } from 'vitest'
import { FOUNDER_QUOTA, PLAN_DISPLAY_ORDER, PLAN_FEATURE_KEYS, PLAN_LIMITS, UNLIMITED, isUnlimited, withinLimit } from '@shared/plans'
import {
  ACTOR_USER_ID,
  diff,
  inClause,
  likePattern,
  serializeForHistory,
  toBoolean,
  toNullableString,
  toNumber,
  toStringValue
} from '@main/db/support'
import { listRecentActivity, logActivity, trimActivityLog } from '@main/db/repositories/activity'
import { createTestContext } from './helpers'

/**
 * Limites de plan (fuente unica de verdad), utilidades de datos y registro de
 * actividad. Los limites deciden que puede hacer cada plan, asi que un error
 * aqui afecta a todo el producto.
 */
describe('limites de plan', () => {
  it('isUnlimited y withinLimit respetan el valor -1', () => {
    expect(isUnlimited(UNLIMITED)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(withinLimit(999_999, UNLIMITED)).toBe(true)
    expect(withinLimit(149, 150)).toBe(true)
    expect(withinLimit(150, 150)).toBe(false)
    expect(withinLimit(0, 0)).toBe(false)
  })

  it('define los tres planes con sus topes', () => {
    expect(PLAN_LIMITS.free.maxProducts).toBe(150)
    expect(PLAN_LIMITS.free.maxUploads).toBe(200)
    expect(PLAN_LIMITS.free.aiStudio).toBe(false)
    expect(PLAN_LIMITS.free.csvImport).toBe(false)

    expect(PLAN_LIMITS.pro.maxProducts).toBe(20_000)
    expect(PLAN_LIMITS.pro.aiMonthlyCalls).toBe(2000)
    expect(PLAN_LIMITS.pro.analytics).toBe(true)
    expect(PLAN_LIMITS.pro.multiUser).toBe(false)

    expect(PLAN_LIMITS.business.maxProducts).toBe(UNLIMITED)
    expect(PLAN_LIMITS.business.aiMonthlyCalls).toBe(UNLIMITED)
    expect(PLAN_LIMITS.business.multiUser).toBe(true)
    expect(PLAN_LIMITS.business.sync).toBe(true)
  })

  it('la cuota fundadora y el orden de planes son los documentados', () => {
    expect(FOUNDER_QUOTA).toEqual({ pro: 200, business: 200 })
    expect(PLAN_DISPLAY_ORDER).toEqual(['free', 'pro', 'business'])
    expect(PLAN_FEATURE_KEYS.length).toBe(11)
    for (const feature of PLAN_FEATURE_KEYS) {
      expect(feature.labelKey.startsWith('plan.feature')).toBe(true)
    }
  })
})

describe('utilidades de datos', () => {
  it('likePattern escapa los comodines de SQL', () => {
    expect(likePattern('camiseta')).toBe('%camiseta%')
    expect(likePattern('50%')).toBe('%50\\%%')
    expect(likePattern('a_b')).toBe('%a\\_b%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })

  it('inClause numera los parametros con nombre', () => {
    const params: Record<string, string | number> = {}
    expect(inClause('st', ['a', 'b'], params)).toBe('$st0, $st1')
    expect(params).toEqual({ $st0: 'a', $st1: 'b' })
  })

  it('diff solo devuelve los campos que cambian de verdad', () => {
    expect(diff({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual([{ key: 'b', from: 2, to: 3 }])
    expect(diff({ a: 1 }, { a: undefined })).toEqual([])
    expect(diff({ a: 1 }, {})).toEqual([])
  })

  it('serializeForHistory convierte a texto y sobrevive a objetos circulares', () => {
    expect(serializeForHistory(null)).toBeNull()
    expect(serializeForHistory(undefined)).toBeNull()
    expect(serializeForHistory('texto')).toBe('texto')
    expect(serializeForHistory(42)).toBe('42')
    expect(serializeForHistory(true)).toBe('true')
    expect(serializeForHistory({ a: 1 })).toBe('{"a":1}')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(serializeForHistory(circular)).toBe('[object Object]')
  })

  it('las conversiones de tipos no mienten', () => {
    expect(toNumber(5)).toBe(5)
    expect(toNumber(Number.NaN, 7)).toBe(7)
    expect(toNumber(BigInt(9))).toBe(9)
    expect(toNumber('12')).toBe(12)
    expect(toNumber('no-numero', 3)).toBe(3)
    expect(toNumber({}, 1)).toBe(1)

    expect(toStringValue('x')).toBe('x')
    expect(toStringValue(null, 'def')).toBe('def')
    expect(toStringValue(42)).toBe('42')

    expect(toNullableString(null)).toBeNull()
    expect(toNullableString(undefined)).toBeNull()
    expect(toNullableString(7)).toBe('7')

    expect(toBoolean(true)).toBe(true)
    expect(toBoolean(1)).toBe(true)
    expect(toBoolean(0)).toBe(false)
    expect(toBoolean('1')).toBe(true)
    expect(toBoolean('0')).toBe(false)
  })
})

describe('registro de actividad', () => {
  it('guarda y lee las entradas mas recientes', () => {
    const ctx = createTestContext()
    logActivity(ctx.db, { entity: 'product', entityId: 'p1', action: 'created', summary: 'Alta' })
    const entries = listRecentActivity(ctx.db)
    expect(entries.length).toBe(1)
    expect(entries[0]?.entity).toBe('product')
    expect(entries[0]?.action).toBe('created')

    logActivity(ctx.db, { entity: 'system', action: 'x', summary: 'y', details: { a: 1 } })
    expect(listRecentActivity(ctx.db).length).toBe(2)
    expect(listRecentActivity(ctx.db, 1).length).toBe(1)
    ctx.close()
  })

  it('trimActivityLog conserva solo las mas recientes', () => {
    const ctx = createTestContext()
    for (let index = 0; index < 5; index += 1) {
      ctx.db.run(
        `INSERT INTO activity_log (id, at, entity, entity_id, action, summary, details, user_id)
         VALUES ($id, $at, 'test', NULL, 'x', 'y', NULL, $user)`,
        { $id: `act-${index}`, $at: `2026-01-0${index + 1}T00:00:00.000Z`, $user: ACTOR_USER_ID }
      )
    }
    expect(Number(trimActivityLog(ctx.db, 2))).toBe(3)
    const remaining = listRecentActivity(ctx.db, 10)
    expect(remaining.length).toBe(2)
    expect(remaining.map((entry) => entry.id)).toEqual(['act-4', 'act-3'])
    ctx.close()
  })
})
