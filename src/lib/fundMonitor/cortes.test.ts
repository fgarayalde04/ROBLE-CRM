import { describe, expect, it } from 'vitest'
import { proximoCorte, ultimoCorte } from './cortes'

describe('cortes de rendimientos (15 y fin de mes)', () => {
  it('último corte', () => {
    expect(ultimoCorte('2026-10-06')).toBe('2026-09-30')
    expect(ultimoCorte('2026-10-14')).toBe('2026-09-30')
    expect(ultimoCorte('2026-10-15')).toBe('2026-10-15')
    expect(ultimoCorte('2026-10-30')).toBe('2026-10-15')
    expect(ultimoCorte('2026-10-31')).toBe('2026-10-31')
    expect(ultimoCorte('2027-02-28')).toBe('2027-02-28')
    expect(ultimoCorte('2027-03-01')).toBe('2027-02-28')
    expect(ultimoCorte('2027-01-10')).toBe('2026-12-31')
  })
  it('próximo corte', () => {
    expect(proximoCorte('2026-10-06')).toBe('2026-10-15')
    expect(proximoCorte('2026-10-15')).toBe('2026-10-31')
    expect(proximoCorte('2026-10-31')).toBe('2026-11-15')
    expect(proximoCorte('2026-12-31')).toBe('2027-01-15')
  })
})

describe('vigencia de 15 días', () => {
  it('se usa lo guardado hasta 14 días, a los 15 se vuelve a buscar', async () => {
    const { vigente } = await import('./cortes')
    expect(vigente('2026-10-15T12:00:00Z', '2026-10-29')).toBe(true)
    expect(vigente('2026-10-15T12:00:00Z', '2026-10-30')).toBe(false)
    expect(vigente('2026-10-15T12:00:00Z', '2026-10-31')).toBe(false)
    expect(vigente(null, '2026-10-31')).toBe(false)
  })
})
