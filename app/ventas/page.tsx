'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { BarChart3, Download, Eye, FileBadge2, Printer, RefreshCcw, Search, X } from 'lucide-react'
import { formatDate, formatTime, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import ExportModal from '@/components/export/ExportModal'
import { exportSales as exportSalesFile } from '@/lib/export/sales-export'
import type { ExportFormat, SalesExportChannel, SalesExportPeriod, SalesExportStatus } from '@/lib/export/export-types'
import { getSaleStatusVisual } from '@/lib/sale-status'

type Sale = {
  id: string
  invoice_number: string | null
  total: number
  discount: number
  card_fee: number
  shipping_cost: number
  cooperative_commission_percent: number
  cooperative_commission_amount: number
  net_received: number
  status: string
  sale_channel: string
  created_at: string
  customer_id: string | null
  payment_method_id: string | null
  ncf: string | null
  fiscal_receipt_type: string | null
  fiscal_status: string | null
  fiscal_customer_name: string | null
}

type SaleItem = {
  id: string
  sale_id: string
  product_name: string
  quantity: number
  unit_price: number
  cost: number
  discount: number
  total: number
  imei: string | null
}

type Customer = {
  full_name: string
  phone: string | null
  cedula: string | null
}

type PaymentMethod = {
  name: string
}

type CreditNote = {
  id: string
  sale_id: string
  credit_note_number: string | null
  total: number
  created_at: string
}

type CustomerLookup = { id: string; full_name: string }

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [allSaleItems, setAllSaleItems] = useState<SaleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<'day' | 'month' | 'year' | 'custom'>('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [exportPeriod, setExportPeriod] = useState<SalesExportPeriod>('month')
  const [exportFromDate, setExportFromDate] = useState('')
  const [exportToDate, setExportToDate] = useState('')
  const [exportChannel, setExportChannel] = useState<SalesExportChannel>('all')
  const [exportStatus, setExportStatus] = useState<SalesExportStatus>('all')

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)

  useEffect(() => {
    loadSales()
  }, [])

  async function loadSales() {
    setLoading(true)
    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data, error } = await supabase
      .from('sales')
      .select('id, total, discount, card_fee, shipping_cost, cooperative_commission_percent, cooperative_commission_amount, net_received, status, sale_channel, created_at, customer_id, payment_method_id, ncf, invoice_number, fiscal_receipt_type, fiscal_status, fiscal_customer_name')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (error) alert('Error cargando ventas: ' + error.message)

    setSales(data || [])

    const saleIds = (data || []).map((sale) => sale.id)

    if (saleIds.length) {
      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select('id, sale_id, product_name, quantity, unit_price, cost, discount, total, imei')
        .in('sale_id', saleIds)

      if (itemsError) alert('Error cargando ganancias: ' + itemsError.message)
      setAllSaleItems(itemsData || [])
    } else {
      setAllSaleItems([])
    }
    setLoading(false)
  }

  function getPeriodRange() {
    const now = new Date()
    const start = new Date(now)
    const end = new Date(now)

    if (period === 'day') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    }

    if (period === 'month') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
    }

    if (period === 'year') {
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(11, 31)
      end.setHours(23, 59, 59, 999)
    }

    if (period === 'custom') {
      return {
        start: fromDate ? new Date(`${fromDate}T00:00:00`) : null,
        end: toDate ? new Date(`${toDate}T23:59:59`) : null,
      }
    }

    return { start, end }
  }

  const filteredSales = useMemo(() => {
    const q = search.toLowerCase().trim()
    const range = getPeriodRange()

    const periodSales = sales.filter((sale) => {
      const date = new Date(sale.created_at)
      const matchStart = range.start ? date >= range.start : true
      const matchEnd = range.end ? date <= range.end : true
      return matchStart && matchEnd
    })

    if (!q) return periodSales

    return periodSales.filter((sale) => {
      const text = `${sale.id} ${sale.status} ${sale.sale_channel} ${sale.ncf || ''} ${sale.fiscal_status || ''} ${formatDate(sale.created_at)}`.toLowerCase()
      return text.includes(q)
    })
  }, [sales, search, period, fromDate, toDate])

  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + saleBusinessTotal(sale),
    0
  )

  const totalFees = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.card_fee || 0),
    0
  )

  const totalCooperativeFees = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.cooperative_commission_amount || 0),
    0
  )

  const totalNet = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.net_received || 0),
    0
  )

  const totalShipping = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.shipping_cost || 0),
    0
  )

  function profitForSale(saleId: string) {
    const sale = sales.find((item) => item.id === saleId)
    const itemsProfit = allSaleItems
      .filter((item) => item.sale_id === saleId)
      .reduce((sum, item) => {
        return sum + (Number(item.total || 0) - Number(item.cost || 0) * Number(item.quantity || 1))
      }, 0)

    return (
      itemsProfit -
      Number(sale?.card_fee || 0) -
      Number(sale?.cooperative_commission_amount || 0)
    )
  }

  const totalProfit = filteredSales.reduce((sum, sale) => sum + profitForSale(sale.id), 0)
  const totalItemsSold = allSaleItems
    .filter((item) => filteredSales.some((sale) => sale.id === item.sale_id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  const lastMonthDate = new Date()
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1)
  const salesLastMonth = sales.filter((sale) => new Date(sale.created_at) >= lastMonthDate)
  const totalLastMonth = salesLastMonth.reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)
  const profitLastMonth = salesLastMonth.reduce((sum, sale) => sum + profitForSale(sale.id), 0)

  const currentYear = new Date().getFullYear()
  const yearSales = sales.filter((sale) => new Date(sale.created_at).getFullYear() === currentYear)
  const totalYear = yearSales.reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)
  const profitYear = yearSales.reduce((sum, sale) => sum + profitForSale(sale.id), 0)
  const chartData = buildVentasChartData(sales, period, fromDate, toDate)
  const bestChartPoint = chartData.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    chartData[0] || { label: '-', amount: 0 }
  )
  const maxChartAmount = Math.max(...chartData.map((item) => item.amount), 1)

  async function openSaleDetails(sale: Sale) {
    setSelectedSale(sale)
    setDetailsLoading(true)
    setSaleItems([])
    setCustomer(null)
    setPaymentMethod(null)
    setCreditNotes([])

    const { data: itemsData, error: itemsError } = await supabase
      .from('sale_items')
      .select('id, sale_id, product_name, quantity, unit_price, cost, discount, total, imei')
      .eq('sale_id', sale.id)

    if (itemsError) {
      alert('Error cargando productos de la venta: ' + itemsError.message)
    } else {
      setSaleItems(itemsData || [])
    }

    if (sale.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('full_name, phone, cedula')
        .eq('id', sale.customer_id)
        .maybeSingle()

      setCustomer(customerData || null)
    }

    if (sale.payment_method_id) {
      const { data: methodData } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('id', sale.payment_method_id)
        .maybeSingle()

      setPaymentMethod(methodData || null)
    }

    const { data: creditNoteRows } = await supabase
      .from('credit_notes')
      .select('id, sale_id, credit_note_number, total, created_at')
      .eq('sale_id', sale.id)
      .order('created_at', { ascending: false })

    setCreditNotes(creditNoteRows || [])

    setDetailsLoading(false)
  }

  function closeDetails() {
    setSelectedSale(null)
    setSaleItems([])
    setCustomer(null)
    setPaymentMethod(null)
    setCreditNotes([])
  }

  function rangeForExportPeriod() {
    const now = new Date()
    const start = new Date(now)
    const end = new Date(now)

    if (exportPeriod === 'day') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    }

    if (exportPeriod === 'month') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1, 0)
      end.setHours(23, 59, 59, 999)
    }

    if (exportPeriod === 'year') {
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(11, 31)
      end.setHours(23, 59, 59, 999)
    }

    if (exportPeriod === 'custom') {
      return {
        start: exportFromDate ? new Date(`${exportFromDate}T00:00:00`) : null,
        end: exportToDate ? new Date(`${exportToDate}T23:59:59`) : null,
      }
    }

    return { start, end }
  }

  function openSalesExport() {
    setExportPeriod(period)
    setExportFromDate(fromDate)
    setExportToDate(toDate)
    setExportModalOpen(true)
  }

  async function handleExportSales() {
    const range = rangeForExportPeriod()
    const periodSales = sales.filter((sale) => {
      const date = new Date(sale.created_at)
      const matchStart = range.start ? date >= range.start : true
      const matchEnd = range.end ? date <= range.end : true
      return matchStart && matchEnd
    })
    const customerIds = Array.from(new Set(periodSales.map((sale) => sale.customer_id).filter(Boolean))) as string[]
    const methodIds = Array.from(new Set(periodSales.map((sale) => sale.payment_method_id).filter(Boolean))) as string[]
    const customerMap = new Map<string, string>()
    const methodMap = new Map<string, string>()

    if (customerIds.length) {
      const { data } = await supabase.from('customers').select('id, full_name').in('id', customerIds)
      ;(data || []).forEach((item: CustomerLookup) => customerMap.set(item.id, item.full_name || ''))
    }

    if (methodIds.length) {
      const { data } = await supabase.from('payment_methods').select('id, name').in('id', methodIds)
      ;(data || []).forEach((item: any) => methodMap.set(item.id, item.name || ''))
    }

    const rows = periodSales.map((sale) => {
      const items = allSaleItems.filter((item) => item.sale_id === sale.id)
      const cost = items.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.quantity || 0), 0)
      return {
        invoice: sale.invoice_number || sale.ncf || sale.id,
        createdAt: sale.created_at,
        customer: sale.fiscal_customer_name || (sale.customer_id ? customerMap.get(sale.customer_id) || 'Cliente' : 'Consumidor final'),
        channel: sale.sale_channel || 'POS',
        status: getSaleStatusVisual(sale.status).label,
        paymentMethod: sale.payment_method_id ? methodMap.get(sale.payment_method_id) || '-' : '-',
        itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        total: saleBusinessTotal(sale),
        cost,
        profit: profitForSale(sale.id),
        cardFee: Number(sale.card_fee || 0),
        cooperativeFee: Number(sale.cooperative_commission_amount || 0),
        shipping: Number(sale.shipping_cost || 0),
      }
    })

    await exportSalesFile({
      rows,
      format: exportFormat,
      period: exportPeriod,
      fromDate: exportFromDate,
      toDate: exportToDate,
      channel: exportChannel,
      status: exportStatus,
    })
    setExportModalOpen(false)
  }
  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <BarChart3 className="text-emerald-500" />
            Ventas
          </h1>
          <p className="text-zinc-500">
            Historial de facturas, detalle de ventas y reimpresión.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={openSalesExport}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-800 hover:bg-zinc-100"
          >
            <Download size={18} />
            Exportar
          </button>

          <Link
            href="/ventas/notas-credito"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-800 hover:bg-zinc-100"
          >
            <FileBadge2 size={18} />
            Nota de crédito
          </Link>

          <Link
            href="/ventas/cambios"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-800 hover:bg-zinc-100"
          >
            <RefreshCcw size={18} />
            Cambio
          </Link>

          <Link
            href="/ventas/comprobantes"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
          >
            <FileBadge2 size={18} />
            Comprobantes
          </Link>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Total ventas" value={formatMoney(totalSales)} />
        <StatCard title="Comision tarjeta" value={formatMoney(totalFees)} red />
        <StatCard title="Comision cooperativa" value={formatMoney(totalCooperativeFees)} red />
        <StatCard title="Neto recibido" value={formatMoney(totalNet)} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Ganancias" value={formatMoney(totalProfit)} />
        <StatCard title="Envíos" value={formatMoney(totalShipping)} />
        <StatCard title="Ítems vendidos" value={String(totalItemsSold)} />
      </div>

      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-600">Periodo</label>
            <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
              {(['day', 'month', 'year', 'custom'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold ${
                    period === option ? 'bg-emerald-500 text-white' : 'text-zinc-700 hover:bg-white'
                  }`}
                >
                  {option === 'day' ? 'Día' : option === 'month' ? 'Mes' : option === 'year' ? 'Año' : 'Rango'}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-600">Desde</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-600">Hasta</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoCard title="Últimos 30 días" value={`${formatMoney(totalLastMonth)} · Ganancia ${formatMoney(profitLastMonth)}`} />
          <InfoCard title={`Año ${currentYear}`} value={`${formatMoney(totalYear)} · Ganancia ${formatMoney(profitYear)}`} />
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-bold">Gráfica de ventas</h2>
            <p className="text-sm font-semibold text-emerald-700">
              Mayor venta: {bestChartPoint.label} · {formatMoney(bestChartPoint.amount)}
            </p>
          </div>

          <div className="flex h-52 items-end gap-2 rounded-xl bg-zinc-50 p-4">
            {chartData.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  title={formatMoney(item.amount)}
                  className={`w-full rounded-t-lg ${item.label === bestChartPoint.label ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  style={{ height: `${Math.max(6, (item.amount / maxChartAmount) * 160)}px` }}
                />
                <span className="text-xs font-semibold uppercase text-zinc-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <Search className="text-emerald-500" size={20} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por factura, fecha, estado o canal..."
          className="w-full bg-transparent outline-none"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Registro de ventas</h2>
          <p className="text-sm text-zinc-500">
            Mostrando {filteredSales.length} de {sales.length}
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando ventas...</p>
        ) : filteredSales.length === 0 ? (
          <p className="p-5 text-zinc-500">No hay ventas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4">Factura</th>
                  <th className="p-4">NCF</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Canal</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Descuento</th>
                  <th className="p-4">Comisión</th>
                  <th className="p-4">Neto</th>
                  <th className="p-4">Ganancias</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Fiscal</th>
                  <th className="p-4 text-right">Acción</th>
                </tr>
              </thead>

              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-zinc-100">
                    <td className="p-4 font-semibold">
                      {sale.invoice_number || `#${sale.id.slice(0, 8).toUpperCase()}`}
                    </td>

                    <td className="p-4">
                     {sale.ncf || '-'}
                    </td>

                    <td className="p-4">{sale.fiscal_receipt_type || '-'}</td>

                    <td className="p-4">
                      <p className="font-medium">{formatDate(sale.created_at)}</p>
                      <p className="text-sm text-zinc-500">{formatTime(sale.created_at)}</p>
                    </td>

                    <td className="p-4">{sale.sale_channel}</td>

                    <td className="p-4 font-semibold text-emerald-600">
                      {formatMoney(saleBusinessTotal(sale))}
                    </td>

                    <td className="p-4">{formatMoney(sale.discount)}</td>

                    <td className="p-4 text-red-500">
                      {formatMoney(Number(sale.card_fee || 0) + Number(sale.cooperative_commission_amount || 0))}
                    </td>

                    <td className="p-4 font-semibold">
                      {formatMoney(sale.net_received)}
                    </td>

                    <td className="p-4 font-semibold text-emerald-600">
                      {formatMoney(profitForSale(sale.id))}
                    </td>

                    <td className="p-4">
                      <SaleStatusBadge status={sale.status} />
                    </td>

                    <td className="p-4">
                      <FiscalStatusBadge status={sale.fiscal_status} />
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => openSaleDetails(sale)}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100"
                      >
                        <Eye size={16} />
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">
                  Factura {selectedSale.invoice_number || `#${selectedSale.id.slice(0, 8).toUpperCase()}`}
                </h2>

                <p className="text-zinc-500">
                  NCF: {selectedSale.ncf || '-'}
                </p>

                {selectedSale.ncf && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-bold text-zinc-700">
                      Tipo {selectedSale.fiscal_receipt_type || '-'}
                    </span>
                    <FiscalStatusBadge status={selectedSale.fiscal_status} />
                  </div>
                )}

                <p className="text-zinc-500">
                  {formatDate(selectedSale.created_at)} · {formatTime(selectedSale.created_at)}
                </p>
              </div>

              <button
                onClick={closeDetails}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <X size={22} />
              </button>
            </div>

            {detailsLoading ? (
              <p className="p-6 text-zinc-500">Cargando detalle...</p>
            ) : (
              <div className="p-6">
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <InfoCard title="Cliente" value={customer?.full_name || 'Consumidor Final'} />
                  <InfoCard title="Teléfono" value={customer?.phone || '-'} />
                  <InfoCard title="Método pago" value={paymentMethod?.name || '-'} />
                </div>

                {creditNotes.length > 0 && (
                  <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <h3 className="font-bold text-orange-800">Notas de crédito</h3>
                    <div className="mt-3 space-y-2">
                      {creditNotes.map((note) => (
                        <div key={note.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                          <div>
                            <p className="font-bold">{note.credit_note_number || note.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-sm text-zinc-500">
                              {formatDate(note.created_at)} · {formatMoney(note.total)}
                            </p>
                          </div>
                          <button
                            onClick={() => window.open(`/ventas/notas-credito/${note.id}/imprimir`, '_blank')}
                            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
                          >
                            <Printer size={16} />
                            Imprimir nota de crédito
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-zinc-200">
                  <div className="border-b border-zinc-200 p-4">
                    <h3 className="font-bold">Productos vendidos</h3>
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {saleItems.map((item) => (
                      <div key={item.id} className="p-4">
                        <div className="flex justify-between gap-4">
                          <div>
                            <p className="font-semibold">{item.product_name}</p>
                            <p className="text-sm text-zinc-500">
                              Cantidad: {item.quantity} · Precio: {formatMoney(item.unit_price)}
                            </p>

                            {item.imei && (
                              <p className="mt-1 text-sm font-medium text-emerald-600">
                                IMEI/Serial: {item.imei}
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <p className="font-bold">{formatMoney(item.total)}</p>
                            {Number(item.discount || 0) > 0 && (
                              <p className="text-sm text-red-500">
                                Desc: {formatMoney(item.discount)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-zinc-50 p-5">
                  <Row label="Total" value={formatMoney(selectedSale.total)} bold />
                  <Row label="Descuento" value={formatMoney(selectedSale.discount)} />
                  <Row label="Comision tarjeta" value={formatMoney(selectedSale.card_fee)} red />
                  <Row
                    label={`Comision cooperativa (${Number(selectedSale.cooperative_commission_percent || 0)}%)`}
                    value={formatMoney(selectedSale.cooperative_commission_amount || 0)}
                    red
                  />
                  <Row label="Neto recibido" value={formatMoney(selectedSale.net_received)} bold />
                  <Row label="Ganancias" value={formatMoney(profitForSale(selectedSale.id))} bold />
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => window.open(`/ventas/${selectedSale.id}/imprimir`, '_blank')}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-5 py-3 font-semibold hover:bg-zinc-100"
                  >
                    <Printer size={18} />
                    Reimprimir
                  </button>

                  {creditNotes[0] && (
                    <button
                      onClick={() => window.open(`/ventas/notas-credito/${creditNotes[0].id}/imprimir`, '_blank')}
                      className="inline-flex items-center gap-2 rounded-xl border border-orange-300 px-5 py-3 font-semibold text-orange-700 hover:bg-orange-50"
                    >
                      <FileBadge2 size={18} />
                      Imprimir nota de crédito
                    </button>
                  )}

                  <button
                    onClick={closeDetails}
                    className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ExportModal
        open={exportModalOpen}
        title="Exportar ventas"
        format={exportFormat}
        onFormatChange={setExportFormat}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportSales}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-zinc-700">Periodo</span>
            <select value={exportPeriod} onChange={(e) => setExportPeriod(e.target.value as SalesExportPeriod)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">
              <option value="day">Día</option>
              <option value="month">Mes</option>
              <option value="year">Año</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-zinc-700">Canal</span>
            <select value={exportChannel} onChange={(e) => setExportChannel(e.target.value as SalesExportChannel)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">
              <option value="all">Todos</option>
              <option value="pos">POS</option>
              <option value="cooperative">Cooperativa</option>
              <option value="quotation">Cotización</option>
            </select>
          </label>
          {exportPeriod === 'custom' && <>
            <label className="block"><span className="mb-1 block text-sm font-bold text-zinc-700">Fecha inicial</span><input type="date" value={exportFromDate} onChange={(e) => setExportFromDate(e.target.value)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /></label>
            <label className="block"><span className="mb-1 block text-sm font-bold text-zinc-700">Fecha final</span><input type="date" value={exportToDate} onChange={(e) => setExportToDate(e.target.value)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /></label>
          </>}
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-bold text-zinc-700">Estado</span>
            <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value as SalesExportStatus)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">
              <option value="all">Todos</option>
              <option value="paid">Pagada</option>
              <option value="pending">Pendiente</option>
              <option value="cancelled">Anulada</option>
            </select>
          </label>
        </div>
      </ExportModal>
    </AppShell>
  )
}

function saleBusinessTotal(sale: Sale) {
  return Math.max(0, Number(sale.total || 0) - Number(sale.card_fee || 0))
}

function buildVentasChartData(
  sales: Sale[],
  period: 'day' | 'month' | 'year' | 'custom',
  fromDate: string,
  toDate: string
) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  if (period === 'year') {
    return Array.from({ length: 12 }, (_, index) => {
      const amount = sales
        .filter((sale) => {
          const date = new Date(sale.created_at)
          return date.getFullYear() === year && date.getMonth() === index
        })
        .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

      return {
        label: new Date(year, index, 1).toLocaleDateString('es-DO', { month: 'short' }),
        amount,
      }
    })
  }

  if (period === 'month') {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weeks = Math.ceil(daysInMonth / 7)

    return Array.from({ length: weeks }, (_, index) => {
      const fromDay = index * 7 + 1
      const toDay = Math.min(fromDay + 6, daysInMonth)
      const amount = sales
        .filter((sale) => {
          const date = new Date(sale.created_at)
          const day = date.getDate()
          return date.getFullYear() === year && date.getMonth() === month && day >= fromDay && day <= toDay
        })
        .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

      return {
        label: `S${index + 1}`,
        amount,
      }
    })
  }

  if (period === 'custom' && fromDate && toDate) {
    const start = new Date(`${fromDate}T00:00:00`)
    const end = new Date(`${toDate}T00:00:00`)
    const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)

    if (diffDays <= 45) {
      return Array.from({ length: diffDays }, (_, index) => {
        const day = new Date(start)
        day.setDate(start.getDate() + index)
        const amount = sales
          .filter((sale) => {
            const date = new Date(sale.created_at)
            return date.toDateString() === day.toDateString()
          })
          .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

        return {
          label: String(day.getDate()),
          amount,
        }
      })
    }

    return Array.from({ length: 12 }, (_, index) => {
      const amount = sales
        .filter((sale) => {
          const date = new Date(sale.created_at)
          return date >= start && date <= end && date.getMonth() === index
        })
        .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

      return {
        label: new Date(year, index, 1).toLocaleDateString('es-DO', { month: 'short' }),
        amount,
      }
    })
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    const amount = sales
      .filter((sale) => {
        const date = new Date(sale.created_at)
        return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
      })
      .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

    return {
      label: String(day),
      amount,
    }
  })
}

function reportPeriodLabel(period: 'day' | 'month' | 'year' | 'custom') {
  if (period === 'day') return 'Dia actual'
  if (period === 'month') return 'Mes actual'
  if (period === 'year') return 'Ano actual'
  return 'Rango personalizado'
}

function FiscalStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'not_applicable') {
    return <span className="text-sm text-zinc-400">-</span>
  }

  const styles: Record<string, string> = {
    pending: 'bg-orange-50 text-orange-700',
    ready_to_send: 'bg-blue-50 text-blue-700',
    sent: 'bg-violet-50 text-violet-700',
    accepted: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
    voided: 'bg-zinc-100 text-zinc-600',
  }

  const labels: Record<string, string> = {
    pending: 'Pendiente',
    ready_to_send: 'Listo e-CF',
    sent: 'Enviado',
    accepted: 'Aceptado',
    rejected: 'Rechazado',
    voided: 'Anulado',
  }

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${styles[status] || 'bg-zinc-100 text-zinc-600'}`}>
      {labels[status] || status}
    </span>
  )
}

function SaleStatusBadge({ status }: { status: string | null }) {
  const visual = getSaleStatusVisual(status)

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${visual.className}`}>
      {visual.label}
    </span>
  )
}

function StatCard({
  title,
  value,
  red = false,
}: {
  title: string
  value: string
  red?: boolean
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
      <h3 className={`mt-2 text-2xl font-bold ${red ? 'text-red-500' : 'text-zinc-950'}`}>
        {value}
      </h3>
    </div>
  )
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  )
}

function Row({
  label,
  value,
  bold = false,
  red = false,
}: {
  label: string
  value: string
  bold?: boolean
  red?: boolean
}) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-zinc-600">{label}</span>
      <span
        className={`${bold ? 'font-bold' : ''} ${
          red ? 'text-red-500' : 'text-zinc-950'
        }`}
      >
        {value}
      </span>
    </div>
  )
}


