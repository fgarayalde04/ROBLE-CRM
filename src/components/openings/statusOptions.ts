import type { OpeningStatus } from '@/types/platform'

export const OPENING_STATUS_OPTIONS: { value: OpeningStatus; label: string }[] = [
  { value: 'carpeta_creada', label: 'Pendiente de apertura' },
  { value: 'recolectando_informacion', label: 'Recolectando informacion' },
  { value: 'documentacion_incompleta', label: 'Documentacion incompleta' },
  { value: 'documentacion_completa', label: 'Documentacion completa' },
  { value: 'formularios_enviados', label: 'Formularios enviados' },
  { value: 'enviado_al_banco', label: 'Enviado al banco' },
  { value: 'en_revision_banco', label: 'En revision banco' },
  { value: 'cuenta_abierta', label: 'Cuenta abierta' },
  { value: 'trabado', label: 'Trabado' },
  { value: 'descartado', label: 'Descartado' },
]
