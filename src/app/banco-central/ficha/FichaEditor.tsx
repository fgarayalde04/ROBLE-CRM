'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { BcFicha, Empresa, TipoCliente, FichaPFData, FichaPJData, PerfilData, ListaData } from './types'
import { emptyFichaPF, emptyFichaPJ, emptyPerfil, emptyLista, calcScore, scoreToProfile, LISTA_PF_ITEMS, LISTA_PJ_ITEMS } from './types'
import FichaPFForm from './FichaPFForm'
import FichaPJForm from './FichaPJForm'
import PerfilInversorForm from './PerfilInversorForm'
import ListaVerificacionForm from './ListaVerificacionForm'
import DocumentPreview from './DocumentPreview'

type Doc = 'ficha' | 'perfil' | 'lista'

interface Props {
  empresa: Empresa
  tipo: TipoCliente
  clientId: string | null
  clientName: string
  fichaId: string | null
  initialData: Partial<BcFicha> | null
  onBack: () => void
}

export default function FichaEditor({ empresa, tipo, clientId, clientName, fichaId: initialFichaId, initialData, onBack }: Props) {
  const [activeDoc, setActiveDoc] = useState<Doc>('ficha')
  const [fichaId, setFichaId] = useState<string | null>(initialFichaId)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [previewOpen, setPreviewOpen] = useState(true)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [fichaData, setFichaData] = useState<FichaPFData | FichaPJData>(() => {
    if (initialData?.ficha_data && Object.keys(initialData.ficha_data).length > 0) {
      return initialData.ficha_data as any
    }
    return tipo === 'pf' ? emptyFichaPF() : emptyFichaPJ()
  })

  const [perfilData, setPerfilData] = useState<PerfilData>(() => {
    if (initialData?.perfil_data && Object.keys(initialData.perfil_data).length > 0) {
      return initialData.perfil_data as PerfilData
    }
    return emptyPerfil()
  })

  const [listaData, setListaData] = useState<ListaData>(() => {
    if (initialData?.lista_data && Object.keys(initialData.lista_data).length > 0) {
      return initialData.lista_data as ListaData
    }
    const d = emptyLista()
    d.nombre_cliente = clientName
    return d
  })

  // Compute completion status for each doc
  const fichaComplete = tipo === 'pf'
    ? !!((fichaData as FichaPFData).personas?.[0]?.apellidos)
    : !!((fichaData as FichaPJData).razon_social)

  const perfilAnswered = Object.keys(perfilData.answers).length
  const perfilComplete = perfilAnswered === 13
  const perfilPending = perfilAnswered > 0 && perfilAnswered < 13

  const items = tipo === 'pf' ? LISTA_PF_ITEMS : LISTA_PJ_ITEMS
  const listaCompletos = items.filter(i => (listaData.items[i.id]?.status ?? 'pendiente') === 'completo').length
  const listaComplete = listaCompletos === items.length
  const listaPending = listaCompletos > 0

  // Auto-save with debounce
  const save = useCallback(async () => {
    setSaving(true)
    try {
      const score = calcScore(perfilData.answers)
      const result = perfilAnswered === 13 ? scoreToProfile(score) : null
      const body = {
        empresa,
        tipo_cliente: tipo,
        client_id: clientId,
        client_name: clientName,
        ficha_data: fichaData,
        perfil_data: perfilData,
        lista_data: listaData,
        perfil_score: perfilAnswered === 13 ? score : null,
        perfil_result: result,
      }

      let res: Response
      if (fichaId) {
        res = await fetch(`/api/bc-ficha/${fichaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        res = await fetch('/api/bc-ficha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (res.ok) {
          const d = await res.json()
          setFichaId(d.id)
          window.history.replaceState({}, '', `/banco-central/ficha?id=${d.id}`)
        }
      }
      if (res.ok) setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }, [fichaId, empresa, tipo, clientId, clientName, fichaData, perfilData, listaData, perfilAnswered])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, 2000)
  }, [save])

  // Trigger auto-save when data changes
  useEffect(() => { scheduleSave() }, [fichaData, perfilData, listaData])

  const docs = [
    {
      key: 'ficha' as Doc,
      short: tipo === 'pf' ? 'Ficha PF' : 'Ficha PJ',
      desc:  tipo === 'pf' ? 'Persona Física' : 'Persona Jurídica',
      complete: fichaComplete,
      pending:  !fichaComplete,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      key: 'perfil' as Doc,
      short: 'Cuestionario',
      desc:  `Perfil inversor · ${Object.keys(perfilData.answers).length}/13`,
      complete: perfilComplete,
      pending:  perfilPending,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      key: 'lista' as Doc,
      short: 'Lista',
      desc:  `Verificación · ${listaCompletos}/${items.length}`,
      complete: listaComplete,
      pending:  listaPending,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M5 12h14M5 16h6" />
        </svg>
      ),
    },
  ]

  const mockFicha = { empresa, tipo_cliente: tipo } as BcFicha

  return (
    <div className="h-screen flex flex-col bg-[#F4F6F8]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#2D3F52] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Fichas
        </button>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${empresa === 'roble' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{empresa}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{tipo === 'pf' ? 'Persona Física' : 'Persona Jurídica'}</span>
          <span className="font-semibold text-sm text-[#2D3F52]">{clientName || 'Sin nombre'}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Guardando…
            </span>
          )}
          {!saving && savedAt && (
            <span className="text-xs text-gray-400 flex items-center gap-1" title="Los datos quedan guardados en el sistema. Podés recuperarlos desde el Historial de Fichas BCU.">
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Guardado · {savedAt.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={save}
            title="Guarda los datos en el sistema. Podés recuperarlos desde el Historial de Fichas BCU."
            className="px-3 py-1.5 bg-[#16A34A] text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
          >
            Guardar
          </button>
          <button
            onClick={() => setPreviewOpen(p => !p)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
          >
            {previewOpen ? 'Ocultar preview' : 'Ver preview'}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left panel */}
        <div className={`${previewOpen ? 'w-[45%] min-w-[440px]' : 'flex-1'} bg-white border-r border-gray-100 flex flex-col overflow-hidden`}>

          {/* Document selector — 3 cards */}
          <div className="shrink-0 bg-[#F4F6F8] border-b border-gray-200 p-3 grid grid-cols-3 gap-2">
            {docs.map(({ key, short, desc, icon, complete, pending }) => {
              const isActive = activeDoc === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveDoc(key)}
                  className={`flex flex-col gap-2 px-3 py-3 rounded-xl text-left transition-all border ${
                    isActive
                      ? 'bg-[#2D3F52] border-[#2D3F52] shadow-sm'
                      : 'bg-white border-gray-200 hover:border-[#2D3F52]/30 hover:shadow-sm'
                  }`}
                >
                  <div className={`${isActive ? 'text-white' : 'text-[#2D3F52]'}`}>
                    {icon}
                  </div>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${isActive ? 'text-white' : 'text-[#2D3F52]'}`}>
                      {short}
                    </p>
                    <p className={`text-[10px] mt-0.5 leading-tight ${isActive ? 'text-white/60' : 'text-gray-400'}`}>
                      {desc}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${
                    complete
                      ? isActive ? 'bg-green-400/25 text-green-300' : 'bg-green-100 text-green-700'
                      : pending
                      ? isActive ? 'bg-amber-400/25 text-amber-300' : 'bg-amber-100 text-amber-700'
                      : isActive ? 'bg-white/10 text-white/50' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {complete ? '✓ Completo' : pending ? '● En progreso' : '○ Sin datos'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Form content */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeDoc === 'ficha' && tipo === 'pf' && (
              <FichaPFForm data={fichaData as FichaPFData} onChange={setFichaData} />
            )}
            {activeDoc === 'ficha' && tipo === 'pj' && (
              <FichaPJForm data={fichaData as FichaPJData} onChange={setFichaData} />
            )}
            {activeDoc === 'perfil' && (
              <PerfilInversorForm data={perfilData} onChange={setPerfilData} />
            )}
            {activeDoc === 'lista' && (
              <ListaVerificacionForm data={listaData} tipo={tipo} onChange={setListaData} />
            )}
          </div>
        </div>

        {/* Right panel — preview */}
        {previewOpen && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <DocumentPreview
              ficha={mockFicha}
              activeDoc={activeDoc}
              fichaData={fichaData}
              perfilData={perfilData}
              listaData={listaData}
            />
          </div>
        )}
      </div>
    </div>
  )
}
