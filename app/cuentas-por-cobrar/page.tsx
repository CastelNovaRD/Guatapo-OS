'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'
import { formatDate, formatMoney } from '@/lib/format'
import { CheckCircle, CreditCard, Search, X } from 'lucide-react'

type Sale = {
  id: string
  invoice_number: string | null
  total: number
  status: string
  sale_channel: string
  cooperative_name: string | null
  created_at: string
  customer_id: string | null
  amount_paid: number | null
  balance_due: number | null
}

type Customer = {
  id: string
  full_name: string
  phone: string | null
  cedula: string | null
}

type Payment = {
  id: string
  sale_id: string
  amount: number
}

export default function CuentasPorCobrarPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [cooperativeFilter, setCooperativeFilter] = useState('')
  const [memberSearch, setMemberSearch] = useState('')

  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select(
        'id, invoice_number, total, status, sale_channel, cooperative_name, created_at, customer_id, amount_paid, balance_due'
      )
      .eq('store_id', storeId)
      .eq('sale_channel', 'cooperative')
      .in('status', ['credit', 'pending'])
      .order('created_at', { ascending: false })

    if (salesError) {
      setLoading(false)
      return alert('Error cargando cuentas por cobrar: ' + salesError.message)
    }

    const saleIds = (salesData || []).map((sale) => sale.id)
    const customerIds = Array.from(
      new Set((salesData || []).map((sale) => sale.customer_id).filter(Boolean))
    ) as string[]

    let customersData: Customer[] = []
    let paymentsData: Payment[] = []

    if (customerIds.length) {
      const { data } = await supabase
        .from('customers')
        .select('id, full_name, phone, cedula')
        .in('id', customerIds)

      customersData = data || []
    }

    if (saleIds.length) {
      const { data } = await supabase
        .from('payments')
        .select('id, sale_id, amount')
        .in('sale_id', saleIds)

      paymentsData = data || []
    }

    setSales(salesData || [])
    setCustomers(customersData)
    setPayments(paymentsData)
    setSelectedIds([])
    setLoading(false)
  }

  function customerOf(sale: Sale) {
    return customers.find((customer) => customer.id === sale.customer_id)
  }

  function paidAmount(sale: Sale) {
    const paymentsTotal = payments
      .filter((payment) => payment.sale_id === sale.id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

    return Number(sale.amount_paid || 0) || paymentsTotal
  }

  function balanceOf(sale: Sale) {
    const savedBalance = Number(sale.balance_due || 0)

    if (savedBalance > 0) return savedBalance

    return Math.max(0, Number(sale.total || 0) - paidAmount(sale))
  }

  const cooperatives = useMemo(() => {
    return Array.from(
      new Set(sales.map((sale) => sale.cooperative_name || 'Sin cooperativa'))
    )
  }, [sales])

  const filteredSales = useMemo(() => {
    const q = memberSearch.toLowerCase().trim()

    return sales.filter((sale) => {
      const customer = customerOf(sale)

      const matchCoop = cooperativeFilter
        ? (sale.cooperative_name || 'Sin cooperativa') === cooperativeFilter
        : true

      const text = `${customer?.full_name || ''} ${customer?.cedula || ''} ${
        customer?.phone || ''
      } ${sale.invoice_number || ''}`.toLowerCase()

      const matchMember = q ? text.includes(q) : true

      return matchCoop && matchMember && balanceOf(sale) > 0
    })
  }, [sales, customers, payments, cooperativeFilter, memberSearch])

  const selectedSales = filteredSales.filter((sale) => selectedIds.includes(sale.id))

  const totalPending = filteredSales.reduce((sum, sale) => sum + balanceOf(sale), 0)

  const selectedTotal = selectedSales.reduce((sum, sale) => sum + balanceOf(sale), 0)

  function toggleSale(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  function openPaymentModal() {
    if (selectedIds.length === 0) return alert('Selecciona una o varias facturas.')

    const today = new Date().toISOString().slice(0, 10)

    setPaymentAmount(String(selectedTotal))
    setPaymentDate(today)
    setReference('')
    setNotes('')
    setPaymentModal(true)
  }

  async function registerPayment() {
    const storeId = await getCurrentStoreId()

    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const amount = Number(paymentAmount || 0)

    if (selectedSales.length === 0) return alert('Selecciona facturas.')
    if (amount <= 0) return alert('Escribe el monto recibido.')

    setSaving(true)

    let remaining = amount

    for (const sale of selectedSales) {
      if (remaining <= 0) break

      const balance = balanceOf(sale)
      const amountForSale = Math.min(balance, remaining)
      const newPaid = paidAmount(sale) + amountForSale
      const newBalance = Math.max(0, Number(sale.total || 0) - newPaid)

      const { error: paymentError } = await supabase.from('payments').insert({
        store_id: storeId,
        sale_id: sale.id,
        amount: amountForSale,
        payment_date: paymentDate ? `${paymentDate}T12:00:00` : new Date().toISOString(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      })

      if (paymentError) {
        setSaving(false)
        return alert('Error registrando pago: ' + paymentError.message)
      }

      const { error: saleError } = await supabase
        .from('sales')
        .update({
          amount_paid: newPaid,
          balance_due: newBalance,
          status: newBalance <= 0 ? 'paid' : sale.status,
          paid_at: newBalance <= 0 ? new Date().toISOString() : null,
          payment_reference: reference.trim() || null,
          payment_notes: notes.trim() || null,
        })
        .eq('id', sale.id)

      if (saleError) {
        setSaving(false)
        return alert('Pago guardado, pero error actualizando factura: ' + saleError.message)
      }

      remaining -= amountForSale
    }

    setSaving(false)
    setPaymentModal(false)
    await loadData()

    alert('Pago registrado correctamente.')
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <CreditCard className="text-emerald-500" />
            Cuentas por Cobrar
          </h1>
          <p className="text-zinc-500">
            Facturas de cooperativa pendientes de pago.
          </p>
        </div>

        <button
          onClick={openPaymentModal}
          className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600"
        >
          Registrar pago
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat title="Pendiente filtrado" value={formatMoney(totalPending)} />
        <Stat title="Facturas pendientes" value={String(filteredSales.length)} />
        <Stat title="Seleccionado" value={formatMoney(selectedTotal)} green />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <select
          value={cooperativeFilter}
          onChange={(e) => setCooperativeFilter(e.target.value)}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-emerald-500"
        >
          <option value="">Todas las cooperativas</option>
          {cooperatives.map((coop) => (
            <option key={coop} value={coop}>
              {coop}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm md:col-span-2">
          <Search className="text-emerald-500" size={20} />
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Buscar por socio, cédula, teléfono o factura..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Facturas pendientes</h2>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando cuentas por cobrar...</p>
        ) : filteredSales.length === 0 ? (
          <p className="p-5 text-zinc-500">No hay facturas pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4"></th>
                  <th className="p-4">Factura</th>
                  <th className="p-4">Socio</th>
                  <th className="p-4">Cooperativa</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Pagado</th>
                  <th className="p-4">Pendiente</th>
                </tr>
              </thead>

              <tbody>
                {filteredSales.map((sale) => {
                  const customer = customerOf(sale)

                  return (
                    <tr key={sale.id} className="border-b border-zinc-100">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(sale.id)}
                          onChange={() => toggleSale(sale.id)}
                          className="h-5 w-5"
                        />
                      </td>

                      <td className="p-4 font-bold">
                        {sale.invoice_number || `#${sale.id.slice(0, 8).toUpperCase()}`}
                      </td>

                      <td className="p-4">
                        <p className="font-semibold">
                          {customer?.full_name || 'Sin socio'}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {customer?.cedula || '-'} · {customer?.phone || '-'}
                        </p>
                      </td>

                      <td className="p-4">{sale.cooperative_name || '-'}</td>

                      <td className="p-4">{formatDate(sale.created_at)}</td>

                      <td className="p-4 font-bold">
                        {formatMoney(sale.total)}
                      </td>

                      <td className="p-4 text-emerald-600">
                        {formatMoney(paidAmount(sale))}
                      </td>

                      <td className="p-4 font-black text-red-500">
                        {formatMoney(balanceOf(sale))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">Registrar pago</h2>
                <p className="text-zinc-500">
                  {selectedSales.length} factura(s) seleccionada(s).
                </p>
              </div>

              <button onClick={() => setPaymentModal(false)}>
                <X />
              </button>
            </div>

            <div className="p-6">
              <div className="rounded-xl bg-emerald-50 p-4 text-emerald-700">
                <p className="text-sm font-bold">Total seleccionado</p>
                <p className="text-3xl font-black">{formatMoney(selectedTotal)}</p>
              </div>

              <label className="mt-5 block text-sm text-zinc-500">
                Monto recibido
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Fecha de pago
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Referencia
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transferencia, cheque, comprobante..."
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Notas
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              />

              <button
                onClick={registerPayment}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <CheckCircle size={20} />
                {saving ? 'Guardando...' : 'Guardar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Stat({
  title,
  value,
  green = false,
}: {
  title: string
  value: string
  green?: boolean
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
      <h3 className={`mt-2 text-2xl font-black ${green ? 'text-emerald-600' : ''}`}>
        {value}
      </h3>
    </div>
  )
}