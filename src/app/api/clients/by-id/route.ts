import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { getClient } from '@/lib/db/clients'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json(null)

    const [client, bcRes, fichaRes] = await Promise.all([
      getClient(id).catch(() => null),
      pool.query(`select id, type, customer_number, authorized_email from banco_central_records where linked_client_id = $1`, [id]),
      pool.query(
        `select ficha_data, tipo_cliente from bc_fichas where client_id = $1 order by updated_at desc limit 1`,
        [id]
      ),
    ])

    if (!client) return NextResponse.json(null)
    return NextResponse.json({
      ...client,
      banco_central: bcRes.rows,
      bc_ficha: fichaRes.rows[0] ?? null,
    })
  } catch {
    return NextResponse.json(null)
  }
}
