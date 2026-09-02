import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { searchClientsForOrders, getAllEmailsByClientNumbers } from '@/lib/db/clients'

// GET /api/legajos/search?q=...
// Buscador de cliente para armar órdenes — busca siempre en Clientes (no en
// Legajos/Banco Central): un cliente activo sin legajo cargado ahí quedaba
// invisible para enviar órdenes aunque existiera y estuviera activo.
// Respeta allowed_folders: un asesor solo debe poder armar una orden para
// sus propios clientes, igual que en la sección Clientes.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  let rawResults
  try {
    rawResults = await searchClientsForOrders(q, session.allowed_folders)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const clientNumbers = rawResults.map((r) => r.client_number).filter(Boolean) as string[]
  const allEmailsMap = await getAllEmailsByClientNumbers(clientNumbers)

  const results = rawResults.map((r) => {
    const displayName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Sin nombre'
    const allEmails = r.client_number ? (allEmailsMap.get(r.client_number) ?? []) : (r.email ? [r.email] : [])
    return {
      id: r.id,
      customer_number: r.client_number as string | null,
      display_name: displayName,
      advisor: r.advisor as string | null,
      authorized_email: (r.email as string | null) ?? (allEmails[0] ?? null),
      all_emails: allEmails,
    }
  })

  return NextResponse.json({ results })
}
