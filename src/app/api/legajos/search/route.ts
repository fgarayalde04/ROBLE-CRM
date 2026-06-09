import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Strip numeric prefix "1234 - " from folder names
function displayName(folderName: string): string {
  return folderName.replace(/^\d+\s*-\s*/, '').trim()
}

// GET /api/legajos/search?q=...
// Searches banco_central_records by folder_name, customer_number, fa
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  // Search across: folder_name (contains client name), customer_number, fa (code)
  const { data, error } = await supabaseAdmin
    .from('banco_central_records')
    .select('id, customer_number, folder_name, type, fa, status')
    .or(`folder_name.ilike.%${q}%,customer_number.ilike.%${q}%,fa.ilike.%${q}%`)
    .order('folder_name', { ascending: true })
    .limit(25)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = (data ?? []).map((r) => ({
    id: r.id,
    customer_number: r.customer_number as string | null,
    folder_name: r.folder_name as string,
    display_name: displayName(r.folder_name as string),
    type: r.type as 'local' | 'internacional',
    fa: r.fa as string | null,
    status: r.status as string,
  }))

  return NextResponse.json({ results })
}
