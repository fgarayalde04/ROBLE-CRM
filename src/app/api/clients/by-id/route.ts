import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json(null)

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, first_name, last_name, client_number')
      .eq('id', id)
      .single()

    if (error) return NextResponse.json(null)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(null)
  }
}
