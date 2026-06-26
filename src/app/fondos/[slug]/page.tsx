import { unstable_noStore as noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
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

async function getManager(slug: string): Promise<Manager | null> {
  const { data } = await supabaseAdmin
    .from('asset_managers')
    .select('id, slug, name, logo_url')
    .eq('slug', slug)
    .single()
  return data ?? null
}

async function getFondos(managerId: string): Promise<FondoWithFactsheet[]> {
  const { data: fondos } = await supabaseAdmin
    .from('fondos')
    .select(`
      id, name, isin, ticker, clase, moneda,
      factsheets(id, file_name, pdf_url, fecha_factsheet, created_at, is_latest)
    `)
    .eq('asset_manager_id', managerId)
    .order('name')

  if (!fondos) return []

  return fondos.map(f => {
    const sheets = (f as any).factsheets ?? []
    const latest = sheets.find((s: any) => s.is_latest) ?? sheets[0] ?? null
    return {
      id:        f.id,
      name:      f.name,
      isin:      f.isin,
      ticker:    f.ticker,
      clase:     f.clase,
      moneda:    f.moneda,
      latest_factsheet: latest
        ? { id: latest.id, file_name: latest.file_name, pdf_url: latest.pdf_url, fecha_factsheet: latest.fecha_factsheet, created_at: latest.created_at }
        : null,
      factsheet_count: sheets.length,
    }
  })
}

async function getUnclassified(managerId: string) {
  const { data } = await supabaseAdmin
    .from('factsheets')
    .select('id, file_name, pdf_url, fecha_factsheet, created_at')
    .eq('asset_manager_id', managerId)
    .is('fondo_id', null)
    .order('created_at', { ascending: false })
  return data ?? []
}

interface Props { params: { slug: string } }

export default async function GestoraPage({ params }: Props) {
  noStore()
  const session = await getSession()
  if (!session) redirect('/login')

  const manager = await getManager(params.slug)
  if (!manager) notFound()

  const [fondos, unclassified] = await Promise.all([
    getFondos(manager.id),
    getUnclassified(manager.id),
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
