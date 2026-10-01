import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getPlantilla } from '@/lib/db/plantillas'
import PlantillaRender, { PAGINA_PLANTILLA } from '@/components/plantillas/PlantillaRender'
import { plantillaFontsClass } from '@/lib/plantillas/fonts'

export const dynamic = 'force-dynamic'

// Hoja "para imprimir": la abre /api/plantillas/[id]/pdf con un browser
// headless y llama a page.pdf() (mismo mecanismo que las propuestas).
export default async function PlantillaPrintPage({ params }: { params: { id: string } }) {
  noStore()
  const session = await getSession()
  if (!session) return null
  const doc = await getPlantilla(params.id)
  if (!doc) notFound()
  const page = PAGINA_PLANTILLA[doc.tipo]

  return (
    <div className={plantillaFontsClass}>
      <style>{`
        @page { size: ${page.width}px ${page.height}px; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .plantilla-hoja { break-after: page; }
        .plantilla-hoja:last-child { break-after: auto; }
      `}</style>
      <PlantillaRender tipo={doc.tipo} datos={doc.datos} />
    </div>
  )
}
