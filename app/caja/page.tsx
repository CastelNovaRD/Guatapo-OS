'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'

type CashRegister = {
  id: string
  opening_amount: number
  closing_amount: number | null
  status: string
  opened_at: string
  closed_at: string | null
}

export default function CajaPage() {
  const [openCash, setOpenCash] = useState<CashRegister | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCash()
  }, [])

  async function loadCash() {
    setLoading(true)
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('store_id', currentStoreId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setOpenCash(data || null)
    setLoading(false)
  }

  async function openRegister() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const { error } = await supabase.from('cash_registers').insert({
      store_id: storeId,
      opening_amount: Number(openingAmount || 0),
      status: 'open',
    })

    if (error) return alert(error.message)

    setOpeningAmount('')
    window.dispatchEvent(new Event('guatapo:cash-updated'))
    loadCash()
  }

  async function closeRegister() {
    if (!openCash) return

    const { data: sales } = await supabase
      .from('sales')
      .select('total, card_fee, cash_received, cash_change, net_received, sale_items(cost, quantity, total)')
      .eq('store_id', storeId)
      .eq('cash_register_id', openCash.id)

    const businessSales = sales?.reduce(
      (sum, sale) => sum + Math.max(0, Number(sale.total || 0) - Number(sale.card_fee || 0)),
      0
    ) || 0
    const totalSales = Number(openCash.opening_amount || 0) + businessSales
    const totalCardFee = sales?.reduce((sum, sale) => sum + Number(sale.card_fee || 0), 0) || 0

    const grossProfit =
      sales?.reduce((sum, sale: any) => {
        const itemsProfit =
          sale.sale_items?.reduce((iSum: number, item: any) => {
            return iSum + (Number(item.total || 0) - Number(item.cost || 0) * Number(item.quantity || 1))
          }, 0) || 0

        return sum + itemsProfit
      }, 0) || 0
    const profit = Math.max(0, grossProfit - totalCardFee)

    const counted = Number(closingAmount || 0)
    const difference = counted - totalSales

    const { error } = await supabase
      .from('cash_registers')
      .update({
        closing_amount: counted,
        total_sales: totalSales,
        total_card_fee: totalCardFee,
        total_profit: profit,
        difference,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('id', openCash.id)

    if (error) return alert(error.message)

    alert('Caja cerrada correctamente')
    setClosingAmount('')
    window.dispatchEvent(new Event('guatapo:cash-updated'))
    loadCash()
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Caja</h1>
        <p className="text-zinc-500">Apertura y cierre de caja diaria.</p>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : openCash ? (
        <div className="max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-emerald-600">Caja abierta</h2>

          <p className="mt-3 text-zinc-500">Apertura</p>
          <p className="font-bold">RD${Number(openCash.opening_amount).toLocaleString()}</p>

          <p className="mt-3 text-zinc-500">Fecha</p>
          <p>{new Date(openCash.opened_at).toLocaleString()}</p>

          <div className="mt-6">
            <label className="mb-2 block text-sm text-zinc-500">
              Efectivo contado al cierre
            </label>
            <input
              type="number"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              placeholder="Ej: 15000"
            />
          </div>

          <button
            onClick={closeRegister}
            className="mt-5 w-full rounded-xl bg-red-500 py-4 font-bold text-white hover:bg-red-600"
          >
            Cerrar caja
          </button>
        </div>
      ) : (
        <div className="max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">Abrir caja</h2>
          <p className="mt-1 text-zinc-500">
            Debes abrir caja antes de usar el POS de Venta.
          </p>

          <div className="mt-6">
            <label className="mb-2 block text-sm text-zinc-500">
              Efectivo inicial
            </label>
            <input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
              placeholder="Ej: 5000"
            />
          </div>

          <button
            onClick={openRegister}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600"
          >
            Abrir caja
          </button>
        </div>
      )}
    </AppShell>
  )
}
