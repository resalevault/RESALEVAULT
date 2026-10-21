import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El servicio de enlaces depende de `electron` (`shell` y `clipboard`). Se
 * sustituye por dobles para poder comprobar:
 *  - que SOLO se abre el destino de la lista blanca (no una URL arbitraria),
 *  - que un fallo real de `openExternal` se comunica como error, no como exito,
 *  - que copiar devuelve la URL exacta.
 */
const openExternal = vi.fn(async (_url: string): Promise<void> => undefined)
const writeText = vi.fn((_text: string): void => undefined)

vi.mock('electron', () => ({
  shell: { openExternal: (url: string) => openExternal(url) },
  clipboard: { writeText: (text: string) => writeText(text) }
}))

const { ALLOWED_LINKS, resolveLink, isAllowedUrl } = await import('../src/shared/links')
const { LinkService } = await import('../src/main/services/links')

describe('lista blanca de enlaces', () => {
  it('contiene el Discord oficial con la URL exacta', () => {
    expect(ALLOWED_LINKS.discord_invite.url).toBe('https://discord.gg/9bMhnGvjrx')
  })

  it('todas las URLs permitidas son HTTPS', () => {
    for (const entry of Object.values(ALLOWED_LINKS)) {
      expect(entry.url.startsWith('https://')).toBe(true)
    }
  })

  it('resuelve solo los destinos declarados', () => {
    expect(resolveLink('discord_invite')?.url).toBe('https://discord.gg/9bMhnGvjrx')
    expect(resolveLink('otra_cosa')).toBeNull()
    expect(resolveLink('')).toBeNull()
  })

  it('isAllowedUrl distingue la URL permitida de cualquier otra', () => {
    expect(isAllowedUrl('https://discord.gg/9bMhnGvjrx')).toBe(true)
    expect(isAllowedUrl('https://evil.example.com')).toBe(false)
    // Una variante parecida tampoco vale: la comparacion es exacta.
    expect(isAllowedUrl('https://discord.gg/9bMhnGvjrx/')).toBe(false)
  })
})

describe('LinkService', () => {
  beforeEach(() => {
    openExternal.mockClear()
    writeText.mockClear()
    openExternal.mockResolvedValue(undefined)
  })

  it('abre el destino permitido en el navegador del sistema', async () => {
    const service = new LinkService()
    const result = await service.open('discord_invite')
    expect(result.opened).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://discord.gg/9bMhnGvjrx')
  })

  it('rechaza un destino desconocido sin abrir nada', async () => {
    const service = new LinkService()
    await expect(service.open('hack' as never)).rejects.toThrow()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('informa de un fallo real al abrir, en lugar de decir que se abrio', async () => {
    const service = new LinkService()
    openExternal.mockRejectedValueOnce(new Error('no hay navegador'))
    await expect(service.open('discord_invite')).rejects.toThrow()
  })

  it('copia la URL exacta al portapapeles', () => {
    const service = new LinkService()
    const result = service.copy('discord_invite')
    expect(result.copied).toBe(true)
    expect(result.url).toBe('https://discord.gg/9bMhnGvjrx')
    expect(writeText).toHaveBeenCalledWith('https://discord.gg/9bMhnGvjrx')
  })

  it('rechaza copiar un destino desconocido', () => {
    const service = new LinkService()
    expect(() => service.copy('hack' as never)).toThrow()
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('textos del boton de compra (es/en)', () => {
  it('el texto del boton es exactamente Comprar licencia / Buy license', async () => {
    const { es } = await import('../src/renderer/src/i18n/es')
    const { en } = await import('../src/renderer/src/i18n/en')
    expect(es.plan.buyButton).toBe('Comprar licencia')
    expect(en.plan.buyButton).toBe('Buy license')
  })

  it('no promete una compra ni pide datos de pago desde la app', async () => {
    const { es } = await import('../src/renderer/src/i18n/es')
    const { en } = await import('../src/renderer/src/i18n/en')
    // El aviso debe decir explicitamente que NO se compra desde la aplicacion.
    expect(es.plan.buyNoPayment.toLowerCase()).toContain('no')
    expect(es.plan.buyNoPayment.toLowerCase()).toContain('pago')
    expect(en.plan.buyNoPayment.toLowerCase()).toContain('not')
  })

  it('existe un texto de respaldo por si el enlace no se abre', async () => {
    const { es } = await import('../src/renderer/src/i18n/es')
    const { en } = await import('../src/renderer/src/i18n/en')
    expect(es.plan.buyOpenFailed.length).toBeGreaterThan(0)
    expect(en.plan.buyOpenFailed.length).toBeGreaterThan(0)
    expect(es.plan.buyCopy.length).toBeGreaterThan(0)
    expect(en.plan.buyCopy.length).toBeGreaterThan(0)
  })
})
