interface SyncHealthReport {
  unlinkedLegajos: { folder_name: string; customer_number: string; type: string; created_at: string }[]
  unparsedLegajos: { folder_name: string; type: string; created_at: string }[]
  clientsWithoutNumber: { id: string; first_name: string; last_name: string; created_at: string }[]
  duplicateNumbers: { client_number: string; count: number }[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })
}

function Section({
  title, count, emptyLabel, children,
}: { title: string; count: number; emptyLabel: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          count === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'
        }`}>
          {count}
        </span>
        <p className="text-xs font-medium text-gray-600">{title}</p>
      </div>
      {count === 0 ? (
        <p className="text-[11px] text-gray-300 pl-6">{emptyLabel}</p>
      ) : (
        <div className="pl-6 space-y-0.5">{children}</div>
      )}
    </div>
  )
}

export default function SyncHealthCard({ report }: { report: SyncHealthReport }) {
  const totalIssues =
    report.unlinkedLegajos.length + report.unparsedLegajos.length +
    report.clientsWithoutNumber.length + report.duplicateNumbers.length

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Salud de sincronización — Legajos / Clientes
        </h2>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          totalIssues === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {totalIssues === 0 ? 'Sin problemas' : `${totalIssues} para revisar`}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Se recalcula en cada carga de esta página — legajos y clientes que quedaron sin
        vincular correctamente.
      </p>

      <div className="space-y-4">
        <Section
          title="Legajos con número pero sin cliente vinculado"
          count={report.unlinkedLegajos.length}
          emptyLabel="Todos los legajos con número están vinculados a un cliente."
        >
          {report.unlinkedLegajos.map((r, i) => (
            <p key={i} className="text-[11px] text-gray-600">
              <span className="font-mono">{r.customer_number}</span> — {r.folder_name}
              <span className="text-gray-300"> · {fmtDate(r.created_at)}</span>
            </p>
          ))}
          <p className="text-[10px] text-gray-400 pt-0.5">
            Debería resolverse solo en el próximo sync. Si sigue apareciendo, avisar.
          </p>
        </Section>

        <Section
          title="Legajos sin número parseable en el nombre de carpeta"
          count={report.unparsedLegajos.length}
          emptyLabel="Todas las carpetas de legajos tienen número en el nombre."
        >
          {report.unparsedLegajos.map((r, i) => (
            <p key={i} className="text-[11px] text-gray-600">
              {r.folder_name}
              <span className="text-gray-300"> · {fmtDate(r.created_at)}</span>
            </p>
          ))}
          <p className="text-[10px] text-gray-400 pt-0.5">
            Nunca se van a poder vincular solos — hay que corregir el nombre de la carpeta.
          </p>
        </Section>

        <Section
          title="Clientes activos sin número de cliente"
          count={report.clientsWithoutNumber.length}
          emptyLabel="Todos los clientes activos tienen número."
        >
          {report.clientsWithoutNumber.map((c) => (
            <p key={c.id} className="text-[11px] text-gray-600">
              {c.first_name} {c.last_name}
              <span className="text-gray-300"> · {fmtDate(c.created_at)}</span>
            </p>
          ))}
        </Section>

        <Section
          title="Números de cliente duplicados"
          count={report.duplicateNumbers.length}
          emptyLabel="Ningún número de cliente está repetido."
        >
          {report.duplicateNumbers.map((d) => (
            <p key={d.client_number} className="text-[11px] text-gray-600">
              <span className="font-mono">{d.client_number}</span> — {d.count} clientes
            </p>
          ))}
        </Section>
      </div>
    </div>
  )
}
