'use client'
import type { FichaPJData, FichaPJAccionista, FichaPJRepresentante, FichaPFPersona } from './types'
import { emptyPersonaPF } from './types'

interface Props {
  data: FichaPJData
  onChange: (d: FichaPJData) => void
}

export default function FichaPJForm({ data, onChange }: Props) {
  const set = (patch: Partial<FichaPJData>) => onChange({ ...data, ...patch })

  const setPersona = (idx: number, patch: Partial<FichaPFPersona>) => {
    const personas = [...data.personas]
    personas[idx] = { ...personas[idx], ...patch }
    set({ personas })
  }

  const setAccionista = (idx: number, patch: Partial<FichaPJAccionista>) => {
    const accionistas = [...data.accionistas]
    accionistas[idx] = { ...accionistas[idx], ...patch }
    set({ accionistas })
  }

  const setRepresentante = (idx: number, patch: Partial<FichaPJRepresentante>) => {
    const arr = [...data.representantes_detalle]
    arr[idx] = { ...arr[idx], ...patch }
    set({ representantes_detalle: arr })
  }

  const setHeader = (field: 'representantes_header' | 'autorizados_header', idx: number, val: string) => {
    const arr = [...data[field]]
    arr[idx] = val
    set({ [field]: arr })
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <Section title="Encabezado">
        <Row label="Código de Cliente">
          <Input value={data.codigo_cliente} onChange={v => set({ codigo_cliente: v })} />
        </Row>
        <div className="mt-3">
          <Row label="Razón Social">
            <Input value={data.razon_social} onChange={v => set({ razon_social: v })} />
          </Row>
        </div>

        <div className="mt-3">
          <Label>REPRESENTANTES — Nombres y apellidos</Label>
          {data.representantes_header.map((n, i) => (
            <ListRow key={i} value={n} onChange={v => setHeader('representantes_header', i, v)}
              canRemove={data.representantes_header.length > 1}
              onRemove={() => set({ representantes_header: data.representantes_header.filter((_, j) => j !== i) })}
              onAdd={i === data.representantes_header.length - 1 ? () => set({ representantes_header: [...data.representantes_header, ''] }) : undefined} />
          ))}
        </div>

        <div className="mt-3">
          <Label>AUTORIZADOS / APODERADOS — Nombres y apellidos</Label>
          {data.autorizados_header.map((n, i) => (
            <ListRow key={i} value={n} onChange={v => setHeader('autorizados_header', i, v)}
              canRemove={data.autorizados_header.length > 1}
              onRemove={() => set({ autorizados_header: data.autorizados_header.filter((_, j) => j !== i) })}
              onAdd={i === data.autorizados_header.length - 1 ? () => set({ autorizados_header: [...data.autorizados_header, ''] }) : undefined} />
          ))}
        </div>

        <div className="mt-4">
          <Label>¿La SOCIEDAD es una Entidad No Financiera Pasiva?</Label>
          <div className="flex gap-4 mt-1">
            {[{ v: true, l: 'SÍ' }, { v: false, l: 'NO' }].map(({ v, l }) => (
              <label key={l} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" checked={data.tipo_entidad_pasiva === v} onChange={() => set({ tipo_entidad_pasiva: v })} className="accent-green-600" />
                {l}
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* Section A */}
      <Section title="A. Identificación del Cliente — Persona Jurídica">
        <Grid2>
          <Row label="Razón y tipo social">
            <Input value={data.razon_tipo_social} onChange={v => set({ razon_tipo_social: v })} />
          </Row>
          <Row label="Nombre comercial">
            <Input value={data.nombre_comercial} onChange={v => set({ nombre_comercial: v })} />
          </Row>
          <Row label="Fecha de constitución">
            <Input value={data.fecha_constitucion} onChange={v => set({ fecha_constitucion: v })} placeholder="DD/MM/AAAA" />
          </Row>
          <Row label="Lugar de constitución">
            <Input value={data.lugar_constitucion} onChange={v => set({ lugar_constitucion: v })} />
          </Row>
          <Row label="País de emisión">
            <Input value={data.pais_emision} onChange={v => set({ pais_emision: v })} />
          </Row>
          <Row label="Número de Identificación tributario">
            <Input value={data.numero_tributario} onChange={v => set({ numero_tributario: v })} />
          </Row>
        </Grid2>
        <div className="mt-3 space-y-3">
          <Row label="Sede social">
            <Input value={data.sede_social} onChange={v => set({ sede_social: v })} />
          </Row>
          <Row label="Localidad / Depto / País">
            <Input value={data.localidad} onChange={v => set({ localidad: v })} />
          </Row>
          <Grid2>
            <Row label="Teléfono/Celular">
              <Input value={data.telefono} onChange={v => set({ telefono: v })} />
            </Row>
            <Row label="Email">
              <Input value={data.email} onChange={v => set({ email: v })} type="email" />
            </Row>
            <Row label="Actividad Principal">
              <Input value={data.actividad_principal} onChange={v => set({ actividad_principal: v })} />
            </Row>
            <Row label="Volumen de ingresos anuales (USD)">
              <Input value={data.ingresos_anuales_usd} onChange={v => set({ ingresos_anuales_usd: v })} />
            </Row>
          </Grid2>
        </div>
        <div className="mt-4 p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Declaración de Residencia Fiscal</p>
          <Grid2>
            <Row label="País / jurisdicción de residencia fiscal">
              <Input value={data.pais_residencia_fiscal} onChange={v => set({ pais_residencia_fiscal: v })} />
            </Row>
            <Row label="Número de identificación fiscal">
              <Input value={data.numero_fiscal} onChange={v => set({ numero_fiscal: v })} />
            </Row>
          </Grid2>
          {[
            { v: 'motivo1', l: 'El país no emite NIF a sus residentes.' },
            { v: 'motivo2', l: 'El titular no puede obtener NIF.' },
            { v: 'motivo3', l: 'No se requiere NIF según la legislación de esa jurisdicción.' },
          ].map(({ v, l }) => (
            <label key={v} className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
              <input type="radio" name="motivo_fiscal_pj" checked={data.motivo_sin_fiscal === v}
                onChange={() => set({ motivo_sin_fiscal: v as any })} className="mt-0.5 accent-gray-500" />
              {l}
            </label>
          ))}
        </div>
      </Section>

      {/* Section B — Accionistas */}
      <Section title="B. Declaración de Accionistas y Beneficiarios Finales">
        <p className="text-xs text-gray-400 mb-3">Identificar propietarios con participación superior al 15%.</p>
        <div className="space-y-3">
          {data.accionistas.map((a, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500">Accionista {i + 1}</span>
                {data.accionistas.length > 1 && (
                  <button onClick={() => set({ accionistas: data.accionistas.filter((_, j) => j !== i) })} className="text-xs text-red-400 hover:text-red-600">✕</button>
                )}
              </div>
              <Grid2>
                <div className="col-span-2">
                  <Row label="Nombres y Apellidos">
                    <Input value={a.nombres_apellidos} onChange={v => setAccionista(i, { nombres_apellidos: v })} />
                  </Row>
                </div>
                <Row label="Participación (%)">
                  <Input value={a.participacion} onChange={v => setAccionista(i, { participacion: v })} placeholder="Ej: 51%" />
                </Row>
                <Row label="Código Beneficiario Final">
                  <Input value={a.codigo_beneficiario} onChange={v => setAccionista(i, { codigo_beneficiario: v })} />
                </Row>
              </Grid2>
              <label className="flex items-center gap-2 mt-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={a.es_beneficiario_final} onChange={e => setAccionista(i, { es_beneficiario_final: e.target.checked })} className="accent-green-600" />
                Es Beneficiario Final
              </label>
            </div>
          ))}
          <button onClick={() => set({ accionistas: [...data.accionistas, { nombres_apellidos: '', participacion: '', es_beneficiario_final: false, codigo_beneficiario: '' }] })}
            className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors">
            + Agregar accionista
          </button>
        </div>
      </Section>

      {/* Section C — Representantes detalle */}
      <Section title="C. Representantes, Apoderados y Autorizados">
        <div className="space-y-2">
          {data.representantes_detalle.map((r, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Row label={`Representante ${i + 1}`}>
                  <Input value={r.nombres_apellidos} onChange={v => setRepresentante(i, { nombres_apellidos: v })} />
                </Row>
              </div>
              <div className="w-36 shrink-0">
                <Row label="Tipo">
                  <select value={r.tipo} onChange={e => setRepresentante(i, { tipo: e.target.value as any })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white outline-none focus:border-[#16A34A]">
                    <option>Representante</option>
                    <option>Apoderado/Autorizado</option>
                  </select>
                </Row>
              </div>
              {data.representantes_detalle.length > 1 && (
                <button onClick={() => set({ representantes_detalle: data.representantes_detalle.filter((_, j) => j !== i) })}
                  className="h-9 px-2 text-gray-400 hover:text-red-500 text-sm mb-0.5">✕</button>
              )}
            </div>
          ))}
          <button onClick={() => set({ representantes_detalle: [...data.representantes_detalle, { nombres_apellidos: '', tipo: 'Representante' }] })}
            className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors">
            + Agregar representante
          </button>
        </div>
      </Section>

      {/* Section D — Datos identificatorios de personas */}
      {data.personas.map((p, idx) => {
          return (
          <Section key={idx} title={`D. Datos Identificatorios — Persona ${idx + 1}`}
            action={idx > 0 ? <button onClick={() => set({ personas: data.personas.filter((_, i) => i !== idx) })} className="text-xs text-red-400">Eliminar</button> : null}>
            <PersonaSimpleForm persona={p} onChange={patch => setPersona(idx, patch)} />
          </Section>
        )
      })}

      <button onClick={() => set({ personas: [...data.personas, { ...emptyPersonaPF(), tipo_titular: 'Titular' }] })}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors">
        + Agregar datos identificatorios de persona adicional
      </button>
    </div>
  )
}

function PersonaSimpleForm({ persona: p, onChange }: { persona: FichaPFPersona; onChange: (patch: Partial<FichaPFPersona>) => void }) {
  const TIPOS_DOC = ['CI', 'Pasaporte', 'RUT', 'Otro']
  return (
    <div className="space-y-3">
      <Grid2>
        <Row label="Apellidos / Razón Social">
          <Input value={p.apellidos} onChange={v => onChange({ apellidos: v })} />
        </Row>
        <Row label="Nombres">
          <Input value={p.nombres} onChange={v => onChange({ nombres: v })} />
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
        <Row label="Fecha de nacimiento">
          <Input value={p.fecha_nacimiento} onChange={v => onChange({ fecha_nacimiento: v })} placeholder="DD/MM/AAAA" />
        </Row>
        <Row label="Domicilio">
          <Input value={p.domicilio} onChange={v => onChange({ domicilio: v })} />
        </Row>
        <Row label="País">
          <Input value={p.pais} onChange={v => onChange({ pais: v })} />
        </Row>
        <Row label="Teléfono">
          <Input value={p.telefono} onChange={v => onChange({ telefono: v })} />
        </Row>
        <Row label="Email">
          <Input value={p.email} onChange={v => onChange({ email: v })} />
        </Row>
        <Row label="País residencia fiscal">
          <Input value={p.pais_residencia_fiscal} onChange={v => onChange({ pais_residencia_fiscal: v })} />
        </Row>
        <Row label="Número fiscal">
          <Input value={p.numero_fiscal} onChange={v => onChange({ numero_fiscal: v })} />
        </Row>
      </Grid2>
      <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer mt-1">
        <input type="checkbox" checked={p.es_pep} onChange={e => onChange({ es_pep: e.target.checked })} className="accent-amber-500" />
        Persona Políticamente Expuesta (P.E.P.)
      </label>
      {p.es_pep && <Input value={p.cargo_publico} onChange={v => onChange({ cargo_publico: v })} placeholder="Cargo público en últimos 5 años" />}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ListRow({ value, onChange, canRemove, onRemove, onAdd }: { value: string; onChange: (v: string) => void; canRemove: boolean; onRemove: () => void; onAdd?: () => void }) {
  return (
    <div className="flex gap-2 mt-1.5">
      <Input value={value} onChange={onChange} />
      {onAdd && <button onClick={onAdd} className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-green-500 hover:text-green-600 text-lg">+</button>}
      {canRemove && <button onClick={onRemove} className="shrink-0 w-8 h-9 rounded border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-500 text-sm">✕</button>}
    </div>
  )
}

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
    <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#16A34A] transition-colors" />
  )
}
