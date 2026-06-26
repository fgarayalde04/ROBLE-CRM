import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile, createFolder } from '@/lib/microsoft/graph'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FONDOS_DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''

// ── Known factsheet pages per gestora ────────────────────────────────────────
// These are public PDF listing or download pages for each asset manager.
// We fetch the page HTML and extract direct PDF download links.

const WEB_SOURCES: Record<string, { name: string; urls: string[]; pdfPattern?: RegExp }> = {
  'pimco': {
    name: 'PIMCO',
    urls: [
      'https://www.pimco.com/en-us/resources/fact-sheets',
      'https://www.pimco.com/en-eu/resources/fact-sheets',
    ],
    pdfPattern: /href="([^"]*(?:fact.?sheet|gis)[^"]*\.pdf[^"]*)"/gi,
  },
  'schroders': {
    name: 'Schroders',
    urls: [
      'https://www.schroders.com/en/global/institutional/literature/',
      'https://www.schroders.com/en/uk/intermediary/literature/',
    ],
    pdfPattern: /href="([^"]*(?:factsheet|fact.sheet)[^"]*\.pdf[^"]*)"/gi,
  },
  'mg': {
    name: 'M&G',
    urls: [
      'https://www.mandg.com/investments/professional-investor/en-gb/literature',
    ],
    pdfPattern: /href="([^"]*(?:factsheet|fact.sheet)[^"]*\.pdf[^"]*)"/gi,
  },
  'janus-henderson': {
    name: 'Janus Henderson',
    urls: [
      'https://janushenderson.com/en-us/investor/literature/',
    ],
    pdfPattern: /href="([^"]*(?:factsheet|fact.sheet)[^"]*\.pdf[^"]*)"/gi,
  },
  'franklin-templeton': {
    name: 'Franklin Templeton',
    urls: [
      'https://www.franklintempleton.com/literature?type=factsheet',
      'https://www.franklintempleton.es/literature?type=factsheet',
    ],
    pdfPattern: /href="([^"]*(?:factsheet|fact.sheet|fs)[^"]*\.pdf[^"]*)"/gi,
  },
  'invesco': {
    name: 'Invesco',
    urls: [
      'https://www.invesco.com/us/financial-products/etfs/product-detail?audienceType=Investor&productId=ETF-QQQ',
    ],
    pdfPattern: /href="([^"]*(?:factsheet|fact.sheet)[^"]*\.pdf[^"]*)"/gi,
  },
}

// Catch-all PDF link pattern for any page
const GENERIC_PDF_PATTERN = /href="([^"]*\.pdf[^"]*)"/gi

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

function extractPDFLinks(html: string, baseUrl: string, pattern?: RegExp): string[] {
  const pat = pattern ?? GENERIC_PDF_PATTERN
  const links = new Set<string>()
  let m: RegExpExecArray | null
  const regex = new RegExp(pat.source, pat.flags)

  while ((m = regex.exec(html)) !== null) {
    const href = m[1]
    if (!href) continue
    // Make absolute
    try {
      const abs = href.startsWith('http') ? href : new URL(href, baseUrl).toString()
      // Only keep if it looks like a factsheet
      const lower = abs.toLowerCase()
      if (lower.includes('factsheet') || lower.includes('fact-sheet') ||
          lower.includes('fund-detail') || lower.includes('fs-')) {
        links.add(abs)
      }
    } catch { /* invalid URL */ }
  }
  return Array.from(links)
}

function isAlreadyKnown(url: string, existing: Set<string>): boolean {
  return existing.has(url)
}

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.split('/').filter(Boolean).pop() ?? 'factsheet'
  } catch {
    return 'factsheet'
  }
}

function extractISIN(text: string): string | null {
  const m = text.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)
  return m?.[1] ?? null
}

async function downloadPDF(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/pdf,*/*',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok || !res.headers.get('content-type')?.includes('pdf')) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

const folderCache: Record<string, string> = {}

async function getOrCreateOneDriveFolder(token: string, parentId: string, name: string): Promise<string> {
  const key = `${parentId}/${name}`
  if (folderCache[key]) return folderCache[key]
  try {
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/items/${parentId}/children?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (listRes.ok) {
      const d = await listRes.json()
      const found = (d.value ?? []).find((i: any) => i.folder && i.name === name)
      if (found) { folderCache[key] = found.id; return found.id }
    }
  } catch { /* fallthrough to create */ }
  const folder = await createFolder(FONDOS_DRIVE_ID, parentId, name, token)
  folderCache[key] = folder.id
  return folder.id
}

