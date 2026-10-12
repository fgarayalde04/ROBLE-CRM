import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { downloadDriveFile, getGraphToken } from '@/lib/microsoft/graph'
import { positionsStore, type PositionsBook } from './db'

/**
 * Descarga el Excel de una corrida del historial. Desde que existe
 * `file_data` sale de la base; las corridas anteriores se bajan de OneDrive
 * con su item_id (puede fallar si el archivo se movió o se pisó).
 */
export async function downloadHistoryFile(book: PositionsBook, id: string, getFolder: () => Promise<{ driveId: string }>) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const gen = await positionsStore(book).getGenerationFile(id)
  if (!gen) return NextResponse.json({ error: 'No existe esa planilla' }, { status: 404 })

  let data: Uint8Array<ArrayBuffer>
  if (gen.fileData) {
    data = new Uint8Array(gen.fileData)
  } else if (gen.onedriveItemId) {
    try {
      const { driveId } = await getFolder()
      data = new Uint8Array(await downloadDriveFile(driveId, gen.onedriveItemId, await getGraphToken()))
    } catch (err: any) {
      return NextResponse.json({ error: `No se pudo bajar el archivo de OneDrive: ${err.message}` }, { status: 502 })
    }
  } else {
    return NextResponse.json({ error: 'Esa corrida no tiene Excel guardado' }, { status: 404 })
  }

  const name = encodeURIComponent(gen.fileName)
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${name}`,
      'Cache-Control': 'no-store',
    },
  })
}
