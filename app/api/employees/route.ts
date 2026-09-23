import { requireTenantContext } from '@/lib/auth/tenant-context'
import { validatePassword } from '@/lib/auth/passwords'
import {
  createEmployee,
  listEmployees,
  type EmployeeInput,
  type PermissionMap,
} from '@/lib/repositories/employees-repository'

export const runtime = 'nodejs'

const allowedFields = new Set([
  'email', 'password', 'full_name', 'phone', 'cedula', 'salary', 'position',
  'role', 'permissions', 'active', 'notes', 'hired_at',
])

function errorResponse(error: unknown) {
  if (error instanceof Error && error.name === 'EmailConflictError') {
    return Response.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof Error && error.name === 'EmployeeAccountRequiredError') {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return Response.json({ error: 'Employees are unavailable.' }, { status: 503 })
}

function optionalText(value: unknown) {
  return value === undefined || value === null || typeof value === 'string'
}

function parseEmployeeInput(value: unknown, mode: 'create' | 'update'):
  | { input: EmployeeInput }
  | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Invalid employee data.' }
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return { error: 'The request contains fields that cannot be updated.' }
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const salary = body.salary === undefined ? 0 : Number(body.salary)
  const permissions = body.permissions

  if (!fullName || !email || !role) return { error: 'Nombre, correo y rol son obligatorios.' }
  if (mode === 'create' && !password) return { error: 'La contraseña es obligatoria para crear un empleado.' }
  if (password) {
    const passwordError = validatePassword(password)
    if (passwordError) return { error: passwordError }
  }
  if (!Number.isFinite(salary) || salary < 0) return { error: 'El sueldo debe ser un número mayor o igual a cero.' }
  if (
    !optionalText(body.phone) || !optionalText(body.cedula) ||
    !optionalText(body.position) || !optionalText(body.notes) || !optionalText(body.hired_at)
  ) return { error: 'Los campos de texto tienen un formato inválido.' }
  if (body.active !== undefined && typeof body.active !== 'boolean') return { error: 'El estado activo es inválido.' }
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return { error: 'Los permisos son obligatorios.' }
  }
  if (!Object.values(permissions).every((permission) => typeof permission === 'boolean')) {
    return { error: 'Los permisos deben ser valores booleanos.' }
  }

  return {
    input: {
      email,
      ...(password ? { password } : {}),
      full_name: fullName,
      phone: typeof body.phone === 'string' ? body.phone : null,
      cedula: typeof body.cedula === 'string' ? body.cedula : null,
      salary,
      position: typeof body.position === 'string' ? body.position : null,
      role,
      permissions: permissions as PermissionMap,
      active: body.active !== false,
      notes: typeof body.notes === 'string' ? body.notes : null,
      hired_at: typeof body.hired_at === 'string' ? body.hired_at : null,
    },
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    return Response.json(await listEmployees(context))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const body = await request.json().catch(() => null)
    const parsed = parseEmployeeInput(body, 'create')
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })

    const employee = await createEmployee(context, parsed.input)
    return Response.json(employee, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}