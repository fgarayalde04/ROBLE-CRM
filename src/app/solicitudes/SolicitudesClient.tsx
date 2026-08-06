'use client'

import { useState } from 'react'
import NuevaSolicitudForm from './NuevaSolicitudForm'
import MesaHoy from './MesaHoy'
import BlotterSolicitudes from './BlotterSolicitudes'

interface Props { isMesa: boolean; userName: string; userEmail: string; gmailConnected: boolean }

function Section({
  title, subtitle, badge, accent = 'gray', defaultOpen = false, children,
}: {
  title: string; subtitle?: string; badge?: number | string
  accent?: 'blue' | 'gray' | 'amber' | 'emerald'
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const accentCls = {
    blue:    'border-blue-200 bg-blue-50',
    amber:   'border-amber-200 bg-amber-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    gray:    'border-gray-200 bg-gray-50',
  }[accent]
  const dotCls = {
    blue:    'bg-blue-500', amber: 'bg-amber-500',
    emerald: 'bg-emerald-500', gray: 'bg-gray-400',
  }[accent]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${dotCls}`} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
              {badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${accentCls}`}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  )
}

export default function SolicitudesClient({ isMesa, userName, userEmail, gmailConnected }: Props) {
  return (
    <div className="p-4 md:p-6 bg-[#F4F6F8] min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#2D3F52]">Órdenes</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {isMesa
            ? 'Mesa de Operaciones — Bandeja, Mesa de hoy y Blotter'
            : 'Enviá solicitudes a Mesa y consultá su estado'}
        </p>
      </div>

      <div className="space-y-4 max-w-7xl">

        {/* 1 — Enviar órdenes */}
        <Section
          title="Enviar órdenes"
          subtitle="Crear una solicitud para Mesa de Operaciones"
          accent="blue"
          defaultOpen={!isMesa}
        >
          <NuevaSolicitudForm gmailConnected={gmailConnected} userEmail={userEmail} />
        </Section>

        {/* 2 — Mesa de hoy */}
        <Section
          title="Mesa de hoy"
          subtitle="Solicitudes del día — estados y acciones"
          accent="amber"
          defaultOpen={isMesa}
        >
          <MesaHoy isMesa={isMesa} userName={userName} />
        </Section>

        {/* 3 — Blotter */}
        <Section
          title="Blotter"
          subtitle="Historial completo de operaciones"
          accent="emerald"
          defaultOpen={false}
        >
          <BlotterSolicitudes isMesa={isMesa} userName={userName} />
        </Section>

      </div>
    </div>
  )
}
