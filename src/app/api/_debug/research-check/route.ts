import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Endpoint puntual de diagnóstico — para ver si el Morning Brief de hoy llegó
// y si el secret de Zapia está configurado, sin exponer su valor. A borrar
// apenas se use.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { rows } = await pool.query(
    `select id, brief_date, created_at, author from research_posts
     where type = 'morning_brief'
     order by created_at desc
     limit 5`
  )

  return NextResponse.json({
    hasZapiaSecret: !!process.env.ZAPIA_WEBHOOK_SECRET,
    recentBriefs: rows,
    serverNow: new Date().toISOString(),
  })
}
