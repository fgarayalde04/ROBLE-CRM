import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getGraphToken, uploadFile, createFolder } from '@/lib/microsoft/graph'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DRIVE_ID = process.env.CLIENTES_DRIVE_ID ?? ''

// ── Gestora-specific factsheet fetchers ───────────────────────────────────────
// Each returns an array of { isin, pdfUrl, filename } for discovered factsheets.
// Returns [] when the site doesn't respond or no PDFs found.
// All are best-effort — errors are caught and skipped.

type FactsheetHit = { isin: string; pdfUrl: string; filename: string }

// Robeco: their document portal has ISIN-searchable pages
async function fetchRobeco(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins) {
    try {
      const res = await fetch(
        `https://www.robeco.com/en-us/api/search?type=fund&q=${isin}&format=json`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const results = data.results ?? data.items ?? []
      for (const item of results) {
        const pdfUrl: string | undefined = item.factsheetUrl ?? item.pdf_url ?? item.document_url
        if (pdfUrl && pdfUrl.endsWith('.pdf')) {
          hits.push({ isin, pdfUrl, filename: `Robeco_${isin}_factsheet.pdf` })
          break
        }
      }
    } catch { /* skip */ }
  }
  return hits
}

// MFS: ISIN-based fund lookup via their public API
async function fetchMFS(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins) {
    try {
      const res = await fetch(
        `https://www.mfs.com/en-us/financial-professional/funds-by-isin/${isin}.html`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const html = await res.text()
      const match = html.match(/href="([^"]*factsheet[^"]*\.pdf[^"]*)"/i)
      if (match) {
        const pdfUrl = match[1].startsWith('http') ? match[1] : `https://www.mfs.com${match[1]}`
        hits.push({ isin, pdfUrl, filename: `MFS_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// PIMCO: Their GIS factsheet API for UCITS funds
async function fetchPIMCO(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins) {
    if (!isin.startsWith('IE')) continue  // PIMCO UCITS are IE-domiciled
    try {
      const res = await fetch(
        `https://www.pimco.com/en-eu/api/products/${isin}/literature?type=factsheet`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const docs = data.documents ?? data.items ?? []
      const fs = docs.find((d: any) => (d.documentType ?? '').toLowerCase().includes('fact'))
      if (fs?.url) {
        hits.push({ isin, pdfUrl: fs.url, filename: `PIMCO_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// Schroders: ISIN-based fund pages
async function fetchSchroders(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins) {
    try {
      const res = await fetch(
        `https://www.schroders.com/en/global/individual/funds/fund-centre/funds/${isin}/`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const html = await res.text()
      const match = html.match(/href="([^"]*(?:factsheet|fund-factsheet)[^"]*\.pdf[^"]*)"/i)
      if (match) {
        const pdfUrl = match[1].startsWith('http') ? match[1] : `https://www.schroders.com${match[1]}`
        hits.push({ isin, pdfUrl, filename: `Schroders_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// Janus Henderson: ISIN-based document search
async function fetchJanusHenderson(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins) {
    try {
      const res = await fetch(
        `https://api.janushenderson.com/api/search/funds?isin=${isin}&locale=en-gb`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const fund = (data.funds ?? data.results ?? [])[0]
      if (!fund) continue
      const fundId = fund.id ?? fund.fundId
      if (!fundId) continue
      // Try to get factsheet from fund detail
      const detailRes = await fetch(
        `https://api.janushenderson.com/api/funds/${fundId}/documents?type=factsheet`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!detailRes.ok) continue
      const detail = await detailRes.json()
      const doc = (detail.documents ?? detail)[0]
      if (doc?.url) {
        hits.push({ isin, pdfUrl: doc.url, filename: `JanusHenderson_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// Franklin Templeton: ISIN-based literature search
async function fetchFranklin(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins.filter(i => i.startsWith('LU') || i.startsWith('IE'))) {
    try {
      const res = await fetch(
        `https://www.franklintempleton.com/api/products/literature?isin=${isin}&type=factsheet`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const doc = (data.documents ?? data)[0]
      if (doc?.url) {
        hits.push({ isin, pdfUrl: doc.url, filename: `Franklin_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// Ninety One: document search by ISIN
async function fetchNinetyOne(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins.filter(i => i.startsWith('LU'))) {
    try {
      const res = await fetch(
        `https://www.ninetyone.com/en/international/funds/funds-listing?isin=${isin}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const html = await res.text()
      const match = html.match(/href="([^"]*(?:factsheet|fund-sheet)[^"]*\.pdf[^"]*)"/i)
      if (match) {
        const pdfUrl = match[1].startsWith('http') ? match[1] : `https://www.ninetyone.com${match[1]}`
        hits.push({ isin, pdfUrl, filename: `NinetyOne_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// Neuberger Berman: their document center
async function fetchNeuberger(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins.filter(i => i.startsWith('IE'))) {
    try {
      const res = await fetch(
        `https://www.nb.com/api/funds/documents?isin=${isin}&documentType=factsheet`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const doc = (data.documents ?? data)[0]
      if (doc?.url) {
        hits.push({ isin, pdfUrl: doc.url, filename: `NB_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// M&G: ISIN-based document search
async function fetchMG(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins.filter(i => i.startsWith('LU'))) {
    try {
      const res = await fetch(
        `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_fs.pdf`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000), method: 'HEAD' }
      )
      if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
        const pdfUrl = `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_fs.pdf`
        hits.push({ isin, pdfUrl, filename: `MG_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// JPMorgan: their literature API
async function fetchJPMorgan(isins: string[]): Promise<FactsheetHit[]> {
  const hits: FactsheetHit[] = []
  for (const isin of isins.filter(i => i.startsWith('LU'))) {
    try {
      const res = await fetch(
        `https://am.jpmorgan.com/us/en/asset-management/gim/adv/api/literature?isin=${isin}&type=factsheet`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const doc = (data.documents ?? data)[0]
      if (doc?.url) {
        hits.push({ isin, pdfUrl: doc.url, filename: `JPMorgan_${isin}_factsheet.pdf` })
      }
    } catch { /* skip */ }
  }
  return hits
}

// ── Map gestora slug → fetcher + its fund ISINs ──────────────────────────────

const FETCHERS: Record<string, (isins: string[]) => Promise<FactsheetHit[]>> = {
  robeco:           fetchRobeco,
  mfs:              fetchMFS,
  pimco:            fetchPIMCO,
  schroders:        fetchSchroders,
  'janus-henderson': fetchJanusHenderson,
  'franklin-templeton': fetchFranklin,
  'ninety-one':     fetchNinetyOne,
  'neuberger-berman': fetchNeuberger,
  mg:               fetchMG,
  'jp-morgan-am':   fetchJPMorgan,
}

// ── OneDrive helpers ──────────────────────────────────────────────────────────

async function downloadPDF(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/pdf,*/*' },
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('pdf') && !ct.includes('octet-stream')) return null
    return Buffer.from(await res.arrayBuffer())
  } catch { return null }
}

const folderCache: Record<string, string> = {}

async function getOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const key = `${parentId}/${name}`
  if (folderCache[key]) return folderCache[key]
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${encodeURIComponent(name)}'&$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const d = await res.json()
      const found = (d.value ?? []).find((i: any) => i.folder && i.name === name)
      if (found) { folderCache[key] = found.id; return found.id }
    }
  } catch { /* fallthrough */ }
  const f = await createFolder(DRIVE_ID, parentId, name, token)
  folderCache[key] = f.id
  return f.id
}

async function getFondosRoot(token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/Fondos`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) return (await res.json()).id
  } catch { /* fallthrough */ }
  const root = await (await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`,
    { headers: { Authorization: `Bearer ${token}` } }
  )).json()
  return (await createFolder(DRIVE_ID, root.id, 'Fondos', token)).id
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Load all managers and their funds that lack a current factsheet
  const { data: managers } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name')

  if (!managers?.length) {
    return NextResponse.json({ error: 'No hay gestoras. Ejecutá fondos_carga.sql en Supabase primero.' }, { status: 500 })
  }

  // Load all fondos without an is_latest factsheet, keyed by asset_manager_id
  const { data: allFondos } = await supabaseAdmin
    .from('fondos')
    .select('id, isin, name, asset_manager_id')
    .not('isin', 'is', null)

  // Load ISINs that already have a latest factsheet (to skip)
  const { data: covered } = await supabaseAdmin
    .from('factsheets')
    .select('fondo_id')
    .eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))

  // Build map: slug → [{fondoId, isin, name}]
  const managerMap = Object.fromEntries(managers.map(m => [m.slug, m]))
  const fundsBySlug: Record<string, { id: string; isin: string; name: string }[]> = {}

  for (const f of allFondos ?? []) {
    if (coveredIds.has(f.id)) continue  // already has factsheet
    const mgr = managers.find(m => m.id === f.asset_manager_id)
    if (!mgr) continue
    if (!fundsBySlug[mgr.slug]) fundsBySlug[mgr.slug] = []
    fundsBySlug[mgr.slug].push({ id: f.id, isin: f.isin!, name: f.name })
  }

  // OneDrive setup
  let msToken: string | null = null
  let rootId:  string | null = null
  try {
    msToken = await getGraphToken()
    rootId  = await getFondosRoot(msToken)
  } catch { /* no OneDrive — store URLs as-is */ }

  const results: { manager: string; slug: string; tried: number; imported: number; error?: string }[] = []
  let totalImported = 0

  for (const [slug, fetcher] of Object.entries(FETCHERS)) {
    const mgr   = managerMap[slug]
    const funds = fundsBySlug[slug] ?? []

    if (!mgr || funds.length === 0) {
      results.push({ manager: mgr?.name ?? slug, slug, tried: 0, imported: 0 })
      continue
    }

    const isins = funds.map(f => f.isin)
    let imported  = 0
    let lastError: string | undefined

    try {
      const hits = await fetcher(isins)

      for (const hit of hits) {
        const fondo = funds.find(f => f.isin === hit.isin)
        if (!fondo) continue

        try {
          const pdfBytes = await downloadPDF(hit.pdfUrl)
          if (!pdfBytes) continue

          let storedUrl: string | null = hit.pdfUrl
          if (msToken && rootId) {
            try {
              const folderId = await getOrCreateFolder(msToken, rootId, mgr.name)
              const safe     = hit.filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
              const item     = await uploadFile(DRIVE_ID, folderId, safe, pdfBytes.buffer as ArrayBuffer, 'application/pdf', msToken)
              storedUrl = item.webUrl ?? hit.pdfUrl
            } catch { /* keep original URL */ }
          }

          // Mark previous latest as stale
          await supabaseAdmin
            .from('factsheets')
            .update({ is_latest: false })
            .eq('fondo_id', fondo.id)
            .eq('is_latest', true)

          await supabaseAdmin.from('factsheets').insert({
            fondo_id:         fondo.id,
            asset_manager_id: mgr.id,
            file_name:        hit.filename,
            pdf_url:          storedUrl,
            is_latest:        true,
            imported_by:      'web-sync',
          })

          imported++
          totalImported++
        } catch (e: any) {
          lastError = e.message
        }
      }
    } catch (e: any) {
      lastError = e.message
    }

    results.push({ manager: mgr.name, slug, tried: funds.length, imported, error: lastError })
  }

  // Also report gestoras we have funds for but no fetcher
  const allSlugsWithFunds = Object.keys(fundsBySlug)
  const knownSlugs = new Set(Object.keys(FETCHERS))
  for (const slug of allSlugsWithFunds) {
    if (knownSlugs.has(slug)) continue
    const mgr = managerMap[slug]
    results.push({ manager: mgr?.name ?? slug, slug, tried: fundsBySlug[slug].length, imported: 0, error: 'sin integración web — subir manualmente' })
  }

  return NextResponse.json({
    imported: totalImported,
    results,
    pending: Object.values(fundsBySlug).flat().length - totalImported,
  })
}
