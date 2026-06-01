/**
 * POST /api/suitability/scoring-base/import
 * Importa activos desde un archivo Excel/CSV a la tabla scoring_base.
 *
 * Columnas esperadas (insensible a mayúsculas, en cualquier orden):
 *   security_identifier | isin | cusip | symbol | normalized_name | security_description
 *   security_type | market_sector | asset_class | category | risk_score
 *   score_explanation | source | classification_status | needs_review
 */
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'

export const maxDuration = 30

// Normalize a header string to a canonical key
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s\-_]+/g, '_').trim()
}

// Map of accepted header aliases → canonical field
const HEADER_MAP: Record<string, string> = {
  security_identifier: 'security_identifier',
  identifier:          'security_identifier',
  sec_id:              'security_identifier',
  cusip:               'cusip',
  isin:                'isin',
  symbol:              'symbol',
  ticker:              'symbol',
  normalized_name:     'normalized_name',
  name:                'normalized_name',
  nombre:              'normalized_name',
  security_description:'security_description',
  description:         'security_description',
  descripcion:         'security_description',
  security_type:       'security_type',
  tipo:                'security_type',
  market_sector:       'market_sector',
  sector:              'market_sector',
  asset_class:         'asset_class',
  clase_activo:        'asset_class',
  category:            'category',
  categoria:           'category',
  risk_score:          'risk_score',
  score:               'risk_score',
  score_explanation:   'score_explanation',
  explicacion:         'score_explanation',
  explanation:         'score_explanation',
  source:              'source',
  fuente:              'source',
  classification_status:'classification_status',
  estado:              'classification_status',
  needs_review:        'needs_review',
  revisar:             'needs_review',
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

    const buffer    = Buffer.from(await file.arrayBuffer())
    const ext       = file.name.split('.').pop()?.toLowerCase() ?? ''

    let rows: Record<string, unknown>[] = []

    if (ext === 'csv' || ext === 'txt') {
      const wb   = XLSX.read(buffer, { type: 'buffer', raw: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      rows       = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb   = XLSX.read(buffer, { type: 'buffer' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      rows       = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    } else {
      return NextResponse.json({ error: 'Formato no soportado. Usar .xlsx, .xls o .csv' }, { status: 400 })
    }

    if (!rows.length) return NextResponse.json({ error: 'Archivo vacío o sin datos' }, { status: 400 })

    // Map each row using normalized headers
    const upserts: Record<string, unknown>[] = []
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const mapped: Record<string, unknown> = {}

      for (const [rawKey, value] of Object.entries(row)) {
        const normalized = normalizeHeader(rawKey)
        const canonical  = HEADER_MAP[normalized]
        if (canonical) mapped[canonical] = value
      }

      // security_identifier is required
      const secId = String(mapped['security_identifier'] ?? mapped['cusip'] ?? mapped['isin'] ?? mapped['symbol'] ?? '').trim().toUpperCase()
      if (!secId) { errors.push(`Fila ${i + 2}: sin security_identifier, se omite`); continue }

      const riskScore = mapped['risk_score'] != null ? parseFloat(String(mapped['risk_score'])) : null
      if (riskScore != null && (isNaN(riskScore) || riskScore < 1 || riskScore > 10)) {
        errors.push(`Fila ${i + 2} (${secId}): risk_score inválido (${mapped['risk_score']}), se omite`)
        continue
      }

      // Auto-detect identifier_type
      const identifierType = /^[A-Z]{2}[A-Z0-9]{10}$/.test(secId) ? 'isin'
                           : /^[A-Z0-9]{9}$/.test(secId)           ? 'cusip'
                           : /^[A-Z]{1,6}$/.test(secId)            ? 'ticker'
                           : 'unknown'

      upserts.push({
        security_identifier:  secId,
        identifier_type:      identifierType,
        isin:                 mapped['isin']   ? String(mapped['isin']).toUpperCase()   : null,
        cusip:                mapped['cusip']  ? String(mapped['cusip']).toUpperCase()  : null,
        symbol:               mapped['symbol'] ? String(mapped['symbol']).toUpperCase() : null,
        normalized_name:      mapped['normalized_name']      ? String(mapped['normalized_name'])      : null,
        security_description: mapped['security_description'] ? String(mapped['security_description']) : null,
        security_type:        mapped['security_type']        ? String(mapped['security_type'])        : null,
        market_sector:        mapped['market_sector']        ? String(mapped['market_sector'])        : null,
        asset_class:          mapped['asset_class']          ? String(mapped['asset_class'])          : null,
        category:             mapped['category']             ? String(mapped['category'])             : null,
        risk_score:           riskScore,
        score_explanation:    mapped['score_explanation']    ? String(mapped['score_explanation'])    : null,
        source:               mapped['source']               ? String(mapped['source'])               : 'manual',
        classification_status: riskScore != null ? (mapped['classification_status'] ? String(mapped['classification_status']) : 'classified') : 'pending',
        needs_review:         String(mapped['needs_review'] ?? '').toLowerCase() === 'true' || String(mapped['needs_review'] ?? '') === '1',
        manual_override:      true,   // imported entries treated as manually curated
        manual_override_by:   session.email ?? session.id ?? null,
        manual_override_at:   new Date().toISOString(),
        last_verified_at:     new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      })
    }

    if (!upserts.length) {
      return NextResponse.json({ error: 'Ninguna fila válida para importar', warnings: errors }, { status: 400 })
    }

    // Batch upsert in chunks of 100
    let inserted = 0; let skipped = 0
    for (let i = 0; i < upserts.length; i += 100) {
      const chunk = upserts.slice(i, i + 100)
      const { data, error } = await supabaseAdmin
        .from('scoring_base')
        .upsert(chunk, { onConflict: 'security_identifier' })
        .select('id')
      if (error) {
        errors.push(`Chunk ${Math.floor(i / 100) + 1}: ${error.message}`)
        skipped += chunk.length
      } else {
        inserted += data?.length ?? chunk.length
      }
    }

    return NextResponse.json({
      inserted,
      skipped,
      total: upserts.length,
      warnings: errors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
