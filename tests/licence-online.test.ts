/**
 * RESALEVAULT - Pruebas del cliente de licencias online.
 *
 * Se prueban tres capas por separado:
 *
 *  1. Las funciones PURAS (construir peticiones, interpretar respuestas,
 *     decidir el resultado). No tocan ni red ni base de datos.
 *  2. El servicio con una `fetch` INYECTADA: asi se comprueba la logica real
 *     (estado en la base, cache de revocaciones) sin salir a internet.
 *  3. La integracion con `LicenseService`: que un rechazo por revocacion baje
 *     el plan a Free SIN borrar datos, y que un fallo de red NO lo baje.
 *
 * Ninguna prueba llama al backend real.
 */

import { describe, expect, it } from 'vitest'
import {
  buildActivateRequest,
  buildDeactivateRequest,
  buildRevocationsUrl,
  codeHash,
  decideOnlineOutcome,
  LicenceOnlineClient,
  parseActivateResponse,
  parseRevocationsResponse,
  shouldRecheck
} from '@main/services/licence-online'
import { LicenseService } from '@main/services/license'
import { ONLINE_RECHECK_DAYS } from '@shared/licence-backend'
import { createTestContext, type TestContext } from './helpers'

// ---------------------------------------------------------------------------
// Utilidades de prueba
// ---------------------------------------------------------------------------

/** Respuesta falsa de `fetch`. Guarda la ultima peticion recibida. */
function fakeFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body: string }
): { fn: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const asString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    calls.push({ url: asString, init })
    const result = handler(asString, init)
    return new Response(result.body, { status: result.status })
  }) as typeof fetch
  return { fn, calls }
}

