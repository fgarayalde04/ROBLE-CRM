import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const DRIVE_ID = process.env.CLIENTES_DRIVE_ID

// ── Microsoft Graph ───────────────────────────────────────────────────────────

async function getMsToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  const d = await res.json()
  if (!d.access_token) throw new Error('Graph token failed: ' + JSON.stringify(d))
  return d.access_token
}

async function ensureFolder(token, parentId, name) {
  const enc = encodeURIComponent(name)
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${parentId}/children?$filter=name eq '${enc}'&$select=id,name`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (r.ok) {
    const d = await r.json()
    const found = (d.value ?? []).find(i => i.name === name)
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
  const created = await cr.json()
  if (!created.id) throw new Error(`Folder create failed: ${JSON.stringify(created)}`)
  return created.id
}

async function uploadToOneDrive(token, folderId, filename, buffer) {
  const safe = filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}:/${encodeURIComponent(safe)}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: buffer }
  )
  if (!r.ok) throw new Error(`Upload failed ${r.status}: ${await r.text()}`)
  return await r.json()
}

// ── Fundinfo scraper ──────────────────────────────────────────────────────────

async function acceptFundinfoDisclaimer(page) {
  await page.waitForTimeout(2000)

  // Check if the disclaimer/market-select modal is visible
  const hasModal = await page.locator('[class*="modal" i], [class*="overlay" i], [class*="dialog" i], [class*="disclaimer" i]')
    .first().isVisible({ timeout: 4000 }).catch(() => false)
  if (!hasModal) return

  // Check all checkboxes (investor category, etc.)
  const checkboxes = page.locator('input[type="checkbox"]')
  const cbCount = await checkboxes.count()
  for (let i = 0; i < cbCount; i++) {
    await checkboxes.nth(i).check({ force: true }).catch(() => {})
  }

  // Select a radio if present (country or investor type)
  const radios = page.locator('input[type="radio"]')
  const rCount = await radios.count()
  if (rCount > 0) {
    await radios.first().check({ force: true }).catch(() => {})
  }

  // Select a dropdown if present
  const selects = page.locator('select')
  const sCount = await selects.count()
  for (let i = 0; i < sCount; i++) {
    // Pick the first non-empty option
    await selects.nth(i).selectOption({ index: 1 }).catch(() => {})
  }

  await page.waitForTimeout(400)

  // Click Confirm/Accept/OK
  for (const text of ['Confirm Selected', 'Confirm', 'Accept', 'Continue', 'OK']) {
    const btn = page.locator(`button:has-text("${text}")`).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(3000)
      return
    }
  }
}

// Download a PDF using ALL capture methods: response interception + download event + popup
async function capturePdf(page, clickFn) {
  let pdfBuf = null

  // Method 1: intercept inline PDF responses
  const onResponse = async (res) => {
    if (pdfBuf) return
    const ct = res.headers()['content-type'] ?? ''
    if (!ct.includes('pdf') && !ct.includes('octet')) return
    try {
      const body = await res.body()
      if (body.length > 5000) pdfBuf = body
    } catch {}
  }
  page.on('response', onResponse)

  // Method 2 & 3: download or popup — race them
  const downloadPromise = page.waitForEvent('download', { timeout: 12000 }).catch(() => null)
  const popupPromise   = page.context().waitForEvent('page',     { timeout: 12000 }).catch(() => null)

  // Click using Playwright (trusted user gesture, unlike evaluate().click())
  await clickFn()

  // Give inline PDF time to arrive
  await page.waitForTimeout(3000)

  // Check download first
  const download = await downloadPromise
  if (download) {
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const buf = Buffer.concat(chunks)
    page.off('response', onResponse)
    return buf.length > 5000 ? buf : null
  }

  // Check popup
  const popup = await popupPromise
  if (popup) {
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
      const url = popup.url()
      if (url.includes('.pdf') || url.includes('document') || url.includes('download')) {
        // Use page.request (same session cookies) to fetch the PDF
        const res = await page.request.get(url, { timeout: 15000 }).catch(() => null)
        if (res?.ok()) {
          const ct = res.headers()['content-type'] ?? ''
          if (ct.includes('pdf') || ct.includes('octet')) {
            const body = await res.body()
            if (body.length > 5000) {
              await popup.close().catch(() => {})
              page.off('response', onResponse)
              return body
            }
          }
        }
      }
    } catch {}
    await popup.close().catch(() => {})
  }

  page.off('response', onResponse)
  return pdfBuf && pdfBuf.length > 5000 ? pdfBuf : null
}

async function scrapeFundinfo(page, isin) {
  await page.goto(`https://fundinfo.com/en/search?query=${encodeURIComponent(isin)}`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  })

  // Accept disclaimer if shown (only first time per session — cookies persist after)
  await acceptFundinfoDisclaimer(page)

  // Wait for the results table
  await page.waitForSelector('table tbody tr', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Find the table row that contains the ISIN
  // Use Playwright locator: tr that has a td with exact ISIN text
  const row = page.locator(`table tbody tr:has(td:has-text("${isin}"))`).first()
  if (!await row.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Fallback: any row containing the ISIN text
    const anyRow = page.locator(`tr:has-text("${isin}")`).first()
    if (!await anyRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      return null
    }
    return await scrapeFundinfoRow(page, anyRow)
  }

  return await scrapeFundinfoRow(page, row)
}

async function scrapeFundinfoRow(page, row) {
  // Debug: log what's in the row
  const rowText = await row.textContent().catch(() => '').then(t => t?.replace(/\s+/g, ' ').trim().slice(0, 120))
  const allLinks = row.locator('a')
  const allCount = await allLinks.count()
  const iconLinks = row.locator('a:has(img), a:has(svg)')
  const iconCount = await iconLinks.count()
  console.log(`    [row] ${rowText} | links=${allCount} icons=${iconCount}`)

  // Log hrefs of all links in row
  for (let i = 0; i < Math.min(allCount, 6); i++) {
    const href = await allLinks.nth(i).getAttribute('href').catch(() => '') ?? ''
    const txt  = (await allLinks.nth(i).textContent().catch(() => ''))?.trim() ?? ''
    const hasImg = await allLinks.nth(i).locator('img, svg').count() > 0
    console.log(`      link[${i}] href="${href}" text="${txt.slice(0,30)}" img=${hasImg}`)
  }

  // Priority 1: icon links (img/svg inside <a>) — these are the MR/PR/PHS document icons
  if (iconCount > 0) {
    const buf = await capturePdf(page, () => iconLinks.first().click())
    if (buf) return buf

    for (let i = 1; i < Math.min(iconCount, 3); i++) {
      const b = await capturePdf(page, () => iconLinks.nth(i).click())
      if (b) return b
    }
  }

  // Priority 2: short-text links (document icon = short label like "MR", "PDF")
  for (let i = 0; i < allCount; i++) {
    const text = (await allLinks.nth(i).textContent().catch(() => ''))?.trim() ?? ''
    if (text.length > 0 && text.length < 10) {
      const b = await capturePdf(page, () => allLinks.nth(i).click())
      if (b) return b
    }
  }

  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting factsheet sync via fundinfo.com…')

  const { data: managers } = await supabase.from('asset_managers').select('id, slug, name')
  const { data: allFondos } = await supabase.from('fondos').select('id, isin, name, asset_manager_id').not('isin', 'is', null)
  const { data: covered }   = await supabase.from('factsheets').select('fondo_id').eq('is_latest', true)

  const coveredIds = new Set((covered ?? []).map(r => r.fondo_id))
  const queue = (allFondos ?? [])
    .filter(f => !coveredIds.has(f.id))
    .map(f => {
      const mgr = (managers ?? []).find(m => m.id === f.asset_manager_id)
      return mgr ? { ...f, managerSlug: mgr.slug, managerName: mgr.name, managerId: mgr.id } : null
    })
    .filter(Boolean)

  console.log(`📋 ${queue.length} funds to process`)
  if (queue.length === 0) { console.log('✅ Nothing to do'); return }

  // OneDrive
  let msToken = null, fondosRootId = null
  try {
    msToken = await getMsToken()
    const root = await (await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root`, {
      headers: { Authorization: `Bearer ${msToken}` }
    })).json()
    fondosRootId = await ensureFolder(msToken, root.id, 'Fondos')
    console.log('✅ OneDrive ready')
  } catch (e) { console.warn('⚠️  OneDrive:', e.message) }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)

  // Pre-accept the fundinfo disclaimer on a clean visit
  console.log('  → accepting fundinfo disclaimer…')
  await page.goto('https://fundinfo.com/en/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await acceptFundinfoDisclaimer(page)
  await page.waitForTimeout(1000)

  const results = []
  let imported = 0, failed = 0
  const folderCache = {}

  for (const fund of queue) {
    let pdfBuf = null
    try {
      pdfBuf = await scrapeFundinfo(page, fund.isin)
    } catch (e) {
      console.warn(`  ⚠️  ${fund.isin}: ${e.message.slice(0, 80)}`)
    }

    if (!pdfBuf) {
      failed++
      results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'not-found' })
      console.log(`  ✗ ${fund.isin} — ${fund.managerName}`)
      continue
    }

    let pdfUrl = null
    try {
      if (msToken && fondosRootId) {
        if (!folderCache[fund.managerName]) {
          folderCache[fund.managerName] = await ensureFolder(msToken, fondosRootId, fund.managerName)
        }
        const filename = `${fund.managerSlug}_${fund.isin}_factsheet.pdf`
        const up = await uploadToOneDrive(msToken, folderCache[fund.managerName], filename, pdfBuf)
        pdfUrl = up.webUrl
      }
    } catch (e) { console.warn(`  ⚠️  Upload ${fund.isin}: ${e.message}`) }

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
    results.push({ isin: fund.isin, fund: fund.name, manager: fund.managerName, status: 'ok' })
    console.log(`  ✓ ${fund.isin} — ${fund.name}`)
  }

  await context.close()
  await browser.close()

  const summary = { date: new Date().toISOString(), total: queue.length, imported, failed, results }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`\n🏁 Done: ${imported} imported, ${failed} not found`)
}

main().catch(e => { console.error(e); process.exit(1) })
