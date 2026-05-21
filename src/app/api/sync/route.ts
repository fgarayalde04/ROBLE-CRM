import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  syncClients,
  syncBancoCentralLocal,
  syncBancoCentralInternacional,
  syncResources,
} from '@/lib/microsoft/sync'

type SyncType = 'clientes' | 'bcu_local' | 'bcu_internacional' | 'recursos' | 'all'

const SYNC_FNS: Record<Exclude<SyncType, 'all'>, () => Promise<unknown>> = {
  clientes: syncClients,
  bcu_local: syncBancoCentralLocal,
  bcu_internacional: syncBancoCentralInternacional,
  recursos: syncResources,
}

async function markRunning(types: string[]) {
  for (const t of types) {
    await supabaseAdmin.from('sync_logs').insert({
      sync_type: t,
      status: 'running',
      started_at: new Date().toISOString(),
    })
  }
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

  // Write "running" markers immediately so the UI picks them up
  await markRunning(targets)

  // Fire each sync in the background — don't await
  for (const t of targets) {
    SYNC_FNS[t]().catch(console.error)
  }

  return NextResponse.json({ status: 'started', types: targets }, { status: 202 })
}
