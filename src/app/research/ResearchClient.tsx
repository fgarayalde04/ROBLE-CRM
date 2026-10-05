'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { SECCIONES_WEB, seccionWebSugerida, seccionWebDePlantilla } from '@/lib/webClientes/secciones'
import { TIPOS_PLANTILLA, type TipoPlantilla } from '@/lib/plantillas/tipos'

type ResearchType =
  | 'morning_brief' | 'noticia_mercado' | 'bono' | 'fondo' | 'nueva_emision'
  | 'research' | 'macro' | 'regulacion' | 'novedad_interna' | 'comite_inversiones'

const TYPE_LABEL: Record<ResearchType, string> = {
  morning_brief: 'Morning Brief',
  noticia_mercado: 'Mercado',
  bono: 'Bono',
  fondo: 'Fondo',
  nueva_emision: 'Nueva emisión',
  research: 'Research',
  macro: 'Macroeconomía',
  regulacion: 'Regulación',
  novedad_interna: 'Novedad interna',
  comite_inversiones: 'Comité de Inversiones',
}

const MANUAL_TYPES: ResearchType[] = [
  'noticia_mercado', 'bono', 'fondo', 'nueva_emision', 'research', 'macro', 'regulacion', 'novedad_interna', 'comite_inversiones',
]

// Las secciones del Morning Brief tienen título libre (vienen tal cual del
// mensaje de origen) — no hay una lista fija de claves.

interface Post {
  id: string
  type: ResearchType
  title: string
  category: string | null
  summary: string | null
  body: string | null
  brief_date: string | null
  sections: Record<string, { text: string; sources: { title: string; source: string; url: string }[] }> | null
  headlines: string[] | null
  file_url: string | null
  file_name: string | null
  link_url: string | null
  author: string | null
  issuer: string | null
  isin: string | null
  currency: string | null
  coupon: string | null
  maturity: string | null
  yield_value: string | null
  fund_class: string | null
  factsheet_url: string | null
  termsheet_url: string | null
  internal_notes: string | null
  pinned: boolean
  featured: boolean
  archived: boolean
  created_by_name: string | null
  published_at: string
  read: boolean
  web_document_id: string | null
  web_section: string | null
  web_subsection: string | null
  web_publicado_at: string | null
  plantilla_tipo: string | null
}

const seccionKey = (section: string, subsection: string) => `${section}/${subsection}`

function seccionWebLabel(section: string | null, subsection: string | null) {
  return SECCIONES_WEB.find((s) => s.section === section && s.subsection === subsection)?.label ?? section ?? ''
}

function esPdf(post: Pick<Post, 'file_url' | 'file_name'>) {
  return !!post.file_url && (post.file_name ?? '').toLowerCase().endsWith('.pdf')
}

