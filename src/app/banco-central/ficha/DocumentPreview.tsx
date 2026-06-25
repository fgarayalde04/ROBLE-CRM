'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BcFicha, FichaPFData, FichaPJData, PerfilData, ListaData } from './types'
import { calcScore, scoreToProfile, SCORES, LISTA_PF_ITEMS, LISTA_PJ_ITEMS } from './types'

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
  const printRef  = useRef<HTMLDivElement>(null)
  const router    = useRouter()
  const [downloading, setDownloading] = useState(false)
  const [sendingDS, setSendingDS]     = useState(false)

  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Documento BCU</title>
      <style>
        @page { size: A4; margin: 20mm 18mm; }
        body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; line-height: 1.3; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #000; padding: 3px 5px; font-size: 8.5pt; vertical-align: top; }
        h1 { font-size: 12pt; text-align: center; font-weight: bold; }
        h2 { font-size: 10pt; font-weight: bold; border-bottom: 1px solid #000; margin: 10px 0 4px; }
        .section { margin-bottom: 8px; }
        .field-row { display: flex; gap: 20px; margin-bottom: 3px; }
        .field-label { font-weight: bold; white-space: nowrap; }
        .field-val { flex: 1; border-bottom: 1px solid #000; min-width: 80px; }
        .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; vertical-align: middle; }
        .checkbox.checked { background: #000; }
        .page-break { page-break-before: always; }
      </style>
    </head><body>${content}</body></html>`)
    w.document.close()
    w.print()
  }

  const handleDownloadDocx = async () => {
    if (downloading) return
    // Lista is generated from the HTML preview (no DOCX template)
    if (activeDoc === 'lista') { handlePrint(); return }

    setDownloading(true)
    try {
      const docParam = activeDoc === 'perfil' ? 'cuestionario' : 'ficha'
      const res = await fetch('/api/bc-ficha/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa: ficha.empresa,
          tipo_cliente: ficha.tipo_cliente,
          doc: docParam,
          format: 'docx',
          ficha_data: fichaData,
          perfil_data: perfilData,
          lista_data: listaData,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Error generando el documento')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ficha.empresa}-${ficha.tipo_cliente}-${docParam}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const handleEnviarDocuSign = async () => {
    if (sendingDS) return
    setSendingDS(true)
    try {
      // Construir documentos pre-seleccionados según el doc activo
      const docsMap: Record<string, { nombre: string; tipo: string }> = {
        ficha:  { nombre: 'Ficha de Cliente', tipo: 'ficha' },
        perfil: { nombre: 'Cuestionario Perfil del Inversor', tipo: 'cuestionario' },
      }
      const docSel = docsMap[activeDoc]
      const documentos = docSel ? [docSel] : []

      const res = await fetch('/api/docusign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name:  (fichaData as any)?.personas?.[0] ? `${(fichaData as any).personas[0].nombre ?? ''} ${(fichaData as any).personas[0].primer_apellido ?? ''}`.trim() : (fichaData as any)?.razon_social ?? 'Cliente',
          empresa:      ficha.empresa,
          tipo_cliente: ficha.tipo_cliente,
          documentos,
          firmantes:    [],
          enviar_ahora: false,
        }),
      })
      if (!res.ok) { alert('Error creando borrador DocuSign'); return }
      const env = await res.json()
      router.push('/docusign')
    } finally {
      setSendingDS(false)
    }
  }

  const docLabel = activeDoc === 'ficha' ? 'Ficha de Cliente'
    : activeDoc === 'perfil' ? 'Cuestionario Perfil del Inversor'
    : 'Lista de Verificación'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-white shrink-0">
        <span className="text-xs font-medium text-gray-500 flex-1">{docLabel}</span>
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          PDF
        </button>
        {activeDoc !== 'lista' && (
          <button
            onClick={handleDownloadDocx}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2D3F52] text-white rounded-lg text-xs font-medium hover:bg-opacity-90 transition-colors disabled:opacity-60"
          >
            {downloading ? (
              <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            )}
            Descargar Word
          </button>
        )}
        {activeDoc !== 'lista' && (
          <button
            onClick={handleEnviarDocuSign}
            disabled={sendingDS}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            {sendingDS ? (
              <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            )}
            Enviar a firmar
          </button>
        )}
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto bg-gray-200 p-4">
        <div
          ref={printRef}
          className="bg-white mx-auto shadow-sm"
          style={{ width: '210mm', minHeight: '297mm', padding: '20mm 18mm', fontFamily: 'Calibri, Arial, sans-serif', fontSize: '9pt', lineHeight: '1.3', color: '#000' }}
        >
          {activeDoc === 'ficha' && (
            ficha.tipo_cliente === 'pf'
              ? <FichaPFPreview data={fichaData as FichaPFData} empresa={ficha.empresa} />
              : <FichaPJPreview data={fichaData as FichaPJData} empresa={ficha.empresa} />
          )}
          {activeDoc === 'perfil' && <PerfilPreview data={perfilData} empresa={ficha.empresa} />}
          {activeDoc === 'lista' && <ListaPreview data={listaData} tipo={ficha.tipo_cliente} empresa={ficha.empresa} />}
        </div>
      </div>
    </div>
  )
}

// ── Ficha PF Preview ──────────────────────────────────────────────────────────

function FichaPFPreview({ data, empresa }: { data: FichaPFData; empresa: string }) {
  const emp = EMPRESA_LABEL[empresa] ?? empresa.toUpperCase()
  return (
    <div>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
        <p style={{ fontSize: '7pt', textAlign: 'right', marginBottom: '4px' }}>{emp}</p>
        <h1 style={{ fontSize: '13pt', textAlign: 'center', fontWeight: 'bold', margin: 0 }}>FICHA DE CLIENTE – PERSONA FÍSICA</h1>
      </div>

      <DocRow label="Código de Cliente" value={data.codigo_cliente} />

      <DocSection title="CLIENTES">
        {data.clientes_header.map((n, i) => (
          <DocRow key={i} label="Nombres y apellidos" value={n} />
        ))}
      </DocSection>

      <DocSection title="AUTORIZADOS / APODERADOS">
        {data.autorizados_header.map((n, i) => (
          <DocRow key={i} label="Nombres y apellidos" value={n} />
        ))}
      </DocSection>

      <DocRow label="Sírvase indicar si actúa por" value={
        data.actua_por === 'propia' ? '☒ cuenta propia  ☐ de un tercero' : '☐ cuenta propia  ☒ de un tercero'
      } />

      <p style={{ fontSize: '7.5pt', margin: '8px 0', fontStyle: 'italic' }}>
        Las órdenes a canalizar a los intermediarios de valores serán impartidas de forma escrita. Cualquier cambio a estas instrucciones será dado por escrito.
      </p>

      {data.personas.map((p, idx) => (
        <div key={idx}>
          {idx > 0 && <div style={{ borderTop: '1px dashed #999', margin: '12px 0' }} />}
          <DocSection title="A. IDENTIFICACIÓN DEL CLIENTE">
            <DocRow label="Código de Beneficiario Final" value={p.codigo_beneficiario} />
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '4px' }}>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '2px 5px', width: '25%' }}>
                    <span style={{ fontWeight: 'bold' }}>Tipo:</span>
                  </td>
                  {['Titular', 'Apoderado/Autorizado', 'Beneficiario Final'].map(t => (
                    <td key={t} style={{ border: '1px solid #000', padding: '2px 5px' }}>
                      <span className={`checkbox ${p.tipo_titular === t ? 'checked' : ''}`} style={{ display: 'inline-block', width: '10px', height: '10px', border: '1px solid #000', marginRight: '4px', backgroundColor: p.tipo_titular === t ? '#000' : 'transparent' }} />
                      {t}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <DocRow label="Apellidos" value={p.apellidos} />
            <DocRow label="Nombres" value={p.nombres} />
            <DocRow label="Fecha de nacimiento" value={p.fecha_nacimiento} />
            <DocRow label="Lugar de nacimiento" value={p.lugar_nacimiento} />
            <DocRow2 a={{ label: 'Tipo de documento', value: p.tipo_documento }} b={{ label: 'Número de documento', value: p.numero_documento }} />
            <DocRow label="País de emisión" value={p.pais_emision} />
            <DocRow label="Estado civil" value={p.estado_civil} />
            {(p.estado_civil === 'Casado' || p.estado_civil === 'Concubino') && (
              <>
                <DocRow label="Nombre de cónyuge/concubino" value={p.conyuge_nombre} />
                <DocRow2 a={{ label: 'Tipo de doc. cónyuge', value: p.conyuge_tipo_doc }} b={{ label: 'Número de doc. cónyuge', value: p.conyuge_numero_doc }} />
              </>
            )}
            <DocRow label="Domicilio" value={p.domicilio} />
            <DocRow2 a={{ label: 'Ciudad y código postal', value: p.ciudad_cp }} b={{ label: 'País', value: p.pais }} />
            <DocRow2 a={{ label: 'Teléfono', value: p.telefono }} b={{ label: 'Celular', value: p.celular }} />
            <DocRow label="E-mail" value={p.email} />
            <DocRow2 a={{ label: 'Profesión / actividad', value: p.profesion }} b={{ label: 'Institución', value: p.institucion }} />
            <DocRow label="Volumen de ingresos anuales (USD)" value={p.ingresos_anuales_usd} />
            <DocRow label="Cuenta / usuario mensajería" value={p.mensajeria} />
            <DocRow label="Usuario página web asesor" value={p.usuario_web} />
            <DocRow label="Persona Políticamente Expuesta (P.E.P.)" value={p.es_pep ? '☒ SÍ' : '☐ NO'} />
            {p.es_pep && <DocRow label="Cargo Público desempeñado en los últimos cinco años" value={p.cargo_publico} />}
            <p style={{ fontWeight: 'bold', fontSize: '8.5pt', marginTop: '6px' }}>Declaración de Residencia Fiscal</p>
            <DocRow label="País de residencia fiscal" value={p.pais_residencia_fiscal} />
            <DocRow label="Número de identificación fiscal" value={p.numero_fiscal} />
          </DocSection>
        </div>
      ))}

      <DocSection title="F. FIRMA DEL CLIENTE">
        <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
          <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Firma</div>
          <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Fecha</div>
        </div>
      </DocSection>
    </div>
  )
}

// ── Ficha PJ Preview ──────────────────────────────────────────────────────────

function FichaPJPreview({ data, empresa }: { data: FichaPJData; empresa: string }) {
  const emp = EMPRESA_LABEL[empresa] ?? empresa.toUpperCase()
  return (
    <div>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
        <p style={{ fontSize: '7pt', textAlign: 'right', marginBottom: '4px' }}>{emp}</p>
        <h1 style={{ fontSize: '13pt', textAlign: 'center', fontWeight: 'bold', margin: 0 }}>FICHA DE CLIENTE – PERSONA JURÍDICA</h1>
      </div>

      <DocRow label="Código de Cliente" value={data.codigo_cliente} />

      <DocSection title="CLIENTES">
        <DocRow label="Razón Social" value={data.razon_social} />
      </DocSection>

      <DocSection title="REPRESENTANTES">
        {data.representantes_header.map((n, i) => <DocRow key={i} label="Nombres y apellidos" value={n} />)}
      </DocSection>

      <DocSection title="AUTORIZADOS / APODERADOS">
        {data.autorizados_header.map((n, i) => <DocRow key={i} label="Nombres y apellidos" value={n} />)}
      </DocSection>

      <DocRow label="¿La SOCIEDAD es una Entidad No Financiera Pasiva?" value={
        data.tipo_entidad_pasiva === true ? '☒ SÍ  ☐ NO' : data.tipo_entidad_pasiva === false ? '☐ SÍ  ☒ NO' : '☐ SÍ  ☐ NO'
      } />

      <DocSection title="A. IDENTIFICACIÓN DEL CLIENTE – PERSONA JURÍDICA">
        <DocRow label="Razón y tipo social" value={data.razon_tipo_social} />
        <DocRow label="Nombre comercial" value={data.nombre_comercial} />
        <DocRow2 a={{ label: 'Fecha de constitución', value: data.fecha_constitucion }} b={{ label: 'Lugar de constitución', value: data.lugar_constitucion }} />
        <DocRow2 a={{ label: 'País de emisión', value: data.pais_emision }} b={{ label: 'N° Identificación tributario', value: data.numero_tributario }} />
        <DocRow label="Sede social" value={data.sede_social} />
        <DocRow label="Localidad / Depto / País" value={data.localidad} />
        <DocRow2 a={{ label: 'Teléfono/Celular', value: data.telefono }} b={{ label: 'Email', value: data.email }} />
        <DocRow label="Actividad Principal" value={data.actividad_principal} />
        <DocRow label="Volumen de ingresos anuales (USD)" value={data.ingresos_anuales_usd} />
        <p style={{ fontWeight: 'bold', fontSize: '8.5pt', marginTop: '6px' }}>Declaración de Residencia Fiscal</p>
        <DocRow label="País / jurisdicción de residencia fiscal" value={data.pais_residencia_fiscal} />
        <DocRow label="Número de identificación fiscal" value={data.numero_fiscal} />
      </DocSection>

      <DocSection title="B. DECLARACIÓN DE ACCIONISTAS Y BENEFICIARIOS FINALES">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'left' }}>Nombres y Apellidos</th>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'center', width: '15%' }}>Participación (%)</th>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'center', width: '15%' }}>Benef. Final</th>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', width: '20%' }}>Código</th>
            </tr>
          </thead>
          <tbody>
            {data.accionistas.map((a, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt' }}>{a.nombres_apellidos}</td>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'center' }}>{a.participacion}</td>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'center' }}>{a.es_beneficiario_final ? '☒' : '☐'}</td>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt' }}>{a.codigo_beneficiario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocSection>

      <DocSection title="C. DECLARACIÓN DE REPRESENTANTES, APODERADOS Y AUTORIZADOS">
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', textAlign: 'left' }}>Nombre/s y Apellido/s</th>
              <th style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt', width: '30%' }}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data.representantes_detalle.map((r, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt' }}>{r.nombres_apellidos}</td>
                <td style={{ border: '1px solid #000', padding: '3px', fontSize: '8pt' }}>{r.tipo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DocSection>

      <DocSection title="F. FIRMA DEL CLIENTE">
        <div style={{ display: 'flex', gap: '40px', marginTop: '20px' }}>
          <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Firma</div>
          <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Fecha</div>
        </div>
      </DocSection>
    </div>
  )
}

// ── Perfil Preview ────────────────────────────────────────────────────────────

const Q_LABELS: Record<string, string> = {
  q1: 'Edad',
  q2: '¿Qué porcentaje del patrimonio líquido representa el monto a invertir?',
  q3: 'Expectativa de ingresos en los próximos 5 años',
  q4: '¿Cuenta con fondo de reservas para cubrir 6 meses de gastos?',
  q5: '¿Por cuánto tiempo espera mantener las inversiones?',
  q6: '¿Piensa realizar algún retiro en los próximos 3 meses?',
  q7: 'Objetivo de inversión y tolerancia a fluctuaciones',
  q8: 'Experiencia como inversionista',
  q9a: 'Experiencia en Fondos mutuos',
  q9b: 'Experiencia en Bonos',
  q9c: 'Experiencia en Acciones',
  q10: '¿Disposición a asumir mayor riesgo para obtener mayor rendimiento?',
  q11: 'Escenario de fluctuación adversa',
}

const OPT_LABELS: Record<string, Record<string, string>> = {
  q1: { A: 'Menos de 40 años', B: 'Entre 40 y 50 años', C: 'Más de 50 años', D: 'Pensionado' },
  q2: { A: 'Menos del 50%', B: 'Entre el 50% y el 75%', C: 'Más del 75%' },
  q3: { A: 'Deben aumentar', B: 'Deben mantenerse estables', C: 'Deben disminuir' },
  q4: { A: 'Sí', B: 'No' },
  q5: { A: 'Más de 5 años', B: 'Entre 3 y 5 años', C: 'Entre 1 y 3 años', D: 'Menos de 1 año' },
  q6: { A: 'No', B: 'Sí, menos del 15%', C: 'Sí, más del 15%', D: 'No tiene certeza' },
  q7: { A: 'Preservación de capital', B: 'Conservador', C: 'Moderado', D: 'Agresivo' },
  q8: { A: 'Limitada', B: 'Moderada', C: 'Extensa' },
  q9a: { A: 'Ninguna', B: 'Limitada', C: 'Moderada', D: 'Extensa' },
  q9b: { A: 'Ninguna', B: 'Limitada', C: 'Moderada', D: 'Extensa' },
  q9c: { A: 'Ninguna', B: 'Limitada', C: 'Moderada', D: 'Extensa' },
  q10: { A: 'No dispuesto a asumir más riesgo', B: 'Un poco más de riesgo', C: 'Mucho más riesgo' },
  q11: { A: 'Invertiría más', B: 'Se preocuparía / transferiría parte', C: 'Redimiría la inversión', D: 'No haría cambios' },
}

function PerfilPreview({ data, empresa }: { data: PerfilData; empresa: string }) {
  const score = calcScore(data.answers)
  const profile = scoreToProfile(score)
  const answered = Object.keys(data.answers).length

  return (
    <div>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
        <p style={{ fontSize: '7pt', textAlign: 'right' }}>{EMPRESA_LABEL[empresa] ?? empresa.toUpperCase()}</p>
        <h1 style={{ fontSize: '13pt', textAlign: 'center', fontWeight: 'bold', margin: 0 }}>CUESTIONARIO PARA DEFINIR EL PERFIL DEL INVERSOR</h1>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '8.5pt' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '5%' }}>Nro.</th>
            <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '45%' }}>Pregunta</th>
            <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '35%' }}>Respuesta</th>
            <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '15%' }}>Puntaje</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(Q_LABELS) as string[]).map((q) => {
            const ans = data.answers[q as keyof typeof data.answers]
            const pts = ans ? (SCORES[q as keyof typeof SCORES][ans] ?? 0) : null
            return (
              <tr key={q}>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>{q.replace('q', '').replace('a', 'a').replace('b', 'b').replace('c', 'c')}</td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>{Q_LABELS[q]}</td>
                <td style={{ border: '1px solid #000', padding: '3px 5px' }}>{ans ? `${ans}. ${OPT_LABELS[q]?.[ans] ?? ans}` : ''}</td>
                <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{pts !== null ? pts : ''}</td>
              </tr>
            )
          })}
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <td colSpan={3} style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold', textAlign: 'right' }}>Puntaje obtenido:</td>
            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{answered === 13 ? score : ''}</td>
          </tr>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <td colSpan={3} style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold', textAlign: 'right' }}>Resultado del perfil:</td>
            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
              {answered === 13 ? profile.charAt(0).toUpperCase() + profile.slice(1) : ''}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: '16px', fontSize: '8.5pt' }}>
        <table style={{ borderCollapse: 'collapse', width: '60%' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #000', padding: '3px' }}>Perfil</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>Descripción</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>Puntos</th>
            </tr>
          </thead>
          <tbody>
            {[
              { p: 'Conservador', pts: '0 – 21' },
              { p: 'Moderado', pts: '22 – 43' },
              { p: 'Agresivo', pts: '44 – 62' },
            ].map(({ p, pts }) => (
              <tr key={p} style={{ backgroundColor: profile === p.toLowerCase() && answered === 13 ? '#d1fae5' : 'transparent' }}>
                <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'center', fontWeight: profile === p.toLowerCase() && answered === 13 ? 'bold' : 'normal' }}>{p}</td>
                <td style={{ border: '1px solid #000', padding: '3px' }}></td>
                <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'center' }}>{pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', gap: '60px' }}>
        <div style={{ flex: 1 }}>
          <p style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Firma: {data.nombre_cliente}</p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '8pt' }}>Fecha: {data.firma_fecha}</p>
        </div>
      </div>
    </div>
  )
}

// ── Lista Preview ─────────────────────────────────────────────────────────────

function ListaPreview({ data, tipo, empresa }: { data: ListaData; tipo: string; empresa: string }) {
  const items = tipo === 'pf' ? LISTA_PF_ITEMS : LISTA_PJ_ITEMS
  const getItem = (id: string) => data.items[id] ?? { status: 'pendiente', comentario: '', responsable: '', fecha: '' }

  const MARK: Record<string, string> = { completo: '☒', pendiente: '☐', no_aplica: 'N/A' }

  return (
    <div>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
        <p style={{ fontSize: '7pt', textAlign: 'right' }}>{EMPRESA_LABEL[empresa] ?? empresa.toUpperCase()}</p>
        <h1 style={{ fontSize: '13pt', textAlign: 'center', fontWeight: 'bold', margin: 0 }}>
          Lista de Verificación – {tipo === 'pf' ? 'Persona Física' : 'Persona Jurídica'}
        </h1>
      </div>

      <DocRow label="Fecha" value={data.fecha} />
      <DocRow label="Nombre del Cliente" value={data.nombre_cliente} />
      <DocRow label="Código del Cliente" value={data.codigo_cliente} />

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '10px', fontSize: '8.5pt' }}>
        <tbody>
          {items.map(item => {
            const cur = getItem(item.id)
            return (
              <tr key={item.id}>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '8%', fontWeight: 'bold' }}>{item.id}</td>
                <td style={{ border: '1px solid #000', padding: '4px', width: '70%' }}>
                  {item.label}
                  {item.sub && (
                    <ul style={{ margin: '2px 0 0 12px', padding: 0 }}>
                      {item.sub.map(s => <li key={s} style={{ fontSize: '7.5pt' }}>{s}</li>)}
                    </ul>
                  )}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '10%', fontSize: '12pt' }}>
                  {MARK[cur.status]}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: '7.5pt', width: '12%' }}>
                  {cur.comentario}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '16px', fontSize: '8.5pt' }}>
        <p><strong>Aprobación de la relación comercial</strong></p>
        <p style={{ borderTop: '1px solid #000', marginTop: '20px', paddingTop: '4px' }}>
          FIRMA: {data.aprobado_por} — Aprobada por: ________________________
        </p>
        <p style={{ borderTop: '1px solid #000', marginTop: '20px', paddingTop: '4px' }}>
          <strong>Constancia de las verificaciones efectuadas por Oficial de Cumplimiento</strong><br />
          FIRMA: {data.oficial_cumplimiento}
        </p>
        {data.riesgo === 'ALTO' && (
          <p style={{ borderTop: '1px solid #000', marginTop: '20px', paddingTop: '4px' }}>
            <strong>Solamente para Clientes de Riesgo Alto — Visto Bueno Oficial de Cumplimiento:</strong><br />
            {data.visto_bueno}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Shared preview helpers ────────────────────────────────────────────────────

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <p style={{ fontWeight: 'bold', fontSize: '9pt', borderBottom: '1px solid #000', marginBottom: '4px', paddingBottom: '2px' }}>{title}</p>
      {children}
    </div>
  )
}

function DocRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '2px', fontSize: '8.5pt', alignItems: 'baseline' }}>
      <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: '160px' }}>{label}:</span>
      <span style={{ flex: 1, borderBottom: '1px solid #000', minWidth: '60px', paddingBottom: '1px' }}>{value}</span>
    </div>
  )
}

function DocRow2({ a, b }: { a: { label: string; value: string }; b: { label: string; value: string } }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '2px' }}>
      <div style={{ flex: 1, display: 'flex', gap: '4px', fontSize: '8.5pt', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{a.label}:</span>
        <span style={{ flex: 1, borderBottom: '1px solid #000', paddingBottom: '1px' }}>{a.value}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: '4px', fontSize: '8.5pt', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>{b.label}:</span>
        <span style={{ flex: 1, borderBottom: '1px solid #000', paddingBottom: '1px' }}>{b.value}</span>
      </div>
    </div>
  )
}
