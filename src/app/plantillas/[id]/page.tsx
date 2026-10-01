import { notFound, redirect } from 'next/navigation'
import { getSession, RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { getPlantilla } from '@/lib/db/plantillas'
import { plantillaFontsClass } from '@/lib/plantillas/fonts'
import PlantillaEditor from './PlantillaEditor'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const doc = await getPlantilla(params.id).catch(() => null)
  return { title: doc?.titulo ?? 'Plantilla' }
}

export default async function PlantillaEditorPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const doc = await getPlantilla(params.id)
  if (!doc) notFound()
  return <PlantillaEditor doc={doc} fontsClass={plantillaFontsClass} puedePublicar={RESEARCH_AUTHOR_ROLES.includes(session.role)} />
}
