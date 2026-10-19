import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto'
import { join } from 'node:path'
import { IntelligenceService } from '@main/services/intelligence'
import { LicenseService, verifyLicenseCode } from '@main/services/license'
import { PLAN_LIMITS } from '@shared/plans'
import { createTestContext, daysAgoIso } from './helpers'

describe('inteligencia: reglas locales', () => {
  it('detecta articulos que se venderian con perdidas', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({
      name: 'Perdida',
      purchasePriceCents: 2000,
      acquisitionFeesCents: 500,
      expectedSalePriceCents: 1500,
      status: 'available'
    })

    const report = new IntelligenceService(ctx.db).report()
    const insight = report.insights.find((entry) => entry.ruleId === 'negative_margin')

    expect(insight).toBeDefined()
    expect(insight?.severity).toBe('critical')
    // La alerta declara los datos exactos en los que se basa.
    expect(insight?.facts.length).toBeGreaterThan(0)
    expect(insight?.facts.some((fact) => fact.labelKey === 'product.totalCost')).toBe(true)
    ctx.close()
  })

  it('detecta stock estancado segun el umbral configurado', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({
      name: 'Antiguo',
      purchaseDate: daysAgoIso(120),
      purchasePriceCents: 1000,
      expectedSalePriceCents: 3000,
      status: 'available'
    })

    const service = new IntelligenceService(ctx.db)
    service.setThresholds({ staleDays: 90 })
    const report = service.report()

    expect(report.insights.some((entry) => entry.ruleId === 'stale_stock')).toBe(true)
    expect(report.thresholds.staleDays).toBe(90)

    // Con un umbral mayor, el articulo deja de aparecer.
    service.setThresholds({ staleDays: 200 })
    expect(service.report().insights.some((entry) => entry.ruleId === 'stale_stock')).toBe(false)
    ctx.close()
  })

  it('permite descartar una alerta y deja de aparecer', () => {
    const ctx = createTestContext()
    ctx.repos.products.create({
      name: 'Perdida',
      purchasePriceCents: 2000,
      expectedSalePriceCents: 1000,
      status: 'available'
    })

    const service = new IntelligenceService(ctx.db)
    const first = service.report()
    const insight = first.insights.find((entry) => entry.ruleId === 'negative_margin')
    expect(insight).toBeDefined()

    service.dismiss({ key: insight?.key as string, ruleId: 'negative_margin' })
    const second = service.report()
    expect(second.insights.some((entry) => entry.ruleId === 'negative_margin')).toBe(false)

    // Y se puede recuperar.
    service.restore(insight?.key as string)
    expect(service.report().insights.some((entry) => entry.ruleId === 'negative_margin')).toBe(true)
    ctx.close()
  })

  it('avisa cuando el inventario esta vacio', () => {
    const ctx = createTestContext()
    const report = new IntelligenceService(ctx.db).report()
    expect(report.insights.some((entry) => entry.ruleId === 'inventory_empty')).toBe(true)
    ctx.close()
  })

  it('detecta pedidos sin enviar', () => {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({
      name: 'Vendido',
      purchasePriceCents: 100,
      expectedSalePriceCents: 500,
      status: 'available'
    })
    ctx.repos.orders.create({ soldAt: daysAgoIso(20), items: [{ productId: product.id, unitPriceCents: 500 }] })

    const report = new IntelligenceService(ctx.db).report()
    expect(report.insights.some((entry) => entry.ruleId === 'pending_orders')).toBe(true)
    ctx.close()
  })
})

