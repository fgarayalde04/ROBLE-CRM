import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS resources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  company text,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  responsible text,
  tags text[] DEFAULT '{}',
  is_featured boolean DEFAULT false,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for faster category filtering
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_is_featured ON resources(is_featured);`

export async function GET() {
  try {
    const { error } = await supabaseAdmin.from('resources').select('id').limit(1)

    const exists = !error || !error.message.includes('does not exist')

    return NextResponse.json({ exists, sql: CREATE_TABLE_SQL })
  } catch (err) {
    return NextResponse.json({ exists: false, sql: CREATE_TABLE_SQL, error: String(err) })
  }
}
