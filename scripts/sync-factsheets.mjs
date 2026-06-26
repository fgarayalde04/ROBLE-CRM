/**
 * Factsheet sync — runs in GitHub Actions (or locally)
 * For each fund without a latest factsheet, tries to download
 * the PDF from the gestora's website and stores it in OneDrive.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const DRIVE_ID = process.env.CLIENTES_DRIVE_ID

// ── Microsoft Graph helpers ───────────────────────────────────────────────────

async function getMsToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  )
  const d = await res.json()
  if (!d.access_token) throw new Error('Graph token failed: ' + JSON.stringify(d))
  return d.access_token
}

async function getOrCreateFolder(token, parentId, name) {
  const enc = encodeURIComponent(name)
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${enc}'&$select=id,name,folder`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (r.ok) {
    const d = await r.json()
    const found = (d.value ?? []).find(i => i.folder && i.name === name)
    if (found) return found.id
  }
  const cr = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    }
  )
  return (await cr.json()).id
}

async function uploadToOneDrive(token, folderId, filename, buffer) {
  const safe = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodeURIComponent(safe)}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
      body: buffer,
    }
  )
  if (!r.ok) throw new Error(`Upload failed ${r.status}: ${await r.text()}`)
  return await r.json()
}

// ── Per-gestora scrapers ──────────────────────────────────────────────────────
// Each returns Buffer | null. Receives (page, isin, browser).

const SCRAPERS = {

  blackrock: async (page, isin) => {
    const urls = [
      `https://www.blackrock.com/cache/api/pdfgen/isr_lu/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
      `https://www.blackrock.com/cache/api/pdfgen/isr_ie/${isin}/en/0/pdf/FS-${isin}-EN.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  pimco: async (page, isin) => {
    const urls = [
      `https://www.pimco.com/handlers/displaydocument.ashx?type=FS&id=${isin}`,
      `https://www.pimco.com/en-eu/handlers/displaydocument.ashx?type=FS&id=${isin}`,
    ]
    return await tryDirectUrls(urls)
  },

  'franklin-templeton': async (page, isin) => {
    const urls = [
      `https://www.franklintempleton.lu/content/dam/ftinternational/literature/en/fact-sheets/${isin}.pdf`,
      `https://www.franklintempleton.ie/content/dam/ftinternational/literature/en/factsheets/${isin}.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  'janus-henderson': async (page, isin) => {
    const urls = [
      `https://documents.janushenderson.com/document/en-gb/factsheet/${isin}.pdf`,
      `https://documents.janushenderson.com/document/en-lu/factsheet/${isin}.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  mg: async (page, isin) => {
    const urls = [
      `https://www.mandg.com/dam/investments/literature/factsheets/${isin}_en_factsheet.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  mfs: async (page, isin) => {
    const urls = [
      `https://www.mfs.com/content/dam/mfs-enterprise-assets/documents/factsheet/${isin}.pdf`,
      `https://www.mfs.com/en-gb/financial-professional/funds/meridian/documents/${isin}-factsheet-en.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  robeco: async (page, isin) => {
    return await tryDirectUrls([`https://www.robeco.com/docm/dooi/robeco-${isin}-factsheet.pdf`])
  },

  schroders: async (page, isin) => {
    try {
      await page.goto(`https://www.schroders.com/en-lu/lu/professional/funds/fund-centre/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.fill('input[placeholder*="Search"], input[type="search"]', isin)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(3000)
      const link = await page.$(`a[href*="${isin}"][href*="factsheet"], a[href*="factsheet"][href*="${isin}"]`)
      if (link) {
        const href = await link.getAttribute('href')
        return await downloadUrl(href.startsWith('http') ? href : `https://www.schroders.com${href}`)
      }
    } catch { /* fallthrough */ }
    return null
  },

  'jp-morgan-am': async (page, isin) => {
    const urls = [
      `https://am.jpmorgan.com/content/dam/jpm-am-aem/emea/en/literature/factsheets/${isin}-en-factsheet.pdf`,
    ]
    return await tryDirectUrls(urls)
  },

  amundi: async (page, isin) => {
    try {
      await page.goto(`https://www.amundi.com/int/Institutional/Fund-Centre/Factsheet/${isin}`, { waitUntil: 'networkidle', timeout: 25000 })
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('a[href*="pdf"], button:has-text("Download"), a:has-text("Factsheet")').catch(() => {}),
      ])
      const buf = await streamToBuffer(await download.createReadStream())
      return buf.length > 1000 ? buf : null
    } catch { /* fallthrough */ }
    return null
  },

  'ninety-one': async (page, isin) => {
    return await tryDirectUrls([
      `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/${isin}.pdf`,
      `https://www.ninetyone.com/-/media/ninetyone/files/factsheets/gsf/${isin}.pdf`,
    ])
  },

  'neuberger-berman': async (page, isin) => {
    return await tryDirectUrls([
      `https://www.nb.com/-/media/nb/documents/factsheets/${isin}.pdf`,
    ])
  },

  vontobel: async (page, isin) => {
    return await tryDirectUrls([
      `https://am.vontobel.com/-/media/am-vontobel/documents/factsheets/${isin}.pdf`,
      `https://am.vontobel.com/-/media/am-vontobel/documents/fund-factsheets/${isin}.pdf`,
    ])
  },

  barings: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.barings.com/-/media/barings/documents/factsheets/${isin}.pdf`,
    ])
  },

  pictet: async (page, isin) => {
    try {
      const url = `https://www.assetmanagement.pictet/en/institutional/funds/fund-selector/${isin}`
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 })
      await page.waitForTimeout(2000)
      const link = await page.$('a[href*="factsheet"], a[href*=".pdf"]')
      if (link) {
        const href = await link.getAttribute('href')
        return await downloadUrl(href.startsWith('http') ? href : `https://www.assetmanagement.pictet${href}`)
      }
    } catch { /* fallthrough */ }
    return null
  },

  jupiter: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.jupiteram.com/-/media/jupiter/files/factsheets/${isin}.pdf`,
    ])
  },

  'man-group': async (page, isin) => {
    try {
      await page.goto(`https://www.man.com/fund-documents?isin=${isin}`, { waitUntil: 'networkidle', timeout: 25000 })
      await page.waitForTimeout(2000)
      const link = await page.$('a[href*="factsheet"], a[href*=".pdf"]')
      if (link) {
        const href = await link.getAttribute('href')
        return await downloadUrl(href.startsWith('http') ? href : `https://www.man.com${href}`)
      }
    } catch { /* fallthrough */ }
    return null
  },

  'morgan-stanley': async (page, isin) => {
    return await tryDirectUrls([
      `https://www.morganstanley.com/im/content/dam/mim/documents/factsheets/${isin}.pdf`,
    ])
  },

  wellington: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.wellington.com/-/media/wellington/documents/factsheets/${isin}.pdf`,
    ])
  },

  invesco: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.invesco.com/content/dam/invesco/emea/en/fund-literature/${isin}.pdf`,
      `https://www.invesco.eu/fund-documents/${isin}/factsheet.pdf`,
    ])
  },

  fidelity: async (page, isin) => {
    try {
      await page.goto(`https://www.fidelityinternational.com/funds/fund/isin-${isin}/`, { waitUntil: 'networkidle', timeout: 25000 })
      await page.waitForTimeout(2000)
      const link = await page.$('a[href*="factsheet"]')
      if (link) {
        const href = await link.getAttribute('href')
        return await downloadUrl(href.startsWith('http') ? href : `https://www.fidelityinternational.com${href}`)
      }
    } catch { /* fallthrough */ }
    return null
  },

  'capital-group': async (page, isin) => {
    return await tryDirectUrls([
      `https://www.capitalgroup.com/content/dam/cgc/documents/fund-factsheets/${isin}.pdf`,
    ])
  },

  lazard: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.lazardassetmanagement.com/-/media/lazard/documents/factsheets/${isin}.pdf`,
    ])
  },

  muzinich: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.muzinich.com/-/media/muzinich/documents/factsheets/${isin}.pdf`,
    ])
  },

  'ab-bernstein': async (page, isin) => {
    return await tryDirectUrls([
      `https://www.alliancebernstein.com/-/media/ab/documents/factsheets/${isin}.pdf`,
    ])
  },

  nuveen: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.nuveen.com/-/media/nuveen/documents/factsheets/${isin}.pdf`,
    ])
  },

  gam: async (page, isin) => {
    return await tryDirectUrls([
      `https://www.gam.com/-/media/gam/documents/factsheets/${isin}.pdf`,
    ])
  },
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function tryDirectUrls(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RobleCapital/1.0)' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('pdf') && !ct.includes('octet-stream')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 2000) return buf
    } catch { /* try next */ }
  }
  return null
}

