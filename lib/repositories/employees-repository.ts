import 'server-only'

import { randomUUID } from 'crypto'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { hashPassword } from '@/lib/auth/passwords'
import { withTransaction } from '@/lib/db'

export type PermissionMap = Record<string, boolean>

export type Employee = {
  id: string
  store_id: string
  auth_user_id: string | null
  full_name: string
  email: string
  phone: string | null
  cedula: string | null
  salary: number
  position: string | null
  role: string
  permissions: PermissionMap
  active: boolean
  notes: string | null
  hired_at: string | null
  created_at: string
}

export type EmployeeInput = {
  email: string
  password?: string
  full_name: string
  phone?: string | null
  cedula?: string | null
  salary?: number
  position?: string | null
  role: string
  permissions: PermissionMap
  active?: boolean
  notes?: string | null
  hired_at?: string | null
}

const employeeSelect = `
  e.id,
  e.store_id,
  e.auth_user_id,
  e.full_name,
  coalesce(p.email, '') as email,
  e.phone,
  e.cedula,
  e.salary,
  e.position,
  e.role,
  coalesce(su.permissions, '{}'::jsonb) as permissions,
  e.active,
  e.notes,
  e.hired_at,
  e.created_at
`

function scope(context: TenantContext) {
  return [context.organizationId, context.installationId, context.storeId]
}

function nullableText(value: string | null | undefined) {
  const text = value?.trim()
  return text || null
}

function values(input: EmployeeInput) {
  return {
    email: input.email.trim().toLowerCase(),
    fullName: input.full_name.trim(),
    phone: nullableText(input.phone),
    cedula: nullableText(input.cedula),
    salary: Number(input.salary ?? 0),
    position: nullableText(input.position),
    role: input.role.trim(),
    permissions: input.permissions,
    active: input.active !== false,
    notes: nullableText(input.notes),
    hiredAt: input.hired_at || null,
  }
}

async function findConflictingEmail(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  email: string,
  excludedUserId?: string
) {
  const result = await client.query<{ id: string }>(
    `select id
       from app_profiles
      where lower(email) = $1
        and ($2::uuid is null or id <> $2::uuid)
      limit 1`,
    [email, excludedUserId ?? null]
  )
  return result.rows[0] ?? null
}

async function selectEmployee(
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  context: TenantContext,
  id: string,
  lock = false
) {
  const result = await client.query<Employee>(
    `select ${employeeSelect}
       from employees e
       left left join app_profiles p
         on p.id = e.auth_user_id
        and p.organization_id = e.organization_id
        and p.installation_id = e.installation_id
       left join store_users su
         on su.user_id = e.auth_user_id
        and su.store_id = e.store_id
        and su.organization_id = e.organization_id
        and su.installation_id = e.installation_id
      where e.id = $1
        and e.organization_id = $2
        and e.installation_id = $3
        and e.store_id = $4
      limit 1${lock ? ' for update of e' : ''}`,
    [id, ...scope(context)]
  )
  return result.rows[0] ?? null
}

export async function listEmployees(context: TenantContext) {
  return withTransaction(async (client) => {
    const result = await client.query<Employee>(
      `select ${employeeSelect}
         from employees e
         left left join app_profiles p
           on p.id = e.auth_user_id
          and p.organization_id = e.organization_id
          and p.installation_id = e.installation_id
         left join store_users su
           on su.user_id = e.auth_user_id
          and su.store_id = e.store_id
          and su.organization_id = e.organization_id
          and su.installation_id = e.installation_id
        where e.organization_id = $1
          and e.installation_id = $2
          and e.store_id = $3
        order by e.created_at desc`,
      scope(context)
    )
    return result.rows
  })
}

export async function getEmployeeById(context: TenantContext, id: string) {
  return withTransaction((client) => selectEmployee(client, context, id))
}

export async function createEmployee(context: TenantContext, input: EmployeeInput) {
  const employee = values(input)
  const userId = randomUUID()
  const passwordHash = await hashPassword(input.password!)

  return withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [employee.email])
    if (await findConflictingEmail(client, employee.email)) {
      const error = new Error('El correo electrónico ya está asociado a otra cuenta.')
      error.name = 'EmailConflictError'
      throw error
    }

    await client.query(
      `insert into app_profiles (
        id, organization_id, installation_id, full_name, role, active,
        email, password_hash, password_changed_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        userId,
        context.organizationId,
        context.installationId,
        employee.fullName,
        employee.role,
        employee.active,
        employee.email,
        passwordHash,
      ]
    )

    await client.query(
      `insert into store_users (
        store_id, user_id, organization_id, installation_id, role, permissions
      ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        context.storeId,
        userId,
        context.organizationId,
        context.installationId,
        employee.role,
        JSON.stringify(employee.permissions),
      ]
    )

    const result = await client.query<Employee>(
      `insert into employees (
        organization_id, installation_id, store_id, auth_user_id,
        full_name, phone, cedula, salary, position, role, active, notes, hired_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning id, store_id, auth_user_id, full_name, $14::text as email,
        phone, cedula, salary, position, role, $15::jsonb as permissions,
        active, notes, hired_at, created_at`,
      [
        context.organizationId,
        context.installationId,
        context.storeId,
        userId,
        employee.fullName,
        employee.phone,
        employee.cedula,
        employee.salary,
        employee.position,
        employee.role,
        employee.active,
        employee.notes,
        employee.hiredAt,
        employee.email,
        JSON.stringify(employee.permissions),
      ]
    )
    return result.rows[0]
  })
}

