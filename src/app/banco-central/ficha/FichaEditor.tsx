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

  const docs: { key: Doc; label: string; icon: string; complete: boolean; pending: boolean }[] = [
    { key: 'ficha', label: tipo === 'pf' ? 'Ficha Persona Física' : 'Ficha Persona Jurídica', icon: '📄', complete: fichaComplete, pending: !fichaComplete },
    { key: 'perfil', label: 'Cuestionario Perfil del Inversor', icon: '📊', complete: perfilComplete, pending: perfilPending },
    { key: 'lista', label: `Lista de Verificación ${tipo === 'pf' ? 'PF' : 'PJ'}`, icon: '✅', complete: listaComplete, pending: listaPending },
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
          {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />Guardando…</span>}
          {!saving && savedAt && <span className="text-xs text-gray-400">Guardado {savedAt.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={save} className="px-3 py-1.5 bg-[#16A34A] text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">Guardar</button>
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
        {/* Left panel — form */}
        <div className={`${previewOpen ? 'w-80 shrink-0' : 'flex-1'} bg-white border-r border-gray-100 flex flex-col overflow-hidden transition-all`}>
          <div className="flex-1 overflow-y-auto p-4">
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

        {/* Center panel — document navigation */}
        <div className="w-56 shrink-0 bg-[#F4F6F8] border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-3 pt-4 pb-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Documentos</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
            {docs.map(({ key, label, icon, complete, pending }) => (
              <button
                key={key}
                onClick={() => setActiveDoc(key)}
                className={`w-full text-left px-3 py-3 rounded-xl transition-all ${
                  activeDoc === key
                    ? 'bg-white shadow-sm border border-gray-200'
                    : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold leading-snug ${activeDoc === key ? 'text-[#2D3F52]' : 'text-gray-600'}`}>
                      {label}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                        complete ? 'bg-green-100 text-green-700' : pending ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {complete ? '🟢 Completo' : pending ? '🟡 Pendiente' : '🔴 Faltan datos'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Overall progress */}
          <div className="px-3 pb-4 pt-2 border-t border-gray-100">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Progreso</p>
            <div className="space-y-1.5">
              <ProgressBar label="Ficha" done={fichaComplete} />
              <ProgressBar label={`Perfil (${Object.keys(perfilData.answers).length}/13)`} done={perfilComplete} partial={perfilPending} />
              <ProgressBar label={`Lista (${listaCompletos}/${items.length})`} done={listaComplete} partial={listaPending} />
            </div>
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

function ProgressBar({ label, done, partial }: { label: string; done: boolean; partial?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-green-500' : partial ? 'bg-amber-400' : 'bg-gray-200'}`} />
      <span className={`text-[10px] font-medium ${done ? 'text-green-700' : partial ? 'text-amber-700' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}