describe('licencias: firma Ed25519', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

  function issue(payload: Record<string, unknown>, key = privateKey): string {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8')
    const signature = sign(null, raw, key)
    return `${raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${signature
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`
  }

  const payload = {
    v: 1,
    id: 'lic_test_1',
    plan: 'pro',
    kind: 'perpetual',
    holder: 'Prueba',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    seats: 1
  }

  it('acepta una licencia firmada correctamente', () => {
    const result = verifyLicenseCode(issue(payload), publicBase64)
    expect(result.ok).toBe(true)
    expect(result.payload?.plan).toBe('pro')
  })

  it('rechaza un payload manipulado', () => {
    const code = issue(payload)
    const [payloadPart, signaturePart] = code.split('.')
    const tampered = Buffer.from(
      JSON.stringify({ ...payload, plan: 'business' }),
      'utf8'
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const result = verifyLicenseCode(`${tampered}.${signaturePart}`, publicBase64)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bad_signature')
    void payloadPart
  })

  it('rechaza una firma de otra clave', () => {
    const other = generateKeyPairSync('ed25519')
    const result = verifyLicenseCode(issue(payload, other.privateKey), publicBase64)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('bad_signature')
  })

  it('rechaza versiones de formato desconocidas', () => {
    const result = verifyLicenseCode(issue({ ...payload, v: 99 }), publicBase64)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unsupported_version')
  })

  it('rechaza licencias caducadas', () => {
    const result = verifyLicenseCode(
      issue({ ...payload, expiresAt: '2020-01-01T00:00:00.000Z' }),
      publicBase64
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('rechaza codigos malformados', () => {
    expect(verifyLicenseCode('sin-punto', publicBase64).reason).toBe('malformed')
    expect(verifyLicenseCode('', publicBase64).reason).toBe('malformed')
    expect(verifyLicenseCode('abc.', publicBase64).reason).toBe('malformed')
  })

  it('la clave publica incluida en la app corresponde a la privada del proyecto', () => {
    const privateFile = join(process.cwd(), 'tools', 'keys', 'license-private.pem')
    if (!existsSync(privateFile)) {
      // La clave privada no esta versionada: la prueba se omite con elegancia.
      expect(true).toBe(true)
      return
    }

    const realPrivate = readFileSync(privateFile, 'utf8')
    const code = issue(payload, createPrivateKey(realPrivate))
    // Se verifica con la clave PUBLICA que viaja en el programa.
    expect(verifyLicenseCode(code).ok).toBe(true)
  })
})

describe('licencias: estado y limites', () => {
  it('sin licencia, el plan es Free y se informa', () => {
    const ctx = createTestContext()
    const state = new LicenseService(ctx.db).state()

    expect(state.plan).toBe('free')
    expect(state.status).toBe('inactive')
    expect(state.signatureValid).toBe(false)
    expect(state.limits).toEqual(PLAN_LIMITS.free)
    expect(state.deviceId.length).toBeGreaterThan(10)
    ctx.close()
  })

  it('el identificador de equipo es estable', () => {
    const ctx = createTestContext()
    const service = new LicenseService(ctx.db)
    const first = service.deviceId()
    const second = service.deviceId()
    expect(first).toBe(second)
    ctx.close()
  })

  it('aplica los limites del plan Free', () => {
    const ctx = createTestContext()
    const service = new LicenseService(ctx.db)

    expect(service.can('analytics')).toBe(false)
    expect(service.can('media')).toBe(true)
    expect(service.canWithin('maxProducts', 149)).toBe(true)
    expect(service.canWithin('maxProducts', 150)).toBe(false)
    ctx.close()
  })

  it('rechaza un codigo invalido al activar', () => {
    const ctx = createTestContext()
    const service = new LicenseService(ctx.db)
    expect(() => service.activate({ code: 'basura.invalida' })).toThrow()
    ctx.close()
  })

  it('el plan Business no limita el numero de articulos', () => {
    expect(PLAN_LIMITS.business.maxProducts).toBe(-1)
    expect(PLAN_LIMITS.pro.maxProducts).toBe(20000)
    expect(PLAN_LIMITS.free.maxProducts).toBe(150)
  })

  it('el plan Free no incluye analitica ni IA pero si el ciclo de venta', () => {
    expect(PLAN_LIMITS.free.analytics).toBe(false)
    expect(PLAN_LIMITS.free.aiStudio).toBe(false)
    expect(PLAN_LIMITS.free.purchases).toBe(true)
    expect(PLAN_LIMITS.free.orders).toBe(true)
    expect(PLAN_LIMITS.free.multiUser).toBe(false)
  })
})
