import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type NcfRange = {
  id: string
  organization_id: string
  installation_id: string
  store_id: string
  receipt_type: string
  prefix: string
  range_start: string | number
  range_end: string | number
  next_number: string | number
  expires_at: string | null
  active: boolean
}

export type NcfRangeInput = {
  receipt_type: string
  prefix: string
  range_start: number
  range_end: number
  next_number?: number
  expires_at?: string | null
  active?: boolean
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

export async function listNcfRanges(context: TenantContext) {
  const result = await query<NcfRange>(
    `select
        id,
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active
       from ncf_receipts
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
      order by receipt_type asc, active desc, range_start asc`,
    scope(context)
  )

  return result.rows
}

export async function getNcfRangeById(
  context: TenantContext,
  id: string
) {
  const result = await query<NcfRange>(
    `select
        id,
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active
       from ncf_receipts
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4
      limit 1`,
    [id, ...scope(context)]
  )

  return result.rows[0] ?? null
}

export async function createNcfRange(
  context: TenantContext,
  input: NcfRangeInput
) {
  const nextNumber = input.next_number ?? input.range_start

  const result = await query<NcfRange>(
    `insert into ncf_receipts (
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning
        id,
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active`,
    [
      context.organizationId,
      context.installationId,
      context.storeId,
      input.receipt_type.trim().toUpperCase(),
      input.prefix.trim().toUpperCase(),
      input.range_start,
      input.range_end,
      nextNumber,
      input.expires_at || null,
      input.active !== false,
    ]
  )

  return result.rows[0]
}

export async function updateNcfRange(
  context: TenantContext,
  id: string,
  input: NcfRangeInput
) {
  const nextNumber = input.next_number ?? input.range_start

  const result = await query<NcfRange>(
    `update ncf_receipts
        set receipt_type = $1,
            prefix = $2,
            range_start = $3,
            range_end = $4,
            next_number = $5,
            expires_at = $6,
            active = $7
      where id = $8
        and organization_id = $9
        and installation_id = $10
        and store_id = $11
      returning
        id,
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active`,
    [
      input.receipt_type.trim().toUpperCase(),
      input.prefix.trim().toUpperCase(),
      input.range_start,
      input.range_end,
      nextNumber,
      input.expires_at || null,
      input.active !== false,
      id,
      ...scope(context),
    ]
  )

  return result.rows[0] ?? null
}

export async function setNcfRangeActive(
  context: TenantContext,
  id: string,
  active: boolean
) {
  const result = await query<NcfRange>(
    `update ncf_receipts
        set active = $1
      where id = $2
        and organization_id = $3
        and installation_id = $4
        and store_id = $5
      returning
        id,
        organization_id,
        installation_id,
        store_id,
        receipt_type,
        prefix,
        range_start,
        range_end,
        next_number,
        expires_at,
        active`,
    [active, id, ...scope(context)]
  )

  return result.rows[0] ?? null
}

export async function deleteNcfRange(
  context: TenantContext,
  id: string
) {
  const result = await query<{ id: string }>(
    `delete from ncf_receipts
      where id = $1
        and organization_id = $2
        and installation_id = $3
        and store_id = $4
      returning id`,
    [id, ...scope(context)]
  )

  return result.rows[0] ?? null
}