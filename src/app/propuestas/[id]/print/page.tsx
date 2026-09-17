import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { getProposalWithLines } from '@/lib/db/proposals'
import { getSession } from '@/lib/auth'
import ProposalPDFTemplate from '@/components/proposals/ProposalPDFTemplate'

export const dynamic = 'force-dynamic'

// Hoja "para imprimir" — layout normal (nada de position:fixed/off-screen
// como usaba el viejo mecanismo de html2canvas), pensada para que
// /api/proposals/[id]/pdf la abra con un browser headless y llame a
// page.pdf(): así la paginación es la NATIVA del navegador — cuando la
// tabla no entra en una hoja, Chromium repite el <thead> solo en la
// siguiente, sin que haya que armar ningún mecanismo de recorte a mano.
export default async function ProposalPrintPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { hidden?: string }
}) {
  noStore()
  const session = await getSession()
  if (!session) return null

  const { proposal, funds, bonds, equities } = await getProposalWithLines(params.id)
  if (!proposal) notFound()

  const hiddenColumns = new Set((searchParams.hidden ?? '').split(',').filter(Boolean))

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        /* Cada <tr> nunca se parte al medio entre hojas — el <thead> de la
           tabla se repite solo en cada hoja nueva, es comportamiento
           nativo del navegador al paginar una tabla larga. */
        tr { break-inside: avoid; page-break-inside: avoid; }
      `}</style>
      <ProposalPDFTemplate
        clientName={proposal.client_name}
        advisorName={proposal.advisor_name}
        totalAmount={proposal.total_amount}
        currency={proposal.currency}
        funds={funds as any}
        bonds={bonds as any}
        equities={equities as any}
        disclaimer={proposal.disclaimer}
        settlementDate={proposal.settlement_date}
        hiddenColumns={hiddenColumns}
      />
    </>
  )
}
