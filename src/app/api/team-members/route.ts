import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export async function GET() {
  try {
    const { rows } = await pool.query(`select id, name from team_members order by name`)
    return NextResponse.json(rows ?? [])
  } catch {
    // Table may not exist yet — return empty array gracefully
    return NextResponse.json([])
  }
}
