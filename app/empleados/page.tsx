'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { logAudit } from '@/lib/audit'
import {
  PERMISSION_GROUPS,
  getDefaultPermissionsForRole,
  getRoleLabel,
  mergePermissions,
  type PermissionKey,
  type PermissionMap,
} from '@/lib/permissions'
import { BriefcaseBusiness, Edit, Plus, RefreshCw, Save, Trash2, UserCheck, Users } from 'lucide-react'

type Employee = {
  id: string
  store_id: string
  auth_user_id: string | null
  full_name: string
  phone: string | null
  cedula: string | null
  salary: number
  position: string | null
  role: string
  permissions: PermissionMap | null
  active: boolean
  notes: string | null
  hired_at: string | null
  created_at: string | null
}

type EmployeeForm = {
  auth_user_id: string
  full_name: string
  phone: string
  cedula: string
  salary: string
  position: string
  role: string
  permissions: PermissionMap
  active: boolean
  notes: string
}

const emptyForm: EmployeeForm = {
  auth_user_id: '',
  full_name: '',
  phone: '',
  cedula: '',
  salary: '',
  position: '',
  role: 'seller',
  permissions: getDefaultPermissionsForRole('seller'),
  active: true,
  notes: '',
}

const ROLES = ['owner', 'admin', 'manager', 'cashier', 'seller', 'inventory', 'viewer']

