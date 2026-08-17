import { pool } from './pool'

export async function findUserByEmail(email: string) {
  const { rows } = await pool.query(
    `select id, name, email, role, password_hash, active, permissions, must_change_password, modo_asesor
     from crm_users where email = $1`,
    [email.toLowerCase().trim()]
  )
  return rows[0] ?? null
}

export async function getUserAuthExtras(userId: string) {
  const { rows } = await pool.query(
    `select permissions, see_all_folders, modo_asesor from crm_users where id = $1`,
    [userId]
  )
  return rows[0] ?? null
}

export async function getUserFolderPermissions(userId: string) {
  const { rows } = await pool.query(
    `select folder_name from user_client_folder_permissions where user_id = $1 and can_view = true`,
    [userId]
  )
  return rows.map((r) => r.folder_name) as string[]
}

export async function getUserPasswordHash(userId: string) {
  const { rows } = await pool.query(`select id, password_hash from crm_users where id = $1`, [userId])
  return rows[0] ?? null
}

export async function updateUserPassword(userId: string, newHash: string) {
  await pool.query(
    `update crm_users set password_hash = $1, must_change_password = false, updated_at = now() where id = $2`,
    [newHash, userId]
  )
}

export async function getUserOneDriveConfig(userId: string) {
  const { rows } = await pool.query(
    `select onedrive_drive_id, onedrive_folder_id, onedrive_folder_path from crm_users where id = $1`,
    [userId]
  )
  return rows[0] ?? null
}

export async function getActiveUsersWithEmail() {
  const { rows } = await pool.query(
    `select name, email from crm_users where active = true and email is not null order by name`
  )
  return rows
}

// ─── Admin CRUD ─────────────────────────────────────────────────────────────

export async function listUsers() {
  const { rows } = await pool.query(
    `select id, name, email, role, active, permissions, modo_asesor, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path, created_at, updated_at
     from crm_users order by name`
  )
  return rows
}

export async function getUsersByRoles(roles: string[]) {
  const { rows } = await pool.query(
    `select id, name from crm_users where role = ANY($1) and active = true`,
    [roles]
  )
  return rows as { id: string; name: string }[]
}

export async function listAdvisorFolders() {
  const { rows } = await pool.query(
    `select distinct advisor from clients where advisor is not null order by advisor`
  )
  return rows.map((r) => r.advisor) as string[]
}

export async function createUser(input: {
  name: string; email: string | null; passwordHash: string; role: string
  mustChangePassword?: boolean
  onedriveDriveId?: string | null; onedriveFolderId?: string | null; onedriveFolderPath?: string | null
}) {
  const { rows } = await pool.query(
    `insert into crm_users (name, email, password_hash, role, active, must_change_password, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path)
     values ($1, $2, $3, $4, true, $5, $6, $7, $8)
     returning id, name, email, role, active, created_at`,
    [
      input.name,
      input.email,
      input.passwordHash,
      input.role,
      input.mustChangePassword ?? true,
      input.onedriveDriveId ?? null,
      input.onedriveFolderId ?? null,
      input.onedriveFolderPath ?? null,
    ]
  )
  return rows[0]
}

export async function updateUser(id: string, updates: Record<string, any>) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  const setClause = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([, v]) => v)
  values.push(id)
  const { rows } = await pool.query(
    `update crm_users set ${setClause.join(', ')} where id = $${values.length}
     returning id, name, email, role, active, permissions, modo_asesor, onedrive_drive_id, onedrive_folder_id, onedrive_folder_path`,
    values
  )
  if (rows.length === 0) throw new Error('User not found')
  return rows[0]
}

export async function getUserPermissions(id: string) {
  const { rows } = await pool.query(`select permissions from crm_users where id = $1`, [id])
  if (rows.length === 0) throw new Error('User not found')
  return rows[0].permissions as string[] | null
}

export async function approveUser(id: string, cleanedPermissions: string[]) {
  const { rows } = await pool.query(
    `update crm_users set active = true, permissions = $1, updated_at = now() where id = $2
     returning id, name, email, role, active, permissions`,
    [cleanedPermissions.length > 0 ? cleanedPermissions : null, id]
  )
  if (rows.length === 0) throw new Error('User not found')
  return rows[0]
}

export async function deleteUser(id: string) {
  await pool.query(`delete from crm_users where id = $1`, [id])
}

export async function setFolderPermissions(userId: string, seeAllFolders: boolean, folders: string[]) {
  await pool.query(
    `update crm_users set see_all_folders = $1, updated_at = now() where id = $2`,
    [seeAllFolders, userId]
  )
  await pool.query(`delete from user_client_folder_permissions where user_id = $1`, [userId])
  if (!seeAllFolders && folders.length > 0) {
    const values: any[] = []
    const rows = folders.map((folder_name, i) => {
      values.push(userId, folder_name)
      return `($${i * 2 + 1}, $${i * 2 + 2}, true, now())`
    })
    await pool.query(
      `insert into user_client_folder_permissions (user_id, folder_name, can_view, updated_at) values ${rows.join(', ')}`,
      values
    )
  }
}

export async function getFolderPermissionsView(userId: string) {
  const { rows } = await pool.query(`select see_all_folders from crm_users where id = $1`, [userId])
  const { rows: permRows } = await pool.query(
    `select folder_name from user_client_folder_permissions where user_id = $1 and can_view = true`,
    [userId]
  )
  return {
    see_all_folders: rows[0]?.see_all_folders ?? false,
    folders: permRows.map((r) => r.folder_name),
  }
}

// ─── Microsoft SSO ──────────────────────────────────────────────────────────

export async function findUserByEmailForSSO(email: string) {
  const { rows } = await pool.query(
    `select id, name, email, role, active, permissions from crm_users where email = $1`,
    [email]
  )
  return rows[0] ?? null
}

export async function createPendingSSOUser(name: string, email: string) {
  await pool.query(
    `insert into crm_users (name, email, role, active, permissions) values ($1, $2, 'asesor', false, $3)`,
    [name, email, ['_pending_approval']]
  )
}
