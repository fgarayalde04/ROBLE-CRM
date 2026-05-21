'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { FileType } from '@/types/platform'

type Step = 'select' | 'preview' | 'map' | 'confirm'

const FILE_TYPES: { value: FileType; label: string; desc: string; fields: { key: string; label: string; required: boolean }[] }[] = [
  {
    value: 'aum',
    label: 'AUM',
    desc: 'Activos bajo gestión por cliente y período',
    fields: [
      { key: 'period', label: 'Período (YYYY-MM)', required: true },
      { key: 'client_name', label: 'Nombre del cliente', required: false },
      { key: 'aum_value', label: 'Valor AUM (número)', required: true },
      { key: 'segment', label: 'Segmento', required: false },
      { key: 'currency', label: 'Moneda', required: false },
    ],
  },
  {
    value: 'production',
    label: 'Produccion',
    desc: 'Producción por asesor, cliente y período',
    fields: [
      { key: 'period', label: 'Período (YYYY-MM)', required: true },
      { key: 'production_value', label: 'Valor producción (número)', required: true },
      { key: 'advisor', label: 'Asesor', required: false },
      { key: 'client_name', label: 'Nombre del cliente', required: false },
      { key: 'product_type', label: 'Tipo de producto', required: false },
      { key: 'currency', label: 'Moneda', required: false },
    ],
  },
  {
    value: 'revenue',
    label: 'Ingresos / Comisiones',
    desc: 'Ingresos y comisiones por período',
    fields: [
      { key: 'period', label: 'Período (YYYY-MM)', required: true },
      { key: 'value', label: 'Valor (número)', required: true },
      { key: 'revenue_type', label: 'Tipo de ingreso', required: false },
      { key: 'currency', label: 'Moneda', required: false },
      { key: 'notes', label: 'Notas', required: false },
    ],
  },
]

const TABLE_MAP: Record<FileType, string> = {
  aum: 'aum_records',
  production: 'production_records',
  revenue: 'revenue_records',
  clients: 'clients',
  pipeline: 'account_openings',
  other: 'business_metrics',
}

const VALUE_FIELDS: Record<string, string> = {
  aum: 'aum_value',
  production: 'production_value',
  revenue: 'value',
}

function parseNumber(v: any): number {
  if (typeof v === 'number') return v
  const s = String(v).replace(/[$,\s]/g, '').replace(',', '.')
  return parseFloat(s) || 0
}

function normalizePeriod(v: any): string {
  const s = String(v).trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const [m, y] = s.split('/')
    return `${y}-${m.padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7)
  return s
}

export default function ImportWizard() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [fileType, setFileType] = useState<FileType>('aum')
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<Record<string, any>[]>([])
  const [allRows, setAllRows] = useState<Record<string, any>[]>([])
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeConfig = FILE_TYPES.find((t) => t.value === fileType)!

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFileName(file.name)
    setLoading(true)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[]

      if (rows.length === 0) throw new Error('El archivo está vacío o no tiene datos reconocibles.')

      const hdrs = Object.keys(rows[0])
      setHeaders(hdrs)
      setAllRows(rows)
      setPreview(rows.slice(0, 5))

      const autoMap: Record<string, string> = {}
      for (const field of typeConfig.fields) {
        const match = hdrs.find(
          (h) =>
            h.toLowerCase().includes(field.key.toLowerCase()) ||
            field.key.toLowerCase().includes(h.toLowerCase().replace(/\s/g, '_'))
        )
        if (match) autoMap[field.key] = match
      }
      setMapping(autoMap)
      setStep('preview')
    } catch (err: any) {
      setError(err.message ?? 'Error leyendo el archivo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const valueField = VALUE_FIELDS[fileType]

      const { data: fileRecord, error: fileErr } = await supabase
        .from('uploaded_files')
        .insert({
          file_name: fileName,
          file_type: fileType,
          row_count: allRows.length,
          status: 'procesado',
        })
        .select()
        .single()
      if (fileErr) throw fileErr

      const rows = allRows.map((raw) => {
        const row: Record<string, any> = { source_file: fileRecord.id, currency: 'USD' }
        for (const field of typeConfig.fields) {
          const col = mapping[field.key]
          if (!col) continue
          const val = raw[col]
          if (field.key === 'period') {
            row[field.key] = normalizePeriod(val)
          } else if (field.key === valueField) {
            row[field.key] = parseNumber(val)
          } else {
            row[field.key] = val ?? null
          }
        }
        return row
      }).filter((r) => r[valueField] > 0 || !valueField)

      const table = TABLE_MAP[fileType]
      const BATCH = 200
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error: insertErr } = await supabase.from(table).insert(rows.slice(i, i + BATCH))
        if (insertErr) throw insertErr
      }

      setStep('confirm')
    } catch (err: any) {
      setError(err.message ?? 'Error importando datos.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-lg text-center py-12">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Importacion completada</h2>
        <p className="text-sm text-gray-500 mb-6">
          {allRows.length} registros importados desde {fileName}
        </p>
        <div className="flex justify-center gap-3">
          <a
            href="/ceo"
            className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors"
          >
            Ver dashboard
          </a>
          <button
            onClick={() => {
              setStep('select')
              setHeaders([])
              setPreview([])
              setAllRows([])
              setFileName('')
              setMapping({})
              if (fileRef.current) fileRef.current.value = ''
            }}
            className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50 transition-colors"
          >
            Importar otro archivo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {/* Step 1: Seleccionar tipo */}
      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">1. Tipo de datos</h2>
        <div className="grid grid-cols-3 gap-3">
          {FILE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setFileType(t.value)}
              className={`text-left p-3 rounded-lg border-2 transition-colors ${
                fileType === t.value
                  ? 'border-[#16A34A] bg-[rgba(196,163,90,0.08)]'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`text-sm font-medium ${fileType === t.value ? 'text-[#16A34A]' : 'text-gray-700'}`}>
                {t.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Step 2: Subir archivo */}
      <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">2. Seleccionar archivo</h2>
        <div
          className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-gray-300 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-gray-500">
            {fileName || 'Hacer clic para seleccionar archivo Excel o CSV'}
          </p>
          <p className="text-xs text-gray-300 mt-1">Formatos: .xlsx, .xls, .csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        {loading && <p className="text-xs text-gray-400 text-center">Leyendo archivo...</p>}
      </section>

      {/* Step 3: Preview + mapeo */}
      {step === 'preview' && (
        <>
          <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">3. Mapeo de columnas</h2>
            <p className="text-xs text-gray-400">
              Asigna cada campo del sistema a la columna correspondiente en tu archivo. Columnas detectadas: {headers.length}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {typeConfig.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => setMapping((p) => ({ ...p, [field.key]: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-gray-900"
                  >
                    <option value="">— No mapear —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Vista previa — primeras 5 filas de {allRows.length} total
              </h2>
            </div>
            <div className="overflow-x-auto rounded border border-gray-100">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[150px] truncate">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={loading || typeConfig.fields.filter((f) => f.required).some((f) => !mapping[f.key])}
              className="px-5 py-2 bg-[#2D3F52] text-white text-sm rounded hover:bg-[#354A5E] transition-colors disabled:opacity-50"
            >
              {loading ? 'Importando...' : `Importar ${allRows.length} registros`}
            </button>
            <button
              type="button"
              onClick={() => { setStep('select'); setFileName(''); setHeaders([]); setPreview([]); if (fileRef.current) fileRef.current.value = '' }}
              className="px-5 py-2 border border-gray-200 text-gray-600 text-sm rounded hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
