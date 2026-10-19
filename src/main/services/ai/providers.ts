/**
 * RESALEVAULT - Adaptadores de proveedor de IA.
 *
 * Cada proveedor tiene su propia forma de autenticar y de devolver tokens, pero
 * todos se exponen con la MISMA interfaz. Asi el resto del programa no sabe si
 * esta hablando con Gemini, OpenAI o Claude.
 *
 * Notas de implementacion honestas:
 *  - Las rutas y cabeceras siguen la documentacion oficial consultada
 *    (Gemini `v1beta/models` + `x-goog-api-key`; OpenAI `/v1/chat/completions` +
 *    `Authorization`; Anthropic `/v1/messages` + `x-api-key` y
 *    `anthropic-version`).
 *  - **Los nombres de modelo NO se codifican aqui**: se consultan al proveedor,
 *    porque cambian en semanas.
 *  - `fetch` se inyecta para poder probar la construccion de peticiones y el
 *    mapeo de errores sin red y sin claves.
 */

import type { AiErrorCode, AiModelInfo, AiProvider } from '@shared/types-modules'

/** Version de la API de Anthropic que se declara en las cabeceras. */
export const ANTHROPIC_VERSION = '2023-06-01'

/** Limites defensivos: una respuesta de IA no debe colgar la app ni disparar el coste. */
export const AI_LIMITS = {
  timeoutMs: 45_000,
  maxOutputTokens: 1600,
  maxImages: 4,
  maxImageBytes: 6 * 1024 * 1024
} as const

export interface ProviderCredentials {
  apiKey: string
  /** URL base opcional (proxy propio o endpoint regional). */
  baseUrl: string
}

export interface ChatRequest {
  model: string
  system: string
  user: string
  images?: Array<{ mimeType: string; base64: string }>
  maxOutputTokens?: number
  temperature?: number
}

export interface ChatResponse {
  text: string
  inputTokens: number
  outputTokens: number
}

export interface ProviderAdapter {
  listModels(credentials: ProviderCredentials): Promise<AiModelInfo[]>
  chat(credentials: ProviderCredentials, request: ChatRequest): Promise<ChatResponse>
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  }
) => Promise<{
  ok: boolean
  status: number
  statusText?: string
  text(): Promise<string>
}>

/** Error normalizado: el resto del programa solo entiende estos codigos. */
export class AiProviderError extends Error {
  readonly code: AiErrorCode
  readonly status: number | null
  readonly detail: string | null

  constructor(code: AiErrorCode, status: number | null = null, detail: string | null = null) {
    super(code)
    this.name = 'AiProviderError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

function trimBase(baseUrl: string | undefined, fallback: string): string {
  const value = (baseUrl ?? '').trim()
  if (!value) return fallback
  return value.replace(/\/+$/, '')
}

/**
 * Traduce una respuesta HTTP a un codigo propio.
 * Se evita devolver el cuerpo del proveedor tal cual: puede contener detalles
 * internos o incluso parte de la clave en algunos mensajes de error.
 */
export function mapHttpError(status: number, body: string): AiProviderError {
  const lower = body.toLowerCase()

  if (status === 401 || status === 403) return new AiProviderError('invalid_key', status, 'unauthorized')
  if (status === 404) return new AiProviderError('model_not_found', status, 'not_found')
  if (status === 413) return new AiProviderError('too_large', status, 'payload_too_large')
  if (status === 429) {
    if (lower.includes('quota') || lower.includes('exceeded')) {
      return new AiProviderError('quota_exceeded', status, 'quota')
    }
    return new AiProviderError('rate_limited', status, 'rate_limited')
  }
  if (status >= 500) return new AiProviderError('provider_error', status, 'server_error')
  return new AiProviderError('provider_error', status, 'http_' + status)
}

/** Envuelve `fetch` con timeout y traduccion de fallos de red. */
async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  timeoutMs = AI_LIMITS.timeoutMs
): Promise<unknown> {
  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AiProviderError('timeout', null, 'timeout')
    }
    throw new AiProviderError('network_error', null, 'network')
  }

  const text = await response.text()

  if (!response.ok) throw mapHttpError(response.status, text)

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AiProviderError('provider_error', response.status, 'invalid_json')
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com'

