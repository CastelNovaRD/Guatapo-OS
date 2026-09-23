import 'server-only'

import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'

export type CustomerDocumentType = 'cedula' | 'rnc' | null

export type CustomerFilters = {
  search?: string
  active?: boolean
  limit?: number
  offset?: number
}

/** `full_name` and `cedula` are temporary input aliases for existing callers. */
export type CustomerInput = {
  fullName?: string
  full_name?: string
  document?: string | null
  cedula?: string | null
  documentType?: CustomerDocumentType
  phone?: string | null
  address?: string | null
  email?: string | null
  active?: boolean
}

const scope = (context: TenantContext) => [
  context.organizationId,
  context.installationId,
  context.storeId,
]

const select = `id, full_name, document, document as cedula, document_type,
  phone, address, email, active, created_at, updated_at`

function nullableText(value: string | null | undefined) {
  return value?.trim() || null
}

function customerName(input: CustomerInput) {
  return input.fullName?.trim() || input.full_name?.trim() || ''
}

function customerDocument(input: CustomerInput) {
  return nullableText(input.document ?? input.cedula)
}

function assertDocumentType(value: CustomerDocumentType | undefined) {
  if (value !== undefined && value !== null && value !== 'cedula' && value !== 'rnc') {
    throw new Error('documentType must be cedula, rnc or null.')
  }
}

export async function listCustomers(context: TenantContext, filters: CustomerFilters = {}) {
  const values: unknown[] = [...scope(context)]
  const clauses = [
    'organization_id = $1',
    'installation_id = $2',
    'store_id = $3',
  ]

  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim()}%`)
    clauses.push(`(full_name ilike $${values.length} or document ilike $${values.length})`)
  }
  if (filters.active !== undefined) {
    values.push(filters.active)
    clauses.push(`active = $${values.length}`)
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)
  values.push(limit, offset)

  return (
    await query(
      `select ${select}
         from customers
        where ${clauses.join(' and ')}
        order by created_at desc, id desc
        limit $${values.length - 1} offset $${values.length}`,
      values
    )
  ).rows
}

export async function getCustomerById(context: TenantContext, id: string) {
  return (
    await query(
      `select ${select}
         from customers
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4`,
      [id, ...scope(context)]
    )
  ).rows[0] || null
}

export const getCustomer = getCustomerById

export async function createCustomer(context: TenantContext, input: CustomerInput) {
  const fullName = customerName(input)
  if (!fullName) throw new Error('fullName is required.')
  assertDocumentType(input.documentType)

  return (
    await query(
      `insert into customers (
         organization_id, installation_id, store_id, full_name, document,
         document_type, phone, address, email, active
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${select}`,
      [
        ...scope(context),
        fullName,
        customerDocument(input),
        input.documentType ?? null,
        nullableText(input.phone),
        nullableText(input.address),
        nullableText(input.email),
        input.active ?? true,
      ]
    )
  ).rows[0]
}

export async function updateCustomer(context: TenantContext, id: string, input: CustomerInput) {
  assertDocumentType(input.documentType)
  const updates: [string, unknown][] = []
  const has = (field: keyof CustomerInput) => Object.prototype.hasOwnProperty.call(input, field)

  if (has('fullName') || has('full_name')) {
    const fullName = customerName(input)
    if (!fullName) throw new Error('fullName cannot be empty.')
    updates.push(['full_name', fullName])
  }
  if (has('document') || has('cedula')) updates.push(['document', customerDocument(input)])
  if (has('documentType')) updates.push(['document_type', input.documentType ?? null])
  if (has('phone')) updates.push(['phone', nullableText(input.phone)])
  if (has('address')) updates.push(['address', nullableText(input.address)])
  if (has('email')) updates.push(['email', nullableText(input.email)])
  if (has('active')) {
    if (typeof input.active !== 'boolean') throw new Error('active must be boolean.')
    updates.push(['active', input.active])
  }

  if (updates.length === 0) return getCustomerById(context, id)

  const values = updates.map(([, value]) => value)
  const assignments = updates.map(([column], index) => `${column} = $${index + 1}`).join(', ')
  values.push(id, ...scope(context))

  return (
    await query(
      `update customers
          set ${assignments}, updated_at = now()
        where id = $${updates.length + 1}
          and organization_id = $${updates.length + 2}
          and installation_id = $${updates.length + 3}
          and store_id = $${updates.length + 4}
        returning ${select}`,
      values
    )
  ).rows[0] || null
}

export async function setCustomerActive(context: TenantContext, id: string, active: boolean) {
  return (
    await query(
      `update customers
          set active = $1, updated_at = now()
        where id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5
        returning ${select}`,
      [active, id, ...scope(context)]
    )
  ).rows[0] || null
}

// Kept for the existing customer route; all deletion criteria remain tenant-scoped.
export async function deleteCustomer(context: TenantContext, id: string) {
  return (
    (await query(
      `delete from customers
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4`,
      [id, ...scope(context)]
    )).rowCount ?? 0
  ) > 0
}
