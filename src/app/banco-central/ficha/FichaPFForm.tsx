'use client'
import type { FichaPFData, FichaPFPersona } from './types'
import { emptyPersonaPF } from './types'

interface Props {
  data: FichaPFData
  onChange: (d: FichaPFData) => void
}

const ESTADOS_CIVILES = ['Soltero', 'Casado', 'Concubino', 'Divorciado', 'Viudo']
const TIPOS_DOC = ['CI', 'Pasaporte', 'Otro']

export default function FichaPFForm({ data, onChange }: Props) {
  const set = (patch: Partial<FichaPFData>) => onChange({ ...data, ...patch })

  const setPersona = (idx: number, patch: Partial<FichaPFPersona>) => {
    const personas = [...data.personas]
    personas[idx] = { ...personas[idx], ...patch }
    set({ personas })
  }

  const addPersona = () => set({ personas: [...data.personas, emptyPersonaPF()] })
  const removePersona = (idx: number) => set({ personas: data.personas.filter((_, i) => i !== idx) })

  const setHeader = (field: 'clientes_header' | 'autorizados_header', idx: number, val: string) => {
    const arr = [...data[field]]
    arr[idx] = val
    set({ [field]: arr })
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <Section title="Encabezado">
        <Row label="Código de Cliente">
          <Input value={data.codigo_cliente} onChange={v => set({ codigo_cliente: v })} placeholder="Ej: 7683264" />
        </Row>

        <div className="mt-3">
          <Label>CLIENTES — Nombres y apellidos</Label>
          {data.clientes_header.map((n, i) => (
            <div key={i} className="flex gap-2 mt-1.5">
              <Input value={n} onChange={v => setHeader('clientes_header', i, v)} placeholder={`Cliente ${i + 1}`} />
              {i === data.clientes_header.length - 1 && (
                <button onClick={() => set({ clientes_header: [...data.clientes_header, ''] })}
                  className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-green-500 hover:text-green-600 text-lg">+</button>
              )}
              {data.clientes_header.length > 1 && (
                <button onClick={() => set({ clientes_header: data.clientes_header.filter((_, j) => j !== i) })}
                  className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-500 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Label>AUTORIZADOS / APODERADOS — Nombres y apellidos</Label>
          {data.autorizados_header.map((n, i) => (
            <div key={i} className="flex gap-2 mt-1.5">
              <Input value={n} onChange={v => setHeader('autorizados_header', i, v)} placeholder={`Autorizado ${i + 1}`} />
              {i === data.autorizados_header.length - 1 && (
                <button onClick={() => set({ autorizados_header: [...data.autorizados_header, ''] })}
                  className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-green-500 hover:text-green-600 text-lg">+</button>
              )}
              {data.autorizados_header.length > 1 && (
                <button onClick={() => set({ autorizados_header: data.autorizados_header.filter((_, j) => j !== i) })}
                  className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-500 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <Label>Sírvase indicar si actúa por:</Label>
          <div className="flex gap-4">
            {[{ v: 'propia', l: 'Cuenta propia' }, { v: 'tercero', l: 'Cuenta de un tercero' }].map(({ v, l }) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="actua_por" checked={data.actua_por === v} onChange={() => set({ actua_por: v as any })} className="accent-green-600" />
                {l}
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* Personas */}
      {data.personas.map((p, idx) => {
        const isLast = idx === data.personas.length - 1
        const sectionTitle = idx === 0
          ? 'A. Identificación del Cliente — Titular'
          : `A. Identificación del Cliente — Beneficiario / Apoderado ${idx + 1}`
        return (
          <Section
            key={idx}
            title={sectionTitle}
            action={idx > 0 ? (
              <button onClick={() => removePersona(idx)} className="text-xs text-red-400 hover:text-red-600">
                Eliminar
              </button>
            ) : null}
          >
            <PersonaForm persona={p} onChange={patch => setPersona(idx, patch)} />

            {isLast && (
              <button
                onClick={addPersona}
                className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#2D3F52] hover:text-[#2D3F52] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar beneficiario o apoderado
              </button>
            )}
          </Section>
        )
      })}
    </div>
  )
}

function PersonaForm({ persona: p, onChange }: { persona: FichaPFPersona; onChange: (patch: Partial<FichaPFPersona>) => void }) {
  return (
    <div className="space-y-4">
      <Row label="Tipo">
        <select value={p.tipo_titular} onChange={e => onChange({ tipo_titular: e.target.value as any })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]">
          <option>Titular</option>
          <option>Apoderado/Autorizado</option>
          <option>Beneficiario Final</option>
        </select>
      </Row>
      <Row label="Código de Beneficiario Final">
        <Input value={p.codigo_beneficiario} onChange={v => onChange({ codigo_beneficiario: v })} />
      </Row>

      <Grid2>
        <Row label="Apellidos">
          <Input value={p.apellidos} onChange={v => onChange({ apellidos: v })} />
        </Row>
        <Row label="Nombres">
          <Input value={p.nombres} onChange={v => onChange({ nombres: v })} />
        </Row>
        <Row label="Fecha de nacimiento">
          <Input value={p.fecha_nacimiento} onChange={v => onChange({ fecha_nacimiento: v })} placeholder="DD/MM/AAAA" />
        </Row>
        <Row label="Lugar de nacimiento">
          <Input value={p.lugar_nacimiento} onChange={v => onChange({ lugar_nacimiento: v })} />
        </Row>
        <Row label="Tipo de documento">
          <select value={p.tipo_documento} onChange={e => onChange({ tipo_documento: e.target.value as any })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]">
            {TIPOS_DOC.map(t => <option key={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Número de documento">
          <Input value={p.numero_documento} onChange={v => onChange({ numero_documento: v })} />
        </Row>
        <Row label="País de emisión">
          <Input value={p.pais_emision} onChange={v => onChange({ pais_emision: v })} />
        </Row>
        <Row label="Estado civil">
          <select value={p.estado_civil} onChange={e => onChange({ estado_civil: e.target.value as any })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A]">
            <option value="">— Seleccionar —</option>
            {ESTADOS_CIVILES.map(ec => <option key={ec}>{ec}</option>)}
          </select>
        </Row>
      </Grid2>

      {(p.estado_civil === 'Casado' || p.estado_civil === 'Concubino') && (
        <Grid2>
          <Row label="Nombre de cónyuge/concubino">
            <Input value={p.conyuge_nombre} onChange={v => onChange({ conyuge_nombre: v })} />
          </Row>
          <Row label="Tipo de documento del cónyuge">
            <Input value={p.conyuge_tipo_doc} onChange={v => onChange({ conyuge_tipo_doc: v })} />
          </Row>
          <Row label="Número de documento del cónyuge">
            <Input value={p.conyuge_numero_doc} onChange={v => onChange({ conyuge_numero_doc: v })} />
          </Row>
        </Grid2>
      )}

      <Row label="Domicilio">
        <Input value={p.domicilio} onChange={v => onChange({ domicilio: v })} placeholder="Calle y número, barrio" />
      </Row>
      <Grid2>
        <Row label="Ciudad y código postal">
          <Input value={p.ciudad_cp} onChange={v => onChange({ ciudad_cp: v })} />
        </Row>
        <Row label="País">
          <Input value={p.pais} onChange={v => onChange({ pais: v })} />
        </Row>
        <Row label="Teléfono">
          <Input value={p.telefono} onChange={v => onChange({ telefono: v })} />
        </Row>
        <Row label="Celular">
          <Input value={p.celular} onChange={v => onChange({ celular: v })} />
        </Row>
      </Grid2>
      <Row label="E-mail">
        <Input value={p.email} onChange={v => onChange({ email: v })} type="email" />
      </Row>
      <Grid2>
        <Row label="Profesión / oficio / actividad">
          <Input value={p.profesion} onChange={v => onChange({ profesion: v })} />
        </Row>
        <Row label="Institución">
          <Input value={p.institucion} onChange={v => onChange({ institucion: v })} />
        </Row>
        <Row label="Volumen de ingresos anuales (USD)">
          <Input value={p.ingresos_anuales_usd} onChange={v => onChange({ ingresos_anuales_usd: v })} placeholder="Ej: 25.000" />
        </Row>
        <Row label="Cuenta u usuario mensajería">
          <Input value={p.mensajeria} onChange={v => onChange({ mensajeria: v })} />
        </Row>
        <Row label="Usuario página web asesor">
          <Input value={p.usuario_web} onChange={v => onChange({ usuario_web: v })} />
        </Row>
      </Grid2>

      {/* PEP */}
      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={p.es_pep} onChange={e => onChange({ es_pep: e.target.checked })} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm font-medium text-amber-900">Persona Políticamente Expuesta (P.E.P.)</span>
        </label>
        {p.es_pep && (
          <div className="mt-2">
            <Label>Cargo Público desempeñado en los últimos cinco años:</Label>
            <Input value={p.cargo_publico} onChange={v => onChange({ cargo_publico: v })} />
          </div>
        )}
      </div>

      {/* Residencia fiscal */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Declaración de Residencia Fiscal</p>
        <Grid2>
          <Row label="País de residencia fiscal">
            <Input value={p.pais_residencia_fiscal} onChange={v => onChange({ pais_residencia_fiscal: v })} />
          </Row>
          <Row label="Número de identificación fiscal">
            <Input value={p.numero_fiscal} onChange={v => onChange({ numero_fiscal: v })} />
          </Row>
        </Grid2>
        <div className="text-xs text-gray-500">
          <p className="mb-1">Si no posee número de identificación fiscal, indique el motivo:</p>
          {[
            { v: 'motivo1', l: 'El país no emite NIF a sus residentes.' },
            { v: 'motivo2', l: 'El titular no puede obtener NIF.' },
            { v: 'motivo3', l: 'No se requiere NIF según la legislación de esa jurisdicción.' },
          ].map(({ v, l }) => (
            <label key={v} className="flex items-start gap-2 mt-1 cursor-pointer">
              <input type="radio" name={`motivo_fiscal_${p.apellidos}`} checked={p.motivo_sin_fiscal === v}
                onChange={() => onChange({ motivo_sin_fiscal: v as any })} className="mt-0.5 accent-gray-500" />
              <span>{l}</span>
            </label>
          ))}
          {p.motivo_sin_fiscal && (
            <button onClick={() => onChange({ motivo_sin_fiscal: '' })} className="mt-1 text-gray-400 underline text-[11px]">Limpiar selección</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-gray-500 mb-1">{children}</p>
}

function Input({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type ?? 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A] transition-colors"
    />
  )
}
