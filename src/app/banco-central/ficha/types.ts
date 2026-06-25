export type Empresa = 'roble' | 'geliene'
export type TipoCliente = 'pf' | 'pj'
export type OptionKey = 'A' | 'B' | 'C' | 'D'
export type QuestionKey = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9a' | 'q9b' | 'q9c' | 'q10' | 'q11'
export type ItemStatus = 'completo' | 'pendiente' | 'no_aplica'

export interface FichaPFPersona {
  tipo_titular: 'Titular' | 'Apoderado/Autorizado' | 'Beneficiario Final'
  codigo_beneficiario: string
  apellidos: string
  nombres: string
  fecha_nacimiento: string
  lugar_nacimiento: string
  tipo_documento: 'CI' | 'Pasaporte' | 'Otro'
  numero_documento: string
  pais_emision: string
  estado_civil: 'Soltero' | 'Casado' | 'Concubino' | 'Divorciado' | 'Viudo' | ''
  conyuge_nombre: string
  conyuge_tipo_doc: string
  conyuge_numero_doc: string
  domicilio: string
  ciudad_cp: string
  pais: string
  telefono: string
  celular: string
  email: string
  profesion: string
  institucion: string
  ingresos_anuales_usd: string
  mensajeria: string
  usuario_web: string
  es_pep: boolean
  cargo_publico: string
  pais_residencia_fiscal: string
  numero_fiscal: string
  motivo_sin_fiscal: '' | 'motivo1' | 'motivo2' | 'motivo3'
}

export function emptyPersonaPF(): FichaPFPersona {
  return {
    tipo_titular: 'Titular',
    codigo_beneficiario: '',
    apellidos: '',
    nombres: '',
    fecha_nacimiento: '',
    lugar_nacimiento: '',
    tipo_documento: 'CI',
    numero_documento: '',
    pais_emision: 'URUGUAY',
    estado_civil: '',
    conyuge_nombre: '',
    conyuge_tipo_doc: '',
    conyuge_numero_doc: '',
    domicilio: '',
    ciudad_cp: '',
    pais: 'URUGUAY',
    telefono: '',
    celular: '',
    email: '',
    profesion: '',
    institucion: '',
    ingresos_anuales_usd: '',
    mensajeria: '',
    usuario_web: '',
    es_pep: false,
    cargo_publico: '',
    pais_residencia_fiscal: 'URUGUAY',
    numero_fiscal: '',
    motivo_sin_fiscal: '',
  }
}

export interface FichaPFData {
  codigo_cliente: string
  clientes_header: string[] // display names en la cabecera
  autorizados_header: string[]
  actua_por: 'propia' | 'tercero'
  tipo_ordenes: 'escrita'
  personas: FichaPFPersona[]
}

export function emptyFichaPF(): FichaPFData {
  return {
    codigo_cliente: '',
    clientes_header: [''],
    autorizados_header: [''],
    actua_por: 'propia',
    tipo_ordenes: 'escrita',
    personas: [emptyPersonaPF()],
  }
}

export interface FichaPJAccionista {
  nombres_apellidos: string
  participacion: string
  es_beneficiario_final: boolean
  codigo_beneficiario: string
}

export interface FichaPJRepresentante {
  nombres_apellidos: string
  tipo: 'Representante' | 'Apoderado/Autorizado'
}

export interface FichaPJData {
  codigo_cliente: string
  razon_social: string
  representantes_header: string[]
  autorizados_header: string[]
  tipo_entidad_pasiva: boolean | null
  tipo_ordenes: 'escrita'
  // Section A
  razon_tipo_social: string
  nombre_comercial: string
  fecha_constitucion: string
  lugar_constitucion: string
  pais_emision: string
  numero_tributario: string
  sede_social: string
  localidad: string
  telefono: string
  email: string
  mensajeria: string
  usuario_web: string
  actividad_principal: string
  ingresos_anuales_usd: string
  pais_residencia_fiscal: string
  numero_fiscal: string
  motivo_sin_fiscal: '' | 'motivo1' | 'motivo2' | 'motivo3'
  // Section B
  accionistas: FichaPJAccionista[]
  // Section C
  representantes_detalle: FichaPJRepresentante[]
  // Section D - personas identificacion (same structure as PF)
  personas: FichaPFPersona[]
}