export async function updateEmployee(context: TenantContext, id: string, input: EmployeeInput) {
  const employee = values(input)

  return withTransaction(async (client) => {
    const existing = await selectEmployee(client, context, id, true)
    if (!existing) return null

    await client.query('select pg_advisory_xact_lock(hashtext($1))', [employee.email])
    if (await findConflictingEmail(client, employee.email, existing.auth_user_id ?? undefined)) {
      const error = new Error('El correo electrónico ya está asociado a otra cuenta.')
      error.name = 'EmailConflictError'
      throw error
    }

    const passwordHash = input.password ? await hashPassword(input.password) : null
    const userId = existing.auth_user_id ?? randomUUID()
    if (!existing.auth_user_id) {
      if (!passwordHash) {
        const error = new Error('Los empleados sin cuenta local requieren una contraseña para habilitar su acceso.')
        error.name = 'EmployeeAccountRequiredError'
        throw error
      }
      await client.query(
        `insert into app_profiles (
          id, organization_id, installation_id, full_name, role, active,
          email, password_hash, password_changed_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [userId, context.organizationId, context.installationId, employee.fullName, employee.role, employee.active, employee.email, passwordHash]
      )
    } else {
      await client.query(
        `update app_profiles
            set full_name = $1,
                role = $2,
                active = $3,
                email = $4,
                password_hash = coalesce($5, password_hash),
                password_changed_at = case when $5::text is null then password_changed_at else now() end
          where id = $6
            and organization_id = $7
            and installation_id = $8`,
        [employee.fullName, employee.role, employee.active, employee.email, passwordHash, userId, context.organizationId, context.installationId]
      )
    }

    await client.query(
      `insert into store_users (
        store_id, user_id, organization_id, installation_id, role, permissions
      ) values ($1, $2, $3, $4, $5, $6::jsonb)
      on conflict (store_id, user_id) do update
        set role = excluded.role,
            permissions = excluded.permissions`,
      [context.storeId, userId, context.organizationId, context.installationId, employee.role, JSON.stringify(employee.permissions)]
    )

    const result = await client.query<Employee>(
      `update employees
          set auth_user_id = $1,
              full_name = $2,
              phone = $3,
              cedula = $4,
              salary = $5,
              position = $6,
              role = $7,
              active = $8,
              notes = $9,
              hired_at = $10
        where id = $11
          and organization_id = $12
          and installation_id = $13
          and store_id = $14
        returning id, store_id, auth_user_id, full_name, $15::text as email,
          phone, cedula, salary, position, role, $16::jsonb as permissions,
          active, notes, hired_at, created_at`,
      [
        userId, employee.fullName, employee.phone, employee.cedula, employee.salary,
        employee.position, employee.role, employee.active, employee.notes, employee.hiredAt,
        id, context.organizationId, context.installationId, context.storeId,
        employee.email, JSON.stringify(employee.permissions),
      ]
    )

    if (existing.auth_user_id && (passwordHash || !employee.active)) {
      await client.query(
        `update shopdesk_auth_sessions
            set revoked_at = now()
          where user_id = $1 and revoked_at is null`,
        [userId]
      )
    }

    return result.rows[0] ?? null
  })
}export async function setEmployeeActive(context: TenantContext, id: string, active: boolean) {
  return withTransaction(async (client) => {
    const existing = await selectEmployee(client, context, id, true)
    if (!existing) return null

    await client.query(
      `update app_profiles
          set active = $1
        where id = $2
          and organization_id = $3
          and installation_id = $4`,
      [active, existing.auth_user_id, context.organizationId, context.installationId]
    )
    const result = await client.query<Employee>(
      `update employees
          set active = $1
        where id = $2
          and organization_id = $3
          and installation_id = $4
          and store_id = $5
        returning id, store_id, auth_user_id, full_name, $6::text as email,
          phone, cedula, salary, position, role, $7::jsonb as permissions,
          active, notes, hired_at, created_at`,
      [
        active,
        id,
        context.organizationId,
        context.installationId,
        context.storeId,
        existing.email,
        JSON.stringify(existing.permissions),
      ]
    )
    if (!active) {
      await client.query(
        `update shopdesk_auth_sessions
            set revoked_at = now()
          where user_id = $1 and revoked_at is null`,
        [existing.auth_user_id]
      )
    }
    return result.rows[0] ?? null
  })
}

export async function deleteEmployee(context: TenantContext, id: string) {
  return withTransaction(async (client) => {
    const existing = await selectEmployee(client, context, id, true)
    if (!existing) return null

    await client.query(
      `update app_profiles
          set active = false
        where id = $1
          and organization_id = $2
          and installation_id = $3`,
      [existing.auth_user_id, context.organizationId, context.installationId]
    )
    await client.query(
      `update shopdesk_auth_sessions
          set revoked_at = now()
        where user_id = $1 and revoked_at is null`,
      [existing.auth_user_id]
    )
    const result = await client.query<{ id: string }>(
      `delete from employees
        where id = $1
          and organization_id = $2
          and installation_id = $3
          and store_id = $4
        returning id`,
      [id, ...scope(context)]
    )
    return result.rows[0] ?? null
  })
}