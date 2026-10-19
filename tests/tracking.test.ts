import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@main/errors'
import { LAYOUT } from '@shared/layout'
import { CARRIER_SEED } from '@shared/carriers-seed'
import {
  buildTrackUrl,
  isSafeTrackingUrl,
  isValidTrackingCode,
  normalizeTrackingCode
} from '@shared/tracking-url'
import { createTestContext, daysAgoIso } from './helpers'

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) return error.code
    throw error
  }
  throw new Error('Se esperaba un error de dominio')
}

describe('URLs de seguimiento', () => {
  it('rellena el codigo en la plantilla cuando existe', () => {
    const result = buildTrackUrl(
      { strategy: 'url', trackUrl: 'https://x.test/', urlTemplate: 'https://x.test/track?n={code}' },
      'ABC 123'
    )
    expect(result).toEqual({ url: 'https://x.test/track?n=ABC%20123', filledByUrl: true })
  })

  it('cae a la pagina oficial cuando no hay plantilla', () => {
    const result = buildTrackUrl(
      { strategy: 'copy', trackUrl: 'https://x.test/track', urlTemplate: '' },
      'ABC123'
    )
    expect(result).toEqual({ url: 'https://x.test/track', filledByUrl: false })
  })

  it('rechaza plantillas que no sean https', () => {
    expect(
      buildTrackUrl(
        { strategy: 'url', trackUrl: 'https://x.test/', urlTemplate: 'http://x.test/?n={code}' },
        'A1'
      )
    ).toBeNull()
    expect(
      buildTrackUrl({ strategy: 'copy', trackUrl: 'javascript:alert(1)', urlTemplate: '' }, 'A1')
    ).toBeNull()
    expect(
      buildTrackUrl({ strategy: 'copy', trackUrl: 'file:///C:/x', urlTemplate: '' }, 'A1')
    ).toBeNull()
  })

  it('valida URLs absolutas https', () => {
    expect(isSafeTrackingUrl('https://a.test/x')).toBe(true)
    expect(isSafeTrackingUrl('http://a.test/x')).toBe(false)
    expect(isSafeTrackingUrl('/relativa')).toBe(false)
    expect(isSafeTrackingUrl('no es una url')).toBe(false)
  })

  it('normaliza el codigo sin perder informacion util', () => {
    expect(normalizeTrackingCode('  ab 123-cd ')).toBe('AB123-CD')
    expect(normalizeTrackingCode('1Z999AA10123456784')).toBe('1Z999AA10123456784')
    expect(isValidTrackingCode('AB12')).toBe(true)
    expect(isValidTrackingCode('A1')).toBe(false)
    expect(isValidTrackingCode('')).toBe(false)
  })
})

