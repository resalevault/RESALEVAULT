import { describe, expect, it } from 'vitest'
import {
  AiProviderError,
  createAnthropicAdapter,
  createGeminiAdapter,
  createOpenAiAdapter,
  estimateCostMicros,
  mapHttpError,
  type FetchLike
} from '@main/services/ai/providers'
import { buildPrompt, extractJson, parseStructured } from '@main/services/ai/prompts'
import { AiService, createInsecureTestStore } from '@main/services/ai/service'
import { createTestContext } from './helpers'

/** Respuesta HTTP falsa. */
function fakeResponse(body: unknown, status = 200): Awaited<ReturnType<FetchLike>> {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    text: async () => text
  }
}

function recordingFetch(
  responder: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Awaited<ReturnType<FetchLike>>
): { fetchImpl: FetchLike; calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> } {
  const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return responder(url, init)
    }
  }
}

describe('adaptadores de proveedor', () => {
  it('Gemini lista modelos y descarta los que no generan contenido', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      fakeResponse({
        models: [
          { name: 'models/gemini-flash', displayName: 'Gemini Flash', inputTokenLimit: 1000, supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-1', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] }
        ]
      })
    )

    const models = await createGeminiAdapter(fetchImpl).listModels({ apiKey: 'k-12345678', baseUrl: '' })

    expect(models).toHaveLength(1)
    expect(models[0]?.id).toBe('gemini-flash')
    expect(models[0]?.inputTokenLimit).toBe(1000)
    // La clave viaja en la cabecera, nunca en la URL.
    expect(calls[0]?.url).not.toContain('k-12345678')
    expect(calls[0]?.init?.headers?.['x-goog-api-key']).toBe('k-12345678')
  })

  it('Gemini construye la peticion de generacion con sistema y contenido', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      fakeResponse({
        candidates: [{ content: { parts: [{ text: 'Hola' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 }
      })
    )

    const result = await createGeminiAdapter(fetchImpl).chat(
      { apiKey: 'k-12345678', baseUrl: '' },
      { model: 'gemini-flash', system: 'SISTEMA', user: 'USUARIO' }
    )

    expect(result).toEqual({ text: 'Hola', inputTokens: 12, outputTokens: 3 })
    expect(calls[0]?.url).toContain('/v1beta/models/gemini-flash:generateContent')
    const body = JSON.parse(calls[0]?.init?.body ?? '{}') as Record<string, unknown>
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SISTEMA' }] })
  })

  it('OpenAI usa Authorization y lee el consumo', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      fakeResponse({
        choices: [{ message: { content: 'Texto' } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 }
      })
    )

    const result = await createOpenAiAdapter(fetchImpl).chat(
      { apiKey: 'sk-test-1234', baseUrl: '' },
      { model: 'gpt-x', system: 'S', user: 'U' }
    )

    expect(result.text).toBe('Texto')
    expect(result.outputTokens).toBe(8)
    expect(calls[0]?.url).toContain('/v1/chat/completions')
    expect(calls[0]?.init?.headers?.Authorization).toBe('Bearer sk-test-1234')
  })

  it('Anthropic declara la version de API y usa un campo system aparte', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      fakeResponse({
        content: [{ type: 'text', text: 'Hola desde Claude' }],
        usage: { input_tokens: 11, output_tokens: 4 }
      })
    )

    const result = await createAnthropicAdapter(fetchImpl).chat(
      { apiKey: 'sk-ant-1234', baseUrl: '' },
      { model: 'claude-x', system: 'SISTEMA', user: 'USUARIO' }
    )

    expect(result.text).toBe('Hola desde Claude')
    expect(result.inputTokens).toBe(11)
    expect(calls[0]?.init?.headers?.['x-api-key']).toBe('sk-ant-1234')
    expect(calls[0]?.init?.headers?.['anthropic-version']).toBeTruthy()
    const body = JSON.parse(calls[0]?.init?.body ?? '{}') as Record<string, unknown>
    expect(body.system).toBe('SISTEMA')
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('respeta una URL base propia', async () => {
    const { fetchImpl, calls } = recordingFetch(() => fakeResponse({ data: [] }))
    await createOpenAiAdapter(fetchImpl).listModels({ apiKey: 'k', baseUrl: 'https://proxy.local/' })
    expect(calls[0]?.url).toBe('https://proxy.local/v1/models')
  })
})

