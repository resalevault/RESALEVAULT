import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SKU_PATTERN,
  categoryToSkuPart,
  renderSkuPattern,
  skuCandidates,
  validateSkuPattern
} from '@shared/sku'

const ctx = {
  prefix: 'RV',
  categoryName: 'Camisetas',
  date: new Date('2026-03-07T10:00:00.000Z'),
  sequence: 42
}

describe('patron de SKU', () => {
  it('renderiza el patron por defecto', () => {
    expect(renderSkuPattern(DEFAULT_SKU_PATTERN, ctx)).toBe('RV-CAM-2603-0042')
  })

  it('renderiza todos los tokens admitidos', () => {
    const pattern = '{PREFIX}-{CAT}-{YYYY}-{YY}-{MM}-{DD}-{SEQ}'
    expect(renderSkuPattern(pattern, ctx)).toBe('RV-CAM-2026-26-03-07-42')
  })

  it('aplica el relleno de secuencia solicitado', () => {
    expect(renderSkuPattern('{SEQ:2}', ctx)).toBe('42')
    expect(renderSkuPattern('{SEQ:6}', ctx)).toBe('000042')
    expect(renderSkuPattern('{SEQ:1}', { ...ctx, sequence: 7 })).toBe('7')
  })

  it('normaliza el resultado a mayusculas y elimina separadores sobrantes', () => {
    expect(renderSkuPattern('{PREFIX}-{CAT}', { ...ctx, prefix: 'rv', categoryName: null })).toBe(
      'RV-GEN'
    )
    expect(renderSkuPattern('{PREFIX}--{CAT}', ctx)).toBe('RV-CAM')
    expect(renderSkuPattern('-{CAT}-', ctx)).toBe('CAM')
  })

  it('genera un fragmento de categoria estable y sin acentos', () => {
    expect(categoryToSkuPart('Camisetas')).toBe('CAM')
    expect(categoryToSkuPart('Niño')).toBe('NIN')
    expect(categoryToSkuPart('Ropa de niño')).toBe('ROP')
    expect(categoryToSkuPart(null)).toBe('GEN')
    expect(categoryToSkuPart('¿?')).toBe('GEN')
    expect(categoryToSkuPart('A', 4)).toBe('AXXX')
  })

  it('valida los patrones y detecta tokens desconocidos', () => {
    expect(validateSkuPattern('{PREFIX}-{SEQ:4}')).toEqual({ ok: true, unknownTokens: [], hasSequence: true })
    expect(validateSkuPattern('{PREFIX}-{RANDOM}').ok).toBe(false)
    expect(validateSkuPattern('{PREFIX}-{RANDOM}').unknownTokens).toContain('{RANDOM}')
    expect(validateSkuPattern('{PREFIX').ok).toBe(false)
    expect(validateSkuPattern('{CAT}').hasSequence).toBe(false)
    // El modificador solo es valido en SEQ.
    expect(validateSkuPattern('{CAT:3}').ok).toBe(false)
  })

  it('genera candidatos consecutivos sin repetir', () => {
    const generator = skuCandidates('{PREFIX}-{SEQ:2}', { prefix: 'RV', categoryName: null, date: ctx.date }, 7)
    expect(generator.next().value).toBe('RV-07')
    expect(generator.next().value).toBe('RV-08')
    expect(generator.next().value).toBe('RV-09')
  })
})
