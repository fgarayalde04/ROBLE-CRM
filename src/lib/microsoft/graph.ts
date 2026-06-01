// App-only authentication via client_credentials grant
// No user login required for server-side sync operations

export interface DriveItem {
  id: string
  name: string
  webUrl: string
  folder?: { childCount: number }
  file?: { mimeType: string; hashes?: { quickXorHash?: string } }
  parentReference?: { path: string; driveId: string; id: string }
  lastModifiedDateTime?: string
  createdDateTime?: string
  size?: number
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.MICROSOFT_TENANT_ID
  const clientId     = process.env.MICROSOFT_CLIENT_ID
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
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
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

export function isGraphConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  )
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listFolderChildren(
  driveId: string,
  itemId: string,
  token: string
): Promise<DriveItem[]> {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/children` +
    `?$select=id,name,webUrl,folder,file,parentReference,lastModifiedDateTime,createdDateTime,size&$top=500&$orderby=name`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error listing ${driveId}/${itemId}: ${err}`)
  }
  const data = await res.json()
  return (data.value ?? []) as DriveItem[]
}

export async function getDriveItem(
  driveId: string,
  itemId: string,
  token: string
): Promise<DriveItem> {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
    `?$select=id,name,webUrl,folder,file,parentReference,lastModifiedDateTime,createdDateTime,size`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error getting item ${driveId}/${itemId}: ${err}`)
  }
  return res.json()
}

export async function downloadDriveFile(
  driveId: string,
  itemId: string,
  token: string
): Promise<ArrayBuffer> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph download error ${driveId}/${itemId}: ${err}`)
  }
  return res.arrayBuffer()
}

/** Get a short-lived download URL (no auth required once obtained). */
export async function getDownloadUrl(
  driveId: string,
  itemId: string,
  token: string
): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}?$select=@microsoft.graph.downloadUrl`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph getDownloadUrl error: ${await res.text()}`)
  const data = await res.json()
  const dlUrl = data['@microsoft.graph.downloadUrl']
  if (!dlUrl) throw new Error('No download URL in response')
  return dlUrl as string
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchInFolder(
  driveId: string,
  folderId: string,
  query: string,
  token: string
): Promise<DriveItem[]> {
  // Graph search within a specific folder subtree
  const url =
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/search(q='${encodeURIComponent(query)}')` +
    `?$select=id,name,webUrl,folder,file,parentReference,lastModifiedDateTime,size&$top=100`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph search error: ${err}`)
  }
  const data = await res.json()
  return (data.value ?? []) as DriveItem[]
}

// ─── Write ────────────────────────────────────────────────────────────────────

/** Upload a file into a parent folder. Overwrites if a file with the same name exists. */
export async function uploadFile(
  driveId: string,
  parentId: string,
  filename: string,
  content: ArrayBuffer,
  mimeType: string,
  token: string
): Promise<DriveItem> {
  const encoded = encodeURIComponent(filename)
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}:/${encoded}:/content`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: content,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph upload error: ${err}`)
  }
  return res.json()
}

/** Create a new folder inside parentId. */
export async function createFolder(
  driveId: string,
  parentId: string,
  folderName: string,
  token: string
): Promise<DriveItem> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph createFolder error: ${err}`)
  }
  return res.json()
}

/** Rename an item (file or folder). */
export async function renameItem(
  driveId: string,
  itemId: string,
  newName: string,
  token: string
): Promise<DriveItem> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph rename error: ${err}`)
  }
  return res.json()
}

/** Move an item to a new parent folder. Optionally rename at the same time. */
export async function moveItem(
  driveId: string,
  itemId: string,
  newParentId: string,
  token: string,
  newName?: string
): Promise<DriveItem> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`
  const body: Record<string, unknown> = {
    parentReference: { driveId, id: newParentId },
  }
  if (newName) body.name = newName

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph move error: ${err}`)
  }
  return res.json()
}

/** Permanently delete an item. */
export async function deleteItem(
  driveId: string,
  itemId: string,
  token: string
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.text()
    throw new Error(`Graph delete error: ${err}`)
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

/** Get an embed URL for in-browser preview via Microsoft 365 viewer. */
export async function getPreviewUrl(
  driveId: string,
  itemId: string,
  token: string
): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/preview`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph preview error: ${err}`)
  }
  const data = await res.json()
  return (data.getUrl ?? data.postUrl ?? '') as string
}