describe('mapeo de errores del proveedor', () => {
  it('traduce los codigos HTTP a codigos propios', () => {
    expect(mapHttpError(401, '').code).toBe('invalid_key')
    expect(mapHttpError(403, '').code).toBe('invalid_key')
    expect(mapHttpError(404, '').code).toBe('model_not_found')
    expect(mapHttpError(413, '').code).toBe('too_large')
    expect(mapHttpError(429, 'rate limit').code).toBe('rate_limited')
    expect(mapHttpError(429, 'quota exceeded').code).toBe('quota_exceeded')
    expect(mapHttpError(500, '').code).toBe('provider_error')
    expect(mapHttpError(503, '').code).toBe('provider_error')
  })

  it('no filtra el cuerpo del proveedor en el mensaje', () => {
    const error = mapHttpError(500, 'sk-secret-key leaked in body')
    expect(error.message).toBe('provider_error')
    expect(error.message).not.toContain('sk-secret')
  })

  it('un fallo de red se convierte en network_error', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    await expect(
      createGeminiAdapter(fetchImpl).listModels({ apiKey: 'k-12345678', baseUrl: '' })
    ).rejects.toMatchObject({ code: 'network_error' })
  })

  it('un timeout se convierte en timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      const error = new Error('aborted')
      error.name = 'TimeoutError'
      throw error
    }
    await expect(
      createGeminiAdapter(fetchImpl).chat({ apiKey: 'k-12345678', baseUrl: '' }, { model: 'm', system: 's', user: 'u' })
    ).rejects.toMatchObject({ code: 'timeout' })
  })
})

describe('estimacion de coste', () => {
  it('calcula el coste en millonésimas con enteros', () => {
    // 1.000.000 tokens de entrada a 2 unidades por millon = 2 unidades = 2.000.000 micros
    expect(estimateCostMicros(1_000_000, 0, 2_000_000, 0)).toBe(2_000_000)
    expect(estimateCostMicros(0, 500_000, 0, 4_000_000)).toBe(2_000_000)
    expect(estimateCostMicros(1000, 1000, 0, 0)).toBe(0)
  })
})

describe('construccion de prompts', () => {
  const product = {
    name: 'Sudadera',
    description: 'Sudadera negra con capucha',
    sku: 'RV-SUD-1',
    brand: 'MarcaX',
    model: '',
    size: 'L',
    color: 'Negro',
    condition: 'good',
    categoryName: 'Sudaderas',
    attributes: { material: 'algodon' },
    expectedSalePriceCents: 3800,
    totalCostCents: 1150,
    tags: ['invierno']
  }

  it('el prompt de titulo pide una linea y prohibe inventar', () => {
    const prompt = buildPrompt('title', product, { language: 'es' })
    expect(prompt.output).toBe('text')
    expect(prompt.system).toContain('No inventes')
    expect(prompt.user).toContain('Sudadera')
    expect(prompt.user).toContain('espanol')
    expect(prompt.user.toLowerCase()).toContain('solo el titulo')
  })

  it('el prompt de precio reconoce que no tiene precios de mercado', () => {
    const prompt = buildPrompt('price_suggestion', product, { targetMarginPercent: 30 })
    expect(prompt.output).toBe('json')
    expect(prompt.user).toContain('NO tienes acceso a precios de mercado')
    expect(prompt.user).toContain('Coste total: 11.50')
    expect(prompt.user).toContain('Margen objetivo: 30')
    expect(prompt.user).toContain('No inventes comparaciones')
  })

  it('incluye las indicaciones adicionales del usuario', () => {
    const prompt = buildPrompt('description', product, { instruction: 'tono divertido' })
    expect(prompt.user).toContain('tono divertido')
  })

  it('traduce el nombre del idioma y acepta codigos desconocidos', () => {
    expect(buildPrompt('translation', product, { language: 'en' }).user).toContain('ingles')
    expect(buildPrompt('translation', product, { language: 'ja' }).user).toContain('ja')
  })

  it('las tareas estructuradas piden JSON', () => {
    for (const task of ['classification', 'attributes', 'keywords', 'review'] as const) {
      expect(buildPrompt(task, product).output).toBe('json')
    }
  })
})

