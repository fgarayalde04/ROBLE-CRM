import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name')
      .order('name')

    if (error) {
      // Table may not exist yet — return empty array gracefully
      return NextResponse.json([])
    }

    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json([])
  }
}
