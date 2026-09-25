// Reglas puras para decidir si un mail entrante a trading@ es una respuesta de
// cliente y a qué orden pertenece — separadas del acceso a Gmail/DB para poder
// testearlas sin nada de eso.

const REPLY_PREFIX = /^\s*((re|rv)\s*:\s*)+/i
const ANY_PREFIX = /^\s*((re|rv|fwd|fw)\s*:\s*)+/i

/** "Re: Re: Confirmacion de orden - X" → "Confirmacion de orden - X" */
export function stripReplyPrefixes(subject: string): string {
  return subject.replace(ANY_PREFIX, '').trim()
}

/** ¿El asunto empieza con "Re:" / "RV:"? (un mail nuevo, no una respuesta, no lo tiene) */
export function hasReplyPrefix(subject: string): boolean {
  return REPLY_PREFIX.test(subject)
}

/** Rebotes y avisos del servidor de mail — no son respuestas de un cliente. */
export function isAutomatedSender(fromEmail: string): boolean {
  return /^(mailer-daemon|postmaster)@/i.test(fromEmail.trim())
}

/**
 * Un mail entrante que no matcheó ninguna orden solo merece aviso a Mesa si
 * parece una respuesta: vive en un hilo con mensajes anteriores (el id del
 * primer mensaje de un hilo es el id del hilo) o tiene prefijo "Re:". Un mail
 * nuevo cualquiera (newsletters, spam, contactos nuevos) no debe disparar push.
 */
export function looksLikeReply(msg: { id: string; threadId: string; subject: string }): boolean {
  return msg.threadId !== msg.id || hasReplyPrefix(msg.subject)
}
