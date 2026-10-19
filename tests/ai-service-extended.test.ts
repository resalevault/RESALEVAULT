import { describe, expect, it } from 'vitest'
import { AppError } from '@main/errors'
import {
  AiProviderError,
  type FetchLike
} from '@main/services/ai/providers'
import { AiService, createInsecureTestStore } from '@main/services/ai/service'
import { createTestContext } from './helpers'

/**
 * AI Studio (gestion): conexiones, rutas, precios y seleccion de destino. Aqui
 * vive el dinero que se gasta en el proveedor y la clave que no debe salir.
 */
function fakeResponse(body: unknown, status = 200): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => JSON.stringify(body)
  }
}

function build(): {
  ctx: ReturnType<typeof createTestContext>
  product: ReturnType<ReturnType<typeof createTestContext>['repos']['products']['create']>
  service: AiService
  calls: Array<{ url: string; body: string }>
} {
  const ctx = createTestContext()
  const product = ctx.repos.products.create({
    name: 'Articulo IA',
    categoryId: 'cat-ropa-camisetas',
    purchasePriceCents: 1000,
    acquisitionFeesCents: 200,
    expectedSalePriceCents: 3000,
    tags: ['verano']
  })
  const calls: Array<{ url: string; body: string }> = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body ?? '' })
    return fakeResponse({
      candidates: [{ content: { parts: [{ text: 'Hola' }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 }
    })
  }
  const service = new AiService(ctx.db, ctx.repos.products, {
    secrets: createInsecureTestStore(),
    fetchImpl
  })
  return { ctx, product, service, calls }
}

async function rejectCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof AiProviderError) return error.code
    throw error
  }
  throw new Error('Se esperaba un rechazo')
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    if (error instanceof AiProviderError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio')
}

describe('AI Studio: gestion de conexiones', () => {
  it('update cambia los campos y vuelve a cifrar la clave si se pide', () => {
    const { ctx, service } = build()
    const connection = service.createConnection({
      provider: 'gemini',
      label: 'Original',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })

    const updated = service.updateConnection(connection.id, {
      label: 'Nueva',
      defaultModel: 'gemini-pro',
      baseUrl: 'https://proxy.local',
      active: false,
      secret: 'AIzaSyNUEVA98765'
    })
    expect(updated.label).toBe('Nueva')
    expect(updated.defaultModel).toBe('gemini-pro')
    expect(updated.baseUrl).toBe('https://proxy.local')
    expect(updated.active).toBe(false)
    expect(updated.secretHint).toBe('••••8765')

    // Sin cambios: sigue igual.
    expect(service.updateConnection(connection.id, {}).label).toBe('Nueva')
    expect(codeOf(() => service.updateConnection('00000000-0000-4000-8000-000000000000', { label: 'x' }))).toBe(
      'not_found'
    )
    ctx.close()
  })

  it('remove borra la conexion y avisa si no existe', () => {
    const { ctx, service } = build()
    const connection = service.createConnection({ provider: 'openai', secret: 'sk-1234567890' })
    expect(service.removeConnection(connection.id)).toEqual({ affected: 1 })
    expect(service.listConnections().length).toBe(0)
    expect(codeOf(() => service.removeConnection(connection.id))).toBe('not_found')
    ctx.close()
  })
})