async function publicarEnWeb(postId: string, key: string): Promise<{ post?: Post; error?: string }> {
  const [section, subsection] = key ? key.split('/') : []
  const res = await fetch(`/api/research/${postId}/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, subsection }),
  })
  const data = await res.json().catch(() => ({}))
  return res.ok ? { post: data.post } : { error: data.error || 'No se pudo publicar en la web' }
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ResearchClient({
  initialPosts, initialLatestBrief, canAuthor, currentUserName,
}: {
  initialPosts: Post[]
  initialLatestBrief: Post | null
  canAuthor: boolean
  currentUserName: string
}) {
  const searchParams = useSearchParams()
  const openId = searchParams.get('open')

  const [tab, setTab] = useState<'feed' | 'brief'>('feed')
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [category, setCategory] = useState<ResearchType | 'all'>('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const [briefs, setBriefs] = useState<Post[]>(initialLatestBrief ? [initialLatestBrief] : [])
  const [period, setPeriod] = useState<'hoy' | 'ayer' | '7d' | '30d' | 'historico'>('7d')
  const [briefQ, setBriefQ] = useState('')

  const [detail, setDetail] = useState<Post | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showBriefCreate, setShowBriefCreate] = useState(false)
  const [showWeb, setShowWeb] = useState(false)

  const didOpenDeepLink = useRef(false)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category !== 'all') params.set('type', category)
      if (q) params.set('q', q)
      const res = await fetch(`/api/research?${params.toString()}`)
      const data = await res.json()
      setPosts(data.posts ?? [])
    } finally {
      setLoading(false)
    }
  }, [category, q])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const fetchBriefs = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (briefQ) params.set('q', briefQ)
    const res = await fetch(`/api/research/morning-brief?${params.toString()}`)
    const data = await res.json()
    setBriefs(data.briefs ?? [])
  }, [period, briefQ])

  useEffect(() => { if (tab === 'brief') fetchBriefs() }, [tab, fetchBriefs])

  const openDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/research/${id}`)
    if (!res.ok) return
    const data = await res.json()
    setDetail(data.post)
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, read: true } : p)))
    if (data.post.type === 'morning_brief') setTab('brief')
  }, [])

  useEffect(() => {
    if (openId && !didOpenDeepLink.current) {
      didOpenDeepLink.current = true
      openDetail(openId)
    }
  }, [openId, openDetail])

  async function handleAuthorAction(post: Post, field: 'pinned' | 'featured' | 'archived', value: boolean) {
    const res = await fetch(`/api/research/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      const data = await res.json()
      setDetail(data.post)
      fetchPosts()
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {(['feed', 'brief'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === t ? 'border-[#16A34A] text-[#16A34A]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'feed' ? 'Feed' : 'Morning Brief'}
          </button>
        ))}
      </div>

      {tab === 'feed' ? (
        <FeedTab
          posts={posts}
          loading={loading}
          category={category}
          setCategory={setCategory}
          q={q}
          setQ={setQ}
          canAuthor={canAuthor}
          onOpen={openDetail}
          onCreate={() => setShowCreate(true)}
          onWeb={() => setShowWeb(true)}
        />
      ) : (
        <BriefTab
          briefs={briefs}
          period={period}
          setPeriod={setPeriod}
          briefQ={briefQ}
          setBriefQ={setBriefQ}
          canAuthor={canAuthor}
          onOpen={openDetail}
          onCreate={() => setShowBriefCreate(true)}
        />
      )}

      {detail && (
        <DetailPanel
          post={detail}
          canAuthor={canAuthor}
          onClose={() => setDetail(null)}
          onAction={handleAuthorAction}
          onUpdated={(p) => { setDetail(p); fetchPosts() }}
        />
      )}

      {showCreate && (
        <CreatePostModal
          currentUserName={currentUserName}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchPosts() }}
        />
      )}

      {showWeb && (
        <WebClientesModal
          onClose={() => { setShowWeb(false); fetchPosts() }}
        />
      )}

      {showBriefCreate && (
        <CreateBriefModal
          onClose={() => setShowBriefCreate(false)}
          onCreated={() => { setShowBriefCreate(false); fetchBriefs() }}
        />
      )}
    </div>
  )
}

// ─── Feed tab ───────────────────────────────────────────────────────────────

function FeedTab({
  posts, loading, category, setCategory, q, setQ, canAuthor, onOpen, onCreate, onWeb,
}: {
  posts: Post[]
  loading: boolean
  category: ResearchType | 'all'
  setCategory: (c: ResearchType | 'all') => void
  q: string
  setQ: (q: string) => void
  canAuthor: boolean
  onOpen: (id: string) => void
  onCreate: () => void
  onWeb: () => void
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            category === 'all' ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos
        </button>
        {MANUAL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setCategory(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              category === t ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
        />
        {canAuthor && (
          <button
            onClick={onWeb}
            className="px-3 py-1.5 bg-white border border-gray-200 text-[#2D3F52] text-xs font-semibold rounded-lg hover:border-[#16A34A] hover:text-[#16A34A] transition-colors"
          >
            🌐 Web de clientes
          </button>
        )}
        {canAuthor && (
          <button
            onClick={onCreate}
            className="px-3 py-1.5 bg-[#16A34A] text-white text-xs font-semibold rounded-lg hover:bg-[#15803D] transition-colors"
          >
            + Nueva publicación
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-4 md:p-8 text-center text-sm text-gray-400">Cargando…</div>
      ) : posts.length === 0 ? (
        <div className="p-4 md:p-8 text-center text-sm text-gray-400 bg-white border border-gray-200 rounded-xl">
          Sin publicaciones todavía.
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onOpen(p.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all flex items-start gap-3"
              >
                {!p.read && <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] mt-2 shrink-0" title="Nuevo" />}
                {p.read && <span className="w-1.5 h-1.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#16A34A] bg-[#16A34A]/10 px-1.5 py-0.5 rounded">
                      {TYPE_LABEL[p.type]}
                    </span>
                    {p.pinned && <span className="text-[10px] text-amber-600 font-semibold">📌 Fijado</span>}
                    {p.featured && <span className="text-[10px] text-blue-600 font-semibold">★ Destacado</span>}
                    {p.web_document_id && <span className="text-[10px] text-[#2D3F52] font-semibold">🌐 En la web</span>}
                    <span className="text-[11px] text-gray-400">{fmtDate(p.published_at)}</span>
                  </div>
                  <p className={`text-sm mt-1 ${!p.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{p.title}</p>
                  {p.summary && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.summary}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Morning Brief tab ──────────────────────────────────────────────────────

function BriefTab({
  briefs, period, setPeriod, briefQ, setBriefQ, canAuthor, onOpen, onCreate,
}: {
  briefs: Post[]
  period: string
  setPeriod: (p: any) => void
  briefQ: string
  setBriefQ: (q: string) => void
  canAuthor: boolean
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const PERIODS: [string, string][] = [
    ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días'], ['historico', 'Histórico'],
  ]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PERIODS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => setPeriod(val)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              period === val ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <input
          value={briefQ}
          onChange={(e) => setBriefQ(e.target.value)}
          placeholder="Buscar (ej: Fed)…"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
        />
        {canAuthor && (
          <button
            onClick={onCreate}
            className="px-3 py-1.5 bg-[#16A34A] text-white text-xs font-semibold rounded-lg hover:bg-[#15803D] transition-colors"
          >
            + Morning Brief (manual)
          </button>
        )}
      </div>

      {briefs.length === 0 ? (
        <div className="p-4 md:p-8 text-center text-sm text-gray-400 bg-white border border-gray-200 rounded-xl">
          No hay Morning Briefs en este período.
        </div>
      ) : (
        <ul className="space-y-2">
          {briefs.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => onOpen(b.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#2D3F52] bg-[#2D3F52]/10 px-1.5 py-0.5 rounded">
                    Morning Brief
                  </span>
                  <span className="text-[11px] text-gray-400">{b.brief_date}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {(b.headlines ?? []).slice(0, 5).map((h, i) => (
                    <li key={i} className="text-sm text-gray-700">• {h}</li>
                  ))}
                </ul>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResendPushButton({ postId }: { postId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ sent: number; recipients: number; onlyMe: boolean } | null>(null)

  async function handleClick(onlyMe: boolean) {
    if (!onlyMe && !confirm('Esto reenvía el push a TODO el equipo (no solo a vos). ¿Confirmás?')) return
    setState('sending')
    try {
      const res = await fetch(`/api/research/${postId}/resend-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyMe }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al reenviar')
      setResult({ sent: data.sent, recipients: data.recipients, onlyMe })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        onClick={() => handleClick(true)}
        disabled={state === 'sending'}
        className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
      >
        {state === 'sending' ? 'Reenviando…' : '🔔 Reenviar push (solo a mí)'}
      </button>
      <button
        onClick={() => handleClick(false)}
        disabled={state === 'sending'}
        className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
      >
        Reenviar a todo el equipo
      </button>
      {state === 'done' && result && (
        <span className="text-[11px] text-emerald-600">
          Enviado a {result.sent} dispositivo{result.sent !== 1 ? 's' : ''}
          {result.onlyMe ? ' tuyo(s)' : ` de ${result.recipients} persona${result.recipients !== 1 ? 's' : ''}`}
        </span>
      )}
      {state === 'error' && (
        <span className="text-[11px] text-red-500">Error al reenviar — intentá de nuevo</span>
      )}
    </div>
  )
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function DetailPanel({
  post, canAuthor, onClose, onAction, onUpdated,
}: {
  post: Post
  canAuthor: boolean
  onClose: () => void
  onAction: (post: Post, field: 'pinned' | 'featured' | 'archived', value: boolean) => void
  onUpdated: (post: Post) => void
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-y-auto shadow-2xl p-4 md:p-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span className="text-[10px] font-bold uppercase tracking-wide text-[#16A34A] bg-[#16A34A]/10 px-1.5 py-0.5 rounded">
          {TYPE_LABEL[post.type]}
        </span>
        <h2 className="text-xl font-semibold text-gray-900 mt-2">{post.title}</h2>
        <p className="text-xs text-gray-400 mt-1">
          {post.author || post.created_by_name} · {fmtDateTime(post.published_at)}
        </p>

        {canAuthor && post.type === 'morning_brief' && <ResendPushButton postId={post.id} />}

        {post.type === 'morning_brief' ? (
          <div className="mt-5 space-y-5">
            {Object.entries(post.sections ?? {}).filter(([, v]) => v?.text).map(([title, section]) => (
              <div key={title}>
                <h3 className="text-sm font-bold text-[#2D3F52] uppercase tracking-wide">{title}</h3>
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{section.text}</p>
                {section.sources?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-gray-400">Fuentes:</span>
                    {section.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        {s.source}{i < section.sources.length - 1 ? ' ·' : ''}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(!post.sections || Object.keys(post.sections).length === 0) && (
              <p className="text-sm text-gray-400">Sin contenido cargado en este brief.</p>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {post.summary && <p className="text-sm text-gray-700">{post.summary}</p>}
            {post.body && <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.body}</p>}

            {(post.issuer || post.isin || post.currency || post.coupon || post.maturity || post.yield_value || post.fund_class) && (
              <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                {post.issuer && <Field label={post.type === 'fondo' ? 'Gestora' : 'Emisor'} value={post.issuer} />}
                {post.isin && <Field label="ISIN" value={post.isin} />}
                {post.currency && <Field label="Moneda" value={post.currency} />}
                {post.coupon && <Field label="Cupón" value={post.coupon} />}
                {post.maturity && <Field label="Vencimiento" value={post.maturity} />}
                {post.yield_value && <Field label="Yield" value={post.yield_value} />}
                {post.fund_class && <Field label="Clase" value={post.fund_class} />}
              </div>
            )}

            {post.internal_notes && canAuthor && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-amber-700 uppercase">Comentarios internos</p>
                <p className="text-sm text-amber-900 mt-0.5">{post.internal_notes}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {post.file_url && (
                <a href={post.file_url} className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200">
                  📎 {post.file_name || 'Descargar adjunto'}
                </a>
              )}
              {post.factsheet_url && (
                <a href={post.factsheet_url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200">
                  Factsheet
                </a>
              )}
              {post.termsheet_url && (
                <a href={post.termsheet_url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200">
                  Term sheet
                </a>
              )}
              {post.link_url && (
                <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium text-gray-700 hover:bg-gray-200">
                  Abrir fuente ↗
                </a>
              )}
            </div>
          </div>
        )}

        {canAuthor && post.type !== 'morning_brief' && esPdf(post) && (
          <WebClientesPanel post={post} onUpdated={onUpdated} />
        )}

        {canAuthor && post.type !== 'morning_brief' && (
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            <button
              onClick={() => onAction(post, 'pinned', !post.pinned)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${post.pinned ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}
            >
              📌 {post.pinned ? 'Quitar fijado' : 'Fijar'}
            </button>
            <button
              onClick={() => onAction(post, 'featured', !post.featured)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium ${post.featured ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
            >
              ★ {post.featured ? 'Quitar destacado' : 'Destacar'}
            </button>
            <button
              onClick={() => onAction(post, 'archived', !post.archived)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700"
            >
              {post.archived ? 'Desarchivar' : 'Archivar'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Publicar (o sacar) el PDF de una publicación en la web de clientes. Siempre a mano.
function WebClientesPanel({ post, onUpdated, compacto = false }: { post: Post; onUpdated: (post: Post) => void; compacto?: boolean }) {
  const publicado = !!post.web_document_id
  // Si viene de Plantillas, la sección de la web es fija según el tipo de plantilla
  const fija = seccionWebDePlantilla(post.plantilla_tipo)
  const sugerida = fija ?? seccionWebSugerida(post.type)
  const [seccion, setSeccion] = useState(
    publicado && post.web_section && post.web_subsection
      ? seccionKey(post.web_section, post.web_subsection)
      : sugerida ? seccionKey(sugerida.section, sugerida.subsection) : ''
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function publicar() {
    if (!fija && !seccion) { setError('Elegí la sección de la web'); return }
    setBusy(true); setError('')
    const r = await publicarEnWeb(post.id, fija ? '' : seccion)
    setBusy(false)
    if (r.error) setError(r.error)
    else if (r.post) onUpdated({ ...post, ...r.post })
  }

  async function quitar() {
    if (!confirm('¿Sacar este documento de la web de clientes? Los clientes dejan de verlo.')) return
    setBusy(true); setError('')
    const res = await fetch(`/api/research/${post.id}/web`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) setError(data.error || 'No se pudo sacar de la web')
    else onUpdated({ ...post, ...data.post })
  }

  const actual = publicado && post.web_section && post.web_subsection
    ? seccionKey(post.web_section, post.web_subsection)
    : ''

  return (
    <div className={compacto ? 'mt-2' : 'mt-6 rounded-xl border border-gray-200 p-4'}>
      <div className="flex items-center justify-between gap-3">
        {!compacto && <p className="text-xs font-semibold text-[#2D3F52] uppercase tracking-wide">Web de clientes</p>}
        {publicado ? (
          <span className="text-[11px] font-semibold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded">
            Publicado · {seccionWebLabel(post.web_section, post.web_subsection)}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">No publicado</span>
        )}
      </div>
      <div className={`${compacto ? 'mt-2' : 'mt-3'} flex flex-col sm:flex-row gap-2`}>
        {fija ? (
          <p className="flex-1 self-center text-xs text-gray-500">
            {TIPOS_PLANTILLA[post.plantilla_tipo as TipoPlantilla].label} → se sube a{' '}
            <span className="font-semibold text-gray-700">{seccionWebLabel(fija.section, fija.subsection)}</span>
          </p>
        ) : (
        <select
          value={seccion}
          onChange={(e) => setSeccion(e.target.value)}
          disabled={busy}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Elegí la sección…</option>
          {SECCIONES_WEB.map((s) => (
            <option key={seccionKey(s.section, s.subsection)} value={seccionKey(s.section, s.subsection)}>{s.label}</option>
          ))}
        </select>
        )}
        {(!publicado || fija || seccion !== actual) && (
          <button
            onClick={publicar}
            disabled={busy || (!fija && !seccion)}
            title={publicado && fija ? 'Reemplaza el PDF de la web por la versión actual' : undefined}
            className="px-4 py-2 bg-[#16A34A] text-white text-sm font-semibold rounded-lg hover:bg-[#15803D] disabled:opacity-50"
          >
            {busy ? 'Subiendo…' : !publicado ? 'Subir a la web de clientes' : fija ? 'Actualizar en la web' : 'Mover a esta sección'}
          </button>
        )}
        {publicado && (
          <button
            onClick={quitar}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
          >
            Sacar de la web
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Lista de todas las publicaciones con PDF para elegir, una por una, cuáles
// subir a la web de clientes (o sacar). Nada se publica solo.
function WebClientesModal({ onClose }: { onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'publicados'>('pendientes')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/research')
      .then((r) => r.json())
      .then((d) => setPosts((d.posts ?? []).filter((p: Post) => esPdf(p))))
      .catch(() => setPosts([]))
  }, [])

  const actualizar = (p: Post) => setPosts((prev) => prev?.map((x) => (x.id === p.id ? { ...x, ...p } : x)) ?? null)

  const visibles = (posts ?? [])
    .filter((p) => filtro === 'todos' || (filtro === 'publicados' ? !!p.web_document_id : !p.web_document_id))
    .filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()))
  const enWeb = (posts ?? []).filter((p) => p.web_document_id).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Publicar en la web de clientes</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Documentos PDF de Research. Elegí la sección y publicá los que quieras que vean los clientes.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
          {([
            ['pendientes', 'Sin publicar'],
            ['publicados', `En la web (${enWeb})`],
            ['todos', 'Todos'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${filtro === k ? 'bg-[#2D3F52] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
          />
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          {posts === null ? (
            <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
          ) : visibles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {filtro === 'publicados' ? 'Todavía no hay documentos en la web.' : 'No hay documentos con PDF para mostrar.'}
            </p>
          ) : (
            visibles.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#16A34A] bg-[#16A34A]/10 px-1.5 py-0.5 rounded">
                    {TYPE_LABEL[p.type]}
                  </span>
                  <span className="text-[11px] text-gray-400">{fmtDate(p.published_at)}</span>
                  {p.file_url && (
                    <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline">
                      Ver PDF
                    </a>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-1">{p.title}</p>
                <WebClientesPanel post={p} onUpdated={actualizar} compacto />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase font-semibold">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}

// ─── Create post modal ──────────────────────────────────────────────────────

function CreatePostModal({ currentUserName, onClose, onCreated }: { currentUserName: string; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<ResearchType>('noticia_mercado')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [author, setAuthor] = useState(currentUserName)
  const [file, setFile] = useState<File | null>(null)
  const [pinned, setPinned] = useState(false)
  const [featured, setFeatured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [creado, setCreado] = useState(false)

  // Web de clientes: apagado por defecto, se activa a mano
  const [publicarWeb, setPublicarWeb] = useState(false)
  const [seccionWeb, setSeccionWeb] = useState('')

  // bono/fondo fields
  const [issuer, setIssuer] = useState('')
  const [isin, setIsin] = useState('')
  const [currency, setCurrency] = useState('')
  const [coupon, setCoupon] = useState('')
  const [maturity, setMaturity] = useState('')
  const [yieldValue, setYieldValue] = useState('')
  const [fundClass, setFundClass] = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  const isBondOrFund = type === 'bono' || type === 'fondo'

  function cambiarTipo(t: ResearchType) {
    setType(t)
    const sugerida = seccionWebSugerida(t)
    if (sugerida) setSeccionWeb(seccionKey(sugerida.section, sugerida.subsection))
  }

  function activarWeb(on: boolean) {
    setPublicarWeb(on)
    if (on && !seccionWeb) {
      const sugerida = seccionWebSugerida(type)
      if (sugerida) setSeccionWeb(seccionKey(sugerida.section, sugerida.subsection))
    }
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('El título es obligatorio'); return }
    if (publicarWeb) {
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) { setError('Para publicar en la web de clientes adjuntá un PDF'); return }
      if (!seccionWeb) { setError('Elegí la sección de la web de clientes'); return }
    }
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('type', type)
      fd.set('title', title)
      if (category) fd.set('category', category)
      if (summary) fd.set('summary', summary)
      if (body) fd.set('body', body)
      if (linkUrl) fd.set('link_url', linkUrl)
      if (author) fd.set('author', author)
      fd.set('pinned', String(pinned))
      fd.set('featured', String(featured))
      if (isBondOrFund) {
        if (issuer) fd.set('issuer', issuer)
        if (isin) fd.set('isin', isin)
        if (currency) fd.set('currency', currency)
        if (type === 'bono' && coupon) fd.set('coupon', coupon)
        if (type === 'bono' && maturity) fd.set('maturity', maturity)
        if (yieldValue) fd.set('yield_value', yieldValue)
        if (type === 'fondo' && fundClass) fd.set('fund_class', fundClass)
        if (internalNotes) fd.set('internal_notes', internalNotes)
      }
      if (file) fd.set('file', file)

      const res = await fetch('/api/research', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Error al publicar')
        setSaving(false)
        return
      }
      if (publicarWeb && data.post?.id) {
        const r = await publicarEnWeb(data.post.id, seccionWeb)
        if (r.error) {
          setError(`Se publicó en el CRM, pero no en la web de clientes: ${r.error}. Podés reintentarlo desde la publicación.`)
          setCreado(true)
          setSaving(false)
          return
        }
      }
      onCreated()
    } catch {
      setError('Error al publicar')
      setSaving(false)
    }
  }

  return (
    <Modal title="Nueva publicación" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">Categoría</label>
          <select value={type} onChange={(e) => cambiarTipo(e.target.value as ResearchType)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {MANUAL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <Input label="Título *" value={title} onChange={setTitle} />
        <Input label="Sub-categoría (opcional)" value={category} onChange={setCategory} placeholder="ej: Renta fija UY" />
        <Textarea label="Resumen" value={summary} onChange={setSummary} rows={2} />
        <Textarea label="Desarrollo" value={body} onChange={setBody} rows={4} />
        <Input label="Link" value={linkUrl} onChange={setLinkUrl} placeholder="https://…" />
        <Input label="Autor" value={author} onChange={setAuthor} />

        {isBondOrFund && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <Input label={type === 'fondo' ? 'Gestora' : 'Emisor'} value={issuer} onChange={setIssuer} />
            <Input label="ISIN" value={isin} onChange={setIsin} />
            <Input label="Moneda" value={currency} onChange={setCurrency} />
            <Input label="Yield" value={yieldValue} onChange={setYieldValue} />
            {type === 'bono' && <Input label="Cupón" value={coupon} onChange={setCoupon} />}
            {type === 'bono' && <Input label="Vencimiento" type="date" value={maturity} onChange={setMaturity} />}
            {type === 'fondo' && <Input label="Clase" value={fundClass} onChange={setFundClass} />}
            <div className="col-span-2">
              <Textarea label="Comentarios internos (solo Dirección/Inversiones)" value={internalNotes} onChange={setInternalNotes} rows={2} />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-500">Archivo adjunto</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fijar
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Destacar
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-gray-700">Publicar también en la web de clientes</span>
              <span className="block text-[11px] text-gray-400">Necesita un PDF adjunto. Se puede hacer después desde la publicación.</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={publicarWeb}
              onClick={() => activarWeb(!publicarWeb)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${publicarWeb ? 'bg-[#16A34A]' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${publicarWeb ? 'translate-x-5' : ''}`} />
            </button>
          </label>
          {publicarWeb && (
            <select
              value={seccionWeb}
              onChange={(e) => setSeccionWeb(e.target.value)}
              className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Elegí la sección de la web…</option>
              {SECCIONES_WEB.map((s) => (
                <option key={seccionKey(s.section, s.subsection)} value={seccionKey(s.section, s.subsection)}>{s.label}</option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          {creado ? (
            <button
              onClick={onCreated}
              className="px-4 py-2 bg-[#16A34A] text-white text-sm font-semibold rounded-lg hover:bg-[#15803D]"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 bg-[#16A34A] text-white text-sm font-semibold rounded-lg hover:bg-[#15803D] disabled:opacity-50"
              >
                {saving ? 'Publicando…' : 'Publicar'}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Create Morning Brief modal (manual/de prueba) ─────────────────────────

function CreateBriefModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [briefDate, setBriefDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!rawText.trim()) { setError('Pegá el resumen del día'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/research/morning-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefDate, rawText }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Error al publicar')
        setSaving(false)
        return
      }
      onCreated()
    } catch {
      setError('Error al publicar')
      setSaving(false)
    }
  }

  return (
    <Modal title="Morning Brief" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Fecha" type="date" value={briefDate} onChange={setBriefDate} />
        <Textarea
          label="Resumen del día (pegalo tal cual te llega)"
          value={rawText}
          onChange={setRawText}
          rows={14}
          placeholder="Pegá acá el mensaje completo…"
        />
        <p className="text-[11px] text-gray-400">Los titulares del Panel del Día se sacan solos de los títulos del texto.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-[#16A34A] text-white text-sm font-semibold rounded-lg hover:bg-[#15803D] disabled:opacity-50"
          >
            {saving ? 'Publicando…' : 'Publicar Morning Brief'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Small shared UI helpers ────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
      />
    </div>
  )
}

function Textarea({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16A34A] resize-none"
      />
    </div>
  )
}
