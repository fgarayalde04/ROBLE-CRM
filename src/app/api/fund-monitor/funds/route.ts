import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'
import { syncSingleFund } from '@/lib/fundMonitor/sync'

export const maxDuration = 60 // login + búsqueda en Davinci

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

    // Completa los rendimientos desde Davinci en el momento (no espera al sync
    // diario). Si falla, el fondo igual queda creado.
    const sync = await syncSingleFund({ id: rows[0].id, isin: cleanIsin, nombre: rows[0].nombre })
    return NextResponse.json({ ...rows[0], sync })
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