export default function EmployeesPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    setError('')

    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setEmployees([])
      setError('Este usuario no tiene una tienda asignada.')
      setLoading(false)
      return
    }

    const { data, error: loadError } = await supabase
      .from('employees')
      .select('id, store_id, auth_user_id, full_name, phone, cedula, salary, position, role, permissions, active, notes, hired_at, created_at')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    if (loadError) {
      setEmployees([])
      setError(
        loadError.code === '42P01'
          ? 'La tabla de empleados todavía no existe. Ejecuta outputs/supabase-empleados.sql en Supabase.'
          : loadError.message
      )
      setLoading(false)
      return
    }

    setEmployees((data || []) as Employee[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return employees

    return employees.filter((employee) => {
      const text = `${employee.full_name} ${employee.phone || ''} ${employee.cedula || ''} ${employee.position || ''} ${employee.role}`.toLowerCase()
      return text.includes(query)
    })
  }, [employees, search])

  const activeEmployees = employees.filter((employee) => employee.active).length
  const inactiveEmployees = employees.length - activeEmployees
  const payroll = employees
    .filter((employee) => employee.active)
    .reduce((sum, employee) => sum + Number(employee.salary || 0), 0)

  function openNewForm() {
    setEditingEmployee(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEditForm(employee: Employee) {
    const role = employee.role || 'seller'
    setEditingEmployee(employee)
    setForm({
      auth_user_id: employee.auth_user_id || '',
      full_name: employee.full_name || '',
      phone: employee.phone || '',
      cedula: employee.cedula || '',
      salary: String(employee.salary || ''),
      position: employee.position || '',
      role,
      permissions: mergePermissions(role, employee.permissions || null),
      active: employee.active !== false,
      notes: employee.notes || '',
    })
    setFormOpen(true)
  }

  function updateRole(role: string) {
    setForm((current) => ({
      ...current,
      role,
      permissions: getDefaultPermissionsForRole(role),
    }))
  }

  function togglePermission(permission: PermissionKey) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permission]: !current.permissions[permission],
      },
    }))
  }

  async function saveEmployee() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (!form.full_name.trim()) return alert('Completa el nombre completo del empleado.')

    setSaving(true)

    const payload = {
      store_id: storeId,
      auth_user_id: form.auth_user_id.trim() || null,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      cedula: form.cedula.trim() || null,
      salary: Number(form.salary || 0),
      position: form.position.trim() || null,
      role: form.role,
      permissions: form.permissions,
      active: form.active,
      notes: form.notes.trim() || null,
    }

    let savedEmployeeId = editingEmployee?.id || ''

    if (editingEmployee) {
      const { error: updateError } = await supabase
        .from('employees')
        .update(payload)
        .eq('store_id', storeId)
        .eq('id', editingEmployee.id)

      if (updateError) {
        setSaving(false)
        return alert('Error actualizando empleado: ' + updateError.message)
      }
    } else {
      const { data: createdEmployee, error: insertError } = await supabase
        .from('employees')
        .insert(payload)
        .select('id')
        .single()

      if (insertError) {
        setSaving(false)
        return alert('Error creando empleado: ' + insertError.message)
      }

      savedEmployeeId = createdEmployee.id
    }

    if (payload.auth_user_id) {
      const { error: profileError } = await supabase.from('app_profiles').upsert({
        id: payload.auth_user_id,
        full_name: payload.full_name,
        role: payload.role,
        active: payload.active,
      })

      if (profileError) {
        setSaving(false)
        return alert('Empleado guardado, pero no pude enlazar el perfil de login: ' + profileError.message)
      }

      const { error: membershipError } = await supabase.from('store_users').upsert(
        {
          store_id: storeId,
          user_id: payload.auth_user_id,
          role: payload.role,
          active: payload.active,
          permissions: payload.permissions,
        },
        { onConflict: 'store_id,user_id' }
      )

      if (membershipError) {
        setSaving(false)
        return alert('Empleado guardado, pero no pude enlazar permisos de login: ' + membershipError.message)
      }
    }

    await logAudit({
      storeId,
      module: 'empleados',
      action: editingEmployee ? 'employee.update' : 'employee.create',
      entityType: 'employee',
      entityId: savedEmployeeId,
      summary: (editingEmployee ? 'Empleado actualizado: ' : 'Empleado creado: ') + payload.full_name + '.',
      beforeData: editingEmployee,
      afterData: payload,
    })

    setSaving(false)
    setFormOpen(false)
    setEditingEmployee(null)
    setForm(emptyForm)
    await loadEmployees()
  }

  async function deleteEmployee(employee: Employee) {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (!confirm(`¿Eliminar a ${employee.full_name}?`)) return

    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('store_id', storeId)
      .eq('id', employee.id)

    if (deleteError) return alert('Error eliminando empleado: ' + deleteError.message)

    if (employee.auth_user_id) {
      await supabase
        .from('store_users')
        .update({ active: false })
        .eq('store_id', storeId)
        .eq('user_id', employee.auth_user_id)
    }

    await logAudit({
      storeId,
      module: 'empleados',
      action: 'employee.delete',
      entityType: 'employee',
      entityId: employee.id,
      summary: 'Empleado eliminado: ' + employee.full_name + '.',
      beforeData: employee,
    })

    await loadEmployees()
  }

  async function toggleEmployeeActive(employee: Employee) {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    const nextActive = !employee.active

    const { error: updateError } = await supabase
      .from('employees')
      .update({ active: nextActive })
      .eq('store_id', storeId)
      .eq('id', employee.id)

    if (updateError) return alert('Error cambiando estado: ' + updateError.message)

    if (employee.auth_user_id) {
      await supabase
        .from('store_users')
        .update({ active: nextActive })
        .eq('store_id', storeId)
        .eq('user_id', employee.auth_user_id)
    }

    await logAudit({
      storeId,
      module: 'empleados',
      action: 'employee.toggle_active',
      entityType: 'employee',
      entityId: employee.id,
      summary: 'Empleado ' + (nextActive ? 'activado: ' : 'desactivado: ') + employee.full_name + '.',
      beforeData: { active: employee.active },
      afterData: { active: nextActive },
    })

    await loadEmployees()
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <BriefcaseBusiness className="text-emerald-500" />
            Administración de empleados
          </h1>
          <p className="text-zinc-500">
            Control de recursos humanos, usuarios y accesos del sistema de la tienda.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadEmployees}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold hover:bg-zinc-100"
          >
            <RefreshCw size={18} />
            Actualizar
          </button>
          <button
            onClick={openNewForm}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700"
          >
            <Plus size={18} />
            Nuevo empleado
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-800">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Empleados" value={String(employees.length)} />
        <StatCard title="Activos" value={String(activeEmployees)} green />
        <StatCard title="Inactivos" value={String(inactiveEmployees)} />
        <StatCard title="Nómina mensual" value={formatMoney(payroll)} red />
      </div>

      {formOpen && (
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">{editingEmployee ? 'Editar empleado' : 'Nuevo empleado'}</h2>
              <p className="text-sm text-zinc-500">Datos laborales, puesto y permisos de acceso.</p>
            </div>
            <button
              onClick={() => {
                setFormOpen(false)
                setEditingEmployee(null)
                setForm(emptyForm)
              }}
              className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold hover:bg-zinc-100"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Input label="NOMBRE COMPLETO" value={form.full_name} onChange={(value) => setForm({ ...form, full_name: value })} />
            <Input label="NUMERO DE TELEFONO" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Input label="CEDULA" value={form.cedula} onChange={(value) => setForm({ ...form, cedula: value })} />
            <Input label="SUELDO" type="number" value={form.salary} onChange={(value) => setForm({ ...form, salary: value })} />
            <Input label="FUNCION O PUESTO" value={form.position} onChange={(value) => setForm({ ...form, position: value })} placeholder="Ej: Gerente general" />
            <label className="block">
              <span className="text-sm font-bold text-zinc-600">ROL BASE</span>
              <select
                value={form.role}
                onChange={(event) => updateRole(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>{getRoleLabel(role)}</option>
                ))}
              </select>
            </label>
            <Input label="USER ID DE SUPABASE PARA LOGIN" value={form.auth_user_id} onChange={(value) => setForm({ ...form, auth_user_id: value })} placeholder="Opcional" />
            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                className="h-5 w-5 accent-emerald-600"
              />
              <span className="font-bold">Empleado activo</span>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-bold text-zinc-600">NOTAS INTERNAS</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="mt-2 min-h-24 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
            />
          </label>

          <div className="mt-6">
            <h3 className="text-lg font-black">A lo que tendrá acceso en el sistema de la tienda</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <h4 className="font-black">{group.title}</h4>
                  <div className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={Boolean(form.permissions[item.key])}
                          onChange={() => togglePermission(item.key)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={saveEmployee}
            disabled={saving}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save size={18} />
            Guardar empleado
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Users className="text-emerald-500" />
              Equipo de trabajo
            </h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, cédula, teléfono o puesto..."
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500 md:w-96"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="p-4">Empleado</th>
                <th className="p-4">Contacto</th>
                <th className="p-4">Puesto</th>
                <th className="p-4">Sueldo</th>
                <th className="p-4">Acceso</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-5 text-zinc-500" colSpan={7}>Cargando empleados...</td></tr>
              ) : visibleEmployees.length === 0 ? (
                <tr><td className="p-5 text-zinc-500" colSpan={7}>No hay empleados registrados.</td></tr>
              ) : (
                visibleEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b border-zinc-100 align-top">
                    <td className="p-4">
                      <p className="font-black">{employee.full_name}</p>
                      <p className="text-xs text-zinc-500">Registro: {employee.created_at ? formatDateTime(employee.created_at) : '-'}</p>
                    </td>
                    <td className="p-4 text-sm">
                      <p>{employee.phone || '-'}</p>
                      <p className="text-zinc-500">{employee.cedula || '-'}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold">{employee.position || '-'}</p>
                      <p className="text-sm text-zinc-500">{getRoleLabel(employee.role)}</p>
                    </td>
                    <td className="p-4 font-bold">{formatMoney(Number(employee.salary || 0))}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${employee.auth_user_id ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                        <UserCheck size={14} />
                        {employee.auth_user_id ? 'Usuario enlazado' : 'Sin login'}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => toggleEmployeeActive(employee)}
                        className={`rounded-full px-3 py-1 text-sm font-bold ${employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
                      >
                        {employee.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditForm(employee)}
                          className="rounded-xl border border-zinc-300 p-2 hover:bg-zinc-100"
                          aria-label="Editar empleado"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => deleteEmployee(employee)}
                          className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50"
                          aria-label="Eliminar empleado"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}

function StatCard({ title, value, green = false, red = false }: { title: string; value: string; green?: boolean; red?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      <p className={`mt-3 break-words text-3xl font-black ${green ? 'text-emerald-600' : red ? 'text-red-600' : 'text-zinc-950'}`}>{value}</p>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </label>
  )
}