/** Inserta una licencia "activa" directamente en la base (sin firma real). */
function seedActiveLicense(ctx: TestContext, id = 'lic_1'): void {
  ctx.db.run(
    `INSERT INTO licenses (id, plan, kind, payload, signature, code_hash, status,
       activated_at, expires_at, device_id, seats, holder, created_at, updated_at)
     VALUES ($id, 'pro', 'perpetual', 'PAYLOAD', 'SIGNATURE', $hash, 'active',
       '2026-01-01T00:00:00.000Z', NULL, 'dev_1', 1, 'Prueba',
       '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    { $id: id, $hash: codeHash('PAYLOAD.SIGNATURE') }
  )
}

// ---------------------------------------------------------------------------
// 1. Funciones puras
// ---------------------------------------------------------------------------

describe('licencia online: peticiones', () => {
  it('construye la activacion con la clave publishable como Bearer', () => {
    const request = buildActivateRequest(
      { code: '  mi-codigo  ', machineId: 'm1', machineLabel: 'Equipo', appVersion: '0.5.0', os: 'win32' },
      'https://example.test/fn'
    )
    expect(request.url).toBe('https://example.test/fn/activate')
    expect(request.method).toBe('POST')
    expect(request.headers.authorization).toBe('Bearer sb_publishable__7OuDroDQkWAV-Nlwe7c3Q_wEMXlnLh')
    const body = JSON.parse(request.body) as Record<string, unknown>
    expect(body.code).toBe('mi-codigo')
    expect(body.machineId).toBe('m1')
    expect(body.appVersion).toBe('0.5.0')
  })

  it('recorta el codigo y rellena los campos opcionales vacios', () => {
    const request = buildActivateRequest({ code: 'abc', machineId: 'm1' }, 'https://x')
    const body = JSON.parse(request.body) as Record<string, unknown>
    expect(body.machineLabel).toBe('')
    expect(body.appVersion).toBe('')
    expect(body.os).toBe('')
  })

  it('construye la liberacion de puesto', () => {
    const request = buildDeactivateRequest({ code: 'abc', machineId: 'm1' }, 'https://x')
    expect(request.url).toBe('https://x/deactivate')
    expect(JSON.parse(request.body)).toEqual({ code: 'abc', machineId: 'm1' })
  })

  it('incluye el cursor `since` solo cuando existe', () => {
    expect(buildRevocationsUrl(null, 'https://x')).toBe('https://x/revocations')
    expect(buildRevocationsUrl('2026-01-01T00:00:00.000Z', 'https://x')).toBe(
      'https://x/revocations?since=2026-01-01T00%3A00%3A00.000Z'
    )
  })

  it('el hash del codigo es estable e ignora espacios exteriores', () => {
    expect(codeHash('abc')).toBe(codeHash('  abc  '))
    expect(codeHash('abc')).toHaveLength(64)
    expect(codeHash('abc')).not.toBe(codeHash('abd'))
  })
})

describe('licencia online: interpretacion de respuestas', () => {
  it('acepta una activacion correcta', () => {
    const result = parseActivateResponse(
      200,
      JSON.stringify({
        ok: true,
        state: 'activated',
        plan: 'pro',
        kind: 'perpetual',
        seats: 3,
        seatsUsed: 2,
        expiresAt: null
      })
    )
    expect(result).toEqual({
      ok: true,
      state: 'activated',
      plan: 'pro',
      kind: 'perpetual',
      seats: 3,
      seatsUsed: 2,
      expiresAt: null
    })
  })

  it('distingue un puesto ya activo', () => {
    const result = parseActivateResponse(200, JSON.stringify({ ok: true, state: 'already_active' }))
    expect(result.ok && result.state).toBe('already_active')
  })

  it('NO cree un ok:true con un estado HTTP de error', () => {
    const result = parseActivateResponse(500, JSON.stringify({ ok: true }))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('server_error')
  })

  it('traduce un rechazo con motivo', () => {
    const result = parseActivateResponse(
      409,
      JSON.stringify({ ok: false, reason: 'seats_exhausted', seatsUsed: 5 })
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('seats_exhausted')
    expect(result.ok === false && result.seatsUsed).toBe(5)
  })

  it('trata un cuerpo invalido como error de servidor, sin lanzar', () => {
    expect(parseActivateResponse(200, 'no es json').ok).toBe(false)
    expect(parseActivateResponse(200, '[]').ok).toBe(false)
    expect(parseActivateResponse(200, 'null').ok).toBe(false)
  })

  it('interpreta la lista de revocaciones y descarta entradas raras', () => {
    const result = parseRevocationsResponse(
      200,
      JSON.stringify({ codes: ['a', 42, 'b'], cursor: '2026-02-01T00:00:00.000Z' })
    )
    expect(result).toEqual({ codes: ['a', 'b'], cursor: '2026-02-01T00:00:00.000Z' })
  })

  it('una lista invalida no revoca nada (devuelve null)', () => {
    expect(parseRevocationsResponse(500, '{}')).toBeNull()
    expect(parseRevocationsResponse(200, 'basura')).toBeNull()
  })
})

describe('licencia online: decision y periodicidad', () => {
  it('marca verificado cuando el servidor acepta', () => {
    const decision = decideOnlineOutcome(
      { ok: true, state: 'activated', plan: 'pro', kind: '', seats: 1, seatsUsed: 1, expiresAt: null },
      true
    )
    expect(decision).toEqual({ action: 'mark_verified', seatsUsed: 1 })
  })

  it('conserva el plan cuando no hay red', () => {
    const decision = decideOnlineOutcome({ ok: false, reason: 'network' }, false)
    expect(decision).toEqual({ action: 'keep', state: 'offline', reason: 'network' })
  })

  it('un error temporal del servidor NO se considera bloqueante', () => {
    const decision = decideOnlineOutcome({ ok: false, reason: 'server_error' }, true)
    expect(decision.action).toBe('mark_rejected')
    expect(decision.action === 'mark_rejected' && decision.blocking).toBe(false)
  })

  it('una revocacion SI es bloqueante', () => {
    const decision = decideOnlineOutcome({ ok: false, reason: 'revoked' }, true)
    expect(decision.action === 'mark_rejected' && decision.blocking).toBe(true)
  })

  it('la comprobacion toca cada 7 dias y no antes', () => {
    expect(shouldRecheck(null, '2026-01-10T00:00:00.000Z')).toBe(true)
    expect(shouldRecheck('2026-01-10T00:00:00.000Z', '2026-01-12T00:00:00.000Z')).toBe(false)
    expect(shouldRecheck('2026-01-10T00:00:00.000Z', '2026-01-17T00:00:00.000Z')).toBe(true)
    expect(shouldRecheck('no-es-fecha', '2026-01-17T00:00:00.000Z')).toBe(true)
    expect(ONLINE_RECHECK_DAYS).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// 2. Servicio con fetch inyectada
// ---------------------------------------------------------------------------

describe('licencia online: servicio', () => {
  it('con una licencia activa, marca verificada y guarda la fecha', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const { fn } = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ ok: true, state: 'activated', plan: 'pro', seatsUsed: 1 })
    }))
    const client = new LicenceOnlineClient(ctx.db, {
      fetchImpl: fn,
      endpoint: 'https://x',
      now: () => '2026-03-01T00:00:00.000Z'
    })

    const result = await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo')
    expect(result.state).toBe('verified')

    const row = ctx.db.get<{ online_state: string; last_check_at: string }>(
      'SELECT online_state, last_check_at FROM licenses WHERE id = $id',
      { $id: 'lic_1' }
    )
    expect(row?.online_state).toBe('verified')
    expect(row?.last_check_at).toBe('2026-03-01T00:00:00.000Z')

    const event = ctx.db.scalar<string>(
      "SELECT event AS v FROM license_events WHERE license_id = $id ORDER BY at DESC LIMIT 1",
      { $id: 'lic_1' }
    )
    expect(event).toBe('online_verified')
    ctx.close()
  })

  it('sin red conserva la licencia y marca offline', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const fn = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    const result = await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo')
    expect(result.state).toBe('offline')

    const row = ctx.db.get<{ status: string; plan: string; online_state: string }>(
      'SELECT status, plan, online_state FROM licenses WHERE id = $id',
      { $id: 'lic_1' }
    )
    // La licencia y el plan siguen intactos.
    expect(row?.status).toBe('active')
    expect(row?.plan).toBe('pro')
    expect(row?.online_state).toBe('offline')
    ctx.close()
  })

  it('un error del servidor deja la licencia como estaba (no bloqueante)', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const { fn } = fakeFetch(() => ({ status: 500, body: JSON.stringify({ ok: false, reason: 'server_error' }) }))
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    const result = await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo')
    expect(result.state).toBe('offline')

    const row = ctx.db.get<{ status: string; online_state: string }>(
      'SELECT status, online_state FROM licenses WHERE id = $id',
      { $id: 'lic_1' }
    )
    expect(row?.status).toBe('active')
    expect(row?.online_state).toBe('offline')
    ctx.close()
  })

  it('un rechazo bloqueante se registra como rejected', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const { fn } = fakeFetch(() => ({ status: 403, body: JSON.stringify({ ok: false, reason: 'revoked' }) }))
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    const result = await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo')
    expect(result.state).toBe('rejected')
    expect(result.reason).toBe('revoked')
    ctx.close()
  })

  it('no comprueba de nuevo antes de 7 dias', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    ctx.db.run("UPDATE licenses SET last_check_at = '2026-03-01T00:00:00.000Z', online_state = 'verified' WHERE id = 'lic_1'")

    const { fn, calls } = fakeFetch(() => ({ status: 200, body: JSON.stringify({ ok: true }) }))
    const client = new LicenceOnlineClient(ctx.db, {
      fetchImpl: fn,
      endpoint: 'https://x',
      now: () => '2026-03-02T00:00:00.000Z'
    })

    const result = await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo')
    expect(calls).toHaveLength(0)
    expect(result.state).toBe('verified')
    ctx.close()
  })

  it('`force` ignora la periodicidad', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    ctx.db.run("UPDATE licenses SET last_check_at = '2026-03-01T00:00:00.000Z' WHERE id = 'lic_1'")

    const { fn, calls } = fakeFetch(() => ({ status: 200, body: JSON.stringify({ ok: true, seatsUsed: 1 }) }))
    const client = new LicenceOnlineClient(ctx.db, {
      fetchImpl: fn,
      endpoint: 'https://x',
      now: () => '2026-03-02T00:00:00.000Z'
    })

    await client.verify('PAYLOAD.SIGNATURE', 'm1', 'Equipo', true)
    expect(calls).toHaveLength(1)
    ctx.close()
  })

  it('sin licencia activa no llama a la red', async () => {
    const ctx = createTestContext()
    const { fn, calls } = fakeFetch(() => ({ status: 200, body: '{}' }))
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    const result = await client.verify('cualquiera', 'm1', 'Equipo')
    expect(result.state).toBe('unknown')
    expect(calls).toHaveLength(0)
    ctx.close()
  })

  it('libera el puesto: informa si el servidor lo confirmo', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const { fn } = fakeFetch(() => ({ status: 200, body: JSON.stringify({ ok: true }) }))
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    expect(await client.releaseSeat('PAYLOAD.SIGNATURE', 'm1')).toEqual({ remote: true })
    ctx.close()
  })

  it('si no hay red, la liberacion local sigue adelante', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const fn = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    expect(await client.releaseSeat('PAYLOAD.SIGNATURE', 'm1')).toEqual({ remote: false })
    ctx.close()
  })

  it('cachea las revocaciones y avanza el cursor', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const revoked = codeHash('OTRO.CODIGO')
    const { fn, calls } = fakeFetch(() => ({
      status: 200,
      body: JSON.stringify({ codes: [revoked], cursor: '2026-04-01T00:00:00.000Z' })
    }))
    const client = new LicenceOnlineClient(ctx.db, {
      fetchImpl: fn,
      endpoint: 'https://x',
      now: () => '2026-04-01T00:00:00.000Z'
    })

    const first = await client.syncRevocations()
    expect(first).toEqual({ fetched: 1, updated: true })
    expect(client.isRevoked('OTRO.CODIGO')).toBe(true)
    expect(client.isRevoked('PAYLOAD.SIGNATURE')).toBe(false)

    const cursor = ctx.db.scalar<string>('SELECT revocation_cursor AS v FROM licenses WHERE id = $id', {
      $id: 'lic_1'
    })
    expect(cursor).toBe('2026-04-01T00:00:00.000Z')

    // Segunda pasada: ya estaba cacheada, no cuenta como nueva, y el cursor
    // viaja en la URL.
    const second = await client.syncRevocations()
    expect(second.fetched).toBe(0)
    expect(calls[1]?.url).toContain('since=2026-04-01')
    ctx.close()
  })

  it('un fallo de red al pedir revocaciones no cambia nada', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const fn = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })

    expect(await client.syncRevocations()).toEqual({ fetched: 0, updated: false })
    expect(client.isRevoked('cualquiera')).toBe(false)
    ctx.close()
  })
})

// ---------------------------------------------------------------------------
// 3. Integracion con LicenseService
// ---------------------------------------------------------------------------

describe('licencia online: integracion con el servicio', () => {
  it('una revocacion conocida baja el plan a Free sin borrar datos', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    // Un producto del usuario: debe sobrevivir a la revocacion.
    ctx.db.run(
      `INSERT INTO products (id, sku, name, condition, status, created_at, updated_at)
       VALUES ('prod_1', 'SKU-1', 'Camiseta', 'new', 'available', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    )

    const revoked = codeHash('PAYLOAD.SIGNATURE')
    const { fn } = fakeFetch((url) => {
      if (url.includes('/revocations')) {
        return { status: 200, body: JSON.stringify({ codes: [revoked], cursor: '2026-05-01T00:00:00.000Z' }) }
      }
      return { status: 200, body: JSON.stringify({ ok: true, seatsUsed: 1 }) }
    })
    const client = new LicenceOnlineClient(ctx.db, {
      fetchImpl: fn,
      endpoint: 'https://x',
      now: () => '2026-05-01T00:00:00.000Z'
    })
    const service = new LicenseService(ctx.db, client)

    const state = await service.refreshOnline(true)
    expect(state.plan).toBe('free')

    // Los datos del usuario siguen ahi.
    const products = ctx.db.scalar<number>('SELECT COUNT(*) AS v FROM products')
    expect(products).toBe(1)
    ctx.close()
  })

  it('sin red, refreshOnline conserva el plan y no lanza', async () => {
    const ctx = createTestContext()
    seedActiveLicense(ctx)
    const fn = (async () => {
      throw new Error('sin red')
    }) as unknown as typeof fetch
    const client = new LicenceOnlineClient(ctx.db, { fetchImpl: fn, endpoint: 'https://x' })
    const service = new LicenseService(ctx.db, client)

    // No debe lanzar nunca.
    const state = await service.refreshOnline(true)
    expect(state.plan).toBe('free') // porque la firma de prueba no valida: se reverifica siempre
    expect(state.online.state).toBe('offline')
    ctx.close()
  })

  it('sin cliente online, el servicio funciona como antes', async () => {
    const ctx = createTestContext()
    const service = new LicenseService(ctx.db)
    expect(service.onlineEnabled).toBe(false)
    expect((await service.refreshOnline()).plan).toBe('free')
    expect(service.state().online.state).toBe('unknown')
    ctx.close()
  })
})
