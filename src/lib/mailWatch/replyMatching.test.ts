import { describe, it, expect } from 'vitest'
import { stripReplyPrefixes, hasReplyPrefix, isAutomatedSender, looksLikeReply } from './replyMatching'

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
