'use client'

import FormularioDirecto from './FormularioDirecto'

export default function NuevaSolicitudForm({ gmailConnected = true, userEmail = '' }: { gmailConnected?: boolean; userEmail?: string }) {
  return <FormularioDirecto onBack={() => {}} gmailConnected={gmailConnected} userEmail={userEmail} />
}
