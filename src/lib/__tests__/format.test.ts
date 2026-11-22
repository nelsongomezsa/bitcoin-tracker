import { describe, expect, it } from 'vitest'
import { dinero, dineroConSigno, porcentaje, porcentajeConSigno } from '../format'

describe('formato es-ES', () => {
  it('importes y porcentajes', () => {
    expect(dinero(1234.56)).toBe('1234,56 €')
    expect(dinero(12345.6)).toBe('12.345,60 €')
    expect(dinero(1234.5, 'USD')).toBe('1234,50 $')
    expect(porcentaje(0.1234)).toBe('12,34 %')
  })
  it('con signo: positivo, negativo y cero', () => {
    expect(dineroConSigno(321.16)).toBe('+321,16 €')
    expect(dineroConSigno(-680.11)).toBe('−680,11 €')
    expect(dineroConSigno(0)).toBe('0,00 €')
    expect(porcentajeConSigno(0.0905)).toBe('+9,05 %')
    expect(porcentajeConSigno(-0.0957)).toBe('−9,57 %')
  })
  it('un valor que se redondea a cero no lleva signo («−0,00 €», «−0,0 %»)', () => {
    expect(dineroConSigno(-0.004)).toBe('0,00 €')
    expect(dineroConSigno(0.004)).toBe('0,00 €')
    expect(dineroConSigno(-0.005)).toBe('−0,01 €')
    expect(porcentajeConSigno(-0.0004, 1)).toBe('0,0 %')
    expect(porcentajeConSigno(0.00004)).toBe('0,00 %')
    expect(porcentajeConSigno(-0.0006, 1)).toBe('−0,1 %')
  })
})
