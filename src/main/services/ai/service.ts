/**
 * RESALEVAULT - AI Studio (BYOK).
 *
 * Modelo de negocio: **Bring Your Own Key**. Cada usuario conecta su propia
 * clave y asume su consumo. Esta aplicacion no incluye ninguna clave y no paga
 * ninguna llamada.
 *
 * Seguridad de las claves:
 *  - Se cifran con el almacen de credenciales del sistema operativo (DPAPI en
 *    Windows, a traves de `safeStorage`). El servicio recibe un `SecretStore`
 *    inyectado, de modo que aqui no hay ninguna dependencia de Electron y la
 *    logica se puede probar.
 *  - En la base de datos solo queda el blob cifrado y una pista (los ultimos
 *    caracteres) para que el usuario identifique la clave.
 *  - La clave NUNCA se devuelve al renderer, nunca se registra y nunca se
 *    incluye en un mensaje de error.
 *
 * Honestidad sobre el coste: el precio por millon de tokens lo configura el
 * usuario, porque las tarifas cambian. El coste mostrado es una ESTIMACION y
 * asi se etiqueta en la interfaz.
 */

import type {
  AiConnection,
  AiConnectionTest,
  AiGenerateRequest,
  AiGenerateResult,
  AiModelInfo,
  AiProvider,
  AiTask,
  AiUsageEntry,
  AiUsageReport
} from '@shared/types-modules'
import type { ProductAttributes } from '@shared/types'
import { AI_TASKS } from '@shared/types-modules'
import type { Database, SqlParam } from '../../db/database'
import { appError } from '../../errors'
import { logActivity } from '../../db/repositories/activity'
import type { ProductRepository } from '../../db/repositories/products'
import { newId, nowIso, toNumber, toNullableString, toStringValue } from '../../db/support'
import {
  AI_LIMITS,
  AiProviderError,
  adapterFor,
  estimateCostMicros,
  type FetchLike,
  type ProviderAdapter
} from './providers'
import { buildPrompt, estimateInputTokens, parseStructured, type PromptProduct } from './prompts'

// ---------------------------------------------------------------------------
// Almacen de secretos
// ---------------------------------------------------------------------------

export interface SecretStore {
  /** Si el sistema operativo ofrece cifrado real. */
  available(): boolean
  /** Devuelve un blob cifrado en base64. */
  encrypt(plain: string): string
  decrypt(cipher: string): string
  /** Pista no sensible para identificar la clave (ultimos caracteres). */
  hint(plain: string): string
}

/**
 * Almacen de reserva SOLO para entornos sin cifrado del sistema (por ejemplo,
 * pruebas). Nunca se usa en produccion: `available()` devuelve false y la
 * interfaz avisa en lugar de guardar una clave sin proteger.
 */
