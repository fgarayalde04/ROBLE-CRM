import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  syncClients,
  syncBancoCentralLocal,
  syncBancoCentralInternacional,
  syncResources,
  syncScoring,
} from '@/lib/microsoft/sync'

export const maxDuration = 300 // 5 minutes — enough for full sync

type SyncType = 'clientes' | 'bcu_local' | 'bcu_internacional' | 'recursos' | 'scoring' | 'all'

const SYNC_FNS: Record<Exclude<SyncType, 'all'>, () => Promise<unknown>> = {
  clientes: syncClients,
  bcu_local: syncBancoCentralLocal,
  bcu_internacional: syncBancoCentralInternacional,
  recursos: syncResources,
  scoring: syncScoring,
}

// Reset any sync_logs stuck in "running" for more than 10 minutes
async function resetStuckSyncs() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await supabaseAdmin
    .from('sync_logs')
    .update({ status: 'error', message: 'Timeout — se canceló automáticamente', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', tenMinutesAgo)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { type?: SyncType }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type } = body
  if (!type) return NextResponse.json({ error: 'Missing type field' }, { status: 400 })

  const allTypes = (Object.keys(SYNC_FNS) as Exclude<SyncType, 'all'>[])
  const targets: Exclude<SyncType, 'all'>[] = type === 'all' ? allTypes : [type as Exclude<SyncType, 'all'>]

  if (!targets.every(t => t in SYNC_FNS)) {
    return NextResponse.json({ error: 'Invalid sync type' }, { status: 400 })
  }

  // Reset any stuck syncs before starting
  await resetStuckSyncs()

  // Run syncs and await them — Vercel kills background work after response
  const results: Record<string, unknown> = {}
  for (const t of targets) {
    try {
      results[t] = await SYNC_FNS[t]()
    } catch (e: any) {
      results[t] = { error: e.message }
    }
  }

  return NextResponse.json({ status: 'done', results })
}
