'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Nombre de la sección a la que se vuelve (mismos nombres que el menú).
const LABELS: Record<string, string> = {
  '/admin/planillas': 'Planillas',
  '/banco-central': 'Banco Central',
  '/calendar': 'Calendario',
  '/ceo': 'Dashboard',
  '/documents': 'Documentos',
  '/events': 'Agenda',
  '/folders': 'Carpetas',
  '/fondos': 'Fondos',
  '/mail': 'Mail',
  '/openings': 'Aperturas',
  '/plantillas': 'Plantillas',
  '/propuestas': 'Propuestas',
  '/solicitudes': 'Solicitudes',
  '/suitability': 'Suitability',
  '/tasks': 'Tareas',
}

// Rutas intermedias que no son páginas: desde ahí no hay a dónde volver.
const NOT_A_PAGE = new Set(['/admin', '/onedrive'])

// Secciones que ya tienen su propio "← Volver" / breadcrumb.
const HAS_OWN_BACK = ['/clients/', '/factsheet/', '/fondos/']

/**
 * Flecha "← <sección>" arriba de cualquier subpágina (p.ej. de una planilla a
 * Planillas, de una propuesta a Propuestas), para no tener que volver por el
 * menú. Va al padre de la URL, no al historial del navegador: funciona igual
 * si se entró por un link directo o una notificación.
 */
export default function BackBar() {
  const pathname = usePathname() ?? '/'
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length < 2) return null
  if (HAS_OWN_BACK.some(p => pathname.startsWith(p))) return null

  const parent = '/' + segments.slice(0, -1).join('/')
  if (NOT_A_PAGE.has(parent)) return null

  const label = LABELS[parent] ?? 'Volver'
  return (
    <div className="px-4 pt-3 md:px-6">
      <Link
        href={parent}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-gray-500 transition hover:bg-gray-200/60 hover:text-[#2D3F52]"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12.5 15l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </Link>
    </div>
  )
}