export function emptyFichaPJ(): FichaPJData {
  return {
    codigo_cliente: '',
    razon_social: '',
    representantes_header: [''],
    autorizados_header: [''],
    tipo_entidad_pasiva: null,
    tipo_ordenes: 'escrita',
    razon_tipo_social: '',
    nombre_comercial: '',
    fecha_constitucion: '',
    lugar_constitucion: '',
    pais_emision: 'URUGUAY',
    numero_tributario: '',
    sede_social: '',
    localidad: '',
    telefono: '',
    email: '',
    mensajeria: '',
    usuario_web: '',
    actividad_principal: '',
    ingresos_anuales_usd: '',
    pais_residencia_fiscal: 'URUGUAY',
    numero_fiscal: '',
    motivo_sin_fiscal: '',
    accionistas: [{ nombres_apellidos: '', participacion: '', es_beneficiario_final: false, codigo_beneficiario: '' }],
    representantes_detalle: [{ nombres_apellidos: '', tipo: 'Representante' }],
    personas: [{ ...emptyPersonaPF(), tipo_titular: 'Titular' }],
  }
}

export interface PerfilData {
  answers: Partial<Record<QuestionKey, OptionKey>>
  firma_fecha: string
  nombre_cliente: string
}

export function emptyPerfil(): PerfilData {
  return { answers: {}, firma_fecha: '', nombre_cliente: '' }
}

export interface ListaItem {
  status: ItemStatus
  comentario: string
  responsable: string
  fecha: string
}

export interface ListaData {
  fecha: string
  nombre_cliente: string
  codigo_cliente: string
  items: Record<string, ListaItem>
  riesgo: 'ALTO' | 'MEDIO' | 'BAJO' | ''
  aprobado_por: string
  oficial_cumplimiento: string
  visto_bueno: string
}

export function emptyLista(): ListaData {
  return {
    fecha: '',
    nombre_cliente: '',
    codigo_cliente: '',
    items: {},
    riesgo: '',
    aprobado_por: '',
    oficial_cumplimiento: '',
    visto_bueno: '',
  }
}

export interface BcFicha {
  id: string
  empresa: Empresa
  tipo_cliente: TipoCliente
  client_id: string | null
  client_name: string | null
  ficha_data: FichaPFData | FichaPJData
  perfil_data: PerfilData
  lista_data: ListaData
  perfil_score: number | null
  perfil_result: string | null
  created_at: string
  updated_at: string
}

// Scoring
export const SCORES: Record<QuestionKey, Partial<Record<OptionKey, number>>> = {
  q1:  { A: 3,  B: 2,  C: 1,  D: 0 },
  q2:  { A: 7,  B: 5,  C: 2 },
  q3:  { A: 2,  B: 1,  C: 0 },
  q4:  { A: 1,  B: 0 },
  q5:  { A: 11, B: 8,  C: 6,  D: 2 },
  q6:  { A: 7,  B: 3,  C: 0,  D: 0 },
  q7:  { A: 0,  B: 1,  C: 3,  D: 5 },
  q8:  { A: 0,  B: 1,  C: 4 },
  q9a: { A: 0,  B: 0,  C: 1,  D: 4 },
  q9b: { A: 0,  B: 0,  C: 1,  D: 4 },
  q9c: { A: 0,  B: 0,  C: 1,  D: 4 },
  q10: { A: 0,  B: 3,  C: 6 },
  q11: { A: 4,  B: 3,  C: 2,  D: 0 },
}

export function calcScore(answers: Partial<Record<QuestionKey, OptionKey>>): number {
  let total = 0
  for (const [q, opt] of Object.entries(answers) as [QuestionKey, OptionKey][]) {
    total += SCORES[q]?.[opt] ?? 0
  }
  return total
}

