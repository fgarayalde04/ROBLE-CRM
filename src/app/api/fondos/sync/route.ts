import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken, getGoogleEmail } from '@/lib/google/tokens'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Gmail API base
const GMAIL = 'https://gmail.googleapis.com/gmail/v1'

// ── Gmail helpers ─────────────────────────────────────────────────────────────

async function gmailFetch(token: string, path: string) {
  const res = await fetch(`${GMAIL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status}`)
  return res.json()
}

async function searchMessages(token: string, query: string, maxResults = 50) {
  const encoded = encodeURIComponent(query)
  const data = await gmailFetch(token, `/users/me/messages?q=${encoded}&maxResults=${maxResults}`)
  return (data.messages ?? []) as { id: string; threadId: string }[]
}

async function getMessage(token: string, id: string) {
  return gmailFetch(token, `/users/me/messages/${id}?format=full`)
}

async function getAttachmentBytes(token: string, messageId: string, attachmentId: string): Promise<Buffer> {
  const data = await gmailFetch(token, `/users/me/messages/${messageId}/attachments/${attachmentId}`)
  // Gmail returns base64url encoded data
  const base64 = (data.data as string).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64')
}

// ── Asset manager detection ───────────────────────────────────────────────────

type ManagerRow = {
  id: string
  slug: string
  name: string
  domain_hints: string[] | null
  keyword_hints: string[] | null
}

function detectManager(
  fromEmail: string,
  subject: string,
  filename: string,
  managers: ManagerRow[]
): ManagerRow | null {
  const haystack = `${fromEmail} ${subject} ${filename}`.toLowerCase()
  const fromDomain = fromEmail.split('@')[1]?.toLowerCase() ?? ''

  // 1. Try domain match first (most reliable)
  for (const m of managers) {
    for (const d of m.domain_hints ?? []) {
      if (fromDomain === d || fromDomain.endsWith('.' + d)) return m
    }
  }

  // 2. Try keyword match
  for (const m of managers) {
    for (const kw of m.keyword_hints ?? []) {
      if (haystack.includes(kw.toLowerCase())) return m
    }
  }

  return null
}

// ── ISIN extraction ───────────────────────────────────────────────────────────

function extractISIN(text: string): string | null {
  const match = text.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)
  return match?.[1] ?? null
}

// ── Supabase Storage upload ───────────────────────────────────────────────────

async function uploadPDF(managerId: string, filename: string, data: Buffer): Promise<string | null> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${managerId}/${Date.now()}_${safeFilename}`

  const { error } = await supabaseAdmin.storage
    .from('factsheets')
    .upload(path, data, { contentType: 'application/pdf', upsert: false })

  if (error) {
    console.error('[fondos/sync] storage upload error:', error.message)
    return null
  }

  const { data: urlData } = supabaseAdmin.storage.from('factsheets').getPublicUrl(path)
  return urlData.publicUrl
}

// ── Fondo upsert ─────────────────────────────────────────────────────────────

async function upsertFondo(managerId: string, name: string, isin: string | null) {
  // Try to find existing by ISIN
  if (isin) {
    const { data } = await supabaseAdmin
      .from('fondos')
      .select('id')
      .eq('asset_manager_id', managerId)
      .eq('isin', isin)
      .single()
    if (data) return data.id
  }

  // Create new
  const { data } = await supabaseAdmin
    .from('fondos')
    .insert({ asset_manager_id: managerId, name, isin: isin ?? null })
    .select('id')
    .single()

  return data?.id ?? null
}

// ── Main sync handler ─────────────────────────────────────────────────────────

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = await getValidGoogleToken()
  if (!token) {
    return NextResponse.json(
      { error: 'Conectá tu cuenta Google en Configuración para sincronizar.' },
      { status: 403 }
    )
  }

  const userEmail = await getGoogleEmail()

  // Load all managers
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name, domain_hints, keyword_hints')

  if (!managers?.length) {
    return NextResponse.json({ error: 'No hay gestoras configuradas. Ejecutá la migración SQL primero.' }, { status: 500 })
  }

  // Search Gmail for messages with PDF attachments
  const query = 'has:attachment filename:pdf (factsheet OR "fact sheet" OR fondo OR fund)'
  let messages: { id: string }[] = []
  try {
    messages = await searchMessages(token, query, 100)
  } catch (e: any) {
    return NextResponse.json({ error: `Error al buscar en Gmail: ${e.message}` }, { status: 500 })
  }

  if (!messages.length) {
    return NextResponse.json({ imported: 0, message: 'No se encontraron emails con factsheets en Gmail.' })
  }

  // Get already-imported message IDs
  const { data: existing } = await supabaseAdmin
    .from('factsheets')
    .select('gmail_message_id')
    .in('gmail_message_id', messages.map(m => m.id))

  const alreadyImported = new Set((existing ?? []).map(r => r.gmail_message_id))

  let imported = 0
  const errors: string[] = []

  for (const msg of messages) {
    if (alreadyImported.has(msg.id)) continue

    try {
      const full = await getMessage(token, msg.id)

      // Extract headers
      const headers: Record<string, string> = {}
      for (const h of full.payload?.headers ?? []) {
        headers[h.name.toLowerCase()] = h.value
      }
      const from    = headers['from'] ?? ''
      const subject = headers['subject'] ?? ''

      // Find PDF attachments in the message parts
      const parts: any[] = []
      const collectParts = (p: any) => {
        if (!p) return
        if (p.filename && p.mimeType === 'application/pdf') parts.push(p)
        for (const c of p.parts ?? []) collectParts(c)
      }
      collectParts(full.payload)

      if (!parts.length) continue

      for (const part of parts) {
        const filename = part.filename || 'factsheet.pdf'

        // Detect which manager this belongs to
        const manager = detectManager(from, subject, filename, managers as ManagerRow[])
        if (!manager) continue  // skip if we can't classify

        // Download the PDF
        const attachmentId = part.body?.attachmentId
        if (!attachmentId) continue

        const pdfBytes = await getAttachmentBytes(token, msg.id, attachmentId)

        // Upload to Supabase Storage
        const pdfUrl = await uploadPDF(manager.id, filename, pdfBytes)

        // Extract ISIN from filename/subject
        const isin = extractISIN(filename) ?? extractISIN(subject)

        // Try to get a clean fund name from filename
        const fundName = filename
          .replace(/\.pdf$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          || subject

        // Mark previous factsheets for this fondo as not latest
        let fondoId: string | null = null
        if (isin) {
          const { data: prevFondo } = await supabaseAdmin
            .from('fondos')
            .select('id')
            .eq('asset_manager_id', manager.id)
            .eq('isin', isin)
            .single()

          if (prevFondo) {
            fondoId = prevFondo.id
            await supabaseAdmin
              .from('factsheets')
              .update({ is_latest: false })
              .eq('fondo_id', fondoId)
              .eq('is_latest', true)
          } else {
            fondoId = await upsertFondo(manager.id, fundName, isin)
          }
        }

        // Insert factsheet record
        await supabaseAdmin.from('factsheets').insert({
          fondo_id:         fondoId,
          asset_manager_id: manager.id,
          file_name:        filename,
          pdf_url:          pdfUrl,
          gmail_message_id: msg.id,
          is_latest:        true,
          imported_by:      userEmail,
        })

        imported++
      }
    } catch (e: any) {
      errors.push(`${msg.id}: ${e.message}`)
    }
  }

  return NextResponse.json({
    imported,
    scanned: messages.length,
    errors: errors.length ? errors.slice(0, 5) : undefined,
  })
}
