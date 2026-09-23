'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatDate, formatTime, formatMoney } from '@/lib/format'

type CashRegister = {
  id: string
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  status: string
  opened_by_name: string | null
  closed_by_name: string | null
}

type CashRegisterSummary = {
  totalSales: number
  cashSales: number
  cardSales: number
  transferSales: number
  creditNotePayments: number
  cashRefunds: number
  cashWithdrawals: number
  expectedCash: number
  totalCardFee: number
  totalProfit: number
  difference: number | null
}

export default function CashRegisterPrint() {
  const params = useParams()
  const cashId = params.id as string

  const [cash, setCash] = useState<CashRegister | null>(null)
  const [summary, setSummary] = useState<CashRegisterSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCash = useCallback(async () => {
    setLoading(true)
    try {
      const [cashResponse, summaryResponse] = await Promise.all([
        fetch(`/api/cash-registers/${encodeURIComponent(cashId)}`, { cache: 'no-store' }),
        fetch(`/api/cash-registers/${encodeURIComponent(cashId)}/history-summary`, { cache: 'no-store' }),
      ])
      const [cashPayload, summaryPayload] = await Promise.all([
        cashResponse.json().catch(() => null),
        summaryResponse.json().catch(() => null),
      ])
      if (!cashResponse.ok || !cashPayload || !summaryResponse.ok || !summaryPayload) {
        throw new Error('No se pudo cargar el cuadre.')
      }
      setCash(cashPayload as CashRegister)
      setSummary(summaryPayload as CashRegisterSummary)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo cargar el cuadre.')
    } finally {
      setLoading(false)
    }
  }, [cashId])

  useEffect(() => {
    void Promise.resolve().then(loadCash)
  }, [loadCash])

  if (loading) {
    return <main className="p-6">Cargando cuadre...</main>
  }

  if (!cash) {
    return <main className="p-6">No se encontró el cuadre.</main>
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
          <h1 className="text-2xl font-black">ShopDesk OS</h1>
          <p>Cuadre de caja</p>
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
          <Row label="Cajero apertura" value={cash.opened_by_name || '-'} />
          <Row label="Cajero cierre" value={cash.closed_by_name || '-'} />
          <Row label="Efectivo inicial" value={formatMoney(cash.opening_amount)} />
          <Row label="Ventas en efectivo" value={formatMoney(summary?.cashSales || 0)} />
          <Row label="Ventas con tarjeta" value={formatMoney(summary?.cardSales || 0)} />
          <Row label="Ventas por transferencia" value={formatMoney(summary?.transferSales || 0)} />
          <Row label="Notas de crédito" value={formatMoney(summary?.creditNotePayments || 0)} />
          <Row label="Retiros de caja" value={formatMoney(summary?.cashWithdrawals || 0)} />
          <Row label="Comisión tarjeta" value={formatMoney(summary?.totalCardFee || 0)} />
          <Row label="Ganancia estimada" value={formatMoney(summary?.totalProfit || 0)} />
          <Row label="Efectivo contado" value={formatMoney(cash.closing_amount || 0)} />
          <Row label="Efectivo esperado" value={formatMoney(summary?.expectedCash || 0)} />
          <Row label="Descuadre" value={summary?.difference === null || summary?.difference === undefined ? '-' : formatMoney(summary.difference)} />
        </div>

        <Divider />

        <div className="flex items-center justify-between gap-3 py-2">
          <span className="text-xl font-black">Total</span>
          <span className="text-2xl font-black">
            {formatMoney(
              summary?.totalSales || 0
            )}
          </span>
        </div>

        <Divider />

        <div className="text-center">
          <p className="font-bold">Firma / Validación</p>
          <div className="mx-auto mt-8 w-48 border-t border-black" />
          <p className="mt-2">Cajero</p>
        </div>

        <Divider />

        <p className="text-center text-xs">
          Generado por CastelNova OS
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
