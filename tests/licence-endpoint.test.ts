import { describe, expect, it } from 'vitest'
import {
  activate,
  deactivate,
  revocations,
  type ActivationRecord,
  type ActivationWrite,
  type LicenceRecord,
  type LicenceStore,
  type RevokedRecord
} from '../supabase/functions/licence/core'

/**
 * Reglas del backend de licencias: puestos, caducidad y revocacion. Un fallo
 * aqui o bloquea a un cliente que ha pagado, o regala licencias.
 */
const NOW = '2026-10-20T12:00:00.000Z'
const LATER = '2026-11-01T00:00:00.000Z'
const HASH = 'a'.repeat(64)

function licence(overrides: Partial<LicenceRecord> = {}): LicenceRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    codeHash: HASH,
    plan: 'pro',
    kind: 'founder',
    seats: 2,
    status: 'active',
    expiresAt: LATER,
    ...overrides
  }
}

class MemoryStore implements LicenceStore {
  records: LicenceRecord[] = []
  activations: Array<ActivationRecord & { licenceId: string }> = []
  revoked: RevokedRecord[] = []
  writes: ActivationWrite[] = []

  async findByCodeHash(codeHash: string): Promise<LicenceRecord | null> {
    return this.records.find((record) => record.codeHash === codeHash) ?? null
  }

  async listActivations(licenceId: string): Promise<ActivationRecord[]> {
    return this.activations
      .filter((entry) => entry.licenceId === licenceId)
      .map((entry) => ({ machineId: entry.machineId, lastSeenAt: entry.lastSeenAt }))
  }

  async touchActivation(input: ActivationWrite): Promise<void> {
    this.writes.push(input)
    const existing = this.activations.find(
      (entry) => entry.licenceId === input.licenceId && entry.machineId === input.machineId
    )
    if (existing) {
      existing.lastSeenAt = input.at
      return
    }
    this.activations.push({
      licenceId: input.licenceId,
      machineId: input.machineId,
      lastSeenAt: input.at
    })
  }

  async removeActivation(licenceId: string, machineId: string): Promise<boolean> {
    const before = this.activations.length
    this.activations = this.activations.filter(
      (entry) => !(entry.licenceId === licenceId && entry.machineId === machineId)
    )
    return this.activations.length < before
  }

  async listRevokedSince(since: string | null): Promise<RevokedRecord[]> {
    if (since === null) return this.revoked
    return this.revoked.filter((record) => record.revokedAt > since)
  }
}

function ready(): MemoryStore {
  const store = new MemoryStore()
  store.records = [licence()]
  return store
}

