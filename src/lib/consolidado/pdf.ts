// PDF de la Posición Consolidada con el formato de estado de cuenta.
import { encabezadoPdf, htmlPortada, piePdf } from '@/lib/estadoCuenta/base'
import { imprimirEstadoCuenta, type PartesPdf } from '@/lib/estadoCuenta/imprimir'
import type { Reporte } from './calc'
import { htmlEstadoCuenta, type OpcionesDocumento } from './html'

const TITULO = 'Posición consolidada'

export function partesConsolidado(r: Reporte, o: OpcionesDocumento): PartesPdf {
  return {
    portada: htmlPortada({ titulo: TITULO, cliente: o.cliente, fecha: r.fecha, pershing: r.bancos.includes('Pershing'), morgan: r.bancos.includes('Morgan Stanley') }),
    cuerpo: htmlEstadoCuenta(r, o),
    encabezado: encabezadoPdf(TITULO, o.cliente, r.fecha),
    pie: piePdf(o.cliente),
    titulo: `${TITULO}${o.cliente.trim() ? ` - ${o.cliente.trim()}` : ''}`,
  }
}

export const generarPdfConsolidado = (r: Reporte, o: OpcionesDocumento) => imprimirEstadoCuenta(partesConsolidado(r, o))
