'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'

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
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCash()
  }, [])

  async function loadCash() {
    setLoading(true)
    try {
      const response = await fetch('/api/cash-registers?status=open')
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'No se pudo cargar la caja.'
        alert(message)
        return
      }
      setOpenCash(Array.isArray(payload) ? (payload[0] as CashRegister | undefined) || null : null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo cargar la caja.')
    } finally {
      setLoading(false)
    }
  }

  async function openRegister() {
    const response = await fetch('/api/cash-registers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingAmount: Number(openingAmount || 0) }),
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'No se pudo abrir la caja.'
      return alert(message)
    }

    setOpeningAmount('')
    window.dispatchEvent(new Event('shopdesk:cash-updated'))
    loadCash()
  }

  async function closeRegister() {
    if (!openCash) return
    const counted = Number(closingAmount || 0)
    const response = await fetch(`/api/cash-registers/${encodeURIComponent(openCash.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingAmount: counted }),
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'No se pudo cerrar la caja.'
      return alert(message)
    }

    alert('Caja cerrada correctamente')
    setClosingAmount('')
    window.dispatchEvent(new Event('shopdesk:cash-updated'))
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
