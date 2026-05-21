import { createClient } from '@supabase/supabase-js'

// Cliente con service role key — bypasea RLS, solo usar en server-side (API routes)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

export const supabaseAdmin = createClient(url, key)
