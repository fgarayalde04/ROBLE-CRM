import { NextRequest, NextResponse } from 'next/server'
import { getSession, createSession, SESSION_COOKIE } from '@/lib/auth'
import { getProposalWithLines } from '@/lib/db/proposals'
import { getBrowser } from '@/lib/fondos/browser'

export const maxDuration = 60

// GET /api/proposals/[id]/pdf — genera el PDF con un browser headless
// (Playwright) navegando a la hoja "para imprimir" (/propuestas/[id]/print)
// y usando page.pdf(): la paginación es la NATIVA del navegador, así que
// una tabla que no entra en una hoja pasa a la siguiente con su <thead>
// repetido solo, sin ningún recorte/composición manual.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { proposal } = await getProposalWithLines(params.id)
  if (!proposal) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })

  const hidden = req.nextUrl.searchParams.get('hidden') ?? ''

  const browser = await getBrowser()
  if (!browser) return NextResponse.json({ error: 'No se pudo iniciar el browser headless' }, { status: 500 })

  const port = process.env.PORT ?? '3000'
  const printUrl = `http://127.0.0.1:${port}/propuestas/${params.id}/print${hidden ? `?hidden=${encodeURIComponent(hidden)}` : ''}`

  const context = await browser.newContext()
  try {
    // Mismo usuario, sesión nueva — page.pdf() necesita que la hoja de
    // impresión se pueda cargar autenticada, y esta ruta ya confirmó
    // arriba que el pedido es de un usuario con sesión válida.
    const token = await createSession(session)
    await context.addCookies([{ name: SESSION_COOKIE, value: token, domain: '127.0.0.1', path: '/' }])

    const page = await context.newPage()
    await page.goto(printUrl, { waitUntil: 'networkidle' })
    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true })

    const clientSlug = (proposal.client_name ?? 'propuesta').replace(/\s+/g, '_')
    const dateSlug = new Date().toISOString().slice(0, 10)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Propuesta_${clientSlug}_${dateSlug}.pdf"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: `No se pudo generar el PDF: ${err.message}` }, { status: 500 })
  } finally {
    await context.close()
  }
}
