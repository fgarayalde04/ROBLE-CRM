import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

// Endpoint puntual de diagnóstico — confirma si la migración/seed de Iche
// Acciones ya se aplicó a la base real. A borrar apenas se use.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { rows: openRows } = await pool.query(`select count(*) as n from iche_open_positions`)
    const { rows: closedRows } = await pool.query(`select count(*) as n from iche_closed_positions`)
    const { rows: logRows } = await pool.query(`select count(*) as n from iche_generation_log`)
    return NextResponse.json({
      tablesExist: true,
      openPositions: Number(openRows[0].n),
      closedPositions: Number(closedRows[0].n),
      generationLogEntries: Number(logRows[0].n),
    })
  } catch (err: any) {
    return NextResponse.json({ tablesExist: false, error: err.message })
  }
}
