import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { listPosts, getLatestMorningBrief } from '@/lib/db/research'
import ResearchClient from './ResearchClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Research & Novedades' }

export default async function ResearchPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canAuthor = session.role === 'admin' || session.role === 'ceo' || session.role === 'direccion'

  const [posts, latestBrief] = await Promise.all([
    listPosts({ userId: session.id, limit: 100 }),
    getLatestMorningBrief(),
  ])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Research & Novedades</h1>
        <p className="mt-1 text-sm text-gray-500">Morning Brief, mercados, bonos, fondos y novedades de Roble</p>
      </div>
      <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Cargando…</div>}>
        <ResearchClient
          initialPosts={posts}
          initialLatestBrief={latestBrief}
          canAuthor={canAuthor}
          currentUserName={session.name}
        />
      </Suspense>
    </div>
  )
}
