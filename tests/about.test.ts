import { describe, expect, it, vi } from 'vitest'
import { computeAppHash, readThirdPartyNotices } from '../src/main/services/about'

// El servicio depende de `electron`, que no existe en el entorno de pruebas: se
// sustituye por lo minimo que necesita (sin empaquetar y sin paquete app.asar).
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd()
  }
}))

describe('Acerca de', () => {
  it('lee el fichero de avisos de terceros que viaja con el proyecto', () => {
    const notices = readThirdPartyNotices()
    expect(notices).not.toBeNull()
    expect(notices?.path.endsWith('THIRD-PARTY-NOTICES.md')).toBe(true)
    expect((notices?.text.length ?? 0)).toBeGreaterThan(0)
    expect(notices?.bytes ?? 0).toBeGreaterThan(0)
  })

  it('no inventa un hash cuando no existe un paquete app.asar', () => {
    // En desarrollo `app.getAppPath()` es un directorio, no un paquete.
    expect(computeAppHash()).toBeNull()
  })
})
