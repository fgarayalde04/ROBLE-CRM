/**
 * Creates docxtemplater-ready templates from the original BC Word files.
 * Run: node scripts/create-bc-templates.js
 * Output: public/bc-templates/
 */
const PizZip = require('pizzip')
const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..')
const OUT = path.join(BASE, 'public', 'bc-templates')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

function load(filename) {
  const content = fs.readFileSync(path.join(BASE, filename), 'binary')
  const zip = new PizZip(content)
  return { zip, xml: zip.files['word/document.xml'].asText() }
}

function save(zip, xml, name) {
  zip.file('word/document.xml', xml)
  fs.writeFileSync(path.join(OUT, name), zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
  console.log('  Saved:', name)
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Replace the first <w:t> run whose content is exactly `from`
function repFirst(xml, from, to) {
  const r = new RegExp(`(<w:t[^>]*>)${esc(from)}(<\\/w:t>)`)
  const out = xml.replace(r, `$1${to}$2`)
  if (out === xml) console.warn('    WARN repFirst not found:', JSON.stringify(from))
  return out
}

// Replace ALL occurrences
function repAll(xml, from, to) {
  const r = new RegExp(`(<w:t[^>]*>)${esc(from)}(<\\/w:t>)`, 'g')
  const out = xml.replace(r, `$1${to}$2`)
  if (out === xml) console.warn('    WARN repAll not found:', JSON.stringify(from))
  return out
}

// Replace the space-value run that immediately follows a label run.
// Pattern: >LABEL</w:t></w:r><w:r...><w:t...> </w:t></w:r>
// Replaces the single space with `{placeholder}`.
function repSpaceAfterLabel(xml, label, placeholder) {
  const r = new RegExp(
    `(${esc(label)}<\\/w:t><\\/w:r>(?:<w:r[^>]*>)(?:<w:rPr>.*?<\\/w:rPr>)?<w:t[^>]*>) (<\\/w:t>)`,
    's'
  )
  const out = xml.replace(r, `$1${placeholder}$2`)
  if (out === xml) console.warn('    WARN repSpaceAfterLabel not found:', JSON.stringify(label))
  return out
}

// Insert a placeholder run into the first EMPTY value paragraph that comes
// right after a given label (in adjacent table cell pattern):
// ...<w:t>LABEL</w:t></w:r>...<\w:p></w:tc><w:tc>...<w:p...><w:pPr...></w:pPr></w:p>...
function insertAfterLabel(xml, label, placeholder) {
  // Try same-paragraph pattern first (label + space in same para)
  const sameParaRe = new RegExp(
    `(${esc(label)}<\\/w:t><\\/w:r>)((?:<w:r[^>]*>(?:<w:rPr>.*?<\\/w:rPr>)?<w:t[^>]*> ?<\\/w:t><\\/w:r>)*?)(<\\/w:p>)`,
    's'
  )
  let out = xml.replace(sameParaRe, `$1$2<w:r><w:t xml:space="preserve"> ${placeholder}</w:t></w:r>$3`)
  if (out !== xml) return out

  // Try next-cell pattern
  const nextCellRe = new RegExp(
    `(${esc(label)}<\\/w:t><\\/w:r>(?:.*?)<\\/w:tc>\\s*<w:tc>(?:.*?)<w:p[^>]*>(?:<w:pPr>.*?<\\/w:pPr>)?)(<\\/w:p>)`,
    's'
  )
  out = xml.replace(nextCellRe, `$1<w:r><w:t xml:space="preserve"> ${placeholder}</w:t></w:r>$2`)
  if (out !== xml) return out

  console.warn('    WARN insertAfterLabel not found:', JSON.stringify(label))
  return xml
}

// ═══════════════════════════════════════════════════════
// FICHA PF ROBLE — has example data, direct replacement
// ═══════════════════════════════════════════════════════
function fichaPFRoble() {
  console.log('\nFICHA PF ROBLE')
  let { zip, xml } = load('FICHA DE CLIENTE PF Roble 2023.docx')

  xml = repFirst(xml, '7683264', '{codigo_cliente}')
  xml = repAll(xml, 'JUAN IGNACIO ARGUL BELLO', '{nombre_completo_1}')

  // Código de Beneficiario Final (split: "7683-" + "55229211")
  xml = repFirst(xml, '7683-', '{cod_bfinal_1}')
  xml = repFirst(xml, '55229211', '')

  xml = repFirst(xml, 'ARGUL BELLO', '{apellidos_1}')
  xml = repFirst(xml, 'JUAN IGNACIO', '{nombres_1}')
  xml = repAll(xml, '31/08/2003', '{fecha_nacimiento_1}')
  xml = repAll(xml, 'MONTEVIDEO, URUGUAY', '{lugar_nacimiento_1}')
  xml = repFirst(xml, '5.522.921-1', '{num_documento_1}')
  xml = repFirst(xml, 'URUGUAY', '{pais_emision_1}')       // 1st URUGUAY = pais emision
  xml = repFirst(xml, 'SOLTERO', '{estado_civil_1}')

  // Address split across 4 runs
  xml = repFirst(xml, 'Dayman 2532', '{domicilio_1}')
  xml = repFirst(xml, ', B', '')
  xml = repFirst(xml, 'arras de carrasco Canelones', '')
  xml = repFirst(xml, ', Uruguay', '')

  xml = repFirst(xml, 'CANELONES 15000', '{cp_ciudad_1}')
  xml = repFirst(xml, 'URUGUAY', '{pais_domicilio_1}')     // 2nd URUGUAY = pais domicilio

  // Phone split ("0" + "91946520") — telefono
  xml = repFirst(xml, '0', '{telefono_1}')
  xml = repFirst(xml, '91946520', '')
  // Celular
  xml = repFirst(xml, '0', '{celular_1}')
  xml = repFirst(xml, '91946520', '')

  xml = repFirst(xml, 'juani.argul@gmail.com', '{email_1}')
  xml = repFirst(xml, 'EMPLEADO', '{ocupacion_1}')
  xml = repFirst(xml, 'EL ESTABLO', '{empleador_1}')
  xml = repFirst(xml, '25.000', '{ingresos_1}')

  // Residencia fiscal
  xml = repFirst(xml, ' URUGUAY', '{pais_res_fiscal_1}')
  xml = repFirst(xml, '5.522.921-1', '{nif_1}')            // 2nd occurrence = NIF

  save(zip, xml, 'ficha-pf-roble.docx')
}

// ═══════════════════════════════════════════════════════
// FICHA PF GELIENE — space runs as value fields
// ═══════════════════════════════════════════════════════
function fichaPFGeliene() {
  console.log('\nFICHA PF GELIENE')
  let { zip, xml } = load('FICHA DE CLIENTE GELIENE Roble 2023.docx')

  // Header — label includes trailing space, value goes inline (no value cell)
  xml = repAll(xml, 'Código de Cliente: ', 'Código de Cliente: {codigo_cliente} ')

  // "Nombres y apellidos:" appears 5 times; replace space after each
  const nombrePHs = ['{nombre_completo_1}','{nombre_completo_2}','{nombre_completo_3}','{nombre_completo_4}','{nombre_completo_5}']
  for (const ph of nombrePHs) {
    xml = repSpaceAfterLabel(xml, 'Nombres y apellidos:', ph)
  }

  // Section A (first person) — label + space run pattern
  xml = repSpaceAfterLabel(xml, 'Apellidos:', '{apellidos_1}')
  xml = repSpaceAfterLabel(xml, 'Nombres:', '{nombres_1}')
  xml = repSpaceAfterLabel(xml, 'Fecha de nacimiento:', '{fecha_nacimiento_1}')
  xml = repSpaceAfterLabel(xml, 'Lugar de nacimiento:', '{lugar_nacimiento_1}')
  xml = repSpaceAfterLabel(xml, 'Tipo de documento:', '{tipo_doc_1}')
  xml = repSpaceAfterLabel(xml, 'Número de documento:', '{num_documento_1}')
  xml = repSpaceAfterLabel(xml, 'País de emisión:', '{pais_emision_1}')
  xml = repSpaceAfterLabel(xml, 'Estado civil:', '{estado_civil_1}')
  xml = repSpaceAfterLabel(xml, 'Domicilio:', '{domicilio_1}')
  xml = repSpaceAfterLabel(xml, 'Ciudad y código postal:', '{cp_ciudad_1}')
  xml = repSpaceAfterLabel(xml, 'País:', '{pais_domicilio_1}')
  xml = repSpaceAfterLabel(xml, 'Teléfono:', '{telefono_1}')
  xml = repSpaceAfterLabel(xml, 'Celular:', '{celular_1}')
  // E-mail: split runs "E-mail" + superscript "1" + ":" + " " (space = value)
  // Target: the space run that comes right after ":"  following the "E-mail" label
  xml = xml.replace(
    /(>E-mail<\/w:t><\/w:r>(?:.*?)<w:t[^>]*>:<\/w:t><\/w:r>)(<w:r[^>]*><w:t[^>]*>) (<\/w:t>)/s,
    '$1$2{email_1}$3'
  )
  xml = repSpaceAfterLabel(xml, 'Profesión / oficio / actividad:', '{ocupacion_1}')

  // Residencia fiscal — has example value "ARGENTINA"
  xml = repFirst(xml, 'ARGENTINA', '{pais_res_fiscal_1}')

  save(zip, xml, 'ficha-pf-geliene.docx')
}

// ═══════════════════════════════════════════════════════
// FICHA PJ ROBLE — labels with trailing space + empty value in next cell
// ═══════════════════════════════════════════════════════
function fichaPJRoble() {
  console.log('\nFICHA PJ ROBLE')
  let { zip, xml } = load('FICHA DE CLIENTE PJ Roble 2023.docx')

  // Header — label is in last cell of header table, value follows in same row
  xml = insertAfterLabel(xml, 'Código de Cliente: ', '{codigo_cliente}')

  // Company info — some labels have trailing space, some are split across runs
  xml = insertAfterLabel(xml, 'Razón y tipo social: ', '{razon_social}')

  // "Lugar de " + "constitución:" are split — merge first run with placeholder
  xml = repFirst(xml, 'Lugar de ', 'Lugar de constitución: {lugar_constitucion} ')
  xml = repFirst(xml, 'constitución:', '')   // clear the second run

  xml = insertAfterLabel(xml, 'Número de Identificación tributario: ', '{nit}')
  xml = insertAfterLabel(xml, 'Sede social: ', '{sede_social}')
  xml = insertAfterLabel(xml, 'Localidad/Depto/Pcia/Estado:', '{localidad}')
  xml = insertAfterLabel(xml, 'Actividad Principal:', '{actividad}')

  // Residencia fiscal
  xml = insertAfterLabel(xml, 'País / jurisdicción de residencia fiscal', '{pais_res_fiscal}')
  xml = insertAfterLabel(xml, 'Número de identificación fiscal o su equivalente funcional*', '{nif}')

  save(zip, xml, 'ficha-pj-roble.docx')
}

// ═══════════════════════════════════════════════════════
// FICHA PJ GELIENE
// ═══════════════════════════════════════════════════════
function fichaPJGeliene() {
  console.log('\nFICHA PJ GELIENE')
  let { zip, xml } = load('FICHA DE CLIENTE PJ GELIENE 2023.docx')

  xml = insertAfterLabel(xml, 'Código de Cliente: ', '{codigo_cliente}')
  xml = insertAfterLabel(xml, 'Razón y tipo social: ', '{razon_social}')

  // "Lugar de " + "constitución:" split
  xml = repFirst(xml, 'Lugar de ', 'Lugar de constitución: {lugar_constitucion} ')
  xml = repFirst(xml, 'constitución:', '')

  xml = insertAfterLabel(xml, 'Número de Identificación tributario: ', '{nit}')
  xml = insertAfterLabel(xml, 'Sede social: ', '{sede_social}')
  xml = insertAfterLabel(xml, 'Localidad/Depto/Pcia/Estado:', '{localidad}')
  xml = insertAfterLabel(xml, 'Actividad Principal:', '{actividad}')
  xml = insertAfterLabel(xml, 'País / jurisdicción de residencia fiscal', '{pais_res_fiscal}')
  xml = insertAfterLabel(xml, 'Número de identificación fiscal o su equivalente funcional*', '{nif}')

  save(zip, xml, 'ficha-pj-geliene.docx')
}

// ═══════════════════════════════════════════════════════
// CUESTIONARIO
// ═══════════════════════════════════════════════════════
function cuestionario() {
  console.log('\nCUESTIONARIO')
  let { zip, xml } = load('Cuestionario Perfil del Inversor.docx')

  // Add placeholders for score/result at bottom
  xml = repAll(xml, 'Puntaje obtenido', 'Puntaje obtenido: {puntaje}')
  xml = repAll(xml, 'Resultado del perfil', 'Resultado del perfil: {resultado_perfil}')
  xml = repAll(xml, 'Fecha:', 'Fecha: {fecha_firma}')

  save(zip, xml, 'cuestionario.docx')
}

fichaPFRoble()
fichaPFGeliene()
fichaPJRoble()
fichaPJGeliene()
cuestionario()
console.log('\nDone!')
