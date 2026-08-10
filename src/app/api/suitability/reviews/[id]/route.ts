import { NextResponse } from 'next/server'
import { deletePortfolioReview } from '@/lib/db/suitability'
import { getSession } from '@/lib/auth'

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    await deletePortfolioReview(params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
