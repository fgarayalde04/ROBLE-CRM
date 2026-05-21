import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export interface MonitoringRecordInput {
  account_number: string | null
  account_name: string | null
  client_code: string | null
  risk_level: string | null
  activity_profile: number | null
  risk_tolerance: string | null
  activity_risk_profile: number | null
  net_worth: number | null
  deviation_percent: number | null
  monitoring_status: string | null
  explanation: string | null
}

// ── Build a map: normalized-name-fragment → customer_number from legajos ──────
// Folder names look like "7683107 - BRANAA ALEJANDRA" or "7683107 - SURO SA"
// Account names in monitoring are often truncated: "BRANAA", "SURO SA"
function buildLegajosMap(legajos: any[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const l of legajos) {
    const num = l.customer_number
    if (!num) continue
    const folder = (l.folder_name ?? '').toUpperCase()
    // Extract name part after "XXXXXXX - "
    const namePart = folder.replace(/^\d+\s*-\s*/, '').trim()
    if (namePart) map.set(namePart, num)
    // Also index each word of 4+ chars for partial matching
    for (const word of namePart.split(/\s+/)) {
      if (word.length >= 4 && !map.has(word)) map.set(word, num)
    }
  }
  return map
}

function findClientCode(accountName: string | null, legajosMap: Map<string, string>): string | null {
  if (!accountName) return null
  const name = accountName.trim().toUpperCase()

  // 1. Exact match against full folder name part
  if (legajosMap.has(name)) return legajosMap.get(name)!

  // 2. Folder name starts with account name, or vice versa
  const entries = Array.from(legajosMap.entries())
  for (const [key, code] of entries) {
    if (key.startsWith(name) || name.startsWith(key)) return code
  }

  // 3. Account name is contained in folder name part, or vice versa
  for (const [key, code] of entries) {
    if (key.includes(name) || name.includes(key)) return code
  }

  return null
}

