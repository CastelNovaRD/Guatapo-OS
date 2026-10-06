'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'
import { formatMoney, formatDate } from '@/lib/format'
import ExportModal from '@/components/export/ExportModal'
import { exportReports as exportReportsFile } from '@/lib/export/reports-export'
import type { ExportFormat } from '@/lib/export/export-types'
import {
  BarChart3,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Truck,
  CreditCard,
  Download,
} from 'lucide-react'

type Sale = {
  id: string
  total: number
  status: string
  sale_channel: string | null
  created_at: string
  card_fee: number
  shipping_cost: number
  cooperative_commission_amount: number
}

type SaleItem = {
  sale_id: string
  product_name: string
  quantity: number
  cost: number
  total: number
}

type Product = {
  id: string
  name: string
  stock: number
  cost: number
  sale_price: number
  category: string | null
  active: boolean | null
}

type Purchase = {
  id: string
  total: number
  created_at: string
  supplier_name: string | null
}

type Payment = {
  id: string
  amount: number
  payment_date: string
}

export default function ReportesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<'day' | 'month' | 'year' | 'custom'>('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)

    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: salesData } = await supabase
      .from('sales')
      .select('id, total, status, sale_channel, created_at, card_fee, shipping_cost, cooperative_commission_amount')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    const saleIds = (salesData || []).map((sale) => sale.id)

    let saleItemsData: SaleItem[] = []

    if (saleIds.length) {
      const { data } = await supabase
        .from('sale_items')
        .select('sale_id, product_name, quantity, cost, total')
        .in('sale_id', saleIds)

      saleItemsData = data || []
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, stock, cost, sale_price, category, active')
      .eq('store_id', storeId)

    const { data: purchasesData } = await supabase
      .from('purchases')
      .select('id, total, created_at, supplier_name')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, amount, payment_date')
      .eq('store_id', storeId)
      .order('payment_date', { ascending: false })

    setSales(salesData || [])
    setSaleItems(saleItemsData)
    setProducts(productsData || [])
    setPurchases(purchasesData || [])
    setPayments(paymentsData || [])
    setLoading(false)
  }

  function getRange() {
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

  function inRange(dateValue: string) {
    const { start, end } = getRange()
    const date = new Date(dateValue)

    if (start && date < start) return false
    if (end && date > end) return false

    return true
  }

  const filteredSales = useMemo(
    () => sales.filter((sale) => inRange(sale.created_at)),
    [sales, period, fromDate, toDate]
  )

  const filteredPurchases = useMemo(
    () => purchases.filter((purchase) => inRange(purchase.created_at)),
    [purchases, period, fromDate, toDate]
  )

  const filteredPayments = useMemo(
    () => payments.filter((payment) => inRange(payment.payment_date)),
    [payments, period, fromDate, toDate]
  )

  const filteredSaleIds = new Set(filteredSales.map((sale) => sale.id))

  const filteredItems = saleItems.filter((item) =>
    filteredSaleIds.has(item.sale_id)
  )

  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + Number(sale.total || 0),
    0
  )

  const totalPurchases = filteredPurchases.reduce(
    (sum, purchase) => sum + Number(purchase.total || 0),
    0
  )

  const totalPayments = filteredPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const totalProfit = filteredItems.reduce((sum, item) => {
    return (
      sum +
      (Number(item.total || 0) -
        Number(item.cost || 0) * Number(item.quantity || 0))
    )
  }, 0)

  const activeProducts = products.filter((product) => product.active !== false)

  const inventoryValue = activeProducts.reduce((sum, product) => {
    return sum + Number(product.cost || 0) * Number(product.stock || 0)
  }, 0)

  const lowStockProducts = activeProducts.filter(
    (product) => product.stock > 0 && product.stock <= 2
  )

  const outOfStockProducts = activeProducts.filter(
    (product) => product.stock <= 0
  )

  const topProducts = Object.values(
    filteredItems.reduce<Record<string, { name: string; quantity: number; total: number }>>(
      (acc, item) => {
        if (!acc[item.product_name]) {
          acc[item.product_name] = {
            name: item.product_name,
            quantity: 0,
            total: 0,
          }
        }

        acc[item.product_name].quantity += Number(item.quantity || 0)
        acc[item.product_name].total += Number(item.total || 0)

        return acc
      },
      {}
    )
  )
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  async function handleExportReports() {
    await exportReportsFile({
      format: exportFormat,
      period,
      periodLabel: reportPeriodLabel(period),
      summary: {
        sales: totalSales,
        purchases: totalPurchases,
        profit: totalProfit,
        payments: totalPayments,
        pendingReceivable: filteredSales.filter((sale) => sale.status === 'pending').reduce((sum, sale) => sum + Number(sale.total || 0), 0),
        cardFee: filteredSales.reduce((sum, sale) => sum + Number(sale.card_fee || 0), 0),
        cooperativeFee: filteredSales.reduce((sum, sale) => sum + Number(sale.cooperative_commission_amount || 0), 0),
        shipping: filteredSales.reduce((sum, sale) => sum + Number(sale.shipping_cost || 0), 0),
        activeProducts: activeProducts.length,
        lowStock: lowStockProducts.length,
        outOfStock: outOfStockProducts.length,
      },
      topProducts: topProducts.map((product) => ({ product: product.name, quantity: product.quantity, total: product.total })),
      latestSales: filteredSales.slice(0, 10).map((sale) => ({ date: sale.created_at, invoice: sale.id, channel: sale.sale_channel || '-', status: sale.status, total: Number(sale.total || 0) })),
      purchases: filteredPurchases.map((purchase) => ({ date: purchase.created_at, supplier: purchase.supplier_name || '', reference: purchase.id, total: Number(purchase.total || 0) })),
      receivables: filteredSales.filter((sale) => sale.status === 'pending').map((sale) => ({ date: sale.created_at, reference: sale.id, status: sale.status, amount: Number(sale.total || 0) })),
      inventoryAlerts: [...lowStockProducts, ...outOfStockProducts].map((product) => ({ product: product.name, category: product.category || '', stock: Number(product.stock || 0), alert: product.stock <= 0 ? 'Agotado' : 'Stock bajo' })),
    })
    setExportModalOpen(false)
  }
  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <BarChart3 className="text-emerald-500" />
            Reportes
          </h1>
          <p className="text-zinc-500">
            Resumen de ventas, compras, ganancias, inventario y cobros.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
        >
          <option value="day">Hoy</option>
          <option value="month">Este mes</option>
          <option value="year">Este año</option>
          <option value="custom">Personalizado</option>
        </select>

        {period === 'custom' && (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
            />

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
            />
          </>
        )}

        <button
          onClick={loadReports}
          className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600"
        >
          Actualizar
        </button>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-bold text-zinc-700 hover:bg-zinc-100"
        >
          <Download size={18} />
          Exportar reporte
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500">Cargando reportes...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <ReportCard
              title="Ventas"
              value={formatMoney(totalSales)}
              icon={<ShoppingCart />}
              green
              compactValue
            />

            <ReportCard
              title="Ganancia estimada"
              value={formatMoney(totalProfit)}
              icon={<TrendingUp />}
              green
              compactValue
            />

            <ReportCard
              title="Compras"
              value={formatMoney(totalPurchases)}
              icon={<Truck />}
              compactValue
            />

            <ReportCard
              title="Cobros recibidos"
              value={formatMoney(totalPayments)}
              icon={<CreditCard />}
              compactValue
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-4">
            <ReportCard
              title="Valor inventario"
              value={formatMoney(inventoryValue)}
              icon={<Package />}
              compactValue
            />

            <ReportCard
              title="Productos activos"
              value={String(activeProducts.length)}
              icon={<Package />}
            />

            <ReportCard
              title="Stock bajo"
              value={String(lowStockProducts.length)}
              icon={<AlertTriangle />}
              warning
            />

            <ReportCard
              title="Agotados"
              value={String(outOfStockProducts.length)}
              icon={<AlertTriangle />}
              danger
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 p-5">
                <h2 className="text-xl font-bold">Productos más vendidos</h2>
              </div>

              {topProducts.length === 0 ? (
                <p className="p-5 text-zinc-500">
                  No hay productos vendidos en este periodo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-sm text-zinc-500">
                      <tr className="border-b border-zinc-200">
                        <th className="p-4">Producto</th>
                        <th className="p-4">Cantidad</th>
                        <th className="p-4">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {topProducts.map((product) => (
                        <tr key={product.name} className="border-b border-zinc-100">
                          <td className="p-4 font-bold">{product.name}</td>
                          <td className="p-4">{product.quantity}</td>
                          <td className="p-4 font-black text-emerald-600">
                            {formatMoney(product.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 p-5">
                <h2 className="text-xl font-bold">Últimas ventas</h2>
              </div>

              {filteredSales.length === 0 ? (
                <p className="p-5 text-zinc-500">
                  No hay ventas en este periodo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="text-sm text-zinc-500">
                      <tr className="border-b border-zinc-200">
                        <th className="p-4">Fecha</th>
                        <th className="p-4">Canal</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredSales.slice(0, 10).map((sale) => (
                        <tr key={sale.id} className="border-b border-zinc-100">
                          <td className="p-4">{formatDate(sale.created_at)}</td>
                          <td className="p-4">{sale.sale_channel || '-'}</td>
                          <td className="p-4">{sale.status}</td>
                          <td className="p-4 font-black text-emerald-600">
                            {formatMoney(sale.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ExportModal
        open={exportModalOpen}
        title="Exportar reporte"
        format={exportFormat}
        onFormatChange={setExportFormat}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportReports}
      >
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-bold text-zinc-700">
          Se exportará el periodo seleccionado actualmente: {reportPeriodLabel(period)}.
        </div>
      </ExportModal>
    </AppShell>
  )
}

function reportPeriodLabel(period: 'day' | 'month' | 'year' | 'custom') {
  if (period === 'day') return 'Hoy'
  if (period === 'month') return 'Este mes'
  if (period === 'year') return 'Este ano'
  return 'Personalizado'
}

function ReportCard({
  title,
  value,
  icon,
  green = false,
  warning = false,
  danger = false,
  compactValue = false,
}: {
  title: string
  value: string
  icon: React.ReactNode
  green?: boolean
  warning?: boolean
  danger?: boolean
  compactValue?: boolean
}) {
  const valueLength = value.length
  const valueSizeClass = compactValue
    ? valueLength >= 16
      ? 'text-[1.05rem] tracking-[-0.02em]'
      : valueLength >= 13
        ? 'text-[1.2rem] tracking-[-0.01em]'
        : valueLength >= 10
          ? 'text-[1.45rem]'
          : 'text-2xl'
    : 'text-2xl'

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
          green
            ? 'bg-emerald-50 text-emerald-600'
            : warning
              ? 'bg-yellow-50 text-yellow-600'
              : danger
                ? 'bg-red-50 text-red-600'
                : 'bg-zinc-100 text-zinc-700'
        }`}
      >
        {icon}
      </div>

      <p className="text-sm text-zinc-500">{title}</p>
      <h3 className={`mt-2 max-w-full whitespace-nowrap font-black leading-tight ${valueSizeClass}`}>
        {value}
      </h3>
    </div>
  )
}



