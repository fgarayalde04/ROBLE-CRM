import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

const COLUMNS = [
  { key: 'account_name',           label: 'Nombre cuenta' },
  { key: 'account_number',         label: 'Número cuenta' },
  { key: 'client_code',            label: 'Código cliente' },
  { key: 'risk_level',             label: 'Riesgo' },
  { key: 'activity_profile',       label: 'Perfil actividad' },
  { key: 'risk_tolerance',         label: 'Tolerancia riesgo' },
  { key: 'activity_risk_profile',  label: 'Perfil actividad + tolerancia' },
  { key: 'net_worth',              label: 'AUM / Net worth' },
  { key: 'deviation_percent',      label: 'Desvío (%)' },
  { key: 'monitoring_status',      label: 'Estado monitoreo' },
  { key: 'explanation',            label: 'Explicación' },
  { key: 'is_new_account',         label: 'Cuenta nueva' },
  { key: 'period',                 label: 'Período' },
]

// GET /api/monitoring/[id]/download?format=xlsx|csv
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'

  // Get run metadata
  const { data: run } = await supabaseAdmin
    .from('monitoring_runs')
    .select('period_year, period_quarter, created_at, entity')
    .eq('id', params.id)
    .single()

  if (!run) return NextResponse.json({ error: 'Monitoreo no encontrado' }, { status: 404 })

  const period = `Q${run.period_quarter} ${run.period_year}`

  // Get inactive accounts for this entity (to exclude them)
  const { data: inactiveAccs } = await supabaseAdmin
    .from('monitoring_base_accounts')
    .select('account_number, account_name')
    .eq('entity', run?.entity ?? 'roble')
    .eq('is_active', false)

  const inactiveNumbers = new Set<string>()
  const inactiveNames   = new Set<string>()
  for (const a of (inactiveAccs ?? []) as any[]) {
    if (a.account_number) inactiveNumbers.add((a.account_number as string).trim().toUpperCase())
    if (a.account_name)   inactiveNames.add((a.account_name as string).trim().toUpperCase())
  }

  // Get records
  const { data: rawRecords, error } = await supabaseAdmin
    .from('monitoring_records')
    .select('*')
    .eq('monitoring_run_id', params.id)
    .order('is_new_account', { ascending: true })
    .order('client_code',    { ascending: true, nullsFirst: false })
    .order('account_name',   { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Exclude inactive accounts
  const records = (rawRecords ?? []).filter((r: any) => {
    const num  = (r.account_number ?? '').trim().toUpperCase()
    const name = (r.account_name   ?? '').trim().toUpperCase()
    return !(
      (num  && inactiveNumbers.has(num)) ||
      (name && inactiveNames.has(name))
    )
  })

  const rows = (records ?? []).map((r: any) => ({
    account_name: r.account_name ?? '',
    account_number: r.account_number ?? '',
    client_code: r.client_code ?? '',
    risk_level: r.risk_level ?? '',
    activity_profile: r.activity_profile ?? '',
    risk_tolerance: r.risk_tolerance ?? '',
    activity_risk_profile: r.activity_risk_profile ?? '',
    net_worth: r.net_worth ?? '',
    deviation_percent: r.deviation_percent ?? '',
    monitoring_status: r.monitoring_status ?? '',
    explanation: r.explanation ?? '',
    is_new_account: r.is_new_account ? 'Sí' : 'No',
    period,
  }))

  const fileName = `Monitoreo_${period.replace(' ', '_')}`

  if (format === 'csv') {
    const header = COLUMNS.map((c) => c.label).join(',')
    const lines = rows.map((r: any) =>
      COLUMNS.map((c) => {
        const v = String(r[c.key] ?? '')
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
      }).join(',')
    )
    const csv = [header, ...lines].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.csv"`,
      },
    })
  }

  // Excel
  const wsData = [
    COLUMNS.map((c) => c.label),
    ...rows.map((r: any) => COLUMNS.map((c) => r[c.key])),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = COLUMNS.map((c, i) => ({
    wch: Math.max(c.label.length, i === 0 ? 30 : i === 9 ? 20 : 18),
  }))

  XLSX.utils.book_append_sheet(wb, ws, `Monitoreo ${period}`)
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}.xlsx"`,
    },
  })
}
