import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { listPlantillas } from '@/lib/db/plantillas'
import PlantillasLista from './PlantillasLista'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plantillas' }

export default async function PlantillasPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let documentos: Awaited<ReturnType<typeof listPlantillas>> = []
  try {
    documentos = await listPlantillas()
  } catch (err) {
    console.error('[plantillas] list', err)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
        <Link href="/research" className="hover:text-gray-600">Research</Link>
        <span>/</span>
        <span className="text-gray-600">Plantillas</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Plantillas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Documentos con el formato de Roble: completás los datos y el PDF sale siempre igual.
        </p>
      </div>
      <PlantillasLista documentos={documentos} />
    </div>
  )
}
