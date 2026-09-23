import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type DgiiContributorRecord = {
  document: string
  registeredName: string
  taxpayerType: string | null
}

export async function findDgiiContributorByDocument(
  _tenant: TenantContext,
  document: string,
): Promise<DgiiContributorRecord | null> {
  const result = await query<{ document: string; registered_name: string; taxpayer_type: string | null }>(
    `SELECT document, registered_name, taxpayer_type
     FROM dgii_contributors
     WHERE document = $1
     LIMIT 1`,
    [document],
  )

  const row = result.rows[0]
  return row
    ? { document: row.document, registeredName: row.registered_name, taxpayerType: row.taxpayer_type }
    : null
}

