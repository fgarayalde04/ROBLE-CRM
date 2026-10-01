'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PlantillaRender, { PAGINA_PLANTILLA, imagenPlantillaUrl } from '@/components/plantillas/PlantillaRender'
import {
  FICHA_BONO_GRUPOS, TIPOS_PLANTILLA, camposFaltantes, nuevoBloque, tituloDocumento,
  type AnalisisBonosDatos, type FichaBonoDatos, type BloqueAnalisis, type TipoPlantilla,
} from '@/lib/plantillas/tipos'
import { RESEARCH_CATEGORIAS, researchCategoriaLabel } from '@/lib/research/labels'
import EnviarClientesModal from './EnviarClientesModal'

interface Doc {
  id: string; tipo: TipoPlantilla; titulo: string; datos: any
  research_type: string | null; research_post_id: string | null; research_publicado_at: string | null; updated_at: string
  web_publicar: boolean; web_report_id: string | null; web_publicado_at: string | null
}

const input = 'w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20 bg-white'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

export default function PlantillaEditor({ doc, fontsClass, puedePublicar, webConfigurada }: {
  doc: Doc; fontsClass: string; puedePublicar: boolean; webConfigurada: boolean
}) {
  const router = useRouter()
  const [datos, setDatos] = useState<any>(doc.datos)
  const [estado, setEstado] = useState<'guardado' | 'pendiente' | 'guardando' | 'error'>('guardado')
  const [desbordes, setDesbordes] = useState<number[]>([])
  const [bajando, setBajando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const ultimo = useRef(JSON.stringify(doc.datos))

  // Guardado automático (1,2 s después del último cambio)
  const guardar = useCallback(async (d: any) => {
    const json = JSON.stringify(d)
    if (json === ultimo.current) { setEstado('guardado'); return true }
    setEstado('guardando')
    try {
      const res = await fetch(`/api/plantillas/${doc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datos: d }),
      })
      if (!res.ok) throw new Error()
      ultimo.current = json
      setEstado('guardado')
      return true
    } catch {
      setEstado('error')
      return false
    }
  }, [doc.id])

  useEffect(() => {
    if (JSON.stringify(datos) === ultimo.current) return
    setEstado('pendiente')
    const t = setTimeout(() => { guardar(datos) }, 1200)
    return () => clearTimeout(t)
  }, [datos, guardar])

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(datos) !== ultimo.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [datos])

  const set = (patch: Record<string, unknown>) => setDatos((d: any) => ({ ...d, ...patch }))

  async function descargar() {
    setBajando(true)
    const ok = await guardar(datos)
    if (ok) window.location.href = `/api/plantillas/${doc.id}/pdf`
    setTimeout(() => setBajando(false), 4000)
  }

  async function duplicar() {
    await guardar(datos)
    const res = await fetch('/api/plantillas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duplicar: doc.id }),
    })
    const data = await res.json()
    if (res.ok) router.push(`/plantillas/${data.documento.id}`)
    else alert(data.error ?? 'No se pudo duplicar')
  }

  const faltan = camposFaltantes(doc.tipo, datos)

  // ── Research & Novedades: se publica sola cuando el documento está completo
  // y se actualiza (PDF nuevo) unos segundos después de cada cambio guardado.
  const [categoria, setCategoria] = useState<string>(doc.research_type ?? '')
  const [web, setWeb] = useState<boolean>(webConfigurada && !!doc.web_publicar)
  const [pub, setPub] = useState<{ estado: 'nada' | 'pendiente' | 'publicando' | 'ok' | 'error'; at: string | null; error?: string; postId: string | null }>({
    estado: doc.research_post_id || doc.web_report_id ? 'ok' : 'nada',
    at: [doc.research_publicado_at, doc.web_publicado_at].filter(Boolean).sort().pop() ?? null,
    postId: doc.research_post_id,
  })
  const alDia = (id: string | null, at: string | null) => !!id && !!at && at >= doc.updated_at
  const publicadoJson = useRef<string | null>(
    (!doc.research_type || alDia(doc.research_post_id, doc.research_publicado_at)) &&
    (!doc.web_publicar || alDia(doc.web_report_id, doc.web_publicado_at)) &&
    (doc.research_type || doc.web_publicar) ? JSON.stringify(doc.datos) : null
  )

  const publicar = useCallback(async () => {
    setPub((p) => ({ ...p, estado: 'publicando', error: undefined }))
    const json = JSON.stringify(datos)
    try {
      const res = await fetch(`/api/plantillas/${doc.id}/publicar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoria: categoria || null, web }),
      })
      const data = await res.json()
      const errores = [
        data.research && !data.research.ok ? `Research: ${data.research.error}` : null,
        data.web && !data.web.ok ? `Web: ${data.web.error}` : null,
      ].filter(Boolean)
      if (!res.ok && !errores.length) throw new Error(data.error ?? 'No se pudo publicar')
      if (errores.length) throw new Error(errores.join(' · '))
      publicadoJson.current = json
      setPub({ estado: 'ok', at: new Date().toISOString(), postId: data.research?.postId ?? null })
    } catch (e: any) {
      setPub((p) => ({ ...p, estado: 'error', error: e.message }))
    }
  }, [datos, categoria, web, doc.id])

  const completo = faltan.length === 0
  useEffect(() => {
    if (!puedePublicar || !(categoria || web) || !completo || estado !== 'guardado') return
    if (publicadoJson.current === JSON.stringify(datos)) return
    setPub((p) => (p.estado === 'publicando' ? p : { ...p, estado: 'pendiente' }))
    const t = setTimeout(() => { publicar() }, 6000)
    return () => clearTimeout(t)
  }, [puedePublicar, categoria, web, completo, estado, datos, publicar])

  async function cambiarWeb(v: boolean) {
    setWeb(v)
    publicadoJson.current = null
    await fetch(`/api/plantillas/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ web: v }),
    })
  }

  async function cambiarCategoria(c: string) {
    setCategoria(c)
    publicadoJson.current = null // republicar en la categoría nueva
    await fetch(`/api/plantillas/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoria: c || null }),
    })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
        <Link href="/plantillas" className="hover:text-gray-600">Plantillas</Link>
        <span>/</span>
        <Link href={`/plantillas?tipo=${doc.tipo}`} className="hover:text-gray-600">{TIPOS_PLANTILLA[doc.tipo].plural}</Link>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[#2D3F52]">{TIPOS_PLANTILLA[doc.tipo].label}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {estado === 'guardado' ? 'Guardado' : estado === 'guardando' ? 'Guardando…' : estado === 'pendiente' ? 'Cambios sin guardar…' : 'No se pudo guardar — reintentando al próximo cambio'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={duplicar} className="px-3 py-1.5 text-sm border border-gray-200 bg-white rounded-md hover:bg-gray-50">
            Duplicar
          </button>
          {puedePublicar && (
            <button
              type="button"
              disabled={faltan.length > 0}
              title={faltan.length ? 'Completá todos los campos para poder enviarlo' : undefined}
              onClick={async () => { if (await guardar(datos)) setEnviando(true) }}
              className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 bg-white rounded-md hover:bg-blue-50 disabled:opacity-40"
            >
              ✉️ Enviar a clientes
            </button>
          )}
          <button
            type="button" onClick={descargar} disabled={bajando}
            className="px-4 py-1.5 text-sm bg-[#2D3F52] text-white rounded-md hover:bg-[#354A5E] disabled:opacity-60"
          >
            {bajando ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {puedePublicar && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
          <span className="font-medium text-gray-700">Publicar en</span>
          <span className="text-xs text-gray-500">Research &amp; Novedades:</span>
          <select
            value={categoria}
            onChange={(e) => cambiarCategoria(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
          >
            <option value="">No publicar</option>
            {RESEARCH_CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {webConfigurada && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={web} onChange={(e) => cambiarWeb(e.target.checked)} />
              Web de clientes
            </label>
          )}
          <span className="text-xs text-gray-500 flex-1 min-w-[200px]">
            {(() => {
              const destinos = [categoria && `Research (${researchCategoriaLabel(categoria)})`, web && 'la web de clientes'].filter(Boolean).join(' y ')
              if (!destinos) return 'No se publica.'
              if (!completo) return `Se publica en ${destinos} cuando completes todos los campos.`
              if (pub.estado === 'publicando') return 'Publicando… (generando el PDF)'
              if (pub.estado === 'pendiente') return `Se actualiza en ${destinos} en unos segundos…`
              if (pub.estado === 'error') return <span className="text-red-600">No se pudo publicar: {pub.error}</span>
              if (pub.estado === 'ok') return <span className="text-emerald-700">✓ Publicado en {destinos}{pub.at ? ` · ${new Date(pub.at).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              return ''
            })()}
          </span>
          {pub.postId && <Link href="/research" className="text-xs text-blue-600 hover:underline">Ver en Research</Link>}
          {(categoria || web) && completo && (
            <button type="button" onClick={publicar} disabled={pub.estado === 'publicando'} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
              Actualizar ahora
            </button>
          )}
        </div>
      )}

      {(faltan.length > 0 || desbordes.length > 0) && (
        <div className="mb-4 space-y-2">
          {faltan.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Faltan completar: {faltan.join(' · ')}
            </p>
          )}
          {desbordes.length > 0 && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              En la hoja {desbordes.join(' y ')} no queda lugar suficiente: la imagen sale muy chica o el contenido se corta. Acortá el texto o pasá parte a la segunda hoja.
            </p>
          )}
        </div>
      )}

      {enviando && (
        <EnviarClientesModal
          docId={doc.id}
          titulo={tituloDocumento(doc.tipo, datos)}
          cuerpoInicial={textoMailInicial(doc.tipo, datos)}
          onClose={() => setEnviando(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,440px)_1fr] gap-6 items-start">
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-5">
          {doc.tipo === 'ficha_bono'
            ? <FormFichaBono datos={datos} set={set} />
            : <FormAnalisis datos={datos} set={set} />}
        </div>
        <div className="lg:sticky lg:top-4">
          <Preview tipo={doc.tipo} datos={datos} fontsClass={fontsClass} onDesbordes={setDesbordes} />
        </div>
      </div>
    </div>
  )
}

function textoMailInicial(tipo: TipoPlantilla, d: any) {
  const que = tipo === 'ficha_bono'
    ? `la ficha de ${d.titulo || 'la nueva emisión'}${d.precio || d.tir ? ` (precio indicativo ${d.precio || '—'}, TIR ${d.tir || '—'})` : ''}`
    : `nuestro análisis de ${d.titulo || 'renta fija'}`
  return `Estimado/a cliente:\n\nLe compartimos ${que}. Encontrará el detalle en el PDF adjunto.\n\nQuedamos a disposición por cualquier consulta; puede responder este mail o contactar a su asesor.\n\nSaludos cordiales,\nRoble Capital Wealth Management`
}

// ── Vista previa escalada al ancho disponible ───────────────────────────────

function Preview({ tipo, datos, fontsClass, onDesbordes }: {
  tipo: TipoPlantilla; datos: any; fontsClass: string; onDesbordes: (h: number[]) => void
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.6)
  const [alto, setAlto] = useState(0)
  const page = PAGINA_PLANTILLA[tipo]

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setEscala(Math.min(1, el.clientWidth / page.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [page.width])

  // Alto real del documento (cantidad de hojas) y hojas cuyo contenido no entra
  useEffect(() => {
    const el = inner.current
    if (!el) return
    const medir = () => {
      setAlto(el.scrollHeight)
      const over: number[] = []
      el.querySelectorAll<HTMLElement>('[data-plantilla-contenido]').forEach((c) => {
        const chica = Array.from(c.querySelectorAll<HTMLElement>('[data-plantilla-imagen]')).some((i) => i.offsetHeight < 160)
        if (c.scrollHeight > c.clientHeight + 2 || chica) over.push(Number(c.dataset.plantillaContenido))
      })
      onDesbordes(over)
    }
    medir()
    const imgs = Array.from(el.querySelectorAll('img'))
    imgs.forEach((i) => i.addEventListener('load', medir))
    ;(document as any).fonts?.ready?.then(medir)
    return () => imgs.forEach((i) => i.removeEventListener('load', medir))
  }, [datos, onDesbordes])

  return (
    <div ref={wrap} className="w-full">
      <div style={{ height: alto * escala, overflow: 'hidden' }} className="shadow-sm border border-gray-200 bg-white">
        <div ref={inner} className={fontsClass} style={{ width: page.width, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
          <div className="space-y-0">
            <PlantillaRender tipo={tipo} datos={datos} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Formulario: ficha de bono ────────────────────────────────────────────────

function FormFichaBono({ datos, set }: { datos: FichaBonoDatos; set: (p: Record<string, unknown>) => void }) {
  return (
    <>
      {FICHA_BONO_GRUPOS.map((g) => (
        <div key={g.titulo}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">{g.titulo}</p>
          <div className="grid grid-cols-2 gap-3">
            {g.campos.map((c) => (
              <div key={c.key} className={c.ancho === 'medio' ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
                <label className={labelCls}>{c.label}</label>
                <input
                  className={`${input} ${!String(datos[c.key] ?? '').trim() ? 'border-amber-300' : ''}`}
                  value={datos[c.key] ?? ''}
                  placeholder={c.placeholder}
                  onChange={(e) => set({ [c.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-gray-400">
        El disclaimer del pie es fijo; solo cambia la fecha de “Precios al”.
      </p>
    </>
  )
}

// ── Formulario: análisis de bonos ────────────────────────────────────────────

function Campo({ label, value, placeholder, onChange, medio = false }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void; medio?: boolean
}) {
  return (
    <div className={medio ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
      <label className={labelCls}>{label}</label>
      <input className={input} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function FormAnalisis({ datos, set }: { datos: AnalisisBonosDatos; set: (p: Record<string, unknown>) => void }) {
  const bloques = datos.bloques ?? []
  const setBloques = (b: BloqueAnalisis[]) => set({ bloques: b })
  const upd = (id: string, patch: Partial<BloqueAnalisis>) =>
    setBloques(bloques.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= bloques.length) return
    const copia = [...bloques]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    setBloques(copia)
  }
  const titulo = 'text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2'

  return (
    <>
      <div>
        <p className={titulo}>Encabezado</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo medio label="Categoría" value={datos.categoria} placeholder="Análisis de renta fija" onChange={(v) => set({ categoria: v })} />
          <Campo medio label="Mes" value={datos.periodo} placeholder="Septiembre 2026" onChange={(v) => set({ periodo: v })} />
          <Campo label="Emisor (línea superior)" value={datos.emisor_largo} placeholder="República Federativa de Brasil" onChange={(v) => set({ emisor_largo: v })} />
          <Campo label="Título" value={datos.titulo} placeholder="Brasil 10,25% 2028" onChange={(v) => set({ titulo: v })} />
          <Campo label="Subtítulo (opcional)" value={datos.subtitulo} placeholder="Bono soberano en reales, liquidado en dólares" onChange={(v) => set({ subtitulo: v })} />
        </div>
      </div>

      <div>
        <p className={titulo}>Precio <span className="normal-case tracking-normal font-normal">— opcional, si se completa aparece la franja gris</span></p>
        <div className="grid grid-cols-2 gap-3">
          <Campo medio label="Precio indicativo" value={datos.precio} placeholder="99,00" onChange={(v) => set({ precio: v })} />
          <Campo medio label="Rendimiento indicativo (TIR)" value={datos.tir} placeholder="11,08%" onChange={(v) => set({ tir: v })} />
          <Campo medio label="Precios al" value={datos.fecha_precios} placeholder="30/09/2026" onChange={(v) => set({ fecha_precios: v })} />
        </div>
      </div>

      <div>
        <p className={titulo}>Hoja 1</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Título del texto" value={datos.sobre_titulo} placeholder="Sobre el emisor" onChange={(v) => set({ sobre_titulo: v })} />
          <div className="col-span-2">
            <label className={labelCls}>Información de la empresa <span className="text-gray-400 font-normal">— dejá una línea en blanco entre párrafos</span></label>
            <textarea rows={8} className={`${input} resize-y`} value={datos.sobre_emisor ?? ''} onChange={(e) => set({ sobre_emisor: e.target.value })} />
          </div>
          <Campo label="Título de la imagen" value={datos.detalle_titulo} placeholder="Detalle del bono" onChange={(v) => set({ detalle_titulo: v })} />
          <div className="col-span-2">
            <label className={labelCls}>Imagen del detalle del bono (captura de Bloomberg, etc.)</label>
            <SubirImagen valor={datos.detalle_imagen_key} onChange={(k) => set({ detalle_imagen_key: k })} />
          </div>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={!!datos.segunda_hoja} onChange={(e) => set({ segunda_hoja: e.target.checked })} />
          Agregar una segunda hoja (gráficos, tablas, más detalle)
        </label>
        {datos.segunda_hoja && (
          <div className="mt-3 space-y-3">
            {bloques.map((b, i) => (
              <div key={b.id} className="border border-gray-200 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-600">Bloque {i + 1}</span>
                  <div className="flex items-center gap-1 text-xs">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="px-1.5 py-0.5 border border-gray-200 rounded disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === bloques.length - 1} className="px-1.5 py-0.5 border border-gray-200 rounded disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => setBloques(bloques.filter((x) => x.id !== b.id))} className="px-1.5 py-0.5 text-red-500 hover:underline">Quitar</button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Título</label>
                  <input className={input} value={b.titulo} placeholder="Evolución de precio" onChange={(e) => upd(b.id, { titulo: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Texto (opcional)</label>
                  <textarea rows={3} className={`${input} resize-y`} value={b.texto} onChange={(e) => upd(b.id, { texto: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Imagen (opcional)</label>
                  <SubirImagen valor={b.imagen_key} onChange={(k) => upd(b.id, { imagen_key: k })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBloques([...bloques, nuevoBloque('')])}
              className="w-full py-2 text-xs font-semibold border border-dashed border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              + Agregar bloque
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function SubirImagen({ valor, onChange }: { valor: string | null; onChange: (key: string | null) => void }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subir(file: File) {
    setSubiendo(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/plantillas/imagen', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo subir')
      onChange(data.key)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div
      onPaste={(e) => {
        const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'))
        if (f) { e.preventDefault(); subir(f) }
      }}
      tabIndex={0}
      className="flex items-center gap-3 rounded p-1 -m-1 focus:outline-none focus:ring-2 focus:ring-[#2D3F52]/20"
    >
      {valor ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagenPlantillaUrl(valor)} alt="" className="w-20 h-12 object-cover rounded border border-gray-200" />
      ) : (
        <div className="w-20 h-12 rounded border border-dashed border-gray-300 bg-gray-50" />
      )}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-blue-600 hover:underline cursor-pointer">
          {subiendo ? 'Subiendo…' : valor ? 'Cambiar imagen' : 'Subir imagen'}
          <input
            type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={subiendo}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }}
          />
        </label>
        {valor && <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-400 hover:text-red-500 text-left">Quitar</button>}
        {!valor && <span className="text-[10px] text-gray-400">o hacé clic acá y pegá una captura (Cmd+V)</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
