// App-only authentication via client_credentials grant
// No user login required for server-side sync operations
// webUrls open in browser where user is already logged into Microsoft

export interface DriveItem {
  id: string
  name: string
  webUrl: string
  folder?: { childCount: number }
  file?: { mimeType: string; size: number }
  parentReference?: { path: string; driveId: string }
  lastModifiedDateTime?: string
  size?: number
}

// Get app-only access token using client_credentials flow
export async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Microsoft credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET in .env.local')
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Microsoft auth failed: ${err}`)
  }

  const data = await res.json()
  return data.access_token as string
}

// List children of a drive folder
export async function listFolderChildren(
  driveId: string,
  itemId: string,
  token: string
): Promise<DriveItem[]> {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children` +
    `?$select=id,name,webUrl,folder,file,parentReference,lastModifiedDateTime,size&$top=500`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error listing ${driveId}/${itemId}: ${err}`)
  }

  const data = await res.json()
  return (data.value ?? []) as DriveItem[]
}

// Get a single drive item
export async function getDriveItem(
  driveId: string,
  itemId: string,
  token: string
): Promise<DriveItem> {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
    `?$select=id,name,webUrl,folder,file,parentReference,lastModifiedDateTime`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error getting item ${driveId}/${itemId}: ${err}`)
  }

  return res.json()
}

// Check if Microsoft Graph is configured
export function isGraphConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  )
}
