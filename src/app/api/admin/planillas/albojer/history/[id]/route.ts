import { NextRequest } from 'next/server'
import { getAlbojerClientFolder } from '@/lib/albojer/clientLookup'
import { downloadHistoryFile } from '@/lib/icheAcciones/historyDownload'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return downloadHistoryFile('albojer', params.id, getAlbojerClientFolder)
}
