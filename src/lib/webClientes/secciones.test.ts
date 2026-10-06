import { describe, expect, it } from 'vitest'
import { requiereComentario, textoParaWeb } from './secciones'

describe('texto que va a la web con el PDF', () => {
  it('resumen y comentario, separados', () => {
    expect(textoParaWeb({ summary: 'Resumen', body: 'Comentario del comité' }, true)).toBe('Resumen\n\nComentario del comité')
    expect(textoParaWeb({ summary: null, body: '  Solo comentario ' }, true)).toBe('Solo comentario')
    expect(textoParaWeb({ summary: 'Resumen', body: 'Texto' }, false)).toBe('Resumen')
    expect(textoParaWeb({ summary: '', body: '' }, true)).toBeNull()
  })
  it('Comité de Inversiones pide comentario', () => {
    expect(requiereComentario('comite-inversiones')).toBe(true)
    expect(requiereComentario('renta-fija')).toBe(false)
  })
})