export function createGeminiAdapter(fetchImpl: FetchLike): ProviderAdapter {
  return {
    async listModels(credentials) {
      const base = trimBase(credentials.baseUrl, GEMINI_DEFAULT_BASE)
      const data = (await requestJson(fetchImpl, `${base}/v1beta/models`, {
        method: 'GET',
        headers: { 'x-goog-api-key': credentials.apiKey }
      })) as { models?: Array<Record<string, unknown>> }

      const models = Array.isArray(data.models) ? data.models : []
      return models
        .filter((model) => {
          const methods = model.supportedGenerationMethods
          return !Array.isArray(methods) || (methods as string[]).includes('generateContent')
        })
        .map((model) => ({
          id: String(model.name ?? '').replace(/^models\//, ''),
          displayName: String(model.displayName ?? model.name ?? ''),
          inputTokenLimit: typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : null,
          outputTokenLimit: typeof model.outputTokenLimit === 'number' ? model.outputTokenLimit : null
        }))
        .filter((model) => model.id.length > 0)
    },

    async chat(credentials, request) {
      const base = trimBase(credentials.baseUrl, GEMINI_DEFAULT_BASE)
      const model = request.model.replace(/^models\//, '')

      const parts: Array<Record<string, unknown>> = [{ text: request.user }]
      for (const image of request.images ?? []) {
        parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } })
      }

      const data = (await requestJson(
        fetchImpl,
        `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': credentials.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: request.temperature ?? 0.7,
              maxOutputTokens: request.maxOutputTokens ?? AI_LIMITS.maxOutputTokens
            }
          })
        }
      )) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      }

      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim()

      return {
        text,
        inputTokens: numberOrZero(data.usageMetadata?.promptTokenCount),
        outputTokens: numberOrZero(data.usageMetadata?.candidatesTokenCount)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

const OPENAI_DEFAULT_BASE = 'https://api.openai.com'

export function createOpenAiAdapter(fetchImpl: FetchLike): ProviderAdapter {
  return {
    async listModels(credentials) {
      const base = trimBase(credentials.baseUrl, OPENAI_DEFAULT_BASE)
      const data = (await requestJson(fetchImpl, `${base}/v1/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${credentials.apiKey}` }
      })) as { data?: Array<{ id?: string }> }

      return (Array.isArray(data.data) ? data.data : [])
        .map((model) => ({
          id: String(model.id ?? ''),
          displayName: String(model.id ?? ''),
          inputTokenLimit: null,
          outputTokenLimit: null
        }))
        .filter((model) => model.id.length > 0)
    },

    async chat(credentials, request) {
      const base = trimBase(credentials.baseUrl, OPENAI_DEFAULT_BASE)

      // Con imagenes se usa el formato multimodal de contenido.
      const userContent =
        request.images && request.images.length > 0
          ? [
              { type: 'text', text: request.user },
              ...request.images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.base64}` }
              }))
            ]
          : request.user

      const data = (await requestJson(fetchImpl, `${base}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: userContent }
          ],
          max_tokens: request.maxOutputTokens ?? AI_LIMITS.maxOutputTokens,
          temperature: request.temperature ?? 0.7
        })
      })) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }

      return {
        text: String(data.choices?.[0]?.message?.content ?? '').trim(),
        inputTokens: numberOrZero(data.usage?.prompt_tokens),
        outputTokens: numberOrZero(data.usage?.completion_tokens)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com'

export function createAnthropicAdapter(fetchImpl: FetchLike): ProviderAdapter {
  const headers = (apiKey: string): Record<string, string> => ({
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'Content-Type': 'application/json'
  })

  return {
    async listModels(credentials) {
      const base = trimBase(credentials.baseUrl, ANTHROPIC_DEFAULT_BASE)
      const data = (await requestJson(fetchImpl, `${base}/v1/models`, {
        method: 'GET',
        headers: headers(credentials.apiKey)
      })) as { data?: Array<{ id?: string; display_name?: string }> }

      return (Array.isArray(data.data) ? data.data : [])
        .map((model) => ({
          id: String(model.id ?? ''),
          displayName: String(model.display_name ?? model.id ?? ''),
          inputTokenLimit: null,
          outputTokenLimit: null
        }))
        .filter((model) => model.id.length > 0)
    },

    async chat(credentials, request) {
      const base = trimBase(credentials.baseUrl, ANTHROPIC_DEFAULT_BASE)

      const content =
        request.images && request.images.length > 0
          ? [
              ...request.images.map((image) => ({
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.base64 }
              })),
              { type: 'text', text: request.user }
            ]
          : request.user

      const data = (await requestJson(fetchImpl, `${base}/v1/messages`, {
        method: 'POST',
        headers: headers(credentials.apiKey),
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? AI_LIMITS.maxOutputTokens,
          temperature: request.temperature ?? 0.7,
          // En Anthropic el prompt de sistema va en un campo aparte, no como
          // mensaje con rol `system`.
          system: request.system,
          messages: [{ role: 'user', content }]
        })
      })) as {
        content?: Array<{ type?: string; text?: string }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }

      return {
        text: (data.content ?? [])
          .filter((block) => block.type === 'text' || block.type === undefined)
          .map((block) => block.text ?? '')
          .join('')
          .trim(),
        inputTokens: numberOrZero(data.usage?.input_tokens),
        outputTokens: numberOrZero(data.usage?.output_tokens)
      }
    }
  }
}

export function adapterFor(provider: AiProvider, fetchImpl: FetchLike): ProviderAdapter {
  switch (provider) {
    case 'gemini':
      return createGeminiAdapter(fetchImpl)
    case 'openai':
      return createOpenAiAdapter(fetchImpl)
    case 'anthropic':
      return createAnthropicAdapter(fetchImpl)
    default:
      throw new AiProviderError('not_configured', null, 'unknown_provider')
  }
}

/**
 * Estima el coste a partir de los tokens y del precio que CONFIGURA el usuario.
 *
 * Se trabaja en "millonesimas" de unidad monetaria para no usar decimales.
 * Aviso que la interfaz repite: es una estimacion y puede no coincidir con la
 * factura del proveedor.
 */
export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
  inputPerMillionMicros: number,
  outputPerMillionMicros: number
): number {
  const input = Math.round((inputTokens * inputPerMillionMicros) / 1_000_000)
  const output = Math.round((outputTokens * outputPerMillionMicros) / 1_000_000)
  return Math.max(0, input + output)
}
