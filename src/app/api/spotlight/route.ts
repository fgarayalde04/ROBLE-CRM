import { NextRequest, NextResponse } from 'next/server'
import { spotlightSearch } from '@/lib/db/spotlight'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ clients: [], tasks: [], openings: [], resources: [], total: 0 })
  }

  const { clients, tasks, openings, resources } = await spotlightSearch(q)

  return NextResponse.json({
    clients,
    tasks,
    openings,
    resources,
    total: clients.length + tasks.length + openings.length + resources.length,
  })
}
