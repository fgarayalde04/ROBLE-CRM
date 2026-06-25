import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Strip numeric prefix "1234 - " from folder names
function displayName(folderName: string): string {
  return folderName.replace(/^\d+\s*-\s*/, '').trim()
}

// GET /api/legajos/search?q=...
// Searches banco_central_records by folder_name, customer_number, fa
// Also returns authorized_email (from banco_central_records.authorized_email OR clients.email)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  // Search across: folder_name (contains client name), customer_number, fa (code)
  const { data, error } = await supabaseAdmin
    .from('banco_central_records')
    .select('id, customer_number, folder_name, type, fa, status, authorized_email')
    .or(`folder_name.ilike.%${q}%,customer_number.ilike.%${q}%,fa.ilike.%${q}%`)
    .order('folder_name', { ascending: true })
    .limit(25)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rawResults = data ?? []

  // Fetch emails from clients table as fallback for records without authorized_email
  const customerNumbers = rawResults
    .filter(r => !r.authorized_email && r.customer_number)
    .map(r => r.customer_number as string)

  let clientEmailMap = new Map<string, string>()
  if (customerNumbers.length > 0) {
    const { data: clientData } = await supabaseAdmin
      .from('clients')
      .select('client_number, email')
      .in('client_number', customerNumbers)
    for (const c of clientData ?? []) {
      if (c.client_number && c.email) clientEmailMap.set(c.client_number, c.email)
    }
  }

  const results = rawResults.map((r) => {
    const authorizedEmail =
      (r.authorized_email as string | null) ||
      (r.customer_number ? (clientEmailMap.get(r.customer_number) ?? null) : null)
    return {
      id: r.id,
      customer_number: r.customer_number as string | null,
      folder_name: r.folder_name as string,
      display_name: displayName(r.folder_name as string),
      type: r.type as 'local' | 'internacional',
      fa: r.fa as string | null,
      status: r.status as string,
      authorized_email: authorizedEmail,
    }
  })

  return NextResponse.json({ results })
}
