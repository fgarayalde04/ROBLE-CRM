import { describe, expect, it } from 'vitest'
import { alinearConEncabezado } from './davinciScraper'

const fila = ['Jupiter Financial Contingent Capital★★★', '', '4.10', '2.85', '11.31', '5.73', '9.0', '8.0', '7.0', '-6.0', '5.0', '0.9', '0.6', '1.2B', '', '30/09/2026']
const encabezados = ['Nombre', '', 'YTD', '1A', '3A', '5A', '2025', '2024', '2023', '2022', '2021', 'Sharpe 3A', 'Sharpe 5A', 'AUM', '', 'Fecha']

describe('alinearConEncabezado', () => {
  it('con el orden de siempre no cambia nada', () => {
    expect(alinearConEncabezado(encabezados, fila)).toEqual(fila)
  })
  it('si Davinci agrega columnas (1M, 3M, 6M) se lee cada valor por su encabezado', () => {
    const h = ['Nombre', '', '1M', '3M', '6M', 'YTD', '1A', '3A', '5A', '2025', '2024', '2023', '2022', '2021', 'Sharpe 3A', 'Sharpe 5A', 'AUM', '', 'Fecha']
    const c = [fila[0], '', '-0.88', '0.14', '1.40', ...fila.slice(2)]
    const r = alinearConEncabezado(h, c)
    expect(r.slice(2, 11)).toEqual(fila.slice(2, 11))
    expect(r[13]).toBe('1.2B')
    expect(r[15]).toBe('30/09/2026')
  })
  it('columnas iniciales sin encabezado (checkbox) no corren los valores', () => {
    expect(alinearConEncabezado(encabezados.slice(1), fila)).toEqual(fila)
  })
  it('sin encabezados reconocibles no devuelve nada (no adivina el orden)', () => {
    expect(alinearConEncabezado([], fila)).toBeNull()
    expect(alinearConEncabezado(fila.map(() => 'x'), fila)).toBeNull()
    expect(alinearConEncabezado(['Nombre', '', '1M', '3M', '6M', '1A'], fila)).toBeNull()
  })
})