describe('AI Studio: seleccion de destino y generacion', () => {
  it('exige un modelo cuando la conexion no define ninguno', async () => {
    const { ctx, service } = build()
    const connection = service.createConnection({ provider: 'gemini', secret: 'AIzaSyCLAVE12345' })
    expect(await rejectCode(service.generate({ task: 'title', connectionId: connection.id }))).toBe('model_not_found')
    ctx.close()
  })

  it('no usa una conexion desactivada', async () => {
    const { ctx, service } = build()
    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })
    service.updateConnection(connection.id, { active: false })
    expect(await rejectCode(service.generate({ task: 'title', connectionId: connection.id }))).toBe('disabled_by_user')
    ctx.close()
  })

  it('usa la ruta configurada y, si no hay, la primera conexion activa', async () => {
    const { ctx, service, calls } = build()
    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })

    service.setRoute('title', connection.id, 'gemini-flash')
    expect(service.routes().title?.connectionId).toBe(connection.id)

    const byRoute = await service.generate({ task: 'title' })
    expect(byRoute.text).toBe('Hola')
    expect(calls.length).toBe(1)

    const byFallback = await service.generate({ task: 'description' })
    expect(byFallback.provider).toBe('gemini')
    ctx.close()
  })

  it('sin conexiones da un error de configuracion, no una respuesta falsa', async () => {
    const { ctx, service } = build()
    expect(await rejectCode(service.generate({ task: 'title' }))).toBe('not_configured')
    ctx.close()
  })

  it('una conexion sin clave utilizable se rechaza', async () => {
    const { ctx, service } = build()
    ctx.db.run(
      `INSERT INTO ai_connections (id, provider, label, secret_cipher, secret_hint, base_url,
         default_model, active, created_at, updated_at)
       VALUES ($id, 'gemini', 'rota', '', '', '', 'gemini-flash', 1, $at, $at)`,
      { $id: '00000000-0000-4000-8000-0000000000cc', $at: '2026-01-01T00:00:00.000Z' }
    )
    expect(await rejectCode(service.generate({ task: 'title', connectionId: '00000000-0000-4000-8000-0000000000cc' }))).toBe(
      'missing_key'
    )
    ctx.close()
  })

  it('genera con la ficha del articulo y no se rompe con un margen corrupto', async () => {
    const { ctx, service, product } = build()
    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })

    // Margen valido, de tipo incorrecto y JSON corrupto: en todos los casos debe generar.
    for (const value of [JSON.stringify(30), JSON.stringify('x'), 'no-json']) {
      ctx.db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES ('finance.targetMarginPercent', $v, $at)
         ON CONFLICT(key) DO UPDATE SET value = $v, updated_at = $at`,
        { $v: value, $at: '2026-01-01T00:00:00.000Z' }
      )
      const result = await service.generate({ task: 'description', connectionId: connection.id, productId: product.id })
      expect(result.text).toBe('Hola')
    }
    ctx.close()
  })
})

describe('AI Studio: precios y flujos', () => {
  it('guarda precios por modelo y los devuelve ordenados', () => {
    const { ctx, service } = build()
    service.setPrice({ provider: 'gemini', model: 'gemini-flash', inputPerMillionMicros: 100_000, outputPerMillionMicros: 200_000 })
    service.setPrice({ provider: 'openai', model: 'gpt-x', inputPerMillionMicros: -5, outputPerMillionMicros: 1.7 })

    const prices = service.prices()
    expect(prices.length).toBe(2)
    const gemini = prices.find((price) => price.model === 'gemini-flash')
    expect(gemini?.inputPerMillionMicros).toBe(100_000)
    const openai = prices.find((price) => price.model === 'gpt-x')
    expect(openai?.inputPerMillionMicros).toBe(0)
    expect(openai?.outputPerMillionMicros).toBe(2)

    // Al repetir, se actualiza en lugar de duplicar.
    service.setPrice({ provider: 'gemini', model: 'gemini-flash', inputPerMillionMicros: 1, outputPerMillionMicros: 1 })
    expect(service.prices().length).toBe(2)
    ctx.close()
  })

  it('estima el flujo multiple y exige confirmacion', () => {
    const { ctx, service } = build()
    const estimate = service.estimateFlow({
      products: 2,
      steps: 3,
      averageInputTokens: 100,
      averageOutputTokens: 50,
      inputPerMillionMicros: 1_000_000,
      outputPerMillionMicros: 2_000_000
    })
    expect(estimate.estimatedCalls).toBe(6)
    expect(estimate.estimatedInputTokens).toBe(600)
    expect(estimate.requiresConfirmation).toBe(true)
    expect(estimate.estimatedCostMicros).toBeGreaterThan(0)
    ctx.close()
  })

  it('expone la lista de tareas disponibles', () => {
    const { ctx, service } = build()
    const tasks = service.tasks()
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks).toContain('title')
    ctx.close()
  })

  it('rechaza una clave demasiado corta', () => {
    const { ctx, service } = build()
    expect(codeOf(() => service.createConnection({ provider: 'gemini', secret: '123' }))).toBe('invalid_input')
    ctx.close()
  })

  it('exige modelo tambien cuando viene de una ruta o de la conexion de reserva', async () => {
    const { ctx, service } = build()
    const connection = service.createConnection({ provider: 'gemini', secret: 'AIzaSyCLAVE12345' })

    service.setRoute('title', connection.id, '')
    expect(await rejectCode(service.generate({ task: 'title' }))).toBe('model_not_found')
    expect(await rejectCode(service.generate({ task: 'description' }))).toBe('model_not_found')
    ctx.close()
  })
})
