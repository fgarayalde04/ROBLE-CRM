import FichaBono, { FICHA_BONO_PAGE } from './FichaBono'
import AnalisisBonos, { ANALISIS_PAGE } from './AnalisisBonos'
import { ComparativoFondos, MasOperado, TABLAS_PAGE } from './Tablas'
import type { TipoPlantilla } from '@/lib/plantillas/tipos'

export const PAGINA_PLANTILLA: Record<TipoPlantilla, { width: number; height: number }> = {
  ficha_bono: FICHA_BONO_PAGE,
  analisis_bonos: ANALISIS_PAGE,
  comparativo_fondos: TABLAS_PAGE,
  mas_operado_fondos: TABLAS_PAGE,
  mas_operado_bonos: TABLAS_PAGE,
}

export function imagenPlantillaUrl(key: string) {
  return `/api/plantillas/imagen?key=${encodeURIComponent(key)}`
}

/** Documento de plantilla tal cual sale en el PDF (una o más hojas). */
export default function PlantillaRender({ tipo, datos }: { tipo: TipoPlantilla; datos: any }) {
  switch (tipo) {
    case 'ficha_bono': return <FichaBono datos={datos} />
    case 'analisis_bonos': return <AnalisisBonos datos={datos} imagenUrl={imagenPlantillaUrl} />
    case 'comparativo_fondos': return <ComparativoFondos datos={datos} />
    default: return <MasOperado tipo={tipo} datos={datos} />
  }
}
