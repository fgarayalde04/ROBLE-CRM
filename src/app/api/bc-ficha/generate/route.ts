import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import type { Empresa, TipoCliente, FichaPFData, FichaPJData, PerfilData, ListaData } from '@/app/banco-central/ficha/types'
import { calcScore, scoreToProfile, SCORES } from '@/app/banco-central/ficha/types'
import path from 'path'
import fs from 'fs'

// POST /api/bc-ficha/generate
// Body: { empresa, tipo_cliente, doc, ficha_data, perfil_data, lista_data }
// Returns: DOCX binary or HTML preview

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa, tipo_cliente, doc, format = 'docx' } = body as {
    empresa: Empresa
    tipo_cliente: TipoCliente
    doc: 'ficha' | 'cuestionario'
    format?: 'docx' | 'html'
    ficha_data: FichaPFData | FichaPJData
    perfil_data: PerfilData
    lista_data: ListaData
  }

  const ficha_data = body.ficha_data as FichaPFData | FichaPJData
  const perfil_data = body.perfil_data as PerfilData
  const lista_data = body.lista_data as ListaData

  // Determine template file
  let templateName: string
  if (doc === 'cuestionario') {
    templateName = 'cuestionario.docx'
  } else {
    templateName = `ficha-${tipo_cliente}-${empresa}.docx`
  }

  const templatePath = path.join(process.cwd(), 'public', 'bc-templates', templateName)
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json({ error: `Template not found: ${templateName}` }, { status: 404 })
  }

  // Build variable map
  const vars = doc === 'cuestionario'
    ? buildCuestionarioVars(perfil_data)
    : tipo_cliente === 'pf'
      ? buildFichaPFVars(ficha_data as FichaPFData, empresa)
      : buildFichaPJVars(ficha_data as FichaPJData, empresa)

  try {
    const PizZip = (await import('pizzip')).default
    const Docxtemplater = (await import('docxtemplater')).default

    const content = fs.readFileSync(templatePath, 'binary')
    const zip = new PizZip(content)
    const docx = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter() { return '' },
    })

    docx.render(vars)
    const buf = docx.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    if (format === 'html') {
      // Convert to HTML via mammoth for preview
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ buffer: buf })
      return NextResponse.json({ html: result.value })
    }

    // Return DOCX
    const filename = `${empresa}-${tipo_cliente}-${doc}.docx`
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('[bc-ficha/generate]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Error generando documento' }, { status: 500 })
  }
}

// ── Variable builders ──────────────────────────────────

const CHK = (val: boolean) => val ? '☒' : '☐'

