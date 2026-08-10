import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listOrderItemsFlat } from '@/lib/db/ordenes'

const ADMIN_ROLES = ['admin', 'ceo', 'direccion']

// GET /api/ordenes/items
// Params: done (true|false|empty=all), dateFrom, dateTo, instrument, user (admin)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ADMIN_ROLES.includes(session.role)
  const { searchParams } = req.nextUrl

  const doneParam   = searchParams.get('done') as 'true' | 'false' | null
  const dateFrom    = searchParams.get('dateFrom')
  const dateTo      = searchParams.get('dateTo')
  const instrument  = searchParams.get('instrument')
  const userFilter  = isAdmin ? searchParams.get('user') : null

  const flat = await listOrderItemsFlat({
    userFilter: !isAdmin ? session.name : null,
    user: userFilter, dateFrom, dateTo, done: doneParam, instrument,
  })

  return NextResponse.json({ items: flat, isAdmin })
}
