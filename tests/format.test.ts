import { describe, expect, it } from 'vitest'
import {
  amountToCents,
  centsToAmount,
  daysBetween,
  formatCents,
  formatInteger,
  formatPercent,
  marginPercent,
  parseAmountToCents
} from '@shared/format'

describe('formato de importes', () => {
  it('convierte centimos a importe y viceversa sin deriva binaria', () => {
    expect(centsToAmount(1999)).toBe(19.99)
    expect(amountToCents(19.99)).toBe(1999)
    expect(amountToCents(0.1 + 0.2)).toBe(30)
    expect(amountToCents(-4.005)).toBe(-401)
  })

  it('interpreta importes con formato espanol', () => {
    expect(parseAmountToCents('19,99', 'es')).toBe(1999)
    expect(parseAmountToCents('1.234,56', 'es')).toBe(123456)
    expect(parseAmountToCents('1.234', 'es')).toBe(123400)
    expect(parseAmountToCents('12', 'es')).toBe(1200)
    expect(parseAmountToCents('0,05', 'es')).toBe(5)
  })

  it('interpreta importes con formato anglosajon', () => {
    expect(parseAmountToCents('19.99', 'en')).toBe(1999)
    expect(parseAmountToCents('1,234.56', 'en')).toBe(123456)
    expect(parseAmountToCents('1,234', 'en')).toBe(123400)
    expect(parseAmountToCents('0.05', 'en')).toBe(5)
  })

  it('ignora simbolos de moneda y espacios', () => {
    expect(parseAmountToCents(' 19,99 EUR ', 'es')).toBe(1999)
    expect(parseAmountToCents('$1,299.00', 'en')).toBe(129900)
  })

  it('interpreta negativos y formato contable', () => {
    expect(parseAmountToCents('-12,50', 'es')).toBe(-1250)
    expect(parseAmountToCents('(12,50)', 'es')).toBe(-1250)
  })

  it('devuelve null cuando el texto no es un importe', () => {
    expect(parseAmountToCents('', 'es')).toBeNull()
    expect(parseAmountToCents('   ', 'es')).toBeNull()
    expect(parseAmountToCents('abc', 'es')).toBeNull()
    expect(parseAmountToCents(',', 'es')).toBeNull()
  })

  it('formatea en el idioma y la divisa indicados', () => {
    // Los espacios de Intl no son consistentes entre versiones de ICU, por eso
    // se normalizan antes de comparar.
    const normalize = (value: string): string => value.replace(/\u00a0|\u202f/g, ' ')
    expect(normalize(formatCents(1999, { locale: 'es-ES', currency: 'EUR' }))).toBe('19,99 €')
    expect(normalize(formatCents(1999, { locale: 'en-US', currency: 'USD' }))).toBe('$19.99')
    expect(normalize(formatCents(-1250, { locale: 'es-ES', currency: 'EUR', accounting: true }))).toBe(
      '(12,50 €)'
    )
  })

  it('formatea porcentajes y enteros', () => {
    const normalize = (value: string): string => value.replace(/\u00a0|\u202f/g, ' ')
    expect(normalize(formatPercent(32.5, 'es-ES'))).toBe('32,5 %')
    expect(normalize(formatInteger(1234567, 'es-ES'))).toBe('1.234.567')
  })
})

describe('formulas financieras', () => {
  it('calcula el margen sobre el precio de venta', () => {
    expect(marginPercent(1000, 600)).toBeCloseTo(40, 6)
    expect(marginPercent(1000, 1000)).toBe(0)
    expect(marginPercent(1000, 1200)).toBeCloseTo(-20, 6)
  })

  it('devuelve null cuando el precio de venta no permite calcular margen', () => {
    expect(marginPercent(0, 100)).toBeNull()
    expect(marginPercent(-100, 100)).toBeNull()
  })

  it('calcula dias transcurridos', () => {
    const now = new Date('2026-06-15T12:00:00.000Z')
    expect(daysBetween('2026-06-15', now)).toBe(0)
    expect(daysBetween('2026-06-01', now)).toBe(14)
    // Una fecha futura nunca devuelve un numero negativo.
    expect(daysBetween('2026-07-01', now)).toBe(0)
  })
})
