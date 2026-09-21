import PizZip from 'pizzip'
import type { DriveItem } from './graph'

// Lee la "Ficha de cliente" (.docx) que está dentro de la carpeta de cada
// legajo de Banco Central, para completar en Clientes lo que el sync no
// puede saber solo: nombre real, mail y celular.

export interface FichaContact {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

/** Texto plano del .docx (etiquetas XML fuera, espacios colapsados). */
export function docxToText(buf: ArrayBuffer): string {
  const xml = new PizZip(buf).file('word/document.xml')?.asText() ?? ''
  return xml.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function firstMatch(text: string, re: RegExp): RegExpMatchArray | null {
  for (const m of Array.from(text.matchAll(re))) {
    if (m.slice(1).every(g => g && g.trim().length > 0)) return m
  }
  return null
}

/**
 * La ficha trae un bloque por persona; el primero con datos es el titular.
 * Los bloques vacíos ("Apellidos: Nombres: Fecha de nacimiento:") se saltean.
 */
export function parseFichaText(text: string): FichaContact {
  // Sin flag i: el encabezado "Nombres y apellidos:" (minúscula) no es este campo.
  const name = firstMatch(text, /Apellidos:\s*([^:]+?)\s+Nombres:\s*([^:]+?)\s+Fecha de nacimiento/g)
  const email = firstMatch(text, /E-?mail\s*\d*\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)
  const celular = firstMatch(text, /Celular:?\s*(\+?[\d\s\-()]{6,20})/gi)
  const telefono = firstMatch(text, /Tel[eé]fono:?\s*(\+?[\d\s\-()]{6,20})/gi)
  const phone = (celular?.[1] ?? telefono?.[1])?.replace(/\s+/g, '').trim()

  return {
    last_name: name?.[1].trim() || null,
    first_name: name?.[2].trim() || null,
    email: email?.[1].toLowerCase().trim() || null,
    phone: phone || null,
  }
}

/** El .docx de la ficha entre los archivos de la carpeta (no cuestionarios/perfiles). */
export function findFichaFile(children: DriveItem[]): DriveItem | null {
  const docs = children.filter(f => f.file && /\.docx$/i.test(f.name) && !f.name.startsWith('~$'))
  const excluded = /cuestionario|perfil|verificaci|inversor/i
  return (
    docs.find(f => /ficha|legajo/i.test(f.name) && !excluded.test(f.name)) ??
    docs.find(f => !excluded.test(f.name)) ??
    null
  )
}
