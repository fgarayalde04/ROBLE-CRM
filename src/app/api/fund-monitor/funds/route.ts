import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { isin, nombre, categoria, subcategoria } = await req.json()
  if (!isin?.trim() || !nombre?.trim() || !categoria?.trim()) {
    return NextResponse.json({ error: 'ISIN, nombre y categoría son requeridos' }, { status: 400 })
  }

  const cleanIsin = isin.trim().toUpperCase()
  const cleanSub = subcategoria?.trim() || null

  const client = await pool.connect()
  try {
    await client.query('begin')

    // sort_order es un entero global que reproduce el orden de filas del
    // Excel — dos fondos nunca pueden compartir el mismo valor, porque eso
    // rompe el agrupado contiguo por categoría/subcategoría en la UI
    // (groupInOrder asume que cada grupo aparece en un bloque seguido).
    // Por eso insertar "al final del grupo" corre +1 a todo lo que viene
    // después, en vez de reusar o intercalar un número.
    const { rows: groupRows } = await client.query(
      `select max(sort_order) as max_sort from fund_monitor_funds
       where categoria = $1 and coalesce(subcategoria, '') = coalesce($2, '')`,
      [categoria.trim(), cleanSub]
    )
    let insertAfter = groupRows[0].max_sort
    if (insertAfter == null) {
      // Categoría/subcategoría nueva, sin fondos todavía: va al final de toda la planilla.
      const { rows: totalRows } = await client.query(`select coalesce(max(sort_order), 0) as max_sort from fund_monitor_funds`)
      insertAfter = Number(totalRows[0].max_sort)
    }

    await client.query(`update fund_monitor_funds set sort_order = sort_order + 1 where sort_order > $1`, [insertAfter])

    const { rows } = await client.query(
      `insert into fund_monitor_funds (isin, nombre, categoria, subcategoria, sort_order, active)
       values ($1, $2, $3, $4, $5, true)
       returning *`,
      [cleanIsin, nombre.trim(), categoria.trim(), cleanSub, insertAfter + 1]
    )

    await client.query('commit')
    return NextResponse.json(rows[0])
  } catch (err: any) {
    await client.query('rollback')
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un fondo con ese ISIN' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 400 })
  } finally {
    client.release()
  }
}

// Endpoint puntual para borrar el fondo de prueba QA0000000001 usado para
// verificar el alta en producción — a borrar apenas se use.
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { isin } = await req.json()
  if (isin !== 'QA0000000001') {
    return NextResponse.json({ error: 'Solo permitido para el fondo de prueba' }, { status: 400 })
  }
  await pool.query(`delete from fund_monitor_funds where isin = $1`, [isin])
  return NextResponse.json({ ok: true })
}
