import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getValidGoogleToken } from '@/lib/google/tokens'

export const dynamic = 'force-dynamic'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'

function parseAddresses(raw: string): Array<{ name: string; email: string }> {
  if (!raw) return []
  return raw.split(',').map((part) => {
    part = part.trim()
    const match = part.match(/^(.+?)\s*<(.+?)>$/)
    if (match) {
      return {
        name:  match[1].trim().replace(/^["']|["']$/g, ''),
        email: match[2].trim().toLowerCase(),
      }
    }
    return { name: '', email: part.toLowerCase() }
  }).filter((c) => c.email.includes('@'))
}

/** Paginate a Gmail label, up to maxPages × 500 */
async function listIds(
  accessToken: string,
  label: string,
  maxPages: number
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${GMAIL_BASE}/users/me/messages`)
    url.searchParams.set('labelIds', label)
    url.searchParams.set('maxResults', '500')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) break
    const data = await r.json()
    for (const m of (data.messages ?? [])) ids.push(m.id)
    pageToken = data.nextPageToken
    if (!pageToken) break
  }
  return ids
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const accessToken = await getValidGoogleToken()
  if (!accessToken) return NextResponse.json({ contacts: [] })

  try {
    // Fetch up to 1500 sent + 500 inbox message IDs
    const [sentIds, inboxIds] = await Promise.all([
      listIds(accessToken, 'SENT',  3),
      listIds(accessToken, 'INBOX', 1),
    ])

    // Merge, sent first (higher contact weight), deduplicate
    const seen = new Set<string>()
    const ids: string[] = []
    for (const id of [...sentIds, ...inboxIds]) {
      if (!seen.has(id)) { seen.add(id); ids.push(id) }
    }

    if (ids.length === 0) return NextResponse.json({ contacts: [] })

    // Fetch metadata in parallel batches of 25 (cap total at 600 messages)
    const cap = Math.min(ids.length, 600)
    const BATCH = 25
    const metaList: any[] = []

    for (let i = 0; i < cap; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      const results = await Promise.all(
        chunk.map(async (id) => {
          try {
            const r = await fetch(
              `${GMAIL_BASE}/users/me/messages/${id}?format=metadata` +
              `&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Cc`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            return r.ok ? r.json() : null
          } catch { return null }
        })
      )
      metaList.push(...results)
    }

    // Build frequency map
    const freq: Record<string, { name: string; email: string; count: number }> = {}

    for (const msg of metaList) {
      if (!msg?.payload?.headers) continue
      const headers: Array<{ name: string; value: string }> = msg.payload.headers

      for (const h of headers) {
        if (!['to', 'from', 'cc'].includes(h.name.toLowerCase())) continue
        for (const c of parseAddresses(h.value)) {
          if (!c.email) continue
          if (freq[c.email]) {
            freq[c.email].count++
            if (!freq[c.email].name && c.name) freq[c.email].name = c.name
          } else {
            freq[c.email] = { ...c, count: 1 }
          }
        }
      }
    }

    const contacts = Object.values(freq)
      .sort((a, b) => b.count - a.count)
      .slice(0, 500)
      .map(({ name, email }) => ({ name, email }))

    return NextResponse.json({ contacts, total: contacts.length })
  } catch (err: any) {
    console.error('[api/gmail/contacts]', err.message)
    return NextResponse.json({ contacts: [] })
  }
}