describe('catalogo de transportistas', () => {
  it('no tiene identificadores repetidos', () => {
    const ids = CARRIER_SEED.map((carrier) => carrier.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todas las URLs son https absolutas', () => {
    for (const carrier of CARRIER_SEED) {
      expect(isSafeTrackingUrl(carrier.trackUrl), carrier.id).toBe(true)
      if (carrier.urlTemplate) {
        // La plantilla se valida sustituyendo el hueco por un valor inocuo.
        expect(
          isSafeTrackingUrl(carrier.urlTemplate.replace(/\{code\}/g, 'X')),
          carrier.id
        ).toBe(true)
      }
    }
  })

  it('la estrategia es coherente con la plantilla', () => {
    for (const carrier of CARRIER_SEED) {
      if (carrier.strategy === 'url') {
        expect(carrier.urlTemplate.includes('{code}'), carrier.id).toBe(true)
      } else {
        expect(carrier.urlTemplate, carrier.id).toBe('')
      }
    }
  })

  it('incluye una seleccion amplia y cubre España, Europa e internacional', () => {
    expect(CARRIER_SEED.length).toBeGreaterThanOrEqual(45)
    const regions = new Set(CARRIER_SEED.map((carrier) => carrier.region))
    expect(regions.has('ES')).toBe(true)
    expect(regions.has('EU')).toBe(true)
    expect(regions.has('INT')).toBe(true)

    const names = CARRIER_SEED.map((carrier) => carrier.id)
    for (const expected of ['correos', 'seur', 'mrw', 'nacex', 'dhl', 'ups', 'fedex', 'dpd', 'royal-mail', 'usps']) {
      expect(names).toContain(expected)
    }
  })

  it('marca como no verificados los dominios que no respondieron', () => {
    const unverified = CARRIER_SEED.filter((carrier) => !carrier.verified).map((carrier) => carrier.id)
    // Se comprobaron de verdad: estos no respondieron o bloquearon la peticion.
    expect(unverified.length).toBeGreaterThan(0)
    expect(unverified).toContain('envialia')
  })
})

describe('repositorio de seguimiento', () => {
  function setup() {
    const ctx = createTestContext()
    ctx.repos.tracking.ensureSeed()
    return ctx
  }

  it('siembra el catalogo y no lo duplica al repetir', () => {
    const ctx = setup()
    const first = ctx.repos.tracking.listCarriers()
    expect(first.length).toBeGreaterThanOrEqual(45)

    const second = ctx.repos.tracking.ensureSeed()
    expect(second.inserted).toBe(0)
    expect(ctx.repos.tracking.listCarriers().length).toBe(first.length)
    ctx.close()
  })

  it('respeta las correcciones del usuario al volver a sembrar', () => {
    const ctx = setup()
    ctx.repos.tracking.updateCarrier('correos', { trackUrl: 'https://mi-proxy.test/correos' })
    ctx.repos.tracking.ensureSeed()

    const carrier = ctx.repos.tracking.getCarrier('correos')
    expect(carrier.trackUrl).toBe('https://mi-proxy.test/correos')
    ctx.close()
  })

  it('filtra transportistas por region y busqueda', () => {
    const ctx = setup()
    expect(ctx.repos.tracking.listCarriers({ region: 'ES' }).every((c) => c.region === 'ES')).toBe(true)
    expect(ctx.repos.tracking.listCarriers({ search: 'correos' }).length).toBeGreaterThan(0)
    expect(ctx.repos.tracking.listCarriers({ search: 'zzzz' })).toEqual([])
    ctx.close()
  })

  it('crea un codigo y lo conserva', () => {
    const ctx = setup()
    const created = ctx.repos.tracking.createTrackcode({
      code: '  ab123456 cd ',
      carrierId: 'seur',
      name: 'Zapatillas',
      orderRef: 'V-1'
    })

    expect(created.code).toBe('AB123456CD')
    expect(created.carrierName).toBe('SEUR')
    expect(created.status).toBe('pending')
    // Sin estado puesto por el usuario, la fuente es 'none'.
    expect(created.statusSource).toBe('none')

    const list = ctx.repos.tracking.listTrackcodes()
    expect(list.total).toBe(1)
    ctx.close()
  })

  it('detecta duplicados y los rechaza: el mismo codigo es el mismo paquete', () => {
    const ctx = setup()
    ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' })

    expect(codeOf(() => ctx.repos.tracking.createTrackcode({ code: 'abc123', carrierId: 'seur' }))).toBe(
      'conflict'
    )
    const duplicate = ctx.repos.tracking.findDuplicate('ABC123', 'seur')
    expect(duplicate?.code).toBe('ABC123')

    // El mismo codigo en OTRO transportista si es valido.
    const other = ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'correos' })
    expect(other.carrierId).toBe('correos')

    // No existe "forzar": el indice unico impide duplicar el mismo envio.
    expect(codeOf(() => ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' }))).toBe(
      'conflict'
    )
    expect(ctx.repos.tracking.listTrackcodes().total).toBe(2)
    ctx.close()
  })

  it('rechaza codigos vacios o demasiado cortos', () => {
    const ctx = setup()
    expect(codeOf(() => ctx.repos.tracking.createTrackcode({ code: '   ', carrierId: 'seur' }))).toBe(
      'invalid_input'
    )
    expect(codeOf(() => ctx.repos.tracking.createTrackcode({ code: 'A1', carrierId: 'seur' }))).toBe(
      'invalid_input'
    )
    ctx.close()
  })

  it('marca un estado manual y lo distingue de una confirmacion', () => {
    const ctx = setup()
    const created = ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' })
    expect(created.statusSource).toBe('none')

    const updated = ctx.repos.tracking.setStatus(created.id, 'in_transit')
    expect(updated.status).toBe('in_transit')
    expect(updated.statusSource).toBe('manual')

    // Abrir la pagina NO cambia el estado ni lo confirma.
    ctx.repos.tracking.touchOpened(created.id)
    const afterOpen = ctx.repos.tracking.getTrackcode(created.id)
    expect(afterOpen.lastOpenedAt).not.toBeNull()
    expect(afterOpen.status).toBe('in_transit')
    expect(afterOpen.statusSource).toBe('manual')
    ctx.close()
  })

  it('archiva, restaura y elimina respetando la unicidad', () => {
    const ctx = setup()
    const created = ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' })

    expect(ctx.repos.tracking.archive([created.id]).affected).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes().total).toBe(0)
    expect(ctx.repos.tracking.listTrackcodes({ onlyArchived: true }).total).toBe(1)

    // Archivar libera el codigo: se puede volver a anadir el mismo.
    const again = ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' })
    expect(again.id).not.toBe(created.id)

    // Pero restaurar el antiguo mientras el activo sigue existiendo chocaria
    // con el indice unico: se rechaza con un error claro.
    expect(codeOf(() => ctx.repos.tracking.restore([created.id]))).toBe('conflict')

    // Al quitar el activo, la restauracion funciona.
    expect(ctx.repos.tracking.remove([again.id]).affected).toBe(1)
    expect(ctx.repos.tracking.restore([created.id]).affected).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes().total).toBe(1)

    expect(ctx.repos.tracking.remove([created.id]).affected).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes().total).toBe(0)
    ctx.close()
  })

  it('busca por codigo, nombre, referencia y transportista', () => {
    const ctx = setup()
    ctx.repos.tracking.createTrackcode({
      code: 'ZZZ999',
      carrierId: 'seur',
      name: 'Zapatillas azules',
      orderRef: 'VINTED-88'
    })
    ctx.repos.tracking.createTrackcode({ code: 'AAA111', carrierId: 'correos', name: 'Libro' })

    expect(ctx.repos.tracking.listTrackcodes({ search: 'ZZZ' }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ search: 'zapatillas' }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ search: 'VINTED-88' }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ search: 'correos' }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ search: 'nada' }).total).toBe(0)
    ctx.close()
  })

  it('filtra por transportista y por estado', () => {
    const ctx = setup()
    const a = ctx.repos.tracking.createTrackcode({ code: 'AAA111', carrierId: 'seur' })
    ctx.repos.tracking.createTrackcode({ code: 'BBB222', carrierId: 'correos' })
    ctx.repos.tracking.setStatus(a.id, 'delivered')

    expect(ctx.repos.tracking.listTrackcodes({ carrierIds: ['seur'] }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ statuses: ['delivered'] }).total).toBe(1)
    expect(ctx.repos.tracking.listTrackcodes({ statuses: ['pending'] }).total).toBe(1)
    ctx.close()
  })

  it('ordena por entrega prevista', () => {
    const ctx = setup()
    ctx.repos.tracking.createTrackcode({ code: 'OLD111', carrierId: 'seur', expectedDate: daysAgoIso(3) })
    ctx.repos.tracking.createTrackcode({ code: 'NEW222', carrierId: 'seur', expectedDate: daysAgoIso(1) })

    // created_at puede coincidir al milisegundo; se comprueba el orden por
    // entrega, que es determinista.
    expect(ctx.repos.tracking.listTrackcodes({ sort: 'created_desc' }).total).toBe(2)

    const byExpected = ctx.repos.tracking.listTrackcodes({ sort: 'expected_asc' })
    expect(byExpected.items[0]?.code).toBe('OLD111')

    const byCarrier = ctx.repos.tracking.listTrackcodes({ sort: 'carrier_asc' })
    expect(byCarrier.total).toBe(2)
    ctx.close()
  })

  it('no permite borrar un transportista del catalogo ni uno con envios', () => {
    const ctx = setup()
    expect(codeOf(() => ctx.repos.tracking.removeCarrier('seur'))).toBe('conflict')

    const custom = ctx.repos.tracking.createCarrier({
      id: 'mi-transportista',
      name: 'Mi transportista',
      region: 'ES',
      trackUrl: 'https://mitransportista.test/seguimiento'
    })
    ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: custom.id })
    expect(codeOf(() => ctx.repos.tracking.removeCarrier(custom.id))).toBe('cannot_delete_in_use')
    ctx.close()
  })

  it('valida que la URL del transportista sea https', () => {
    const ctx = setup()
    expect(
      codeOf(() =>
        ctx.repos.tracking.createCarrier({
          id: 'inseguro',
          name: 'Inseguro',
          region: 'ES',
          trackUrl: 'http://inseguro.test/'
        })
      )
    ).toBe('invalid_input')
    ctx.close()
  })

  it('los eventos empiezan vacios: no se inventan seguimientos', () => {
    const ctx = setup()
    const created = ctx.repos.tracking.createTrackcode({ code: 'ABC123', carrierId: 'seur' })
    expect(ctx.repos.tracking.listEvents(created.id)).toEqual([])
    expect(created.eventCount).toBe(0)
    ctx.close()
  })
})

