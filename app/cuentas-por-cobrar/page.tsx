'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { getCurrentStoreId } from '@/lib/store-context'
import { formatDate, formatMoney } from '@/lib/format'
import { CheckCircle, CreditCard, Eye, FileBadge2, RefreshCcw, Search, X } from 'lucide-react'

type Sale = {
  id: string
  invoice_number: string | null
  subtotal: number | null
  discount: number | null
  itbis: number | null
  total: number
  status: string
  sale_channel: string
  created_at: string
  customer_id: string | null
  payment_method_id: string | null
  amount_paid: number | null
  balance_due: number | null
  ncf: string | null
  fiscal_receipt_type: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
  fiscal_customer_phone: string | null
  fiscal_customer_address: string | null
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

type SaleItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  discount: number | null
  total: number
  imei: string | null
}

type PaymentMethod = {
  id: string
  name: string
}

export default function CuentasPorCobrarPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [memberSearch, setMemberSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedSaleDetails, setSelectedSaleDetails] = useState<Sale | null>(null)
  const [detailItems, setDetailItems] = useState<SaleItem[]>([])
  const [detailPaymentMethod, setDetailPaymentMethod] = useState<PaymentMethod | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

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

   try {
  const response = await fetch('/api/accounts-receivable', {
    method: 'GET',
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => null)) as {
    sales?: Sale[]
    customers?: Customer[]
    payments?: Payment[]
    error?: string
  } | null

  if (!response.ok) {
    throw new Error(
      data?.error || 'No se pudieron cargar las cuentas por cobrar.'
    )
  }

  setSales(data?.sales || [])
  setCustomers(data?.customers || [])
  setPayments(data?.payments || [])
  setSelectedIds([])
} catch (error) {
  alert(
    'Error cargando cuentas por cobrar: ' +
      (error instanceof Error ? error.message : 'Error desconocido.')
  )
} finally {
  setLoading(false)
  }
}

  function customerOf(sale: Sale) {
    return customers.find((customer) => customer.id === sale.customer_id)
  }

  function displayCustomerName(sale: Sale) {
    return sale.fiscal_customer_name || customerOf(sale)?.full_name || 'Consumidor final'
  }

  function displayCustomerDocument(sale: Sale) {
    return sale.fiscal_customer_rnc || customerOf(sale)?.cedula || '-'
  }

  function displayCustomerPhone(sale: Sale) {
    return sale.fiscal_customer_phone || customerOf(sale)?.phone || '-'
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


  useEffect(() => {
    setCurrentPage(1)
    setSelectedIds([])
  }, [memberSearch, itemsPerPage])

  const filteredSales = useMemo(() => {
    const q = memberSearch.toLowerCase().trim()

    return sales.filter((sale) => {
      const customer = customerOf(sale)

      const text = `${sale.fiscal_customer_name || ''} ${sale.fiscal_customer_rnc || ''} ${sale.fiscal_customer_phone || ''} ${customer?.full_name || ''} ${customer?.cedula || ''} ${
        customer?.phone || ''
      } ${sale.invoice_number || ''} ${sale.ncf || ''}`.toLowerCase()

      const matchMember = q ? text.includes(q) : true

      return matchMember && balanceOf(sale) > 0
    })
  }, [sales, customers, payments, memberSearch])

  const totalReceivablePages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage))
  const firstVisibleSale = filteredSales.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const lastVisibleSale = Math.min(filteredSales.length, currentPage * itemsPerPage)
  const paginatedSales = filteredSales.slice(firstVisibleSale === 0 ? 0 : firstVisibleSale - 1, lastVisibleSale)

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

 async function openSaleDetails(sale: Sale) {
  const storeId = await getCurrentStoreId()

  if (!storeId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  setSelectedSaleDetails(sale)
  setDetailItems([])
  setDetailPaymentMethod(null)
  setDetailsLoading(true)

  try {
    const response = await fetch(
      `/api/accounts-receivable?saleId=${encodeURIComponent(sale.id)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )

    const data = (await response.json().catch(() => null)) as {
      sale?: Sale
      items?: SaleItem[]
      paymentMethod?: PaymentMethod | null
      error?: string
    } | null

    if (!response.ok) {
      throw new Error(
        data?.error || 'No se pudo cargar el detalle de la factura.'
      )
    }

    setSelectedSaleDetails(data?.sale || sale)
    setDetailItems(data?.items || [])
    setDetailPaymentMethod(data?.paymentMethod || null)
  } catch (error) {
    setSelectedSaleDetails(null)

    alert(
      'Error cargando detalle de factura: ' +
        (error instanceof Error ? error.message : 'Error desconocido.')
    )
  } finally {
    setDetailsLoading(false)
  }
}

  function openCreditNoteFlow(sale: Sale) {
    const invoice = encodeURIComponent(sale.invoice_number || sale.id)
    window.location.href = `/ventas/notas-credito?invoice=${invoice}`
  }

  function openExchangeFlow(sale: Sale) {
    const invoice = encodeURIComponent(sale.invoice_number || sale.id)
    window.location.href = `/ventas/cambios?invoice=${invoice}`
  }

  async function registerPayment() {
  const storeId = await getCurrentStoreId()

  if (!storeId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  const amount = Number(paymentAmount || 0)

  if (selectedSales.length === 0) {
    return alert('Selecciona facturas.')
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return alert('Escribe el monto recibido.')
  }

  setSaving(true)

  try {
    const response = await fetch('/api/accounts-receivable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        saleIds: selectedSales.map((sale) => sale.id),
        amount,
        paymentDate: paymentDate
          ? `${paymentDate}T12:00:00`
          : new Date().toISOString(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    })

    const data = (await response.json().catch(() => null)) as {
      payments?: Array<{
        saleId: string
        amount: number
        balanceDue: number
        status: string
      }>
      appliedAmount?: number
      unappliedAmount?: number
      error?: string
    } | null

    if (!response.ok) {
      throw new Error(
        data?.error || 'No se pudo registrar el pago.'
      )
    }

    setPaymentModal(false)

    await loadData()

    const unappliedAmount = Number(data?.unappliedAmount || 0)

    if (unappliedAmount > 0) {
      alert(
        `Pago registrado correctamente. Quedaron ${formatMoney(
          unappliedAmount
        )} sin aplicar porque las facturas seleccionadas ya fueron cubiertas.`
      )
      return
    }

    alert('Pago registrado correctamente.')
  } catch (error) {
    alert(
      'Error registrando pago: ' +
        (error instanceof Error ? error.message : 'Error desconocido.')
    )
  } finally {
    setSaving(false)
  }
}

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <CreditCard className="text-[#a90404]" />
            Cuentas por Cobrar
          </h1>
          <p className="text-zinc-500">
            Facturas pendientes y pagos por cobrar de clientes.
          </p>
        </div>

        <button
          onClick={openPaymentModal}
          className="rounded-xl bg-[#a90404] px-5 py-3 font-bold text-white hover:bg-[#8f0303]"
        >
          Registrar pago
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat title="Pendiente filtrado" value={formatMoney(totalPending)} />
        <Stat title="Facturas pendientes" value={String(filteredSales.length)} />
        <Stat title="Seleccionado" value={formatMoney(selectedTotal)} green />
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <Search className="text-[#a90404]" size={20} />
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Buscar por cliente, cÃ©dula, telÃ©fono, factura, RNC o NCF..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-5">
          <div>
            <h2 className="text-xl font-semibold">Facturas pendientes</h2>
            <p className="text-sm text-zinc-500">
              Mostrando {firstVisibleSale}-{lastVisibleSale} de {filteredSales.length} facturas
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
            Facturas por pÃ¡gina
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-[#a90404]"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
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
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Pagado</th>
                  <th className="p-4">Pendiente</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {paginatedSales.map((sale) => {
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
                          {displayCustomerName(sale)}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {customer?.cedula || '-'} Â· {customer?.phone || '-'}
                        </p>
                      </td>

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

                      <td className="p-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openSaleDetails(sale)}
                            className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-bold hover:bg-zinc-100"
                          >
                            <Eye size={15} />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreditNoteFlow(sale)}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                          >
                            <FileBadge2 size={15} />
                            Anular
                          </button>
                          <button
                            type="button"
                            onClick={() => openExchangeFlow(sale)}
                            className="inline-flex items-center gap-1 rounded-xl border border-[#a90404]/20 px-3 py-2 text-sm font-bold text-[#a90404] hover:bg-[#a90404]/5"
                          >
                            <RefreshCcw size={15} />
                            Cambio
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        <span>
          PÃ¡gina {currentPage} de {totalReceivablePages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
            className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalReceivablePages, page + 1))}
            disabled={currentPage >= totalReceivablePages}
            className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>

      {selectedSaleDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-black">Factura {selectedSaleDetails.invoice_number || `#${selectedSaleDetails.id.slice(0, 8).toUpperCase()}`}</h2>
                <p className="text-zinc-500">{formatDate(selectedSaleDetails.created_at)}</p>
              </div>
              <button onClick={() => setSelectedSaleDetails(null)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><X /></button>
            </div>

            {detailsLoading ? (
              <p className="p-6 text-zinc-500">Cargando detalle...</p>
            ) : (
              <div className="space-y-5 p-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <Info title="Cliente" value={displayCustomerName(selectedSaleDetails)} />
                  <Info title="RNC / Cedula" value={displayCustomerDocument(selectedSaleDetails)} />
                  <Info title="Telefono" value={displayCustomerPhone(selectedSaleDetails)} />
                  <Info title="NCF" value={selectedSaleDetails.ncf || '-'} />
                  <Info title="Metodo" value={detailPaymentMethod?.name || 'Pendiente de pago'} />
                </div>

                <div className="rounded-2xl border border-zinc-200">
                  <div className="border-b border-zinc-200 p-4 font-black">Productos</div>
                  <div className="divide-y divide-zinc-100">
                    {detailItems.map((item) => (
                      <div key={item.id} className="flex justify-between gap-4 p-4">
                        <div>
                          <p className="font-bold">{item.product_name}</p>
                          <p className="text-sm text-zinc-500">Cantidad: {item.quantity} ? Precio: {formatMoney(item.unit_price)}</p>
                          {item.imei && <p className="text-sm font-semibold text-emerald-700">IMEI/Serial: {item.imei}</p>}
                        </div>
                        <p className="font-black">{formatMoney(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-5">
                  <DetailRow label="Subtotal" value={formatMoney(selectedSaleDetails.subtotal || 0)} />
                  <DetailRow label="ITBIS" value={formatMoney(selectedSaleDetails.itbis || 0)} />
                  <DetailRow label="Descuento" value={formatMoney(selectedSaleDetails.discount || 0)} />
                  <DetailRow label="Total" value={formatMoney(selectedSaleDetails.total)} bold />
                  <DetailRow label="Pagado" value={formatMoney(paidAmount(selectedSaleDetails))} />
                  <DetailRow label="Pendiente" value={formatMoney(balanceOf(selectedSaleDetails))} bold red />
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button onClick={() => window.open(`/ventas/${selectedSaleDetails.id}/imprimir`, '_blank')} className="rounded-xl border border-zinc-300 px-5 py-3 font-bold hover:bg-zinc-100">Reimprimir</button>
                  <button onClick={() => openCreditNoteFlow(selectedSaleDetails)} className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-600 hover:bg-red-50">Anular con nota de credito</button>
                  <button onClick={() => openExchangeFlow(selectedSaleDetails)} className="rounded-xl bg-[#a90404] px-5 py-3 font-bold text-white hover:bg-[#8f0303]">Cambio de equipo</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#a90404]"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Fecha de pago
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#a90404]"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Referencia
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transferencia, cheque, comprobante..."
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#a90404]"
              />

              <label className="mt-4 block text-sm text-zinc-500">
                Notas
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-[#a90404]"
              />

              <button
                onClick={registerPayment}
                disabled={saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#a90404] py-4 font-bold text-white hover:bg-[#8f0303] disabled:opacity-50"
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
function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-bold text-zinc-500">{title}</p>
      <p className="mt-1 font-black text-zinc-950">{value || '-'}</p>
    </div>
  )
}

function DetailRow({ label, value, bold = false, red = false }: { label: string; value: string; bold?: boolean; red?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${bold ? 'text-lg font-black' : 'font-semibold'}`}>
      <span className="text-zinc-600">{label}</span>
      <span className={red ? 'text-red-600' : 'text-zinc-950'}>{value}</span>
    </div>
  )
}

