'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate, formatTime, formatMoney } from '@/lib/format'
import { calculateCashRegisterTotals } from '@/lib/cash-register'

type CashRegister = {
  id: string
  store_id: string
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  total_sales: number
  total_card_fee: number
  total_profit: number
  difference: number
  status: string
}

type SalePayment = {
  id: string
  total: number
  card_fee: number | null
  cash_received: number | null
  cash_change: number | null
  payment_method_id: string | null
}

type PaymentMethod = {
  id: string
  name: string
}

export default function CashRegisterPrint() {
  const params = useParams()
  const cashId = params.id as string

  const [cash, setCash] = useState<CashRegister | null>(null)
  const [paymentBreakdown, setPaymentBreakdown] = useState({
    cash: 0,
    card: 0,
    transfer: 0,
    cashRefunds: 0,
    expectedCash: 0,
  })
  const [loading, setLoading] = useState(true)

  async function loadPaymentBreakdown(register: CashRegister) {
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('id, total, card_fee, cash_received, cash_change, payment_method_id')
      .eq('cash_register_id', register.id)

    if (salesError) {
      alert('Error cargando desglose de pagos: ' + salesError.message)
      return
    }

    const sales = (salesData || []) as SalePayment[]
    const saleIds = sales.map((sale) => sale.id)
    const methodIds = Array.from(
      new Set(sales.map((sale) => sale.payment_method_id).filter(Boolean))
    ) as string[]
    const methodMap = new Map<string, string>()

    if (methodIds.length > 0) {
      const { data: methodsData } = await supabase
        .from('payment_methods')
        .select('id, name')
        .in('id', methodIds)

      ;((methodsData || []) as PaymentMethod[]).forEach((method) => {
        methodMap.set(method.id, method.name.toLowerCase())
      })
    }

    let refunds: { total: number; refund_method: string | null }[] = []

    if (saleIds.length > 0) {
      const { data: refundRows } = await supabase
        .from('credit_notes')
        .select('total, refund_method')
        .in('sale_id', saleIds)

      refunds = refundRows || []
    }

    const totals = calculateCashRegisterTotals({
      openingAmount: Number(register.opening_amount || 0),
      countedCash: Number(register.closing_amount || 0),
      sales,
      refunds,
      paymentMethods: methodMap,
    })

    setPaymentBreakdown({
      cash: totals.cashSales,
      card: totals.cardSales,
      transfer: totals.transferSales,
      cashRefunds: totals.cashRefunds,
      expectedCash: totals.expectedCash,
    })
  }

  async function loadCash() {
    setLoading(true)

    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('id', cashId)
      .single()

    if (error) {
      alert('Error cargando cuadre: ' + error.message)
      setLoading(false)
      return
    }

    setCash(data)
    await loadPaymentBreakdown(data)
    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(loadCash)
  }, [])

  if (loading) {
    return <main className="p-6">Cargando cuadre...</main>
  }

  if (!cash) {
    return <main className="p-6">No se encontrÃ³ el cuadre.</main>
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[320px] justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
        >
          Imprimir cuadre
        </button>
      </div>

      <section className="mx-auto w-[320px] bg-white p-4 text-sm shadow-xl print:w-[80mm] print:shadow-none">
        <div className="text-center">
          <h1 className="text-2xl font-black">GUATAPO</h1>
          <p>Cuadre de caja</p>
          <p>RNC: 131974661</p>
          <p>809-636-1020</p>
        </div>

        <Divider />

        <div>
          <Row label="Estado" value={cash.status === 'closed' ? 'Cerrada' : 'Abierta'} />
          <Row label="Fecha" value={formatDate(cash.opened_at)} />
          <Row label="Apertura" value={formatTime(cash.opened_at)} />
          <Row label="Cierre" value={cash.closed_at ? formatTime(cash.closed_at) : '-'} />
        </div>

        <Divider />

        <div>
          <Row label="Efectivo inicial" value={formatMoney(cash.opening_amount)} />
          <Row label="Efectivo esperado" value={formatMoney(cash.total_sales)} />
          <Row label="Ventas efectivo" value={formatMoney(paymentBreakdown.cash)} />
          <Row label="Ventas tarjeta" value={formatMoney(paymentBreakdown.card)} />
          <Row label="Ventas transferencia" value={formatMoney(paymentBreakdown.transfer)} />
          <Row label="Devoluciones efectivo" value={formatMoney(paymentBreakdown.cashRefunds)} />
          <Row label="ComisiÃ³n tarjeta" value={formatMoney(cash.total_card_fee)} />
          <Row label="Ganancia estimada" value={formatMoney(cash.total_profit)} />
          <Row label="Efectivo contado" value={formatMoney(cash.closing_amount || 0)} />
          <Row label="Descuadre" value={formatMoney(cash.difference)} />
          <Row label="Resultado" value={Math.abs(Number(cash.difference || 0)) < 0.01 ? 'Cuadrado' : Number(cash.difference || 0) > 0 ? 'Sobrante' : 'Faltante'} />
        </div>

        <Divider />

        <div className="text-center">
          <p className="font-bold">Firma / ValidaciÃ³n</p>
          <div className="mx-auto mt-8 w-48 border-t border-black" />
          <p className="mt-2">Cajero</p>
        </div>

        <Divider />

        <p className="text-center text-xs">
          Generado por CastelNova ERP
        </p>
      </section>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          body {
            background: white !important;
          }
        }
      `}</style>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span>{label}</span>
      <span className="font-bold text-right">{value}</span>
    </div>
  )
}

function Divider() {
  return <div className="my-3 border-t border-dashed border-black" />
}
