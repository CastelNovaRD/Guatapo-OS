'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'
import { formatMoney } from '@/lib/format'
import {
  AlertTriangle,
  CreditCard,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'

type Sale = {
  id: string
  total: number
  card_fee: number
  shipping_cost: number
  cooperative_commission_amount: number
  net_received: number
  created_at: string
  invoice_number: string | null
}

type SaleItem = {
  sale_id: string
  quantity: number
  cost: number
  total: number
}

type Product = {
  id: string
  name: string
  stock: number
  active: boolean | null
}

export default function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day')

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)

    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return
    }

    const { data: salesData } = await supabase
      .from('sales')
      .select(
        'id, total, card_fee, shipping_cost, cooperative_commission_amount, net_received, created_at, invoice_number'
      )
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, stock, active')
      .eq('store_id', storeId)

    const nextSales = salesData || []
    const saleIds = nextSales.map((sale) => sale.id)

    if (saleIds.length) {
      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, cost, total')
        .in('sale_id', saleIds)

      setSaleItems(itemsData || [])
    } else {
      setSaleItems([])
    }

    setSales(nextSales)
    setProducts(productsData || [])
    setLoading(false)
  }

  function getPeriodSales() {
    const now = new Date()

    return sales.filter((sale) => {
      const date = new Date(sale.created_at)

      if (period === 'day') {
        return date.toDateString() === now.toDateString()
      }

      if (period === 'month') {
        return (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth()
        )
      }

      return date.getFullYear() === now.getFullYear()
    })
  }

  function profitForSale(saleId: string) {
    const sale = sales.find((item) => item.id === saleId)

    const itemsProfit = saleItems
      .filter((item) => item.sale_id === saleId)
      .reduce((sum, item) => {
        return (
          sum +
          (Number(item.total || 0) -
            Number(item.cost || 0) * Number(item.quantity || 1))
        )
      }, 0)

    return (
      itemsProfit -
      Number(sale?.card_fee || 0) -
      Number(sale?.cooperative_commission_amount || 0)
    )
  }

  const selectedSales = getPeriodSales()
  const selectedSaleIds = new Set(selectedSales.map((sale) => sale.id))

  const totalSelectedSales = selectedSales.reduce(
    (sum, sale) => sum + saleBusinessTotal(sale),
    0
  )

  const totalSelectedProfit = selectedSales.reduce(
    (sum, sale) => sum + profitForSale(sale.id),
    0
  )

  const totalSelectedItems = saleItems
    .filter((item) => selectedSaleIds.has(item.sale_id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  const totalShipping = selectedSales.reduce(
    (sum, sale) => sum + Number(sale.shipping_cost || 0),
    0
  )

  const cardFeesSelected = selectedSales.reduce(
    (sum, sale) => sum + Number(sale.card_fee || 0),
    0
  )

  const cooperativeFeesSelected = selectedSales.reduce(
    (sum, sale) => sum + Number(sale.cooperative_commission_amount || 0),
    0
  )

  const currentYear = new Date().getFullYear()
  const chartData = buildDashboardChartData(sales, period)

  const bestChartPoint = chartData.reduce(
    (best, item) => (item.amount > best.amount ? item : best),
    chartData[0] || { label: '-', amount: 0 }
  )

  const maxChartAmount = Math.max(...chartData.map((item) => item.amount), 1)

  const activeProducts = products.filter((p) => p.active !== false).length
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 2)
  const outOfStock = products.filter((p) => p.stock <= 0)

  const lastSales = sales.slice(0, 5)

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="text-zinc-500">Resumen general de Guatapo OS</p>
      </div>

      {loading ? (
        <p className="text-zinc-500">Cargando dashboard...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-5">
            <Card
              title={`Ventas ${periodLabel(period)}`}
              value={formatDashboardMoney(totalSelectedSales)}
              icon={<ShoppingCart />}
              compactValue
            />

            <Card
              title="Ítems vendidos"
              value={String(totalSelectedItems)}
              icon={<Package />}
            />

            <Card
              title="Beneficio neto"
              value={formatDashboardMoney(totalSelectedProfit)}
              icon={<TrendingUp />}
              compactValue
            />

            <Card
              title="Productos activos"
              value={String(activeProducts)}
              icon={<Package />}
            />

            <Card
              title="Stock bajo"
              value={String(lowStock.length)}
              icon={<AlertTriangle />}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Resumen por periodo</h3>
                <p className="text-zinc-500">
                  Selecciona día, mes o año para ver el dashboard.
                </p>
              </div>

              <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                {(['day', 'month', 'year'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPeriod(option)}
                    className={`rounded-lg px-5 py-2 font-bold ${
                      period === option
                        ? 'bg-emerald-500 text-white'
                        : 'text-zinc-700 hover:bg-white'
                    }`}
                  >
                    {option === 'day'
                      ? 'Día'
                      : option === 'month'
                        ? 'Mes'
                        : 'Año'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex h-52 items-end gap-2 rounded-xl bg-zinc-50 p-4">
              {chartData.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                >
                  <div
                    title={formatMoney(item.amount)}
                    className={`w-full rounded-t-lg ${
                      item.label === bestChartPoint.label
                        ? 'bg-emerald-500'
                        : 'bg-zinc-300'
                    }`}
                    style={{
                      height: `${Math.max(
                        6,
                        (item.amount / maxChartAmount) * 160
                      )}px`,
                    }}
                  />

                  <span className="text-xs font-semibold uppercase text-zinc-600">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-sm font-semibold text-emerald-700">
              Mayor venta en {chartTitle(period, currentYear)}:{' '}
              {bestChartPoint.label} con {formatMoney(bestChartPoint.amount)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card
              title="Comisión de tarjeta"
              value={formatMoney(cardFeesSelected)}
              icon={<CreditCard />}
              danger
            />

            <Card
              title="Comisión de cooperativas"
              value={formatMoney(cooperativeFeesSelected)}
              icon={<Users />}
              danger
            />

            <Card
              title="Envíos"
              value={formatMoney(totalShipping)}
              icon={<Truck />}
              danger
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">Últimas ventas</h3>

              <div className="mt-4 space-y-3">
                {lastSales.length === 0 ? (
                  <p className="text-zinc-500">
                    Todavía no hay ventas registradas.
                  </p>
                ) : (
                  lastSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between rounded-xl bg-zinc-50 p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {sale.invoice_number || 'Venta POS'}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {new Date(sale.created_at).toLocaleString()}
                        </p>
                      </div>

                      <p className="font-bold text-emerald-600">
                        {formatMoney(saleBusinessTotal(sale))}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">Alertas de inventario</h3>

              <div className="mt-4 space-y-3">
                {lowStock.length === 0 && outOfStock.length === 0 ? (
                  <p className="text-zinc-500">
                    No hay alertas de inventario.
                  </p>
                ) : (
                  <>
                    {outOfStock.slice(0, 5).map((product) => (
                      <AlertItem
                        key={product.id}
                        title={product.name}
                        text="Agotado"
                        danger
                      />
                    ))}

                    {lowStock.slice(0, 5).map((product) => (
                      <AlertItem
                        key={product.id}
                        title={product.name}
                        text={`Quedan ${product.stock}`}
                      />
                    ))}
                  </>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </AppShell>
  )
}

function saleBusinessTotal(sale: Sale) {
  return Math.max(0, Number(sale.total || 0) - Number(sale.card_fee || 0))
}

function formatDashboardMoney(value: number) {
  return `RD$${Number(value || 0).toLocaleString('es-DO', {
    maximumFractionDigits: 0,
  })}`
}

function periodLabel(period: 'day' | 'month' | 'year') {
  if (period === 'day') return 'del día'
  if (period === 'month') return 'del mes'
  return 'del año'
}

function chartTitle(period: 'day' | 'month' | 'year', year: number) {
  if (period === 'day') return 'el mes actual'
  if (period === 'month') return 'las semanas del mes'
  return String(year)
}

function buildDashboardChartData(
  sales: Sale[],
  period: 'day' | 'month' | 'year'
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
        label: new Date(year, index, 1).toLocaleDateString('es-DO', {
          month: 'short',
        }),
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

          return (
            date.getFullYear() === year &&
            date.getMonth() === month &&
            day >= fromDay &&
            day <= toDay
          )
        })
        .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

      return {
        label: `S${index + 1}`,
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

        return (
          date.getFullYear() === year &&
          date.getMonth() === month &&
          date.getDate() === day
        )
      })
      .reduce((sum, sale) => sum + saleBusinessTotal(sale), 0)

    return {
      label: String(day),
      amount,
    }
  })
}

function Card({
  title,
  value,
  icon,
  danger = false,
  compactValue = false,
}: {
  title: string
  value: string
  icon: React.ReactNode
  danger?: boolean
  compactValue?: boolean
}) {
  const valueLength = value.length
  const valueSizeClass = compactValue
    ? valueLength >= 13
      ? 'text-[1.18rem] tracking-[-0.01em]'
      : valueLength >= 10
        ? 'text-[1.35rem]'
        : 'text-[1.65rem]'
    : 'text-[clamp(1.75rem,2vw,2.25rem)]'

  return (
    <div className="min-h-[136px] min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        {icon}
      </div>

      <p className="text-sm font-semibold text-zinc-700">{title}</p>

      <h3
        className={`mt-2 max-w-full whitespace-nowrap font-black leading-tight ${valueSizeClass} ${
          danger ? 'text-red-600' : 'text-zinc-950'
        }`}
      >
        {value}
      </h3>
    </div>
  )
}

function AlertItem({
  title,
  text,
  danger = false,
}: {
  title: string
  text: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-4">
      <p className="font-medium">{title}</p>

      <span
        className={`rounded-full px-3 py-1 text-sm font-bold ${
          danger ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
        }`}
      >
        {text}
      </span>
    </div>
  )
}
