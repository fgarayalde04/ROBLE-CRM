// Armado automático a fin de mes: el día 1 se crean los borradores de "Fondos
// más comprados" y "Bonos más comprados" del mes anterior (con las órdenes y los
// rendimientos ya cargados) y se avisa por notificación + push a quienes
// publican Research, para que escriban la visión y lo manden.
// Idempotente: un borrador por tipo y mes, y un aviso por borrador y persona.

import { RESEARCH_AUTHOR_ROLES } from '@/lib/auth'
import { createNotification } from '@/lib/db/notifications'
import { createPlantillaAuto, getPlantillaAuto } from '@/lib/db/plantillas'
import { getUsersByRoles } from '@/lib/db/users'
import { sendPushNotification } from '@/lib/push/server'
import { periodoMes, type Periodo } from '@/lib/masOperado/periodos'
import { datosIniciales } from './datosAuto'
import { TIPOS_PLANTILLA, tituloDocumento, type TipoPlantilla } from './tipos'

const TIPOS_AUTO: ('mas_operado_fondos' | 'mas_operado_bonos')[] = ['mas_operado_fondos', 'mas_operado_bonos']
const NOTIF_TYPE = 'plantilla_mensual'

export interface ResultadoAuto {
  mes: string
  tipo: TipoPlantilla
  estado: 'creada' | 'ya_existia' | 'sin_compras'
  id?: string
  avisos: number
}

/** Mes (YYYY-MM) que cubre el informe: el anterior a la fecha dada. */
export function mesDelInforme(hoy: string): Periodo {
  const d = new Date(`${hoy}T12:00:00Z`)
  return periodoMes(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10))
}

async function avisar(docId: string, tipo: TipoPlantilla, periodo: Periodo, cantidad: number) {
  const que = tipo === 'mas_operado_fondos' ? 'fondos' : 'bonos'
  const titulo = `📝 ${TIPOS_PLANTILLA[tipo].label} · ${periodo.label}`
  const mensaje = `Ya está armado el borrador con los ${cantidad} ${que} más comprados. Falta escribir nuestra visión de mercado para publicarlo o mandarlo.`
  const url = `/plantillas/${docId}`
  let avisos = 0
  for (const u of await getUsersByRoles(RESEARCH_AUTHOR_ROLES)) {
    const creada = await createNotification({
      userId: u.id, userName: u.name, notifType: NOTIF_TYPE, title: titulo, message: mensaje,
      clientName: null, entityType: 'plantilla', entityId: docId, url,
    })
    if (!creada) continue   // ya se le avisó
    avisos++
    try {
      await sendPushNotification({ userId: u.id, title: titulo, body: mensaje, url, type: NOTIF_TYPE, entityId: docId, tag: `plantilla-${docId}` })
    } catch (err) {
      console.error('[plantillas-mensuales] push failed', u.name, err)   // la notificación interna ya quedó
    }
  }
  return avisos
}

export async function armarPlantillasMensuales(hoy: string, opts: { avisar: boolean }): Promise<ResultadoAuto[]> {
  const periodo = mesDelInforme(hoy)
  const mes = periodo.desde.slice(0, 7)
  const resultados: ResultadoAuto[] = []
  for (const tipo of TIPOS_AUTO) {
    let doc = await getPlantillaAuto(tipo, mes)
    let estado: ResultadoAuto['estado'] = 'ya_existia'
    if (!doc) {
      const datos = await datosIniciales(tipo, { desde: periodo.desde, hasta: periodo.hasta })
      if (!datos.compras?.length) {
        resultados.push({ mes, tipo, estado: 'sin_compras', avisos: 0 })
        continue
      }
      doc = await createPlantillaAuto({
        tipo, periodo: mes, titulo: tituloDocumento(tipo, datos), datos, researchType: TIPOS_PLANTILLA[tipo].categoriaResearch,
      }) ?? await getPlantillaAuto(tipo, mes)
      estado = 'creada'
    }
    if (!doc) continue
    const avisos = opts.avisar ? await avisar(doc.id, tipo, periodo, doc.datos?.compras?.length ?? 0) : 0
    resultados.push({ mes, tipo, estado, id: doc.id, avisos })
  }
  return resultados
}
