import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken, getGoogleEmail } from '@/lib/google/tokens'
import { getGraphToken, uploadFile, createFolder } from '@/lib/microsoft/graph'
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

// ── OneDrive upload ───────────────────────────────────────────────────────────
// Folder structure: Fondos / {ManagerName} / {filename}

const FONDOS_DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''  // reuse existing SharePoint drive
const FONDOS_ROOT_PATH = 'Fondos'  // top-level folder name in the drive

// Cache of folder IDs to avoid re-creating them on each file
const folderCache: Record<string, string> = {}

async function getOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const key = `${parentId}/${name}`
  if (folderCache[key]) return folderCache[key]

  // Try to find existing folder
  const listUrl = `https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/items/${parentId}/children?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name,folder`
  const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (res.ok) {
    const data = await res.json()
    const existing = (data.value ?? []).find((i: any) => i.folder && i.name === name)
    if (existing) {
      folderCache[key] = existing.id
      return existing.id
    }
  }

  // Create it
  const folder = await createFolder(FONDOS_DRIVE_ID, parentId, name, token)
  folderCache[key] = folder.id
  return folder.id
}

async function getRootFolderId(token: string): Promise<string> {
  // Get or create the "Fondos" root folder at the drive root
  const url = `https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/root:/${FONDOS_ROOT_PATH}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.ok) {
    const data = await res.json()
    return data.id
  }
  // Create at root
  const rootRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/root`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const root = await rootRes.json()
  const folder = await createFolder(FONDOS_DRIVE_ID, root.id, FONDOS_ROOT_PATH, token)
  return folder.id
}

async function uploadToOneDrive(
  managerName: string,
  filename: string,
  data: Buffer,
  token: string,
): Promise<string | null> {
  try {
    if (!FONDOS_DRIVE_ID) throw new Error('CLIENTES_DRIVE_ID no configurado')

    const rootId    = await getRootFolderId(token)
    const folderId  = await getOrCreateFolder(token, rootId, managerName)
    const safeFile  = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
    const item      = await uploadFile(FONDOS_DRIVE_ID, folderId, safeFile, data.buffer as ArrayBuffer, 'application/pdf', token)
    return item.webUrl ?? null
  } catch (e: any) {
    console.error('[fondos/sync] OneDrive upload error:', e.message)
    return null
  }
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

  let msToken: string | null = null
  try { msToken = await getGraphToken() } catch { /* OneDrive not connected */ }

  const userEmail = await getGoogleEmail()

  // Load all managers
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name, domain_hints, keyword_hints')

  if (!managers?.length) {
    return NextResponse.json({ error: 'No hay gestoras configuradas. Ejecutá la migración SQL primero.' }, { status: 500 })
  }

  // Search Gmail for messages with PDF attachments from gestoras or with factsheet keywords
  const senderDomains = managers
    .flatMap(m => (m as any).domain_hints ?? [])
    .map((d: string) => `from:${d}`)
    .join(' OR ')

  const keywordQuery = 'has:attachment filename:pdf (factsheet OR "fact sheet" OR "fund factsheet" OR "monthly report" OR "fund update" OR ISIN)'
  const senderQuery  = senderDomains ? `has:attachment filename:pdf (${senderDomains})` : ''
  const query = senderQuery ? `(${keywordQuery}) OR (${senderQuery})` : keywordQuery
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

        // Upload to OneDrive: Fondos / {ManagerName} / {filename}
        const pdfUrl = msToken
          ? await uploadToOneDrive(manager.name, filename, pdfBytes, msToken)
          : null

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