async function downloadUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RobleCapital/1.0)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 2000 ? buf : null
  } catch { return null }
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting factsheet sync...')

  // Load all funds without a current factsheet
  const { data: managers } = await supabase.from('asset_managers').select('id, slug, name')
  const { data: allFondos } = await supabase.from('fondos').select('id, isin, name, asset_manager_id').not('isin', 'is', null)
  const { data: covered }   = await supabase.from('factsheets').select('fondo_id').eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))
  const queue = (allFondos ?? [])
    .filter(f => !coveredIds.has(f.id))
    .map(f => {
      const mgr = managers.find(m => m.id === f.asset_manager_id)
      return mgr ? { ...f, managerSlug: mgr.slug, managerName: mgr.name, managerId: mgr.id } : null
    })
    .filter(Boolean)

  console.log(`📋 ${queue.length} funds without factsheet`)
  if (queue.length === 0) { console.log('✅ All funds already have factsheets'); return }

  // OneDrive setup
  let msToken, rootId
  try {
    msToken = await getMsToken()
    const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/Fondos`, {
      headers: { Authorization: `Bearer ${msToken}` }
    })
    if (r.ok) {
      rootId = (await r.json()).id
    } else {
      const root = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`, {
        headers: { Authorization: `Bearer ${msToken}` }
      })).json()
      rootId = (await (await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${root.id}/children`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fondos', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
      })).json()).id
    }
    console.log('✅ OneDrive connected')
  } catch (e) {
    console.warn('⚠️  OneDrive unavailable — PDFs will be stored as direct URLs only:', e.message)
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  const results = []
  let imported = 0
  let skipped  = 0
  const folderCache = {}

  for (const fund of queue) {
    const scraper = SCRAPERS[fund.managerSlug]
    if (!scraper) {
      skipped++
      results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'no-scraper' })
      continue
    }

    const page = await browser.newPage()
    page.setDefaultTimeout(20000)

    let pdfBuf = null
    try {
      pdfBuf = await scraper(page, fund.isin)
    } catch (e) {
      console.warn(`  ⚠️  ${fund.isin} scraper error:`, e.message)
    } finally {
      await page.close()
    }

    if (!pdfBuf) {
      skipped++
      results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'not-found' })
      console.log(`  ✗ ${fund.isin} — ${fund.name}`)
      continue
    }

    let pdfUrl = null
    try {
      if (msToken && rootId) {
        const cacheKey = fund.managerName
        if (!folderCache[cacheKey]) {
          folderCache[cacheKey] = await getOrCreateFolder(msToken, rootId, fund.managerName)
        }
        const folderId = folderCache[cacheKey]
        const filename  = `${fund.managerSlug}_${fund.isin}_factsheet.pdf`
        const uploaded  = await uploadToOneDrive(msToken, folderId, filename, pdfBuf)
        pdfUrl = uploaded.webUrl
      }
    } catch (e) {
      console.warn(`  ⚠️  OneDrive upload failed for ${fund.isin}:`, e.message)
    }

    await supabase.from('factsheets').update({ is_latest: false }).eq('fondo_id', fund.id).eq('is_latest', true)
    await supabase.from('factsheets').insert({
      fondo_id: fund.id,
      asset_manager_id: fund.managerId,
      file_name: `${fund.managerSlug}_${fund.isin}_factsheet.pdf`,
      pdf_url: pdfUrl,
      is_latest: true,
      imported_by: 'github-actions',
    })

    imported++
    results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'ok', url: pdfUrl })
    console.log(`  ✓ ${fund.isin} — ${fund.name}`)
  }

  await browser.close()

  const summary = {
    date: new Date().toISOString(),
    total: queue.length,
    imported,
    skipped,
    results,
  }

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2))

  console.log(`\n🏁 Done: ${imported} imported, ${skipped} not found`)
}

main().catch(e => { console.error(e); process.exit(1) })