describe('activacion de licencias', () => {
  it('activa un equipo y devuelve el estado de la licencia', async () => {
    const store = ready()
    const result = await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)
    expect(result).toEqual({
      ok: true,
      state: 'activated',
      plan: 'pro',
      kind: 'founder',
      seats: 2,
      seatsUsed: 1,
      expiresAt: LATER
    })
    expect(store.writes[0]?.machineId).toBe('machine-0001')
  })

  it('repetir la activacion del mismo equipo no consume un puesto', async () => {
    const store = ready()
    await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)
    const again = await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, '2026-10-21T00:00:00.000Z')
    expect(again).toMatchObject({ ok: true, state: 'already_active', seatsUsed: 1 })
    expect(store.activations.length).toBe(1)
  })

  it('el segundo equipo ocupa la segunda plaza y el tercero se rechaza', async () => {
    const store = ready()
    await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)
    const second = await activate({ codeHash: HASH, machineId: 'machine-0002' }, store, NOW)
    expect(second).toMatchObject({ ok: true, state: 'activated', seatsUsed: 2 })

    const third = await activate({ codeHash: HASH, machineId: 'machine-0003' }, store, NOW)
    expect(third).toEqual({ ok: false, reason: 'seats_exhausted', seatsUsed: 2 })
    expect(store.activations.length).toBe(2)
  })

  it('rechaza un codigo desconocido', async () => {
    const store = ready()
    const result = await activate({ codeHash: 'b'.repeat(64), machineId: 'machine-0001' }, store, NOW)
    expect(result).toEqual({ ok: false, reason: 'unknown_code' })
  })

  it('una licencia revocada no se activa aunque queden puestos', async () => {
    const store = ready()
    store.records = [licence({ status: 'revoked' })]
    expect(await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)).toEqual({
      ok: false,
      reason: 'revoked'
    })
  })

  it('una licencia suspendida se rechaza y se distingue de una revocada', async () => {
    const store = ready()
    store.records = [licence({ status: 'suspended' })]
    expect(await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)).toEqual({
      ok: false,
      reason: 'suspended'
    })
  })

  it('caduca en el instante exacto de expiracion', async () => {
    const store = ready()
    expect(await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, LATER)).toEqual({
      ok: false,
      reason: 'expired'
    })
  })

  it('una licencia perpetua no caduca nunca', async () => {
    const store = ready()
    store.records = [licence({ expiresAt: null, kind: 'perpetual' })]
    const result = await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, '2099-01-01T00:00:00.000Z')
    expect(result.ok).toBe(true)
  })

  it('una fecha de caducidad ilegible no regala la licencia', async () => {
    const store = ready()
    store.records = [licence({ expiresAt: 'no-es-una-fecha' })]
    expect(await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)).toEqual({
      ok: false,
      reason: 'expired'
    })
  })

  it('valida el identificador de equipo y el hash', async () => {
    const store = ready()
    expect(await activate({ codeHash: 'corto', machineId: 'machine-0001' }, store, NOW)).toEqual({
      ok: false,
      reason: 'invalid_input'
    })
    expect(await activate({ codeHash: HASH, machineId: 'mal' }, store, NOW)).toEqual({
      ok: false,
      reason: 'invalid_input'
    })
    expect(
      await activate({ codeHash: HASH, machineId: 'equipo con espacios' }, store, NOW)
    ).toEqual({ ok: false, reason: 'invalid_input' })
  })

  it('recorta la etiqueta y la version antes de guardarlas', async () => {
    const store = ready()
    await activate(
      {
        codeHash: HASH,
        machineId: 'machine-0001',
        machineLabel: '  Portatil de Ana  ',
        appVersion: 'x'.repeat(80),
        os: 'win32'
      },
      store,
      NOW
    )
    expect(store.writes[0]?.machineLabel).toBe('Portatil de Ana')
    expect(store.writes[0]?.appVersion.length).toBe(32)
    expect(store.writes[0]?.os).toBe('win32')
  })
})

describe('liberacion de puestos', () => {
  it('desactivar un equipo libera su plaza', async () => {
    const store = ready()
    await activate({ codeHash: HASH, machineId: 'machine-0001' }, store, NOW)
    await activate({ codeHash: HASH, machineId: 'machine-0002' }, store, NOW)

    expect(await deactivate({ codeHash: HASH, machineId: 'machine-0002' }, store)).toEqual({
      ok: true,
      removed: true
    })

    const third = await activate({ codeHash: HASH, machineId: 'machine-0003' }, store, NOW)
    expect(third).toMatchObject({ ok: true, state: 'activated', seatsUsed: 2 })
  })

  it('desactivar un equipo que no estaba devuelve removed: false', async () => {
    const store = ready()
    expect(await deactivate({ codeHash: HASH, machineId: 'machine-9999' }, store)).toEqual({
      ok: true,
      removed: false
    })
  })

  it('desactivar un codigo desconocido o con datos invalidos falla', async () => {
    const store = ready()
    expect(await deactivate({ codeHash: 'b'.repeat(64), machineId: 'machine-0001' }, store)).toEqual({
      ok: false,
      reason: 'unknown_code'
    })
    expect(await deactivate({ codeHash: HASH, machineId: 'x' }, store)).toEqual({
      ok: false,
      reason: 'invalid_input'
    })
  })
})

describe('lista de revocaciones', () => {
  it('devuelve todas las revocaciones y un cursor', async () => {
    const store = ready()
    store.revoked = [
      { codeHash: 'b'.repeat(64), revokedAt: '2026-10-01T00:00:00.000Z' },
      { codeHash: 'c'.repeat(64), revokedAt: '2026-10-15T00:00:00.000Z' }
    ]
    const result = await revocations({ since: null }, store, NOW)
    expect(result.codes).toEqual(['b'.repeat(64), 'c'.repeat(64)])
    expect(result.cursor).toBe(NOW)
  })

  it('filtra por el cursor y trata una fecha invalida como "desde el principio"', async () => {
    const store = ready()
    store.revoked = [
      { codeHash: 'b'.repeat(64), revokedAt: '2026-10-01T00:00:00.000Z' },
      { codeHash: 'c'.repeat(64), revokedAt: '2026-10-15T00:00:00.000Z' }
    ]
    expect((await revocations({ since: '2026-10-10T00:00:00.000Z' }, store, NOW)).codes).toEqual([
      'c'.repeat(64)
    ])
    expect((await revocations({ since: 'basura' }, store, NOW)).codes.length).toBe(2)
  })
})