describe('interpretacion de la respuesta', () => {
  it('extrae JSON aunque venga con texto alrededor', () => {
    expect(parseStructured('Claro:\n{"a":"b"}\nEspero que sirva', 'json').structured).toEqual({ a: 'b' })
  })

  it('extrae JSON de un bloque de codigo', () => {
    expect(parseStructured('```json\n{"category":"Ropa"}\n```', 'json').structured).toEqual({
      category: 'Ropa'
    })
  })

  it('respeta las llaves dentro de cadenas', () => {
    expect(extractJson('{"text":"contiene } y { dentro"}')).toBe('{"text":"contiene } y { dentro"}')
  })

  it('devuelve el texto si no hay JSON valido', () => {
    const result = parseStructured('no hay json aqui', 'json')
    expect(result.structured).toBeUndefined()
    expect(result.text).toBe('no hay json aqui')
  })

  it('las tareas de texto no se intentan estructurar', () => {
    const result = parseStructured('{"a":"b"}', 'text')
    expect(result.structured).toBeUndefined()
  })
})

describe('servicio de AI Studio', () => {
  function build(options: { responder: Parameters<typeof recordingFetch>[0] }) {
    const ctx = createTestContext()
    const product = ctx.repos.products.create({
      name: 'Articulo IA',
      purchasePriceCents: 1000,
      expectedSalePriceCents: 3000
    })
    const recorder = recordingFetch(options.responder)
    const service = new AiService(ctx.db, ctx.repos.products, {
      secrets: createInsecureTestStore(),
      fetchImpl: recorder.fetchImpl
    })
    return { ctx, product, service, recorder }
  }

  it('guarda la clave cifrada y solo devuelve una pista', () => {
    const { ctx, service } = build({ responder: () => fakeResponse({}) })

    const connection = service.createConnection({ provider: 'gemini', secret: 'AIzaSyCLAVE12345' })

    expect(connection.hasSecret).toBe(true)
    expect(connection.secretHint).toBe('••••2345')
    // La vista publica no contiene ningun campo con la clave.
    expect(JSON.stringify(connection)).not.toContain('AIzaSyCLAVE12345')

    // En la base de datos solo hay el blob cifrado (base64 en el almacen de prueba).
    const raw = ctx.db.scalar<string>('SELECT secret_cipher FROM ai_connections')
    expect(raw).not.toContain('AIzaSyCLAVE12345')
    expect(raw).toBe(Buffer.from('AIzaSyCLAVE12345').toString('base64'))

    ctx.close()
  })

  it('prueba la conexion y guarda el resultado', async () => {
    const { service } = build({
      responder: () => fakeResponse({ models: [{ name: 'models/gemini-flash', supportedGenerationMethods: ['generateContent'] }] })
    })
    const connection = service.createConnection({ provider: 'gemini', secret: 'AIzaSyCLAVE12345' })

    const result = await service.testConnection(connection.id)
    expect(result.ok).toBe(true)
    expect(result.modelCount).toBe(1)

    const updated = service.listConnections()[0]
    expect(updated?.lastOkAt).not.toBeNull()
    expect(updated?.lastError).toBeNull()
  })

  it('guarda el CODIGO del error, no el mensaje del proveedor', async () => {
    const { service } = build({ responder: () => fakeResponse({ error: 'sk-secret' }, 401) })
    const connection = service.createConnection({ provider: 'openai', secret: 'sk-secret-1234' })

    const result = await service.testConnection(connection.id)
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('invalid_key')

    const updated = service.listConnections()[0]
    expect(updated?.lastError).toBe('invalid_key')
    expect(JSON.stringify(updated)).not.toContain('sk-secret')
  })

  it('genera texto y registra el consumo con el precio configurado', async () => {
    const { ctx, product, service } = build({
      responder: () =>
        fakeResponse({
          candidates: [{ content: { parts: [{ text: 'Sudadera negra talla L' }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 }
        })
    })

    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })
    service.setPrice({ provider: 'gemini', model: 'gemini-flash', inputPerMillionMicros: 1_000_000, outputPerMillionMicros: 2_000_000 })

    const result = await service.generate({ task: 'title', productId: product.id, connectionId: connection.id })

    expect(result.text).toContain('Sudadera')
    expect(result.outputTokens).toBe(20)
    // 100 * 1 + 20 * 2 = 140 micros
    expect(result.costMicros).toBe(140)

    const usage = service.usage()
    expect(usage.totalCalls).toBe(1)
    expect(usage.totalCostMicros).toBe(140)
    expect(usage.recent[0]?.ok).toBe(true)
    ctx.close()
  })

  it('registra tambien las llamadas fallidas', async () => {
    const { ctx, product, service } = build({ responder: () => fakeResponse({}, 429) })
    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })

    await expect(
      service.generate({ task: 'title', productId: product.id, connectionId: connection.id })
    ).rejects.toBeInstanceOf(AiProviderError)

    const usage = service.usage()
    expect(usage.totalCalls).toBe(1)
    expect(usage.recent[0]?.ok).toBe(false)
    expect(usage.recent[0]?.error).toBe('rate_limited')
    ctx.close()
  })

  it('usa la ruta configurada cuando no se indica conexion', async () => {
    const { ctx, product, service } = build({
      responder: () => fakeResponse({ choices: [{ message: { content: 'ok' } }], usage: {} })
    })
    const connection = service.createConnection({
      provider: 'openai',
      secret: 'sk-test-1234',
      defaultModel: 'gpt-x'
    })
    service.setRoute('description', connection.id, 'gpt-x')

    const result = await service.generate({ task: 'description', productId: product.id })
    expect(result.provider).toBe('openai')
    expect(result.text).toBe('ok')
    ctx.close()
  })

  it('sin conexiones da un error de configuracion, no una respuesta falsa', async () => {
    const { ctx, product, service } = build({ responder: () => fakeResponse({}) })
    await expect(service.generate({ task: 'title', productId: product.id })).rejects.toMatchObject({
      code: 'not_configured'
    })
    ctx.close()
  })

  it('rechaza imagenes no admitidas y en exceso', async () => {
    const { ctx, product, service } = build({ responder: () => fakeResponse({}) })
    const connection = service.createConnection({
      provider: 'gemini',
      secret: 'AIzaSyCLAVE12345',
      defaultModel: 'gemini-flash'
    })

    await expect(
      service.generate({
        task: 'description',
        productId: product.id,
        connectionId: connection.id,
        images: [{ mimeType: 'application/pdf', base64: 'x' }]
      })
    ).rejects.toMatchObject({ code: 'unsupported_file' })

    await expect(
      service.generate({
        task: 'description',
        productId: product.id,
        connectionId: connection.id,
        images: Array.from({ length: 5 }, () => ({ mimeType: 'image/png', base64: 'x' }))
      })
    ).rejects.toMatchObject({ code: 'too_large' })
    ctx.close()
  })

  it('estima el coste de un flujo multiple y exige confirmacion', () => {
    const { ctx, service } = build({ responder: () => fakeResponse({}) })
    const estimate = service.estimateFlow({
      products: 20,
      steps: 3,
      averageInputTokens: 500,
      averageOutputTokens: 200,
      inputPerMillionMicros: 1_000_000,
      outputPerMillionMicros: 2_000_000
    })

    expect(estimate.estimatedCalls).toBe(60)
    expect(estimate.requiresConfirmation).toBe(true)
    // 60*500 = 30.000 tokens entrada; 60*200 = 12.000 salida
    // 30000*1 + 12000*2 = 30.000 + 24.000 = 54.000 micros
    expect(estimate.estimatedCostMicros).toBe(54_000)
    ctx.close()
  })

  it('no permite crear una conexion sin almacen de secretos disponible', () => {
    const ctx = createTestContext()
    const service = new AiService(ctx.db, ctx.repos.products, {
      secrets: { ...createInsecureTestStore(), available: () => false },
      fetchImpl: async () => fakeResponse({})
    })

    expect(() => service.createConnection({ provider: 'gemini', secret: 'AIzaSyCLAVE12345' })).toThrow()
    ctx.close()
  })
})
