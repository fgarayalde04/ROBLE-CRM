import { unstable_noStore as noStore } from 'next/cache'
import { getManagerBySlug, getFondosForManager, getUnclassifiedFactsheets } from '@/lib/db/fondos'
import { getSession } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import GestoraDetail from './GestoraDetail'

export const dynamic = 'force-dynamic'

export type FondoWithFactsheet = {
  id: string
  name: string
  isin: string | null
  ticker: string | null
  clase: string | null
  moneda: string | null
  latest_factsheet: {
    id: string
    file_name: string
    pdf_url: string | null
    fecha_factsheet: string | null
    created_at: string
  } | null
  factsheet_count: number
}

export type Manager = {
  id: string
  slug: string
  name: string
  logo_url: string | null
}

interface Props { params: { slug: string } }

export default async function GestoraPage({ params }: Props) {
  noStore()
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await getManagerBySlug(params.slug)
  if (!manager) notFound()

  const [fondos, unclassified] = await Promise.all([
    getFondosForManager(manager.id) as Promise<FondoWithFactsheet[]>,
    getUnclassifiedFactsheets(manager.id),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back nav */}
      <div className="bg-white border-b border-gray-100 px-8 py-4">
        <div className="max-w-6xl mx-auto">
          <Link href="/fondos" className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 w-fit mb-4">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Fondos
          </Link>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{manager.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {fondos.length} fondos · {unclassified.length > 0 ? `${unclassified.length} sin clasificar` : 'todos clasificados'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-6">
        <GestoraDetail
          manager={manager}
          fondos={fondos}
          unclassified={unclassified}
        />
      </div>
    </div>
  )
}
