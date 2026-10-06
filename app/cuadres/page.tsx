'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { CalendarDays, Printer } from 'lucide-react'
import { formatDate, formatTime, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'

type CashRegister = {
  id: string
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

export default function CuadresPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRegisters()
  }, [])

  async function loadRegisters() {
    setLoading(true)
    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('store_id', storeId)
      .order('opened_at', { ascending: false })

    if (error) {
      alert('Error cargando cuadres: ' + error.message)
    }

    setRegisters(data || [])
    setLoading(false)
  }

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <CalendarDays className="text-emerald-500" />
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
          <p className="p-5 text-zinc-500">Todavía no hay cuadres registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Apertura</th>
                  <th className="p-4">Cierre</th>
                  <th className="p-4">Efectivo esperado</th>
                  <th className="p-4">Ganancia</th>
                  <th className="p-4">Comisión tarjeta</th>
                  <th className="p-4">Descuadre</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acción</th>
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
                      {formatMoney(register.opening_amount)}
                    </td>

                    <td className="p-4">
                      {register.closing_amount !== null
                        ? formatMoney(register.closing_amount)
                        : '-'}
                    </td>

                    <td className="p-4 font-semibold text-emerald-600">
                      {formatMoney(register.total_sales)}
                    </td>

                    <td className="p-4">
                      {formatMoney(register.total_profit)}
                    </td>

                    <td className="p-4 text-red-500">
                      {formatMoney(register.total_card_fee)}
                    </td>

                    <td className="p-4">
                      <span
                        className={
                          Number(register.difference || 0) < 0
                            ? 'font-semibold text-red-500'
                            : Number(register.difference || 0) > 0
                              ? 'font-semibold text-orange-500'
                              : 'font-semibold text-emerald-600'
                        }
                      >
                        {formatMoney(register.difference)}
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
