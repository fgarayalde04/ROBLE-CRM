'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import type { BcFicha, FichaPFData, FichaPJData, PerfilData, ListaData } from './types'
import { LISTA_PF_ITEMS, LISTA_PJ_ITEMS } from './types'

type Doc = 'ficha' | 'perfil' | 'lista'

interface Props {
  ficha: Partial<BcFicha> & { empresa: BcFicha['empresa']; tipo_cliente: BcFicha['tipo_cliente'] }
  activeDoc: Doc
  fichaData: FichaPFData | FichaPJData
  perfilData: PerfilData
  listaData: ListaData
}

const EMPRESA_LABEL: Record<string, string> = {
  roble: 'ROBLE CAPITAL WEALTH MANAGEMENT S.A.',
  geliene: 'GELIENE S.A.',
}

export default function DocumentPreview({ ficha, activeDoc, fichaData, perfilData, listaData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const listaRef    = useRef<HTMLDivElement>(null)
  const [renderLoading, setRenderLoading] = useState(false)
  const [downloading,   setDownloading]   = useState(false)
  const [renderError,   setRenderError]   = useState<string | null>(null)

  const docLabel =
    activeDoc === 'ficha'  ? 'Ficha de Cliente' :
    activeDoc === 'perfil' ? 'Cuestionario Perfil del Inversor' :
                             'Lista de Verificación'

  // Build the payload for the generate API
  const buildPayload = useCallback((fmt: 'docx' | 'html' = 'docx') => ({
    empresa:      ficha.empresa,
    tipo_cliente: ficha.tipo_cliente,
    doc:          activeDoc === 'perfil' ? 'cuestionario' : 'ficha',
    format:       fmt,
    ficha_data:   fichaData,
    perfil_data:  perfilData,
    lista_data:   listaData,
  }), [ficha.empresa, ficha.tipo_cliente, activeDoc, fichaData, perfilData, listaData])

  // Fetch DOCX and render with docx-preview
  const renderDocx = useCallback(async () => {
    if (activeDoc === 'lista' || !containerRef.current) return

    setRenderLoading(true)
    setRenderError(null)

    try {
      const res = await fetch('/api/bc-ficha/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload('docx')),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setRenderError(err.error ?? 'Error al generar el documento')
        return
      }

      const blob = await res.blob()
      const { renderAsync } = await import('docx-preview')

      containerRef.current.innerHTML = ''
      await renderAsync(blob, containerRef.current, undefined, {
        className:       'docx-preview',
        inWrapper:       true,
        ignoreWidth:     false,
        ignoreHeight:    false,
        ignoreFonts:     false,
        breakPages:      true,
        useBase64URL:    true,
        renderHeaders:   true,
        renderFooters:   true,
        renderFootnotes: true,
        renderEndnotes:  true,
      })
    } catch (e) {
      console.error(e)
      setRenderError('Error al renderizar el documento')
    } finally {
      setRenderLoading(false)
    }
  }, [activeDoc, buildPayload])

  // Auto-render when activeDoc changes (not on every keystroke)
  useEffect(() => {
    if (activeDoc === 'lista') return
    const timer = setTimeout(renderDocx, 200)
    return () => clearTimeout(timer)
  }, [activeDoc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Print
  const handlePrint = () => {
    if (activeDoc === 'lista') {
      const content = listaRef.current?.innerHTML
      if (!content) return
      const w = window.open('', '_blank')
      if (!w) return
      w.document.write(`<!DOCTYPE html><html><head><title>Lista de Verificación</title>
        <style>
          @page { size: A4; margin: 20mm 18mm; }
          body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; line-height: 1.3; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #000; padding: 3px 5px; font-size: 8.5pt; vertical-align: top; }
          h1 { font-size: 12pt; text-align: center; font-weight: bold; }
        </style>
      </head><body>${content}</body></html>`)
      w.document.close()
      w.print()
      return
    }

    // Collect all loaded CSS (includes docx-preview dynamic styles)
    const styles = Array.from(document.styleSheets)
      .map(ss => {
        try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n') }
        catch { return '' }
      })
      .join('\n')

    const content = containerRef.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>${docLabel}</title>
      <style>${styles}
        @page { size: A4; margin: 0; }
        body { margin: 0; background: white; }
        .docx-wrapper { background: white !important; padding: 0 !important; }
        section.docx { box-shadow: none !important; margin: 0 auto !important; }
      </style>
    </head><body>${content}</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  // Download DOCX
  const handleDownloadDocx = async () => {
    if (downloading) return
    if (activeDoc === 'lista') { handlePrint(); return }

    setDownloading(true)
    try {
      const res = await fetch('/api/bc-ficha/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload('docx')),
      })
      if (!res.ok) { alert('Error generando el documento'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const tipoLabel = ficha.tipo_cliente === 'pf' ? 'PF' : 'PJ'
      const docName   = activeDoc === 'perfil' ? 'Cuestionario' : `Ficha-${tipoLabel}`
      a.download = `${docName}-${ficha.empresa?.toUpperCase()}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
        <span className="text-xs font-medium text-gray-500 flex-1">{docLabel}</span>

        {activeDoc !== 'lista' && (
          <button
            onClick={renderDocx}
            disabled={renderLoading}
            title="Actualizar preview con los datos actuales"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-60"
          >
            {renderLoading
              ? <span className="w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            Actualizar
          </button>
        )}

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimir
        </button>

        {activeDoc !== 'lista' && (
          <button
            onClick={handleDownloadDocx}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2D3F52] text-white rounded-lg text-xs font-medium hover:bg-opacity-90 transition-colors disabled:opacity-60"
          >
            {downloading
              ? <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            }
            Descargar Word
          </button>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto bg-gray-200">
        {activeDoc !== 'lista' ? (
          <div className="relative min-h-full">
            {renderLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-10">
                <div className="flex flex-col items-center gap-3">
                  <span className="w-8 h-8 border-2 border-[#2D3F52] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-gray-500">Generando preview…</span>
                </div>
              </div>
            )}
            {renderError && !renderLoading && (
              <div className="flex items-center justify-center h-40">
                <p className="text-sm text-red-500">{renderError}</p>
              </div>
            )}
            <div ref={containerRef} />
          </div>
        ) : (
          <div
            className="bg-white mx-auto shadow-sm"
            style={{ width: '210mm', minHeight: '297mm', padding: '20mm 18mm', fontFamily: 'Calibri, Arial, sans-serif', fontSize: '9pt', lineHeight: '1.3', color: '#000' }}
          >
            <div ref={listaRef}>
              <ListaPreview data={listaData} tipo={ficha.tipo_cliente} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lista de Verificación ─────────────────────────────────────────────────────

function ListaPreview({ data, tipo }: { data: ListaData; tipo: string }) {
  const isPF     = tipo === 'pf'
  const items    = isPF ? LISTA_PF_ITEMS : LISTA_PJ_ITEMS
  const verifId  = isPF ? '10' : '14'
  const riesgoId = isPF ? '11' : '15'
  const aprNum   = isPF ? 12  : 16
  const altNum   = isPF ? 13  : 17

  const chk    = (id: string) => data.items[id]?.status === 'completo' ? '☒' : '☐'
  const subChk = (parentId: string, idx: number) => chk(`${parentId}_${idx}`)

  const simpleItems = items.filter(i => parseInt(i.id) < parseInt(verifId))
  const verifItem   = items.find(i => i.id === verifId)!

  const box: React.CSSProperties = {
    display: 'inline-block', border: '1px solid #000',
    width: '14px', height: '14px',
    textAlign: 'center', fontSize: '10pt', lineHeight: '14px',
    verticalAlign: 'middle', flexShrink: 0,
  }
  const numCell: React.CSSProperties = { width: '24px', fontWeight: 'bold', verticalAlign: 'top', padding: '2px 4px 2px 6px', whiteSpace: 'nowrap' }
  const textCell: React.CSSProperties = { padding: '2px 4px', verticalAlign: 'top', fontSize: '8.5pt' }
  const chkCell: React.CSSProperties = { width: '24px', padding: '2px 6px 2px 0', verticalAlign: 'top', textAlign: 'right' }

  const fmtFecha = (f: string) => {
    if (!f) return ''
    const d = new Date(f + 'T12:00:00')
    return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div style={{ fontFamily: 'Calibri, Arial, sans-serif', fontSize: '9pt', color: '#000', border: '1px solid #000', lineHeight: '1.4' }}>

      {/* Title */}
      <div style={{ backgroundColor: '#000', color: '#fff', textAlign: 'center', fontWeight: 'bold', padding: '5px', fontSize: '10pt' }}>
        Lista de Verificación - {isPF ? 'Persona Física' : 'Persona Jurídica'}
      </div>

      {/* Fecha top-right */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px 0' }}>
        <span style={{ border: '1px solid #000', padding: '2px 10px', fontSize: '8.5pt' }}>
          Fecha: {fmtFecha(data.fecha)}
        </span>
      </div>

      {/* Client box */}
      <div style={{ border: '1px solid #000', margin: '4px 8px 6px', padding: '5px 8px', fontSize: '8.5pt' }}>
        <p style={{ margin: '2px 0' }}><strong>Nombre del Cliente:</strong>{'  '}{data.nombre_cliente}</p>
        <p style={{ margin: '2px 0' }}><strong>Código del Cliente:</strong>{'  '}{data.codigo_cliente}</p>
      </div>

      {/* Items 1–N (simple rows) */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {simpleItems.map(item => (
            <tr key={item.id}>
              <td style={numCell}>{item.id}</td>
              <td style={textCell}>{item.label}</td>
              <td style={chkCell}><span style={box}>{chk(item.id)}</span></td>
            </tr>
          ))}

          {/* Verificación de antecedentes */}
          <tr>
            <td style={numCell}>{verifId}</td>
            <td colSpan={2} style={{ ...textCell, paddingBottom: '4px' }}>
              <strong>Verificación de antecedentes (ONU, OFAC, otras).</strong>
              <div style={{ marginLeft: '16px', marginTop: '3px' }}>
                {verifItem.sub?.map((s, idx) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ fontSize: '8.5pt' }}>{s}</span>
                    <span style={box}>{subChk(verifId, idx)}</span>
                  </div>
                ))}
              </div>
            </td>
          </tr>

          {/* Evaluación de Riesgo */}
          <tr>
            <td style={numCell}>{riesgoId}</td>
            <td style={textCell}><strong>Evaluación de Riesgo (ALTO, MEDIO, BAJO)</strong></td>
            <td style={{ ...chkCell, paddingRight: '8px' }}>
              <span style={{ display: 'inline-block', border: '1px solid #000', padding: '1px 8px', minWidth: '60px', fontWeight: 'bold', textAlign: 'center', fontSize: '8.5pt' }}>
                {data.riesgo}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Section aprNum: 2-column approval box */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', border: '1px solid #000' }}>
        <tbody>
          <tr>
            <td style={{ width: '24px', fontWeight: 'bold', padding: '2px 4px 2px 6px', verticalAlign: 'middle', fontSize: '8.5pt' }}>{aprNum}</td>
            <td style={{ backgroundColor: '#000', color: '#fff', fontWeight: 'bold', textAlign: 'center', padding: '4px 6px', fontSize: '8.5pt', borderRight: '1px solid #fff', width: '48%' }}>
              Aprobación de la relación comercial
            </td>
            <td style={{ backgroundColor: '#000', color: '#fff', fontWeight: 'bold', textAlign: 'center', padding: '4px 6px', fontSize: '8.5pt' }}>
              Constancia de las verificaciones efectuadas por Oficial de Cumplimiento
            </td>
          </tr>
          <tr>
            <td />
            <td style={{ padding: '8px', verticalAlign: 'top', borderRight: '1px solid #000', fontSize: '8.5pt' }}>
              <p style={{ margin: '0 0 16px' }}>
                Aprobada por:{' '}
                <span style={{ display: 'inline-block', borderBottom: '1px solid #000', minWidth: '110px' }}>{data.aprobado_por}</span>
              </p>
              <p style={{ margin: 0 }}>
                FIRMA:{' '}
                <span style={{ display: 'inline-block', borderBottom: '1px solid #000', minWidth: '120px' }} />
              </p>
            </td>
            <td style={{ padding: '8px', verticalAlign: 'top', fontSize: '8.5pt' }}>
              <p style={{ margin: '16px 0 0' }}>
                FIRMA:{' '}
                <span style={{ display: 'inline-block', borderBottom: '1px solid #000', minWidth: '120px' }} />
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Section altNum: Solamente para Riesgo Alto */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px', border: '1px solid #000' }}>
        <tbody>
          <tr>
            <td style={{ width: '24px', fontWeight: 'bold', padding: '2px 4px 2px 6px', verticalAlign: 'middle', fontSize: '8.5pt' }}>{altNum}</td>
            <td style={{ backgroundColor: '#000', color: '#fff', fontWeight: 'bold', textAlign: 'center', padding: '4px 6px', fontSize: '8.5pt' }}>
              Solamente para Clientes de Riesgo Alto
            </td>
          </tr>
          <tr>
            <td />
            <td style={{ padding: '8px', fontSize: '8.5pt' }}>
              Visto Bueno Oficial de Cumplimiento:{' '}
              <span style={{ display: 'inline-block', borderBottom: '1px solid #000', minWidth: '200px' }}>{data.visto_bueno}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
