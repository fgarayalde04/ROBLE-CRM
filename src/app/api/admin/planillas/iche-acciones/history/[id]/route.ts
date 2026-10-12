import { NextRequest } from 'next/server'
import { getIcheClientFolder } from '@/lib/icheAcciones/clientLookup'
import { downloadHistoryFile } from '@/lib/icheAcciones/historyDownload'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return downloadHistoryFile('iche', params.id, getIcheClientFolder)
}
