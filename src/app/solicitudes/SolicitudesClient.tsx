'use client'

import { useState } from 'react'
import NuevaSolicitudForm from './NuevaSolicitudForm'
import MesaHoy from './MesaHoy'

interface Props { isMesa: boolean; userName: string; userEmail: string; gmailConnected: boolean }

function Section({
  title, subtitle, accent = 'gray', defaultOpen = false, children,
}: {
  title: string; subtitle?: string
  accent?: 'blue' | 'amber' | 'gray'
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const dotCls = { blue: 'bg-blue-500', amber: 'bg-amber-500', gray: 'bg-gray-400' }[accent ?? 'gray']

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${dotCls}`} />
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
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
        <p className="text-sm text-gray-400 mt-0.5">Enviá órdenes a Mesa y seguí el estado del día</p>
      </div>

      <div className="space-y-4 max-w-7xl">

        <Section
          title="Enviar órdenes"
          subtitle="Crear una solicitud para Mesa de Operaciones"
          accent="blue"
          defaultOpen={!isMesa}
        >
          <NuevaSolicitudForm gmailConnected={gmailConnected} userEmail={userEmail} />
        </Section>

        <Section
          title="Mesa de hoy"
          subtitle="Solicitudes del día — estados y acciones"
          accent="amber"
          defaultOpen={isMesa}
        >
          <MesaHoy isMesa={isMesa} userName={userName} />
        </Section>

      </div>
    </div>
  )
}