export function createInsecureTestStore(): SecretStore {
  return {
    available: () => true,
    encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
    decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
    hint: (plain) => (plain.length <= 4 ? '••••' : '••••' + plain.slice(-4))
  }
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

interface ConnectionRow {
  id: string
  provider: string
  label: string
  secret_cipher: string
  secret_hint: string
  base_url: string
  default_model: string
  active: number
  last_ok_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

const CONNECTION_SELECT = `
  SELECT id, provider, label, secret_cipher, secret_hint, base_url, default_model, active,
         last_ok_at, last_error, created_at, updated_at
  FROM ai_connections
`

function mapConnection(row: ConnectionRow): AiConnection {
  return {
    id: row.id,
    provider: row.provider as AiProvider,
    label: toStringValue(row.label),
    secretHint: toStringValue(row.secret_hint),
    baseUrl: toStringValue(row.base_url),
    defaultModel: toStringValue(row.default_model),
    active: toNumber(row.active) === 1,
    hasSecret: toStringValue(row.secret_cipher).length > 0,
    lastOkAt: toNullableString(row.last_ok_at),
    lastError: toNullableString(row.last_error),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at)
  }
}

export interface AiServiceOptions {
  secrets: SecretStore
  /** Inyectable para pruebas sin red. */
  fetchImpl?: FetchLike
}

export class AiService {
  private readonly fetchImpl: FetchLike
  private adapters = new Map<AiProvider, ProviderAdapter>()

  constructor(
    private readonly db: Database,
    private readonly products: ProductRepository,
    private readonly options: AiServiceOptions
  ) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  private adapter(provider: AiProvider): ProviderAdapter {
    const cached = this.adapters.get(provider)
    if (cached) return cached
    const created = adapterFor(provider, this.fetchImpl)
    this.adapters.set(provider, created)
    return created
  }

  // -------------------------------------------------------------------------
  // Conexiones
  // -------------------------------------------------------------------------

  listConnections(): AiConnection[] {
    return this.db
      .all<ConnectionRow>(`${CONNECTION_SELECT} ORDER BY created_at ASC`)
      .map(mapConnection)
  }

  private rowById(id: string): ConnectionRow {
    const row = this.db.get<ConnectionRow>(`${CONNECTION_SELECT} WHERE id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'ai_connection' })
    return row
  }

  createConnection(input: {
    provider: AiProvider
    label?: string
    secret: string
    baseUrl?: string
    defaultModel?: string
  }): AiConnection {
    if (!this.options.secrets.available()) {
      throw appError('storage_error', undefined, 'encryption_unavailable')
    }

    const secret = input.secret.trim()
    if (secret.length < 8) throw appError('invalid_input', { field: 'secret' })

    const id = newId()
    const at = nowIso()

    this.db.run(
      `INSERT INTO ai_connections (id, provider, label, secret_cipher, secret_hint, base_url,
          default_model, active, created_at, updated_at)
       VALUES ($id, $provider, $label, $cipher, $hint, $base, $model, 1, $at, $at)`,
      {
        $id: id,
        $provider: input.provider,
        $label: (input.label ?? '').trim(),
        $cipher: this.options.secrets.encrypt(secret),
        $hint: this.options.secrets.hint(secret),
        $base: (input.baseUrl ?? '').trim(),
        $model: (input.defaultModel ?? '').trim(),
        $at: at
      }
    )

    logActivity(this.db, {
      entity: 'ai_connection',
      entityId: id,
      action: 'created',
      summary: `Conexion de IA anadida: ${input.provider}`
    })

    // Se devuelve la vista publica: la clave jamas sale de aqui.
    return mapConnection(this.rowById(id))
  }

  updateConnection(
    id: string,
    patch: {
      label?: string
      defaultModel?: string
      baseUrl?: string
      active?: boolean
      secret?: string
    }
  ): AiConnection {
    // Se valida que exista antes de tocar nada.
    this.rowById(id)

    const assignments: string[] = []
    const params: Record<string, SqlParam> = { $id: id, $at: nowIso() }

    if (patch.label !== undefined) {
      assignments.push('label = $label')
      params.$label = patch.label.trim()
    }
    if (patch.defaultModel !== undefined) {
      assignments.push('default_model = $model')
      params.$model = patch.defaultModel.trim()
    }
    if (patch.baseUrl !== undefined) {
      assignments.push('base_url = $base')
      params.$base = patch.baseUrl.trim()
    }
    if (patch.active !== undefined) {
      assignments.push('active = $active')
      params.$active = patch.active ? 1 : 0
    }
    if (patch.secret !== undefined && patch.secret.trim().length > 0) {
      if (!this.options.secrets.available()) {
        throw appError('storage_error', undefined, 'encryption_unavailable')
      }
      assignments.push('secret_cipher = $cipher', 'secret_hint = $hint')
      params.$cipher = this.options.secrets.encrypt(patch.secret.trim())
      params.$hint = this.options.secrets.hint(patch.secret.trim())
    }

    if (assignments.length > 0) {
      this.db.run(
        `UPDATE ai_connections SET ${assignments.join(', ')}, updated_at = $at WHERE id = $id`,
        params
      )
    }

    return mapConnection(this.rowById(id))
  }

  removeConnection(id: string): { affected: number } {
    this.rowById(id)
    this.db.run('DELETE FROM ai_connections WHERE id = $id', { $id: id })
    // Las rutas que apuntaban a esta conexion quedan sin asignar (ON DELETE SET NULL).
    return { affected: 1 }
  }

  /** Credenciales descifradas, solo para uso interno. */
  private credentials(row: ConnectionRow): { apiKey: string; baseUrl: string } {
    if (!row.secret_cipher) throw new AiProviderError('missing_key')
    if (!this.options.secrets.available()) {
      throw new AiProviderError('encryption_unavailable')
    }
    return {
      apiKey: this.options.secrets.decrypt(row.secret_cipher),
      baseUrl: row.base_url
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const row = this.rowById(connectionId)
    const adapter = this.adapter(row.provider as AiProvider)
    return adapter.listModels(this.credentials(row))
  }

  /** Prueba real: consulta la lista de modelos del proveedor. */
  async testConnection(connectionId: string): Promise<AiConnectionTest> {
    this.rowById(connectionId)
    const started = Date.now()

    try {
      const models = await this.listModels(connectionId)
      const latencyMs = Date.now() - started

      this.db.run(
        "UPDATE ai_connections SET last_ok_at = $at, last_error = NULL, updated_at = $at WHERE id = $id",
        { $id: connectionId, $at: nowIso() }
      )

      return { ok: true, modelCount: models.length, models, latencyMs }
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'provider_error'
      const latencyMs = Date.now() - started

      // Solo se guarda el CODIGO, nunca el mensaje del proveedor.
      this.db.run('UPDATE ai_connections SET last_error = $error, updated_at = $at WHERE id = $id', {
        $id: connectionId,
        $error: code,
        $at: nowIso()
      })

      return { ok: false, modelCount: 0, models: [], latencyMs, errorCode: code }
    }
  }

  // -------------------------------------------------------------------------
  // Rutas por tarea
  // -------------------------------------------------------------------------

  routes(): Record<string, { connectionId: string | null; model: string }> {
    const rows = this.db.all<{ task: string; connection_id: string | null; model: string }>(
      'SELECT task, connection_id, model FROM ai_routes'
    )
    const result: Record<string, { connectionId: string | null; model: string }> = {}
    for (const row of rows) {
      result[row.task] = { connectionId: row.connection_id, model: toStringValue(row.model) }
    }
    return result
  }

  setRoute(task: string, connectionId: string | null, model = ''): void {
    this.db.run(
      `INSERT INTO ai_routes (task, connection_id, model, updated_at)
       VALUES ($task, $connection, $model, $at)
       ON CONFLICT(task) DO UPDATE SET connection_id = $connection, model = $model, updated_at = $at`,
      { $task: task, $connection: connectionId, $model: model.trim(), $at: nowIso() }
    )
  }

  private resolveTarget(request: AiGenerateRequest): { row: ConnectionRow; model: string } {
    if (request.connectionId) {
      const row = this.rowById(request.connectionId)
      const model = (request.model ?? row.default_model).trim()
      if (!model) throw new AiProviderError('model_not_found', null, 'model_not_selected')
      return { row, model }
    }

    const route = this.routes()[request.task]
    if (route?.connectionId) {
      const row = this.rowById(route.connectionId)
      const model = (request.model ?? route.model ?? row.default_model).trim()
      if (!model) throw new AiProviderError('model_not_found', null, 'model_not_selected')
      return { row, model }
    }

    // Sin ruta explicita: se usa la primera conexion activa.
    const fallback = this.db.get<ConnectionRow>(
      `${CONNECTION_SELECT} WHERE active = 1 ORDER BY created_at ASC LIMIT 1`
    )
    if (!fallback) throw new AiProviderError('not_configured', null, 'no_connection')
    const model = (request.model ?? fallback.default_model).trim()
    if (!model) throw new AiProviderError('model_not_found', null, 'model_not_selected')
    return { row: fallback, model }
  }

  // -------------------------------------------------------------------------
  // Generacion
  // -------------------------------------------------------------------------

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const { row, model } = this.resolveTarget(request)

    if (toNumber(row.active) !== 1) {
      throw new AiProviderError('disabled_by_user')
    }

    const images = this.validateImages(request.images)
    const promptProduct = request.productId ? this.loadPromptProduct(request.productId) : null

    const prompt = buildPrompt(request.task, promptProduct ?? EMPTY_PRODUCT, {
      instruction: request.instruction,
      language: request.language,
      targetMarginPercent: this.targetMargin(),
      currentPriceCents: promptProduct?.expectedSalePriceCents
    })

    const started = Date.now()

    try {
      const response = await this.adapter(row.provider as AiProvider).chat(this.credentials(row), {
        model,
        system: prompt.system,
        user: prompt.user,
        images,
        maxOutputTokens: AI_LIMITS.maxOutputTokens
      })

      const latencyMs = Date.now() - started
      const parsed = parseStructured(response.text, prompt.output)
      const priced = this.priceFor(row.provider, model)
      const costMicros = estimateCostMicros(
        response.inputTokens,
        response.outputTokens,
        priced.inputPerMillionMicros,
        priced.outputPerMillionMicros
      )

      this.logUsage({
        connectionId: row.id,
        provider: row.provider,
        model,
        task: request.task,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costMicros,
        ok: true,
        error: null,
        subject: request.productId ?? ''
      })

      if (response.inputTokens === 0 && response.outputTokens === 0) {
        // El proveedor no informo del consumo: se estima la entrada para no
        // presentar un coste de cero como si fuera seguro.
        this.db.run(
          'UPDATE ai_usage SET input_tokens = $tokens WHERE id = (SELECT id FROM ai_usage ORDER BY at DESC LIMIT 1)',
          { $tokens: estimateInputTokens(prompt.user) }
        )
      }

      return {
        task: request.task,
        provider: row.provider as AiProvider,
        model,
        text: parsed.text,
        structured: parsed.structured,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costMicros,
        latencyMs,
        disclaimerKey: request.task === 'price_suggestion' ? 'ai.priceDisclaimer' : undefined
      }
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'provider_error'

      this.logUsage({
        connectionId: row.id,
        provider: row.provider,
        model,
        task: request.task,
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        ok: false,
        error: code,
        subject: request.productId ?? ''
      })

      this.db.run('UPDATE ai_connections SET last_error = $error, updated_at = $at WHERE id = $id', {
        $id: row.id,
        $error: code,
        $at: nowIso()
      })

      throw new AiProviderError(code)
    }
  }

  private validateImages(
    images: AiGenerateRequest['images']
  ): Array<{ mimeType: string; base64: string }> | undefined {
    if (!images || images.length === 0) return undefined
    if (images.length > AI_LIMITS.maxImages) {
      throw new AiProviderError('too_large', null, 'too_many_images')
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    for (const image of images) {
      if (!allowed.includes(image.mimeType)) throw new AiProviderError('unsupported_file')
      // base64 crece ~4/3: se calcula el tamano real aproximado.
      if ((image.base64.length * 3) / 4 > AI_LIMITS.maxImageBytes) {
        throw new AiProviderError('too_large', null, 'image_too_large')
      }
    }
    return images
  }

  private loadPromptProduct(productId: string): PromptProduct {
    const detail = this.products.get(productId)
    const product = detail.product
    const categoryName = product.categoryId
      ? (this.db.scalar<string>('SELECT name FROM categories WHERE id = $id', { $id: product.categoryId }) ?? null)
      : null

    const attributes: ProductAttributes = product.attributes

    return {
      name: product.name,
      description: product.description,
      sku: product.sku,
      brand: product.brand,
      model: product.model,
      size: product.size,
      color: product.color,
      condition: product.condition,
      categoryName,
      attributes,
      expectedSalePriceCents: product.expectedSalePriceCents,
      totalCostCents: product.purchasePriceCents + product.acquisitionFeesCents,
      tags: detail.tags.map((tag) => tag.name)
    }
  }

  private targetMargin(): number {
    const raw = this.db.scalar<string>("SELECT value FROM settings WHERE key = 'finance.targetMarginPercent'")
    if (!raw) return 25
    try {
      const parsed = JSON.parse(raw) as unknown
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 25
    } catch {
      return 25
    }
  }

  // -------------------------------------------------------------------------
  // Uso y precios
  // -------------------------------------------------------------------------

  private logUsage(entry: {
    connectionId: string
    provider: string
    model: string
    task: string
    inputTokens: number
    outputTokens: number
    costMicros: number
    ok: boolean
    error: string | null
    subject: string
  }): void {
    this.db.run(
      `INSERT INTO ai_usage (id, at, connection_id, provider, model, task, input_tokens,
          output_tokens, cost_micros, ok, error, subject)
       VALUES ($id, $at, $connection, $provider, $model, $task, $input, $output, $cost, $ok, $error, $subject)`,
      {
        $id: newId(),
        $at: nowIso(),
        $connection: entry.connectionId,
        $provider: entry.provider,
        $model: entry.model,
        $task: entry.task,
        $input: Math.max(0, Math.round(entry.inputTokens)),
        $output: Math.max(0, Math.round(entry.outputTokens)),
        $cost: Math.max(0, Math.round(entry.costMicros)),
        $ok: entry.ok ? 1 : 0,
        $error: entry.error,
        $subject: entry.subject
      }
    )
  }

  usage(): AiUsageReport {
    const totals = this.db.get<Record<string, number>>(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COALESCE(SUM(cost_micros), 0) AS cost
       FROM ai_usage`
    )

    const byProvider = this.db
      .all<{ provider: string; calls: number; cost: number }>(
        `SELECT provider, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost
         FROM ai_usage GROUP BY provider ORDER BY cost DESC`
      )
      .map((row) => ({ provider: row.provider, calls: toNumber(row.calls), costMicros: toNumber(row.cost) }))

    const byTask = this.db
      .all<{ task: string; calls: number; cost: number }>(
        `SELECT task, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost
         FROM ai_usage GROUP BY task ORDER BY cost DESC`
      )
      .map((row) => ({ task: row.task, calls: toNumber(row.calls), costMicros: toNumber(row.cost) }))

    const recent = this.db
      .all<{
        id: string
        at: string
        provider: string
        model: string
        task: string
        input_tokens: number
        output_tokens: number
        cost_micros: number
        ok: number
        error: string | null
        subject: string
      }>(
        `SELECT id, at, provider, model, task, input_tokens, output_tokens, cost_micros, ok, error, subject
         FROM ai_usage ORDER BY at DESC LIMIT 40`
      )
      .map<AiUsageEntry>((row) => ({
        id: row.id,
        at: row.at,
        provider: row.provider,
        model: row.model,
        task: row.task,
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
        costMicros: toNumber(row.cost_micros),
        ok: toNumber(row.ok) === 1,
        error: toNullableString(row.error),
        subject: toStringValue(row.subject)
      }))

    return {
      totalCalls: toNumber(totals?.calls),
      totalInputTokens: toNumber(totals?.input_tokens),
      totalOutputTokens: toNumber(totals?.output_tokens),
      totalCostMicros: toNumber(totals?.cost),
      byProvider,
      byTask,
      recent
    }
  }

  prices(): Array<{
    provider: string
    model: string
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  }> {
    return this.db
      .all<{
        provider: string
        model: string
        input_per_million_micros: number
        output_per_million_micros: number
      }>(
        `SELECT provider, model, input_per_million_micros, output_per_million_micros
         FROM ai_prices ORDER BY provider ASC, model ASC`
      )
      .map((row) => ({
        provider: row.provider,
        model: row.model,
        inputPerMillionMicros: toNumber(row.input_per_million_micros),
        outputPerMillionMicros: toNumber(row.output_per_million_micros)
      }))
  }

  setPrice(input: {
    provider: AiProvider
    model: string
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  }): void {
    this.db.run(
      `INSERT INTO ai_prices (id, provider, model, input_per_million_micros,
          output_per_million_micros, updated_at)
       VALUES ($id, $provider, $model, $input, $output, $at)
       ON CONFLICT(id) DO UPDATE SET input_per_million_micros = $input,
          output_per_million_micros = $output, updated_at = $at`,
      {
        $id: `${input.provider}:${input.model}`,
        $provider: input.provider,
        $model: input.model.trim(),
        $input: Math.max(0, Math.round(input.inputPerMillionMicros)),
        $output: Math.max(0, Math.round(input.outputPerMillionMicros)),
        $at: nowIso()
      }
    )
  }

  private priceFor(provider: string, model: string): {
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  } {
    const row = this.db.get<{
      input_per_million_micros: number
      output_per_million_micros: number
    }>(
      'SELECT input_per_million_micros, output_per_million_micros FROM ai_prices WHERE id = $id',
      { $id: `${provider}:${model}` }
    )
    return {
      inputPerMillionMicros: toNumber(row?.input_per_million_micros),
      outputPerMillionMicros: toNumber(row?.output_per_million_micros)
    }
  }

  // -------------------------------------------------------------------------
  // Flujos multi-IA (desactivados por defecto)
  // -------------------------------------------------------------------------

  /**
   * Estimacion de coste ANTES de lanzar un flujo con varios proveedores.
   * Sirve para pedir confirmacion: multiplicar llamadas multiplica la factura.
   */
  estimateFlow(input: {
    products: number
    steps: number
    averageInputTokens: number
    averageOutputTokens: number
    inputPerMillionMicros: number
    outputPerMillionMicros: number
  }): {
    estimatedCalls: number
    estimatedInputTokens: number
    estimatedCostMicros: number
    requiresConfirmation: boolean
  } {
    const calls = Math.max(0, input.products) * Math.max(0, input.steps)
    const inputTokens = calls * Math.max(0, input.averageInputTokens)
    return {
      estimatedCalls: calls,
      estimatedInputTokens: inputTokens,
      estimatedCostMicros: estimateCostMicros(
        inputTokens,
        calls * Math.max(0, input.averageOutputTokens),
        input.inputPerMillionMicros,
        input.outputPerMillionMicros
      ),
      // Cualquier flujo multiple exige confirmacion explicita: nunca se lanza solo.
      requiresConfirmation: true
    }
  }

  /** Tareas disponibles, para que la interfaz no duplique la lista. */
  tasks(): readonly AiTask[] {
    return AI_TASKS
  }
}

/** Producto vacio para tareas sencillas que no dependen de una ficha. */
const EMPTY_PRODUCT: PromptProduct = {
  name: '',
  description: '',
  sku: '',
  brand: '',
  model: '',
  size: '',
  color: '',
  condition: '',
  categoryName: null,
  attributes: {},
  expectedSalePriceCents: 0,
  totalCostCents: 0,
  tags: []
}
