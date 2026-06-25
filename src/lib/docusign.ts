import docusign from 'docusign-esign'

const BASE_PATH  = 'https://www.docusign.net/restapi'
const OAUTH_HOST = 'account.docusign.com'

let _cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token
  }

  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY!
  const accountId      = process.env.DOCUSIGN_ACCOUNT_ID!
  const userId         = process.env.DOCUSIGN_USER_ID!
  const privateKey     = process.env.DOCUSIGN_PRIVATE_KEY!.replace(/\\n/g, '\n')

  if (!integrationKey || !accountId || !userId || !privateKey) {
    throw new Error('Faltan variables de entorno de DocuSign (DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_ACCOUNT_ID, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY)')
  }

  const apiClient = new docusign.ApiClient()
  apiClient.setOAuthBasePath(OAUTH_HOST)

  const results = await apiClient.requestJWTUserToken(
    integrationKey,
    userId,
    ['signature', 'impersonation'],
    Buffer.from(privateKey),
    3600
  )

  _cachedToken = {
    token:     results.body.access_token,
    expiresAt: Date.now() + results.body.expires_in * 1000,
  }
  return _cachedToken.token
}

export async function getApiClient(): Promise<{ client: docusign.ApiClient; accountId: string }> {
  const token     = await getAccessToken()
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!
  const client    = new docusign.ApiClient()
  client.setBasePath(BASE_PATH)
  client.addDefaultHeader('Authorization', `Bearer ${token}`)
  return { client, accountId }
}

export interface Firmante {
  nombre:    string
  apellido:  string
  email:     string
  rol:       string
  orden:     number   // 1, 2, 3 …
  routingOrder?: number
}

export interface DocumentoEnvio {
  nombre:    string
  contenido: Buffer   // DOCX o PDF en binario
  tipo:      'docx' | 'pdf'
}

export interface EnvioConfig {
  asunto:        string
  mensaje:       string
  firmantes:     Firmante[]
  documentos:    DocumentoEnvio[]
  fechaLimite?:  Date
}

// Crea un envelope en DocuSign y lo envía
export async function crearYEnviarEnvelope(config: EnvioConfig): Promise<{ envelopeId: string }> {
  const { client, accountId } = await getApiClient()

  // Build DocuSign documents
  const dsDocuments: docusign.Document[] = config.documentos.map((doc, i) => ({
    documentBase64: doc.contenido.toString('base64'),
    name:           doc.nombre,
    fileExtension:  doc.tipo,
    documentId:     String(i + 1),
  }))

  // Build signers — each firmante gets a SignHere tab on the last page
  const signers: docusign.Signer[] = config.firmantes.map((f, i) => {
    const tabs: docusign.Tabs = {
      signHereTabs: [{
        anchorString:       '/firma/',
        anchorUnits:        'pixels',
        anchorIgnoreIfNotPresent: 'true',
        anchorXOffset:      '0',
        anchorYOffset:      '0',
      }],
      dateSignedTabs: [{
        anchorString:       '/fecha_firma/',
        anchorUnits:        'pixels',
        anchorIgnoreIfNotPresent: 'true',
      }],
    }

    return {
      email:          f.email,
      name:           `${f.nombre} ${f.apellido}`.trim(),
      recipientId:    String(i + 1),
      routingOrder:   String(f.orden),
      roleName:       f.rol,
      tabs,
    }
  })

  const envelopeDefinition: docusign.EnvelopeDefinition = {
    emailSubject: config.asunto,
    emailBlurb:   config.mensaje,
    documents:    dsDocuments,
    recipients: {
      signers,
    },
    status: 'sent',
    ...(config.fechaLimite ? { expirationDateTime: config.fechaLimite.toISOString() } : {}),
  }

  const envelopesApi = new docusign.EnvelopesApi(client)
  const result = await envelopesApi.createEnvelope(accountId, { envelopeDefinition })

  return { envelopeId: result.envelopeId! }
}

// Obtiene el estado de un envelope
export async function getEnvelopeStatus(envelopeId: string) {
  const { client, accountId } = await getApiClient()
  const envelopesApi = new docusign.EnvelopesApi(client)
  return envelopesApi.getEnvelope(accountId, envelopeId)
}

// Descarga el documento firmado (PDF combinado)
export async function downloadSignedDoc(envelopeId: string): Promise<Buffer> {
  const { client, accountId } = await getApiClient()
  const envelopesApi = new docusign.EnvelopesApi(client)
  const result = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null as any)
  return Buffer.from(result as unknown as string, 'binary')
}

// Descarga el certificado de firma
export async function downloadCertificate(envelopeId: string): Promise<Buffer> {
  const { client, accountId } = await getApiClient()
  const envelopesApi = new docusign.EnvelopesApi(client)
  const result = await envelopesApi.getDocument(accountId, envelopeId, 'certificate', null as any)
  return Buffer.from(result as unknown as string, 'binary')
}

// Reenvía recordatorio a los firmantes pendientes
export async function reenviarRecordatorio(envelopeId: string): Promise<void> {
  const { client, accountId } = await getApiClient()
  const envelopesApi = new docusign.EnvelopesApi(client)
  await envelopesApi.update(accountId, envelopeId, {
    envelope: { resend_envelope: 'true' } as any,
  })
}

// Cancela un envelope
export async function cancelarEnvelope(envelopeId: string, motivo?: string): Promise<void> {
  const { client, accountId } = await getApiClient()
  const envelopesApi = new docusign.EnvelopesApi(client)
  await envelopesApi.update(accountId, envelopeId, {
    envelope: { status: 'voided', voidedReason: motivo ?? 'Cancelado desde CRM' },
  })
}

// Mapea estados de DocuSign a estados internos del CRM
export function mapDsEstado(dsStatus: string): string {
  const map: Record<string, string> = {
    created:   'borrador',
    sent:      'enviado',
    delivered: 'visto',
    signed:    'firmado_parcial',
    completed: 'firmado_completo',
    declined:  'rechazado',
    voided:    'cancelado',
    expired:   'vencido',
  }
  return map[dsStatus] ?? dsStatus
}
