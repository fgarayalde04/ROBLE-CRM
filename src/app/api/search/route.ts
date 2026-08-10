import { NextRequest, NextResponse } from 'next/server'
import { getClients } from '@/lib/db/clients'
import { getDocuments } from '@/lib/db/documents'
import { getTasks } from '@/lib/db/tasks'
import { getDeadlines } from '@/lib/db/deadlines'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) {
    return NextResponse.json({ clients: [], documents: [], tasks: [], deadlines: [] })
  }

  const [clients, documents, tasks, deadlines] = await Promise.all([
    getClients(q).then((rows) => rows.slice(0, 5)),
    getDocuments({ search: q }).then((rows) => rows.slice(0, 5)),
    getTasks({ search: q }).then((rows) => rows.slice(0, 5)),
    getDeadlines({ search: q }).then((rows) => rows.slice(0, 5)),
  ])

  return NextResponse.json({ clients, documents, tasks, deadlines })
}
