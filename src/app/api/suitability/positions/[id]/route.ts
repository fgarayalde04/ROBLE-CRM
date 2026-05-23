import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth'
import { ASSET_CLASS_DEFAULT_SCORE, type AssetClass } from '@/lib/risk-scoring'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = params
    const body = await req.json() as {
      asset_class?: AssetClass
      risk_score?: number
      category?: string
    }

    const update: Record<string, unknown> = {
      classification_status: 'manual',
      updated_at: new Date().toISOString(),
    }

    if (body.asset_class !== undefined) {
      update.asset_class = body.asset_class
      // Auto-fill risk_score from default if not provided
      if (body.risk_score === undefined) {
        update.risk_score = ASSET_CLASS_DEFAULT_SCORE[body.asset_class]
      }
    }
    if (body.risk_score !== undefined) update.risk_score = body.risk_score
    if (body.category   !== undefined) update.category   = body.category

    const { data, error } = await supabaseAdmin
      .from('portfolio_positions')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
