import type { Metadata } from 'next'
import { unstable_noStore } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase/admin'
import ImpuestosTable, { type TaxRecord } from '@/components/ImpuestosTable'

export const metadata: Metadata = { title: 'Impuestos' }
export const dynamic = 'force-dynamic'

export default async function ImpuestosPage() {
  unstable_noStore()

  const { data } = await supabaseAdmin
    .from('tax_records')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('company', { ascending: true })
    .order('tax_name', { ascending: true })

  const records = (data ?? []) as TaxRecord[]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#2D3F52]">Impuestos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vencimientos y pagos</p>
      </div>

      <ImpuestosTable records={records} />
    </div>
  )
}
