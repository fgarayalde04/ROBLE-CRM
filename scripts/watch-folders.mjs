/**
 * watch-folders.mjs
 * Watches three folder paths:
 *   - CLIENTS_FOLDER_PATH/{advisor}/{client}/  → POST /api/sync-clientes
 *   - LEGAJOS_CUNDRY_PATH/{client}/            → POST /api/sync-banco-central
 *   - LEGAJOS_GENELIE_PATH/{client}/           → POST /api/sync-banco-central
 *
 * Legacy: also watches LOCAL_CLIENTS_FOLDER_PATH → POST /api/sync-local-folders
 *
 * Run:  npm run watch
 */

import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import chokidar from 'chokidar'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── 1. Load .env.local manually ────────────────────────────────────────────
async function loadEnv() {
  const envPath = resolve(ROOT, '.env.local')
  try {
    const raw = await readFile(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      process.env[key] ??= val
    }
  } catch {
    console.warn('[watch] No se pudo leer .env.local — usando variables del entorno.')
  }
}

// ── 2. Queue-based sync per endpoint ────────────────────────────────────────
const syncState = {}

async function triggerSync(endpoint, reason) {
  if (!syncState[endpoint]) syncState[endpoint] = { syncing: false, pending: false }
  const state = syncState[endpoint]

  if (state.syncing) {
    state.pending = true
    return
  }
  state.syncing = true

  const baseUrl = process.env.CRM_BASE_URL ?? 'http://localhost:3000'
  console.log(`[watch] Sincronizando ${endpoint} (${reason})…`)

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      console.error(`[watch] Error del servidor (${endpoint}):`, json.error ?? res.statusText)
    } else {
      summarize(endpoint, json)
    }
  } catch (err) {
    console.error(`[watch] No se pudo conectar con el CRM (¿está corriendo npm run dev?):`, err.message)
  } finally {
    state.syncing = false
    if (state.pending) {
      state.pending = false
      setTimeout(() => triggerSync(endpoint, 'cola pendiente'), 1000)
    }
  }
}

function summarize(endpoint, json) {
  if (endpoint === '/api/sync-clientes') {
    const { total_found, created, duplicates, errors } = json
    console.log(`[watch] ✓ Clientes: ${total_found} encontradas · ${created} nuevas · ${duplicates} ya existían · ${errors} errores`)
    if (json.advisors?.length) {
      for (const a of json.advisors) {
        console.log(`        ${a.name}: ${a.count} carpetas`)
      }
    }
  } else if (endpoint === '/api/sync-banco-central') {
    const { results } = json
    if (results?.cundry && !results.cundry.error) {
      const r = results.cundry
      console.log(`[watch] ✓ Cundry (local): ${r.found} encontrados · ${r.linked} vinculados · ${r.created} nuevos · ${r.errors} errores`)
    }
    if (results?.genelie && !results.genelie.error) {
      const r = results.genelie
      console.log(`[watch] ✓ Genelie (internacional): ${r.found} encontrados · ${r.linked} vinculados · ${r.created} nuevos · ${r.errors} errores`)
    }
  } else if (endpoint === '/api/sync-local-folders') {
    const { created, duplicates, total_found } = json
    console.log(`[watch] ✓ Nuevos clientes: ${total_found} encontradas · ${created} nuevas · ${duplicates} ya existían`)
  }
}

// ── 3. Main ────────────────────────────────────────────────────────────────
await loadEnv()

const baseUrl = process.env.CRM_BASE_URL ?? 'http://localhost:3000'
console.log(`[watch] CRM: ${baseUrl}`)
console.log()

const watchers = []

// — CLIENTS_FOLDER_PATH (depth:1 — advisor/{client} folders) ———————————
const clientsPath = process.env.CLIENTS_FOLDER_PATH
if (clientsPath) {
  console.log(`[watch] Clientes:      ${clientsPath}`)
  await triggerSync('/api/sync-clientes', 'inicio')

  const w = chokidar.watch(clientsPath, {
    depth: 1,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  })
  w.on('addDir', (path) => {
    if (path === clientsPath) return
    const name = path.split('/').pop()
    console.log(`[watch] 📁 Nueva carpeta en Clientes: "${name}"`)
    triggerSync('/api/sync-clientes', `nueva carpeta: ${name}`)
  })
  w.on('error', (err) => console.error('[watch] Error (Clientes):', err))
  watchers.push(w)
} else {
  console.warn('[watch] CLIENTS_FOLDER_PATH no configurado — omitiendo.')
}

// — LEGAJOS_CUNDRY_PATH (depth:0) ————————————————————————————————————————
const cundryPath = process.env.LEGAJOS_CUNDRY_PATH
if (cundryPath) {
  console.log(`[watch] Cundry:        ${cundryPath}`)
  await triggerSync('/api/sync-banco-central', 'inicio')

  const w = chokidar.watch(cundryPath, {
    depth: 0,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  })
  w.on('addDir', (path) => {
    if (path === cundryPath) return
    const name = path.split('/').pop()
    console.log(`[watch] 📁 Nuevo legajo Cundry: "${name}"`)
    triggerSync('/api/sync-banco-central', `nueva carpeta Cundry: ${name}`)
  })
  w.on('error', (err) => console.error('[watch] Error (Cundry):', err))
  watchers.push(w)
} else {
  console.warn('[watch] LEGAJOS_CUNDRY_PATH no configurado — omitiendo.')
}

// — LEGAJOS_GENELIE_PATH (depth:0) ————————————————————————————————————————
const geneliePath = process.env.LEGAJOS_GENELIE_PATH
if (geneliePath) {
  console.log(`[watch] Genelie:       ${geneliePath}`)
  // Banco Central ya fue synced above, no need to re-trigger

  const w = chokidar.watch(geneliePath, {
    depth: 0,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  })
  w.on('addDir', (path) => {
    if (path === geneliePath) return
    const name = path.split('/').pop()
    console.log(`[watch] 📁 Nuevo legajo Genelie: "${name}"`)
    triggerSync('/api/sync-banco-central', `nueva carpeta Genelie: ${name}`)
  })
  w.on('error', (err) => console.error('[watch] Error (Genelie):', err))
  watchers.push(w)
} else {
  console.warn('[watch] LEGAJOS_GENELIE_PATH no configurado — omitiendo.')
}

// — Legacy: LOCAL_CLIENTS_FOLDER_PATH (Clientes nuevos / prospectos) ———————
const legacyPath = process.env.LOCAL_CLIENTS_FOLDER_PATH
if (legacyPath) {
  console.log(`[watch] Nuevos (legacy): ${legacyPath}`)
  await triggerSync('/api/sync-local-folders', 'inicio')

  const w = chokidar.watch(legacyPath, {
    depth: 0,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
  })
  w.on('addDir', (path) => {
    if (path === legacyPath) return
    const name = path.split('/').pop()
    console.log(`[watch] 📁 Nuevo prospecto: "${name}"`)
    triggerSync('/api/sync-local-folders', `nueva carpeta: ${name}`)
  })
  w.on('error', (err) => console.error('[watch] Error (legacy):', err))
  watchers.push(w)
}

console.log(`\n[watch] Listo — monitoreando ${watchers.length} carpeta(s).\n`)

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[watch] Deteniendo monitor…')
  await Promise.all(watchers.map((w) => w.close()))
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await Promise.all(watchers.map((w) => w.close()))
  process.exit(0)
})
