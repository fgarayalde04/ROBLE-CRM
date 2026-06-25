import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getValidGoogleToken } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

export interface AuthorizedEmail {
  id: string
  email: string
  nombre_cliente: string | null
  fecha_autorizacion: string | null
  ultima_utilizacion: string | null
  cantidad_utilizaciones: number
  autorizado: boolean
}

export interface EmailSuggestion {
  email: string
  last_contact: string | null
  order_count: number
  source: 'gmail' | 'historial'
}

const GMAIL_BASE     = 'https://gmail.googleapis.com/gmail/v1'
const INTERNAL_DOMAIN = 'roblecapital.net'

// ── RFC 2047 decoder ──────────────────────────────────────────────────────────
function decodeRfc2047(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, _cs, enc, encoded) => {
    try {
      return enc.toUpperCase() === 'B'
        ? Buffer.from(encoded, 'base64').toString('utf8')
        : encoded.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m: string, h: string) =>
            String.fromCharCode(parseInt(h, 16))
          )
    } catch { return s }
  })
}

function parseAddresses(raw: string): string[] {
  if (!raw) return []
  return raw.split(',').map((part) => {
    part = part.trim()
    const match = part.match(/^.+<(.+?)>$/)
    const email = match ? match[1].trim().toLowerCase() : part.toLowerCase()
    return email.includes('@') ? email : ''
  }).filter(Boolean)
}

// ── Search Gmail for messages related to the client, extract external emails ──
async function gmailSuggestionsForClient(
  accessToken: string,
  clientName: string | null | undefined,
  clientNumber: string | null | undefined,
): Promise<string[]> {
  // Build a Gmail search query — try name first, fall back to number
  const terms: string[] = []
  if (clientName)   terms.push(`"${clientName}"`)
  if (clientNumber) terms.push(`"${clientNumber}"`)
  if (terms.length === 0) return []

  const q = terms.join(' OR ')

  // Search for matching messages (SENT + INBOX)
  const searchUrl = new URL(`${GMAIL_BASE}/users/me/messages`)
  searchUrl.searchParams.set('q', q)
  searchUrl.searchParams.set('maxResults', '30')

  const r = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) return []

  const data = await r.json()
  const ids: string[] = (data.messages ?? []).map((m: any) => m.id).slice(0, 30)
  if (ids.length === 0) return []

  // Fetch metadata (To, From, Cc) for each message in parallel
  const metas = await Promise.all(
    ids.map(async (id) => {
      try {
        const mr = await fetch(
          `${GMAIL_BASE}/users/me/messages/${id}?format=metadata` +
          `&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Cc`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        return mr.ok ? mr.json() : null
      } catch { return null }
    })
  )

  // Extract all external email addresses
  const seen = new Set<string>()
  for (const msg of metas) {
    if (!msg?.payload?.headers) continue
    for (const h of msg.payload.headers as Array<{ name: string; value: string }>) {
      if (!['to', 'from', 'cc'].includes(h.name.toLowerCase())) continue
      for (const em of parseAddresses(decodeRfc2047(h.value))) {
        if (em && !em.endsWith(`@${INTERNAL_DOMAIN}`)) seen.add(em)
      }
    }
  }

  return Array.from(seen)
}

// ── GET /api/authorized-emails?client_number=X&client_name=Y ─────────────────
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clientNumber = req.nextUrl.searchParams.get('client_number')?.trim()
  const clientName   = req.nextUrl.searchParams.get('client_name')?.trim()

  if (!clientNumber && !clientName) {
    return NextResponse.json({ authorized: [], suggestions: [] })
  }

  // ── 1. Authorized emails from DB ──────────────────────────────────────────
  let authQuery = supabaseAdmin
    .from('client_authorized_emails')
    .select('id, email, nombre_cliente, fecha_autorizacion, ultima_utilizacion, cantidad_utilizaciones, autorizado')
    .eq('autorizado', true)
    .order('cantidad_utilizaciones', { ascending: false })

  if (clientNumber) authQuery = authQuery.eq('numero_cliente', clientNumber)

  const { data: authorizedData } = await authQuery
  const authorized: AuthorizedEmail[] = (authorizedData ?? [])
    .filter((r) => !r.email?.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`))
    .map((r) => ({
      id:                     r.id,
      email:                  r.email,
      nombre_cliente:         r.nombre_cliente,
      fecha_autorizacion:     r.fecha_autorizacion,
      ultima_utilizacion:     r.ultima_utilizacion,
      cantidad_utilizaciones: r.cantidad_utilizaciones,
      autorizado:             r.autorizado,
    }))

  const authorizedSet = new Set(authorized.map((a) => a.email.toLowerCase()))

  // ── 2. Suggestions from Gmail (trading@roblecapital.net inbox) ─────────────
  let gmailEmails: string[] = []
  try {
    const accessToken = await getValidGoogleToken()
    if (accessToken) {
      gmailEmails = await gmailSuggestionsForClient(accessToken, clientName, clientNumber)
    }
  } catch (err: any) {
    console.warn('[authorized-emails] Gmail search failed:', err?.message)
  }

  // ── 3. Suggestions from order_history (fallback / extra context) ───────────
  let historialEmails: string[] = []
  try {
    let ordQuery = supabaseAdmin
      .from('order_history')
      .select('to_email')
      .not('to_email', 'is', null)
      .not('to_email', 'ilike', `%@${INTERNAL_DOMAIN}`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (clientNumber) ordQuery = ordQuery.eq('client_number', clientNumber)
    else if (clientName) ordQuery = ordQuery.ilike('client_name', `%${clientName}%`)

    const { data: orderData } = await ordQuery
    historialEmails = (orderData ?? [])
      .map((r: any) => (r.to_email as string).toLowerCase().trim())
      .filter((em: string) => em && !em.endsWith(`@${INTERNAL_DOMAIN}`))
  } catch { /* ignore */ }

  // ── 4. Merge & deduplicate suggestions ────────────────────────────────────
  // Gmail suggestions first, then historial — exclude already-authorized
  const suggestionSet = new Set<string>()
  const suggestions: EmailSuggestion[] = []

  const addSuggestion = (email: string, source: 'gmail' | 'historial') => {
    const em = email.toLowerCase().trim()
    if (!em || em.endsWith(`@${INTERNAL_DOMAIN}`)) return
    if (authorizedSet.has(em)) return
    if (suggestionSet.has(em)) return
    suggestionSet.add(em)
    suggestions.push({ email: em, last_contact: null, order_count: 0, source })
  }

  for (const em of gmailEmails)    addSuggestion(em, 'gmail')
  for (const em of historialEmails) addSuggestion(em, 'historial')

  return NextResponse.json({ authorized, suggestions: suggestions.slice(0, 15) })
}

// ── POST /api/authorized-emails — authorize an email ─────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { numero_cliente, nombre_cliente, email } = await req.json()
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('client_authorized_emails')
    .upsert({
      numero_cliente:     numero_cliente ?? null,
      nombre_cliente:     nombre_cliente ?? null,
      email:              email.toLowerCase().trim(),
      autorizado:         true,
      fecha_autorizacion: new Date().toISOString(),
      usuario_autorizo:   session.name ?? null,
    }, { onConflict: 'numero_cliente,email' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
