'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { Download, Edit, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { formatDate, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import ExportModal from '@/components/export/ExportModal'
import { exportCustomers as exportCustomersFile } from '@/lib/export/customers-export'
import type { CustomerExportScope, ExportFormat } from '@/lib/export/export-types'

type Customer = {
  id: string
  full_name: string
  phone: string | null
  cedula: string | null
  created_at: string
}

type QuoteCustomer = {
  id: string
  company_name: string
  rnc: string | null
  phone: string | null
  address: string | null
  created_at: string | null
}

type DisplayCustomer = {
  id: string
  source: 'customer' | 'quote_customer'
  full_name: string
  phone: string | null
  cedula: string | null
  created_at: string
  originalCustomer?: Customer
  fiscalRnc?: string | null
}

type Sale = {
  id: string
  customer_id: string | null
  total: number
  created_at: string
  sale_channel: string | null
  cooperative_name: string | null
  fiscal_customer_rnc: string | null
}

type CustomerForm = {
  full_name: string
  phone: string
  cedula: string
}

const emptyForm: CustomerForm = {
  full_name: '',
  phone: '',
  cedula: '',
}

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 10)
  if (numbers.length <= 3) return numbers
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
}

function formatCedula(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 11)
  if (numbers.length <= 3) return numbers
  if (numbers.length <= 10) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 10)}-${numbers.slice(10)}`
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quoteCustomers, setQuoteCustomers] = useState<QuoteCustomer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'fiscal' | 'partner'>('all')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [exportScope, setExportScope] = useState<CustomerExportScope>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('id, full_name, phone, cedula, created_at')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('id, customer_id, total, created_at, sale_channel, cooperative_name, fiscal_customer_rnc')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    const { data: quoteCustomersData, error: quoteCustomersError } = await supabase
      .from('quote_customers')
      .select('id, company_name, rnc, phone, address, created_at')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    if (customersError) alert('Error cargando clientes: ' + customersError.message)
    if (salesError) alert('Error cargando ventas: ' + salesError.message)
    if (quoteCustomersError) alert('Error cargando clientes fiscales: ' + quoteCustomersError.message)

    setCustomers(customersData || [])
    setQuoteCustomers(quoteCustomersData || [])
    setSales(salesData || [])
    setLoading(false)
  }

  const displayCustomers = useMemo<DisplayCustomer[]>(() => {
    const normalCustomers = customers.map((customer) => ({
      id: customer.id,
      source: 'customer' as const,
      full_name: customer.full_name,
      phone: customer.phone,
      cedula: customer.cedula,
      created_at: customer.created_at,
      originalCustomer: customer,
    }))

    const fiscalCustomers = quoteCustomers.map((customer) => ({
      id: `quote:${customer.id}`,
      source: 'quote_customer' as const,
      full_name: customer.company_name,
      phone: customer.phone,
      cedula: customer.rnc,
      created_at: customer.created_at || new Date().toISOString(),
      fiscalRnc: customer.rnc,
    }))

    return [...fiscalCustomers, ...normalCustomers]
  }, [customers, quoteCustomers])

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim()

    return displayCustomers.filter((customer) => {
      const text = `${customer.full_name} ${customer.phone || ''} ${customer.cedula || ''}`.toLowerCase()
      const kind = getCustomerKind(customer).label
      const matchesSearch = q ? text.includes(q) : true
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'customer' && kind === 'Cliente') ||
        (typeFilter === 'fiscal' && kind === 'Cliente fiscal') ||
        (typeFilter === 'partner' && kind === 'Socio')

      return matchesSearch && matchesType
    })
  }, [displayCustomers, search, typeFilter, sales])

  async function handleExportCustomers() {
    const rows = displayCustomers.map((customer) => {
      const customerSales = getCustomerSales(customer)
      const lastSale = customerSales[0]
      return {
        name: customer.full_name,
        phone: customer.phone || '',
        document: customer.cedula || '',
        type: getCustomerKind(customer).label as 'Cliente' | 'Cliente fiscal' | 'Socio',
        purchases: customerSales.length,
        totalPurchased: customerSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
        lastPurchase: lastSale?.created_at || '',
        createdAt: customer.created_at,
      }
    })

    await exportCustomersFile({ rows, format: exportFormat, scope: exportScope })
    setExportModalOpen(false)
  }
  function getCustomerSales(customer: DisplayCustomer) {
    if (customer.source === 'quote_customer') {
      const fiscalRnc = customer.fiscalRnc?.trim()
      if (!fiscalRnc) return []
      return sales.filter((sale) => sale.fiscal_customer_rnc?.trim() === fiscalRnc)
    }

    return sales.filter((sale) => sale.customer_id === customer.id)
  }

  function getCustomerKind(customer: DisplayCustomer) {
    if (customer.source === 'quote_customer') {
      return {
        label: 'Cliente fiscal',
        className: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
      }
    }

    const normalizedName = customer.full_name.trim().toLowerCase()

    const isPartner = sales.some((sale) => {
      const cooperativeName = sale.cooperative_name?.trim().toLowerCase()

      return (
        (sale.customer_id === customer.id && sale.sale_channel === 'cooperative') ||
        (Boolean(cooperativeName) && cooperativeName === normalizedName)
      )
    })

    if (isPartner) {
      return {
        label: 'Socio',
        className: 'bg-red-50 text-red-700 ring-red-200',
      }
    }

    return {
      label: 'Cliente',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    }
  }

  function openNewCustomer() {
    setEditingCustomer(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEditCustomer(customer: Customer) {
    setEditingCustomer(customer)
    setForm({
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      cedula: customer.cedula || '',
    })
    setModalOpen(true)
  }

async function deleteCustomer(customer: Customer) {
  const customerSales = sales.filter((sale) => sale.customer_id === customer.id)

  if (customerSales.length > 0) {
    alert('No puedes eliminar este cliente porque tiene ventas registradas.')
    return
  }

  if (!confirm(`¿Seguro que quieres eliminar a "${customer.full_name}"?`)) return

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customer.id)

  if (error) {
    return alert('Error eliminando cliente: ' + error.message)
  }

  loadData()
}

  function updateForm(field: keyof CustomerForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault()

    if (!form.full_name.trim()) return alert('Escribe el nombre del cliente')
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setSaving(true)

  const duplicateCustomer = customers.find((customer) => {
  const sameCedula =
    form.cedula.trim() &&
    customer.cedula?.trim() === form.cedula.trim()

  const samePhone =
    form.phone.trim() &&
    customer.phone?.trim() === form.phone.trim()

  const isDifferentCustomer =
    !editingCustomer || customer.id !== editingCustomer.id

  return isDifferentCustomer && (sameCedula || samePhone)
})

if (duplicateCustomer) {
  setSaving(false)

  return alert(
    `Ya existe un cliente registrado.\n\n` +
    `Nombre: ${duplicateCustomer.full_name}\n` +
    `Teléfono: ${duplicateCustomer.phone || '-'}\n` +
    `Cédula: ${duplicateCustomer.cedula || '-'}`
  )
}

    const payload = {
      full_name: form.full_name.trim(),
      store_id: storeId,
      phone: form.phone.trim() || null,
      cedula: form.cedula.trim() || null,
    }

    if (editingCustomer) {
      const { error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)

      if (error) {
        setSaving(false)
        return alert('Error actualizando cliente: ' + error.message)
      }
    } else {
      const { error } = await supabase.from('customers').insert(payload)

      if (error) {
        setSaving(false)
        return alert('Error creando cliente: ' + error.message)
      }
    }

    setSaving(false)
    setModalOpen(false)
    setEditingCustomer(null)
    setForm(emptyForm)
    loadData()
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Users className="text-emerald-500" />
            Clientes
          </h1>
          <p className="text-zinc-500">
            Historial de clientes, compras y datos de contacto.
          </p>
        </div>

        <button
          onClick={openNewCustomer}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
        >
          <Plus size={18} />
          Nuevo Cliente
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <Search className="text-emerald-500" size={20} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o cédula..."
          className="w-full bg-transparent outline-none"
        />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-emerald-500"
        >
          <option value="all">Todos los clientes</option>
          <option value="customer">Clientes</option>
          <option value="fiscal">Clientes fiscales</option>
          <option value="partner">Socios</option>
        </select>
        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-bold text-zinc-700 shadow-sm hover:bg-zinc-100"
        >
          <Download size={18} />
          Exportar
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Registro de clientes</h2>
          <p className="text-sm text-zinc-500">
            Mostrando {filteredCustomers.length} de {displayCustomers.length}
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando clientes...</p>
        ) : filteredCustomers.length === 0 ? (
          <p className="p-5 text-zinc-500">No hay clientes registrados.</p>
        ) : (
         <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-zinc-500">
            <tr className="border-b border-zinc-200">
              <th className="p-4">Cliente</th>
              <th className="p-4">Teléfono</th>
              <th className="p-4">Cédula / RNC</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Compras</th>
              <th className="p-4">Total</th>
              <th className="p-4">Última compra</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
        </thead>

      <tbody>
        {filteredCustomers.map((customer) => {
          const customerSales = getCustomerSales(customer)
          const totalPurchased = customerSales.reduce(
            (sum, sale) => sum + Number(sale.total || 0),
            0
          )
          const lastSale = customerSales[0]
          const customerKind = getCustomerKind(customer)

          return (
            <tr key={customer.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="p-4">
                <p className="font-bold text-zinc-950">{customer.full_name}</p>
                <p className="text-sm text-zinc-500">
                  Registrado: {formatDate(customer.created_at)}
                </p>
              </td>

              <td className="p-4">{customer.phone || '-'}</td>

              <td className="p-4">{customer.cedula || '-'}</td>

              <td className="p-4">
                <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase ring-1 ${customerKind.className}`}
              >
                {customerKind.label}
              </span>
            </td>

            <td className="p-4 font-semibold">{customerSales.length}</td>

            <td className="p-4 font-black text-emerald-600">
              {formatMoney(totalPurchased)}
            </td>

            <td className="p-4">
              {lastSale ? formatDate(lastSale.created_at) : 'Sin compras'}
            </td>

            <td className="p-4">
              {customer.originalCustomer ? (
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => openEditCustomer(customer.originalCustomer!)}
                    className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:border-emerald-500 hover:text-emerald-600"
                    title="Editar cliente"
                  >
                    <Edit size={17} />
                  </button>

                  <button
                    onClick={() => deleteCustomer(customer.originalCustomer!)}
                    className="rounded-lg border border-zinc-200 p-2 text-red-500 hover:border-red-500 hover:bg-red-50"
                    title="Eliminar cliente"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ) : (
                <p className="text-right text-sm text-zinc-400">Fiscal</p>
              )}
            </td>
          </tr>
           )
         })}
         </tbody>
       </table>
      </div>
        )}
      </div>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
                </h2>
                <p className="text-zinc-500">
                  Guarda los datos principales del cliente.
                </p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={saveCustomer} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <Input
                label="Nombre completo"
                value={form.full_name}
                onChange={(value) => updateForm('full_name', value)}
              />

              <Input
                label="Teléfono"
                value={form.phone}
                onChange={(value) => updateForm('phone', formatPhone(value))}
                placeholder="829-636-1020"
              />

              <Input
                label="Cédula"
                value={form.cedula}
                onChange={(value) => updateForm('cedula', formatCedula(value))}
                placeholder="402-4376435-8"
              />

              <div className="flex justify-end gap-3 border-t border-zinc-200 pt-5 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving
                    ? 'Guardando...'
                    : editingCustomer
                      ? 'Guardar cambios'
                      : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ExportModal
        open={exportModalOpen}
        title="Exportar clientes"
        format={exportFormat}
        onFormatChange={setExportFormat}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportCustomers}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-zinc-700">Tipo de cliente</span>
          <select value={exportScope} onChange={(e) => setExportScope(e.target.value as CustomerExportScope)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">
            <option value="all">Todos</option>
            <option value="customer">Clientes normales</option>
            <option value="fiscal">Clientes fiscales</option>
            <option value="partner">Socios</option>
          </select>
        </label>
      </ExportModal>
    </AppShell>
  )
}

function Info({
  label,
  value,
  green = false,
}: {
  label: string
  value: string
  green?: boolean
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-bold ${green ? 'text-emerald-600' : 'text-zinc-950'}`}>
        {value}
      </p>
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-500">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}


