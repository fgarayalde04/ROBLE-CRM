import { describe, it, expect } from 'vitest'
import { newAprobacionToken, isAprobacionToken, extractAprobacionRef, parseAprobacion, buildAprobacionEmail } from './aprobacion'
import { extractReplyText } from './mailWatch/replyMatching'

describe('referencia de la orden', () => {
  it('genera referencias válidas de 8 caracteres', () => {
    for (let i = 0; i < 50; i++) expect(isAprobacionToken(newAprobacionToken())).toBe(true)
  })
  it('la encuentra en la respuesta armada por el botón (snippet de Gmail, todo en una línea)', () => {
    expect(extractAprobacionRef('APRUEBO Ref. orden: ABCD2345 Comentarios: dale')).toBe('ABCD2345')
    expect(extractAprobacionRef('no apruebo ref orden abcd2345')).toBe('ABCD2345')
  })
  it('lee el rótulo nuevo, con o sin tildes', () => {
    expect(extractAprobacionRef('APRUEBO Código de confirmación: ABCD2345')).toBe('ABCD2345')
    expect(extractAprobacionRef('no apruebo codigo de confirmacion abcd2345')).toBe('ABCD2345')
    expect(parseAprobacion('APRUEBO Código de confirmación: ABCD2345 Comentarios: dale')).toEqual({ decision: 'aprobada', comentario: 'dale' })
  })
  it('sin referencia → null', () => {
    expect(extractAprobacionRef('Apruebo, gracias')).toBeNull()
  })
})

describe('parseAprobacion', () => {
  it('APRUEBO del botón, con comentario', () => {
    expect(parseAprobacion('APRUEBO Ref. orden: ABCD2345 Comentarios: Ejecutar antes del cierre')).toEqual({
      decision: 'aprobada', comentario: 'Ejecutar antes del cierre',
    })
  })
  it('NO APRUEBO del botón, sin comentario', () => {
    expect(parseAprobacion('NO APRUEBO Ref. orden: ABCD2345 Comentarios:')).toEqual({ decision: 'rechazada', comentario: null })
  })
  it('respuesta escrita a mano en el mismo hilo', () => {
    expect(parseAprobacion('Apruebo. Saludos')).toEqual({ decision: 'aprobada', comentario: 'Saludos' })
    expect(parseAprobacion('no aprobado, prefiero esperar')).toEqual({ decision: 'rechazada', comentario: 'prefiero esperar' })
  })
  it('un "apruebo" que no está al comienzo no cuenta', () => {
    expect(parseAprobacion('Consulta: si apruebo hoy, cuándo se ejecuta?')).toBeNull()
    expect(parseAprobacion('Gracias!')).toBeNull()
  })
  it('el comentario termina donde empieza el detalle de la orden que trae la respuesta', () => {
    const snippet = 'APRUEBO Ref. orden: ABCD2345 Comentarios: Dale, gracias ----- Detalle de la orden ----- Compra 100 AAPL'
    expect(parseAprobacion(extractReplyText(snippet))).toEqual({ decision: 'aprobada', comentario: 'Dale, gracias' })
    expect(extractAprobacionRef(extractReplyText(snippet))).toBe('ABCD2345')
  })
  it('funciona sobre el texto ya sin la cita del mail original', () => {
    const text = extractReplyText('APRUEBO Ref. orden: ABCD2345 El jue, 25 sept 2026 a las 16:19, Mesa escribió: Confirmacion de orden')
    expect(parseAprobacion(text)).toEqual({ decision: 'aprobada', comentario: null })
  })
})

describe('buildAprobacionEmail', () => {
  const built = buildAprobacionEmail({
    body: 'Detalle <orden>', subject: 'Confirmacion de orden - 1234', replyTo: 'trading@roblecapital.net',
    asesorEmail: 'asesor@roblecapital.net', ref: 'ABCD2345',
  })
  it('los botones arman una respuesta a trading@ con copia al asesor, la palabra clave y la referencia', () => {
    const hrefs = Array.from(built.html.matchAll(/href="([^"]+)"/g), (m) => m[1].replace(/&amp;/g, '&'))
    // Un solo par de botones, al final
    expect(hrefs).toHaveLength(2)
    const [si, no] = hrefs.map((h) => new URL(h))
    expect(si.protocol).toBe('mailto:')
    expect(si.pathname).toBe('trading@roblecapital.net')
    expect(si.searchParams.get('cc')).toBe('asesor@roblecapital.net')
    expect(si.searchParams.get('subject')).toBe('Re: Confirmacion de orden - 1234')
    expect(si.searchParams.get('body')).toMatch(/^APRUEBO\r\nCódigo de confirmación: ABCD2345/)
    expect(no.searchParams.get('body')).toMatch(/^NO APRUEBO\r\n/)
    // El cliente ve el detalle de la orden mientras responde
    expect(si.searchParams.get('body')).toContain('----- Detalle de la orden -----\r\nDetalle <orden>')
  })
  it('los botones aparecen solo después del detalle', () => {
    const detalle = built.html.indexOf('Detalle &lt;orden&gt;')
    expect(built.html.indexOf('Aprobar esta orden')).toBeGreaterThan(detalle)
  })
  it('escapa el cuerpo en el HTML y deja instrucciones en el texto plano', () => {
    expect(built.html).toContain('Detalle &lt;orden&gt;')
    expect(built.text).toContain('APRUEBO')
    expect(built.text).toContain('Código de confirmación: ABCD2345')
  })
})