// POST /api/monitoring/create
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { period_year, period_quarter, original_file_name, records, entity } = body as {
    period_year: number
    period_quarter: number
    original_file_name: string
    records: MonitoringRecordInput[]
    entity: string
  }

  if (!period_year || !period_quarter || !Array.isArray(records)) {
    return NextResponse.json({ error: 'Campos requeridos: period_year, period_quarter, records' }, { status: 400 })
  }

  // ── Load legajos for client_code lookup ────────────────────────────────────
  // roble → type=local, geliene → type=internacional
  const legajosType = (entity ?? 'roble') === 'geliene' ? 'internacional' : 'local'
  const { data: legajosData } = await supabaseAdmin
    .from('banco_central_records')
    .select('customer_number, folder_name')
    .eq('type', legajosType)
  const legajosMap = buildLegajosMap(legajosData ?? [])

  // ── Also load base accounts with client_code for known accounts ────────────
  const { data: baseAccsWithCode } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .select('account_number, account_name, client_code')
    .eq('entity', entity ?? 'roble')
    .not('client_code', 'is', null)
  const baseCodeByNumber = new Map<string, string>()
  const baseCodeByName   = new Map<string, string>()
  for (const a of (baseAccsWithCode ?? []) as any[]) {
    if (a.account_number && a.client_code) baseCodeByNumber.set(a.account_number.trim().toUpperCase(), a.client_code)
    if (a.account_name   && a.client_code) baseCodeByName.set(a.account_name.trim().toUpperCase(), a.client_code)
  }

  // ── Server-side matching against base accounts ──────────────────────────────
  const { data: baseAccs } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .select('account_number, account_name, is_active')
    .eq('entity', entity ?? 'roble')

  const activeNumbers   = new Set<string>()
  const activeNames     = new Set<string>()
  const inactiveNumbers = new Set<string>()
  const inactiveNames   = new Set<string>()

  for (const a of (baseAccs ?? []) as any[]) {
    const num  = (a.account_number ?? '').trim().toUpperCase()
    const name = (a.account_name   ?? '').trim().toUpperCase()
    if (a.is_active) {
      if (num)  activeNumbers.add(num)
      if (name) activeNames.add(name)
    } else {
      if (num)  inactiveNumbers.add(num)
      if (name) inactiveNames.add(name)
    }
  }

  // Tag records, exclude inactive, and resolve client_code from legajos
  const taggedRecords = records
    .filter((r) => {
      const num  = (r.account_number ?? '').trim().toUpperCase()
      const name = (r.account_name   ?? '').trim().toUpperCase()
      const isInactive = (num && inactiveNumbers.has(num)) || (name && inactiveNames.has(name))
      return !isInactive
    })
    .map((r) => {
      const num  = (r.account_number ?? '').trim().toUpperCase()
      const name = (r.account_name   ?? '').trim().toUpperCase()
      const inBase = (num && activeNumbers.has(num)) || (name && activeNames.has(name))

      // Resolve client_code: base table → legajos lookup → original value
      const resolvedCode =
        (num  && baseCodeByNumber.get(num))  ||
        (name && baseCodeByName.get(name))   ||
        r.client_code                         ||
        findClientCode(r.account_name, legajosMap) ||
        null

      return { ...r, is_new_account: !inBase, client_code: resolvedCode }
    })

  const total            = taggedRecords.length
  const withDeviation    = taggedRecords.filter((r) => hasDeviation(r)).length
  const withoutDeviation = total - withDeviation
  const newAccounts      = taggedRecords.filter((r) => r.is_new_account).length

  // ── Create monitoring run ───────────────────────────────────────────────────
  const { data: run, error: runError } = await supabaseAdmin
    .from('monitoring_runs')
    .insert({
      period_year,
      period_quarter,
      original_file_name: original_file_name ?? null,
      created_by: session.name,
      entity: entity ?? 'roble',
      total_accounts: total,
      accounts_with_deviation: withDeviation,
      accounts_without_deviation: withoutDeviation,
      new_accounts_detected: newAccounts,
      status: 'completed',
    })
    .select('id')
    .single()

  if (runError || !run) return NextResponse.json({ error: runError?.message }, { status: 400 })

  // ── Insert records in batches of 100 ───────────────────────────────────────
  const BATCH = 100
  for (let i = 0; i < taggedRecords.length; i += BATCH) {
    const batch = taggedRecords.slice(i, i + BATCH).map((r) => ({
      monitoring_run_id:     run.id,
      account_number:        r.account_number        ?? null,
      account_name:          r.account_name          ?? null,
      client_code:           r.client_code           ?? null,
      risk_level:            r.risk_level            ?? null,
      activity_profile:      r.activity_profile      ?? null,
      risk_tolerance:        r.risk_tolerance        ?? null,
      activity_risk_profile: r.activity_risk_profile ?? null,
      net_worth:             r.net_worth             ?? null,
      deviation_percent:     r.deviation_percent     ?? null,
      monitoring_status:     r.monitoring_status     ?? null,
      explanation:           r.explanation           ?? null,
      is_new_account:        r.is_new_account,
    }))
    const { error } = await supabaseAdmin.from('monitoring_records').insert(batch)
    if (error) {
      await supabaseAdmin.from('monitoring_runs').delete().eq('id', run.id)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // ── Auto-create unmatched accounts in base table (needs_review = true) ──────
  const unmatched = taggedRecords.filter((r) => r.is_new_account && r.account_number)
  if (unmatched.length > 0) {
    const newBaseAccounts = unmatched.map((r) => ({
      account_number: r.account_number,
      account_name:   r.account_name   ?? null,
      client_code:    r.client_code    ?? null,  // already resolved from legajos
      risk_level:     null,
      activity_profile: null,
      risk_tolerance: null,
      comments:       null,
      is_active:      true,
      needs_review:   true,
      entity:         entity ?? 'roble',
    }))
    await supabaseAdmin
      .from('monitoring_base_accounts')
      .upsert(newBaseAccounts, { onConflict: 'account_number,entity', ignoreDuplicates: true })
  }

  return NextResponse.json({ id: run.id, new_accounts: newAccounts })
}

function hasDeviation(r: MonitoringRecordInput): boolean {
  if (r.deviation_percent !== null && r.deviation_percent > 0) return true
  const status = (r.monitoring_status ?? '').toLowerCase().trim()
  if (!status) return false
  const noDeviation = ['ok', 'normal', 'sin desvío', 'sin desvio', 'correcto', 'completo', 'aceptable', '-', '—']
  return !noDeviation.includes(status)
}
