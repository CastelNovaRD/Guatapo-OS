import { requireTenantContext } from '@/lib/auth/tenant-context'
import { validatePassword } from '@/lib/auth/passwords'
import {
  deleteEmployee,
  getEmployeeById,
  setEmployeeActive,
  updateEmployee,
  type EmployeeInput,
  type PermissionMap,
} from '@/lib/repositories/employees-repository'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

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
  return Response.json({ error: 'Employee operation failed.' }, { status: 503 })
}

function parseEmployeeInput(value: unknown): { input: EmployeeInput } | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Invalid employee data.' }
  const body = value as Record<string, unknown>
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return { error: 'The request contains fields that cannot be updated.' }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const salary = body.salary === undefined ? 0 : Number(body.salary)
  const permissions = body.permissions
  if (!fullName || !email || !role) return { error: 'Nombre, correo y rol son obligatorios.' }
  if (password) {
    const passwordError = validatePassword(password)
    if (passwordError) return { error: passwordError }
  }
  if (!Number.isFinite(salary) || salary < 0) return { error: 'El sueldo debe ser un número mayor o igual a cero.' }
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions) || !Object.values(permissions).every((permission) => typeof permission === 'boolean')) {
    return { error: 'Los permisos son inválidos.' }
  }
  for (const key of ['phone', 'cedula', 'position', 'notes', 'hired_at']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') return { error: 'Los campos de texto tienen un formato inválido.' }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') return { error: 'El estado activo es inválido.' }

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

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    const employee = await getEmployeeById(context, id)
    return employee ? Response.json(employee) : Response.json({ error: 'Employee not found.' }, { status: 404 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })

    const fields = Object.keys(body)
    if (fields.length === 1 && typeof (body as Record<string, unknown>).active === 'boolean') {
      const existing = await getEmployeeById(context, id)
      if (!existing) return Response.json({ error: 'Employee not found.' }, { status: 404 })
      if (!((body as Record<string, unknown>).active) && existing.auth_user_id === context.userId) {
        return Response.json({ error: 'No puedes desactivar tu propia cuenta.' }, { status: 409 })
      }
      const employee = await setEmployeeActive(context, id, (body as Record<string, boolean>).active)
      return employee ? Response.json(employee) : Response.json({ error: 'Employee not found.' }, { status: 404 })
    }

    const parsed = parseEmployeeInput(body)
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
    const existing = await getEmployeeById(context, id)
    if (!existing) return Response.json({ error: 'Employee not found.' }, { status: 404 })
    if (!parsed.input.active && existing.auth_user_id === context.userId) {
      return Response.json({ error: 'No puedes desactivar tu propia cuenta.' }, { status: 409 })
    }

    const employee = await updateEmployee(context, id, parsed.input)
    return employee ? Response.json(employee) : Response.json({ error: 'Employee not found.' }, { status: 404 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params
    const employee = await getEmployeeById(context, id)
    if (!employee) return Response.json({ error: 'Employee not found.' }, { status: 404 })
    if (employee.auth_user_id === context.userId) {
      return Response.json({ error: 'No puedes eliminar tu propio registro de empleado mientras estás usando esa cuenta.' }, { status: 409 })
    }
    const deleted = await deleteEmployee(context, id)
    return deleted ? Response.json({ ok: true, id: deleted.id }) : Response.json({ error: 'Employee not found.' }, { status: 404 })
  } catch (error) {
    return errorResponse(error)
  }
}