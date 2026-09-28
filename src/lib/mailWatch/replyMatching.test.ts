import { describe, it, expect } from 'vitest'
import { stripReplyPrefixes, hasReplyPrefix, isAutomatedSender, looksLikeReply, extractReplyText } from './replyMatching'

describe('stripReplyPrefixes', () => {
  it('quita Re:/RV:/Fwd: repetidos, sin importar mayúsculas', () => {
    expect(stripReplyPrefixes('Re: Re: Confirmacion de orden - 1234')).toBe('Confirmacion de orden - 1234')
    expect(stripReplyPrefixes('RV: Confirmacion de orden')).toBe('Confirmacion de orden')
    expect(stripReplyPrefixes('  re :  Fwd: Hola')).toBe('Hola')
  })
  it('no toca un asunto sin prefijo', () => {
    expect(stripReplyPrefixes('Confirmacion de orden - Re: algo')).toBe('Confirmacion de orden - Re: algo')
  })
})

describe('hasReplyPrefix', () => {
  it('detecta Re:/RV: pero no Fwd:', () => {
    expect(hasReplyPrefix('Re: hola')).toBe(true)
    expect(hasReplyPrefix('RV: hola')).toBe(true)
    expect(hasReplyPrefix('Fwd: hola')).toBe(false)
    expect(hasReplyPrefix('Resumen de mercado')).toBe(false)
  })
})

describe('isAutomatedSender', () => {
  it('detecta rebotes del servidor de mail', () => {
    expect(isAutomatedSender('mailer-daemon@googlemail.com')).toBe(true)
    expect(isAutomatedSender('postmaster@empresa.com')).toBe(true)
    expect(isAutomatedSender('cliente@gmail.com')).toBe(false)
  })
})

describe('looksLikeReply', () => {
  it('un mail nuevo (id = threadId, sin Re:) no es una respuesta', () => {
    expect(looksLikeReply({ id: 'a1', threadId: 'a1', subject: 'Newsletter semanal' })).toBe(false)
  })
  it('un mensaje dentro de un hilo existente sí', () => {
    expect(looksLikeReply({ id: 'b2', threadId: 'a1', subject: 'Confirmacion' })).toBe(true)
  })
  it('un mensaje nuevo con prefijo Re: sí (respuesta desde otra cuenta, hilo nuevo)', () => {
    expect(looksLikeReply({ id: 'c3', threadId: 'c3', subject: 'Re: Confirmacion de orden' })).toBe(true)
  })
})

describe('extractReplyText', () => {
  it('deja solo lo que escribió el cliente, sin la cita de Gmail', () => {
    expect(extractReplyText('Ok, confirmo. Gracias El jue, 25 sept 2026 a las 16:19, Mesa de Operaciones | Roble Capital (&lt;trading@roblecapital.net&gt;) escribió: Estimado'))
      .toBe('Ok, confirmo. Gracias')
  })
  it('corta citas en inglés, de Outlook y firmas del celular', () => {
    expect(extractReplyText('Approved On Thu, Sep 25, 2026 at 4:19 PM Mesa wrote: hi')).toBe('Approved')
    expect(extractReplyText('Dale adelante ________________________________ De: Mesa')).toBe('Dale adelante')
    expect(extractReplyText('Si Enviado desde mi iPhone El 25 sep 2026, a las 16:19, Mesa escribió:')).toBe('Si')
  })
  it('decodifica entidades y colapsa espacios', () => {
    expect(extractReplyText('It&#39;s   ok &amp; go')).toBe("It's ok & go")
  })
  it('no corta el texto propio aunque diga "el" o "escribió"', () => {
    expect(extractReplyText('Confirmo el bono, de acuerdo con lo que escribió Juan: ok'))
      .toBe('Confirmo el bono, de acuerdo con lo que escribió Juan: ok')
  })
  it('devuelve vacío si todo es cita', () => {
    expect(extractReplyText('El jue, 25 sept 2026, Mesa escribió: texto')).toBe('')
  })
})