describe('maquetacion compartida', () => {
  it('las constantes coinciden con las variables CSS', () => {
    // Si estos valores se desincronizan, la vista web nativa taparia la barra
    // o dejaria un hueco. La prueba lo detecta antes de compilar el instalador.
    const css = readFileSync(join(process.cwd(), 'src', 'renderer', 'src', 'app.css'), 'utf8')

    const readVar = (name: string): number => {
      const match = new RegExp(`--${name}:\\s*(\\d+)px`).exec(css)
      expect(match, `variable --${name}`).not.toBeNull()
      return Number(match?.[1])
    }

    expect(readVar('titlebar-height')).toBe(LAYOUT.titlebarHeight)
    expect(readVar('sidebar-width')).toBe(LAYOUT.sidebarWidth)
    expect(readVar('browser-chrome-height')).toBe(LAYOUT.browserChromeHeight)
  })

  it('las constantes son razonables para una ventana de escritorio', () => {
    expect(LAYOUT.titlebarHeight).toBeGreaterThanOrEqual(28)
    expect(LAYOUT.titlebarHeight).toBeLessThanOrEqual(56)
    expect(LAYOUT.sidebarWidth).toBeGreaterThanOrEqual(180)
    expect(LAYOUT.browserChromeHeight).toBeGreaterThanOrEqual(36)
    expect(LAYOUT.browserChromeHeight).toBeLessThanOrEqual(64)
  })
})

describe('archivos del modulo', () => {
  it('existe la migracion del shipping tracker', () => {
    expect(
      existsSync(join(process.cwd(), 'src', 'main', 'db', 'migrations', '004-tracking.ts'))
    ).toBe(true)
  })
})