export function scoreToProfile(score: number): 'conservador' | 'moderado' | 'agresivo' {
  if (score <= 21) return 'conservador'
  if (score <= 43) return 'moderado'
  return 'agresivo'
}

// Lista de verificación items
export const LISTA_PF_ITEMS: { id: string; label: string; sub?: string[] }[] = [
  { id: '1', label: 'Formulario "Ficha del Cliente" completo.' },
  { id: '2', label: 'Fotocopia de Documento de Identidad de Cliente.' },
  { id: '3', label: 'Fotocopia de Documento de Identidad de Autorizados (mandatarios, apoderados, etc.), en caso de corresponder.' },
  { id: '4', label: 'Fotocopia de Documento de Identidad de Beneficiario Final, en caso de corresponder.' },
  { id: '5', label: 'Documentación que acredite la existencia de Autorizados (Apoderados, Mandatarios, etc.), si corresponde.' },
  { id: '6', label: 'Cuestionario Perfil del Inversor.' },
  { id: '7', label: 'Documentación de respaldo de la actividad económica del Cliente y del origen de los fondos, en caso de corresponder.' },
  { id: '8', label: 'Copia de Declaración Jurada o documentación equivalente presentada ante la administración tributaria correspondiente, en caso de corresponder.' },
  { id: '9', label: 'Informe Circunstanciado, en caso de corresponder.' },
  { id: '10', label: 'Verificación de antecedentes (ONU, OFAC, otras).', sub: ['Titulares', 'Mandatarios, Apoderados, Autorizados', 'Beneficiario Final'] },
  { id: '11', label: 'Evaluación de Riesgo (ALTO, MEDIO, BAJO)' },
  { id: '12', label: 'Aprobación de la relación comercial' },
  { id: '13', label: 'Constancia de las verificaciones efectuadas por Oficial de Cumplimiento' },
]

export const LISTA_PJ_ITEMS: { id: string; label: string; sub?: string[] }[] = [
  { id: '1', label: 'Formulario "Ficha del Cliente" completo.' },
  { id: '2', label: 'Fotocopia Documento de identidad de Representantes.' },
  { id: '3', label: 'Fotocopia de Documento de identidad de Autorizados (mandatarios, apoderados, etc.).' },
  { id: '4', label: 'Fotocopia de Documento de Beneficiario Final.' },
  { id: '5', label: 'Documentación que acredite Representación de la Sociedad.' },
  { id: '6', label: 'Documentación que acredite la existencia de Autorizados (Mandatarios, apoderados, etc), en caso de corresponder.' },
  { id: '7', label: 'Fotocopia de Inscripción en Registro Tributario (RUT o similar), en caso de corresponder.' },
  { id: '8', label: 'Contrato social o estatutos u otra documentación probatoria de la existencia de la sociedad y constancia de inscripción en el registro que corresponda.' },
  { id: '9', label: 'Constancia de inscripción en el Registro de Beneficiarios Finales del Banco Central del Uruguay, en caso de corresponder.' },
  { id: '10', label: 'Cuestionario Perfil del Inversor.' },
  { id: '11', label: 'Documentación de respaldo de la actividad económica del Cliente y del origen de los fondos, en caso de corresponder.' },
  { id: '12', label: 'Copia de Declaración Jurada o documentación equivalente presentada ante la administración tributaria correspondiente, en caso de corresponder.' },
  { id: '13', label: 'Informe Circunstanciado, en caso de corresponder.' },
  { id: '14', label: 'Verificación de antecedentes (ONU, OFAC, otras).', sub: ['Persona Jurídica', 'Representantes', 'Mandatarios, Apoderados, Autorizados', 'Socios o accionistas mayoritarios', 'Beneficiario Final'] },
  { id: '15', label: 'Evaluación de Riesgo (ALTO, MEDIO, BAJO)' },
  { id: '16', label: 'Aprobación de la relación comercial' },
  { id: '17', label: 'Constancia de las verificaciones efectuadas por Oficial de Cumplimiento' },
]
