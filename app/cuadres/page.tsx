'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { CalendarDays, Printer } from 'lucide-react'
import { formatDate, formatTime, formatMoney } from '@/lib/format'

type CashRegister = {
  id: string
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  opened_by_name: string | null
  closed_by_name: string | null
  totalSales?: number
  cashSales?: number
  cardSales?: number
  transferSales?: number
  expectedCash?: number
  difference?: number | null
  status: string
}

export default function CuadresPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)

  async function loadRegisters() {
    setLoading(true)
    try {
      const response = await fetch('/api/cash-registers')
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'No se pudieron cargar los cuadres.'
        alert('Error cargando cuadres: ' + message)
        return
      }
      const list = Array.isArray(payload) ? payload as CashRegister[] : []
      const hydrated = await Promise.all(
        list.map(async (register) => {
          const summaryResponse = await fetch(
            `/api/cash-registers/${encodeURIComponent(register.id)}/history-summary`,
            { cache: 'no-store' }
          )
          if (!summaryResponse.ok) return register
          const summary = await summaryResponse.json().catch(() => null)
          return summary && typeof summary === 'object' ? { ...register, ...summary } : register
        })
      )
      setRegisters(hydrated)
    } catch (error) {
      alert('Error cargando cuadres: ' + (error instanceof Error ? error.message : 'Error desconocido'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadRegisters)
  }, [])

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <CalendarDays className="text-[#a90404]" />
          Cuadres de caja
        </h1>
        <p className="text-zinc-500">
          Historial de aperturas, cierres, ventas, ganancias y descuadres.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Registro de cuadres</h2>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando cuadres...</p>
        ) : registers.length === 0 ? (
          <p className="p-5 text-zinc-500">TodavÃ­a no hay cuadres registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Cajero</th>
                  <th className="p-4">Efectivo inicial</th>
                  <th className="p-4">Efectivo</th>
                  <th className="p-4">Tarjeta</th>
                  <th className="p-4">Transferencia</th>
                  <th className="p-4">Total vendido</th>
                  <th className="p-4">Efectivo esperado</th>
                  <th className="p-4">Efectivo contado</th>
                  <th className="p-4">Descuadre</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">AcciÃ³n</th>
                </tr>
              </thead>

              <tbody>
                {registers.map((register) => (
                  <tr key={register.id} className="border-b border-zinc-100">
                    <td className="p-4">
                      <p className="font-medium">
                        {formatDate(register.opened_at)}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {formatTime(register.opened_at)}
                      </p>
                    </td>

                    <td className="p-4">
                      <p>{register.opened_by_name || '-'}</p>
                      {register.closed_by_name ? <p className="text-sm text-zinc-500">Cierre: {register.closed_by_name}</p> : null}
                    </td>

                    <td className="p-4">{formatMoney(register.opening_amount)}</td>
                    <td className="p-4">{formatOptionalMoney(register.cashSales)}</td>
                    <td className="p-4">{formatOptionalMoney(register.cardSales)}</td>
                    <td className="p-4">{formatOptionalMoney(register.transferSales)}</td>
                    <td className="p-4 font-semibold">{formatOptionalMoney(register.totalSales)}</td>
                    <td className="p-4 font-semibold text-emerald-600">{formatOptionalMoney(register.expectedCash)}</td>

                    <td className="p-4">
                      {register.closing_amount !== null
                        ? formatMoney(register.closing_amount)
                        : '-'}
                    </td>

                    <td className="p-4">
                      <span
                        className={
                          Number(register.difference ?? 0) < 0
                            ? 'font-semibold text-red-500'
                            : Number(register.difference ?? 0) > 0
                              ? 'font-semibold text-orange-500'
                              : 'font-semibold text-emerald-600'
                        }
                      >
                        {formatOptionalMoney(register.difference)}
                      </span>
                    </td>

                    <td className="p-4">
                      {register.status === 'open' ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                          Abierta
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-bold text-zinc-600">
                          Cerrada
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => window.open(`/cuadres/${register.id}/imprimir`, '_blank')}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-100"
                      >
                        <Printer size={16} />
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function formatOptionalMoney(value: number | null | undefined) {
  return value === undefined || value === null ? '-' : formatMoney(value)
}

