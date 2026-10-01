import FichaBono, { FICHA_BONO_PAGE } from './FichaBono'
import AnalisisBonos, { ANALISIS_PAGE } from './AnalisisBonos'
import type { TipoPlantilla } from '@/lib/plantillas/tipos'

export const PAGINA_PLANTILLA: Record<TipoPlantilla, { width: number; height: number }> = {
  ficha_bono: FICHA_BONO_PAGE,
  analisis_bonos: ANALISIS_PAGE,
}

export function imagenPlantillaUrl(key: string) {
  return `/api/plantillas/imagen?key=${encodeURIComponent(key)}`
}

/** Documento de plantilla tal cual sale en el PDF (una o más hojas). */
export default function PlantillaRender({ tipo, datos }: { tipo: TipoPlantilla; datos: any }) {
  if (tipo === 'ficha_bono') return <FichaBono datos={datos} />
  return <AnalisisBonos datos={datos} imagenUrl={imagenPlantillaUrl} />
}