function buildFichaPFVars(data: FichaPFData, empresa: Empresa) {
  const p = (i: number) => data.personas?.[i]
  const v: Record<string, string> = {
    codigo_cliente:          data.codigo_cliente || '',
    actua_por_propia_check:  CHK(data.actua_por === 'propia'),
    actua_por_tercero_check: CHK(data.actua_por === 'tercero'),
  }

  // Up to 5 personas
  for (let i = 0; i < 5; i++) {
    const persona = p(i)
    const suffix = `_${i + 1}`
    if (persona) {
      v[`nombre_completo${suffix}`]    = `${persona.nombres} ${persona.apellidos}`.trim()
      v[`cod_bfinal${suffix}`]         = persona.codigo_beneficiario || ''
      v[`apellidos${suffix}`]          = persona.apellidos || ''
      v[`nombres${suffix}`]            = persona.nombres || ''
      v[`fecha_nacimiento${suffix}`]   = persona.fecha_nacimiento || ''
      v[`lugar_nacimiento${suffix}`]   = persona.lugar_nacimiento || ''
      v[`tipo_doc${suffix}`]           = persona.tipo_documento || ''
      v[`num_documento${suffix}`]      = persona.numero_documento || ''
      v[`pais_emision${suffix}`]       = persona.pais_emision || ''
      v[`estado_civil${suffix}`]       = persona.estado_civil || ''
      v[`conyuge_nombre${suffix}`]     = persona.conyuge_nombre || ''
      v[`conyuge_tipo_doc${suffix}`]   = persona.conyuge_tipo_doc || ''
      v[`conyuge_num_doc${suffix}`]    = persona.conyuge_numero_doc || ''
      v[`domicilio${suffix}`]          = persona.domicilio || ''
      v[`cp_ciudad${suffix}`]          = persona.ciudad_cp || ''
      v[`pais_domicilio${suffix}`]     = persona.pais || ''
      v[`telefono${suffix}`]           = persona.telefono || ''
      v[`celular${suffix}`]            = persona.celular || ''
      v[`email${suffix}`]              = persona.email || ''
      v[`mensajeria${suffix}`]         = persona.mensajeria || ''
      v[`usuario_web${suffix}`]        = persona.usuario_web || ''
      v[`ocupacion${suffix}`]          = persona.profesion || ''
      v[`empleador${suffix}`]          = persona.institucion || ''
      v[`ingresos${suffix}`]           = persona.ingresos_anuales_usd || ''
      v[`pais_res_fiscal${suffix}`]    = persona.pais_residencia_fiscal || ''
      v[`nif${suffix}`]                = persona.numero_fiscal || ''
      v[`tipo_titular_check${suffix}`] = persona.tipo_titular || ''
      v[`pep_si_check${suffix}`]       = CHK(!!persona.es_pep)
      v[`pep_no_check${suffix}`]       = CHK(!persona.es_pep)
      v[`cargo_publico${suffix}`]      = persona.cargo_publico || ''
    } else {
      const fields = [
        'nombre_completo','cod_bfinal','apellidos','nombres','fecha_nacimiento',
        'lugar_nacimiento','tipo_doc','num_documento','pais_emision','estado_civil',
        'conyuge_nombre','conyuge_tipo_doc','conyuge_num_doc',
        'domicilio','cp_ciudad','pais_domicilio','telefono','celular','email',
        'mensajeria','usuario_web','ocupacion','empleador','ingresos',
        'pais_res_fiscal','nif','tipo_titular_check','pep_si_check','pep_no_check','cargo_publico',
      ]
      for (const f of fields) v[`${f}${suffix}`] = ''
    }
  }

  return v
}

function buildFichaPJVars(data: FichaPJData, empresa: Empresa) {
  const entidadPasiva = data.tipo_entidad_pasiva
  return {
    codigo_cliente:           data.codigo_cliente || '',
    tipo_entidad_si_check:    CHK(entidadPasiva === true),
    tipo_entidad_no_check:    CHK(entidadPasiva === false),
    razon_social:             data.razon_tipo_social || '',
    nombre_comercial:         data.nombre_comercial || '',
    fecha_constitucion:       data.fecha_constitucion || '',
    lugar_constitucion:       data.lugar_constitucion || '',
    pais_emision:             data.pais_emision || '',
    nit:                      data.numero_tributario || '',
    sede_social:              data.sede_social || '',
    localidad:                data.localidad || '',
    telefono:                 data.telefono || '',
    email:                    data.email || '',
    actividad:                data.actividad_principal || '',
    ingresos:                 data.ingresos_anuales_usd || '',
    pais_res_fiscal:          data.pais_residencia_fiscal || '',
    nif:                      data.numero_fiscal || '',
  }
}

function buildCuestionarioVars(data: PerfilData) {
  const score = calcScore(data.answers)
  const totalAnswered = Object.keys(data.answers).length
  const perfil = totalAnswered === 13 ? scoreToProfile(score) : ''
  const perfilLabel = perfil === 'conservador' ? 'Conservador (0-21)'
    : perfil === 'moderado' ? 'Moderado (22-43)'
    : perfil === 'agresivo' ? 'Agresivo (44-62)'
    : ''

  return {
    puntaje:          totalAnswered === 13 ? String(score) : '',
    resultado_perfil: perfilLabel,
    fecha_firma:      data.firma_fecha || '',
  }
}
