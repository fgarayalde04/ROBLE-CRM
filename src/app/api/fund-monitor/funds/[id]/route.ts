import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { pool } from '@/lib/db/pool'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { isin, nombre, categoria, subcategoria, moneda } = await req.json()
  if (!isin?.trim() || !nombre?.trim() || !categoria?.trim()) {
    return NextResponse.json({ error: 'ISIN, nombre y categoría son requeridos' }, { status: 400 })
  }

  const cleanIsin = isin.trim().toUpperCase()
  const cleanCategoria = categoria.trim()
  const cleanSub = subcategoria?.trim() || null
  const cleanMoneda = moneda?.trim() || null

  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows: currentRows } = await client.query(
      `select categoria, subcategoria, sort_order from fund_monitor_funds where id = $1`,
      [params.id]
    )
    const current = currentRows[0]
    if (!current) {
      await client.query('rollback')
      return NextResponse.json({ error: 'Fondo no encontrado' }, { status: 404 })
    }

    const groupChanged = current.categoria !== cleanCategoria || (current.subcategoria ?? '') !== (cleanSub ?? '')
    let newSortOrder = current.sort_order

    if (groupChanged) {
      // Mismo criterio que el alta: se reubica al final del nuevo grupo,
      // corriendo +1 todo lo que venía después para abrir un lugar — el
      // hueco que deja en el grupo viejo no rompe nada porque groupInOrder
      // solo necesita que cada grupo quede contiguo, no que los números sean consecutivos.
      const { rows: groupRows } = await client.query(
        `select max(sort_order) as max_sort from fund_monitor_funds
         where categoria = $1 and coalesce(subcategoria, '') = coalesce($2, '') and id != $3`,
        [cleanCategoria, cleanSub, params.id]
      )
      let insertAfter = groupRows[0].max_sort
      if (insertAfter == null) {
        const { rows: totalRows } = await client.query(`select coalesce(max(sort_order), 0) as max_sort from fund_monitor_funds where id != $1`, [params.id])
        insertAfter = Number(totalRows[0].max_sort)
      }
      await client.query(`update fund_monitor_funds set sort_order = sort_order + 1 where sort_order > $1 and id != $2`, [insertAfter, params.id])
      newSortOrder = insertAfter + 1
    }

    const { rows } = await client.query(
      `update fund_monitor_funds
       set isin = $1, nombre = $2, categoria = $3, subcategoria = $4, moneda = $5, sort_order = $6
       where id = $7
       returning *`,
      [cleanIsin, nombre.trim(), cleanCategoria, cleanSub, cleanMoneda, newSortOrder, params.id]
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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Baja lógica (active = false): nunca se borra la fila, para no perder el
  // historial de rendimientos ya sincronizado si más adelante hay que reactivarlo.
  await pool.query(`update fund_monitor_funds set active = false where id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
