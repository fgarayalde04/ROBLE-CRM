import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { listPlantillas } from '@/lib/db/plantillas'
import { TIPOS_PLANTILLA, isTipoPlantilla } from '@/lib/plantillas/tipos'
import PlantillasLista from './PlantillasLista'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plantillas' }

// /plantillas            → una tarjeta por plantilla
// /plantillas?tipo=xxx   → crear uno nuevo + todos los ya hechos de esa plantilla
export default async function PlantillasPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const tipo = isTipoPlantilla(searchParams.tipo) ? searchParams.tipo : null

  let documentos: Awaited<ReturnType<typeof listPlantillas>> = []
  try {
    documentos = await listPlantillas()
  } catch (err) {
    console.error('[plantillas] list', err)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        {tipo ? (
          <>
            <Link href="/plantillas" className="hover:text-gray-600">Plantillas</Link>
            <span>/</span>
            <span className="text-gray-600">{TIPOS_PLANTILLA[tipo].plural}</span>
          </>
        ) : <span className="text-gray-600">Plantillas</span>}
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{tipo ? TIPOS_PLANTILLA[tipo].plural : 'Plantillas'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {tipo ? TIPOS_PLANTILLA[tipo].descripcion : 'Documentos con el formato de Roble: completás los datos y el PDF sale siempre igual.'}
        </p>
      </div>
      <PlantillasLista tipo={tipo} documentos={documentos} puedePublicar={RESEARCH_AUTHOR_ROLES.includes(session.role)} />
    </div>
  )
}