async function getFondosRootId(token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/root:/Fondos`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) return (await res.json()).id
  } catch { /* fallthrough */ }
  const rootRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${FONDOS_DRIVE_ID}/root`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const root = await rootRes.json()
  const folder = await createFolder(FONDOS_DRIVE_ID, root.id, 'Fondos', token)
  return folder.id
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let msToken: string | null = null
  try { msToken = await getGraphToken() } catch { /* OneDrive not connected */ }

  // Load existing factsheet URLs to avoid duplicates
  const { data: existingRows } = await supabaseAdmin
    .from('factsheets')
    .select('pdf_url')
    .not('pdf_url', 'is', null)

  const existingUrls = new Set((existingRows ?? []).map(r => r.pdf_url as string))

  // Load managers for slug → id + name lookup
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name')

  const managerMap = Object.fromEntries((managers ?? []).map(m => [m.slug, m]))

  let rootFolderId: string | null = null
  if (msToken && FONDOS_DRIVE_ID) {
    try { rootFolderId = await getFondosRootId(msToken) } catch { /* no OneDrive */ }
  }

  const results: { manager: string; found: number; imported: number; error?: string }[] = []
  let totalImported = 0

  for (const [slug, source] of Object.entries(WEB_SOURCES)) {
    const manager = managerMap[slug]
    if (!manager) continue

    let found = 0
    let imported = 0
    let lastError: string | undefined

    for (const pageUrl of source.urls) {
      const html = await fetchPage(pageUrl)
      if (!html) continue

      const pdfLinks = extractPDFLinks(html, pageUrl, source.pdfPattern)
      found += pdfLinks.length

      for (const pdfUrl of pdfLinks) {
        if (isAlreadyKnown(pdfUrl, existingUrls)) continue

        try {
          const pdfBytes = await downloadPDF(pdfUrl)
          if (!pdfBytes) continue

          const filename = decodeURIComponent(slugFromUrl(pdfUrl))
            .replace(/[^a-zA-Z0-9._\-() ]/g, '_') + '.pdf'

          // Upload to OneDrive
          let storedUrl: string | null = pdfUrl  // fallback: keep original URL
          if (msToken && rootFolderId) {
            try {
              const folderId = await getOrCreateOneDriveFolder(msToken, rootFolderId, manager.name)
              const item = await uploadFile(
                FONDOS_DRIVE_ID, folderId, filename,
                pdfBytes.buffer as ArrayBuffer, 'application/pdf', msToken
              )
              storedUrl = item.webUrl ?? pdfUrl
            } catch { /* keep original URL */ }
          }

          // Try to find/create fondo
          const isin = extractISIN(filename) ?? extractISIN(pdfUrl)
          let fondoId: string | null = null
          if (isin) {
            const { data: f } = await supabaseAdmin
              .from('fondos').select('id')
              .eq('asset_manager_id', manager.id).eq('isin', isin).single()
            if (f) {
              fondoId = f.id
              await supabaseAdmin.from('factsheets')
                .update({ is_latest: false })
                .eq('fondo_id', fondoId).eq('is_latest', true)
            } else {
              const fundName = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim()
              const { data: nf } = await supabaseAdmin
                .from('fondos')
                .insert({ asset_manager_id: manager.id, name: fundName, isin })
                .select('id').single()
              fondoId = nf?.id ?? null
            }
          }

          await supabaseAdmin.from('factsheets').insert({
            fondo_id:         fondoId,
            asset_manager_id: manager.id,
            file_name:        filename,
            pdf_url:          storedUrl,
            is_latest:        true,
            imported_by:      'web-sync',
          })

          existingUrls.add(pdfUrl)
          imported++
          totalImported++
        } catch (e: any) {
          lastError = e.message
        }
      }
    }

    results.push({ manager: source.name, found, imported, error: lastError })
  }

  return NextResponse.json({ imported: totalImported, results })
}
