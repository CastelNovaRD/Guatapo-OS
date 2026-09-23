'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import {
  ArrowLeft,
  FileBadge2,
  Plus,
  RefreshCw,
  Trash2,
  Power,
  PowerOff,
} from 'lucide-react'

type NcfRange = {
  id: string
  organization_id: string
  installation_id: string
  store_id: string
  receipt_type: string
  prefix: string
  range_start: string | number
  range_end: string | number
  next_number: string | number
  expires_at: string | null
  active: boolean
}

const RECEIPT_TYPES = [
  { value: 'B01', label: 'B01 - Crédito fiscal' },
  { value: 'B02', label: 'B02 - Consumidor final' },
  { value: 'B14', label: 'B14 - Régimen especial' },
  { value: 'B15', label: 'B15 - Gubernamental' },
  { value: 'E31', label: 'E31 - e-CF crédito fiscal' },
  { value: 'E32', label: 'E32 - e-CF consumo' },
  { value: 'E44', label: 'E44 - e-CF régimen especial' },
  { value: 'E45', label: 'E45 - e-CF gubernamental' },
]

export default function ComprobantesPage() {
  const [ranges, setRanges] = useState<NcfRange[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [receiptType, setReceiptType] = useState('B01')
  const [prefix, setPrefix] = useState('B01')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const loadRanges = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/ncf/ranges', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudieron cargar los comprobantes.'
        )
      }

      setRanges(Array.isArray(data) ? data : [])
    } catch (loadError) {
      setRanges([])
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar los comprobantes.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRanges()
  }, [loadRanges])

  const totalAvailable = useMemo(
    () =>
      ranges.reduce((total, range) => {
        if (!range.active) return total

        const next = Number(range.next_number)
        const end = Number(range.range_end)

        if (!Number.isFinite(next) || !Number.isFinite(end)) return total

        return total + Math.max(0, end - next + 1)
      }, 0),
    [ranges]
  )

  const activeRanges = ranges.filter((range) => range.active).length
  const exhaustedRanges = ranges.filter(
    (range) => Number(range.next_number) > Number(range.range_end)
  ).length

  async function createRange() {
    const start = Number(rangeStart)
    const end = Number(rangeEnd)

    if (!prefix.trim()) {
      return alert('Escribe el prefijo del comprobante.')
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      return alert('El rango de comprobantes no es válido.')
    }

    setSaving(true)

    try {
      const response = await fetch('/api/ncf/ranges', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receipt_type: receiptType,
          prefix: prefix.trim().toUpperCase(),
          range_start: start,
          range_end: end,
          next_number: start,
          expires_at: expiresAt || null,
          active: true,
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudo guardar el rango.'
        )
      }

      setRangeStart('')
      setRangeEnd('')
      setExpiresAt('')

      await loadRanges()
    } catch (saveError) {
      alert(
        'Error guardando rango: ' +
          (saveError instanceof Error
            ? saveError.message
            : 'Error desconocido')
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleRange(range: NcfRange) {
    setSaving(true)

    try {
      const response = await fetch(
        `/api/ncf/ranges/${encodeURIComponent(range.id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            active: !range.active,
          }),
        }
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudo cambiar el estado del rango.'
        )
      }

      await loadRanges()
    } catch (toggleError) {
      alert(
        'Error cambiando estado: ' +
          (toggleError instanceof Error
            ? toggleError.message
            : 'Error desconocido')
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteRange(range: NcfRange) {
    const used =
      Number(range.next_number) > Number(range.range_start)

    if (used) {
      alert(
        'Este rango ya utilizó comprobantes. Desactívalo para conservar el historial.'
      )
      return
    }

    if (
      !window.confirm(
        `¿Eliminar el rango ${range.prefix}${range.range_start} - ${range.prefix}${range.range_end}?`
      )
    ) {
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/ncf/ranges/${encodeURIComponent(range.id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudo eliminar el rango.'
        )
      }

      await loadRanges()
    } catch (deleteError) {
      alert(
        'Error eliminando rango: ' +
          (deleteError instanceof Error
            ? deleteError.message
            : 'Error desconocido')
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/ventas"
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft size={16} />
            Volver a ventas
          </Link>

          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <FileBadge2 className="text-emerald-500" />
            Comprobantes
          </h1>

          <p className="text-zinc-500">
            Administración de secuencias y rangos de comprobantes fiscales.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRanges()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold hover:bg-zinc-100 disabled:opacity-50"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p className="font-bold">No se pudieron cargar los comprobantes.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          title="Rangos registrados"
          value={String(ranges.length)}
        />
        <StatCard
          title="Rangos activos"
          value={String(activeRanges)}
          green
        />
        <StatCard
          title="NCF disponibles"
          value={String(totalAvailable)}
          green
        />
        <StatCard
          title="Rangos agotados"
          value={String(exhaustedRanges)}
        />
      </div>

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold">
            Registrar rango de comprobantes
          </h2>
          <p className="text-sm text-zinc-500">
            Registra la secuencia autorizada para que ShopDesk consuma los NCF automáticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="text-sm font-bold text-zinc-600">
              TIPO
            </span>
            <select
              value={receiptType}
              onChange={(event) => {
                setReceiptType(event.target.value)
                setPrefix(event.target.value)
              }}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
            >
              {RECEIPT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="PREFIJO"
            value={prefix}
            onChange={(value) =>
              setPrefix(value.toUpperCase().replace(/\s+/g, ''))
            }
            placeholder="Ej: B01"
          />

          <Input
            label="DESDE"
            value={rangeStart}
            onChange={(value) =>
              setRangeStart(value.replace(/\D/g, ''))
            }
            placeholder="Ej: 1"
          />

          <Input
            label="HASTA"
            value={rangeEnd}
            onChange={(value) =>
              setRangeEnd(value.replace(/\D/g, ''))
            }
            placeholder="Ej: 500"
          />

          <label className="block">
            <span className="text-sm font-bold text-zinc-600">
              VÁLIDO HASTA
            </span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void createRange()}
          disabled={saving}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus size={18} />
          {saving ? 'Guardando...' : 'Registrar rango'}
        </button>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">
            Rangos registrados
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            El próximo número avanza automáticamente cuando se utiliza un comprobante.
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">
            Cargando comprobantes...
          </p>
        ) : ranges.length === 0 ? (
          <p className="p-5 text-zinc-500">
            Todavía no hay rangos de comprobantes registrados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Prefijo</th>
                  <th className="p-4">Desde</th>
                  <th className="p-4">Hasta</th>
                  <th className="p-4">Próximo</th>
                  <th className="p-4">Disponibles</th>
                  <th className="p-4">Vence</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {ranges.map((range) => {
                  const start = Number(range.range_start)
                  const end = Number(range.range_end)
                  const next = Number(range.next_number)
                  const available = Math.max(0, end - next + 1)
                  const exhausted = next > end
                  const used = next > start

                  return (
                    <tr
                      key={range.id}
                      className="border-b border-zinc-100"
                    >
                      <td className="p-4 font-bold">
                        {getReceiptTypeLabel(range.receipt_type)}
                      </td>

                      <td className="p-4 font-black">
                        {range.prefix}
                      </td>

                      <td className="p-4">{start}</td>
                      <td className="p-4">{end}</td>

                      <td className="p-4">
                        {exhausted ? 'Agotado' : `${range.prefix}${next}`}
                      </td>

                      <td className="p-4 font-bold">
                        {available}
                      </td>

                      <td className="p-4">
                        {range.expires_at || '-'}
                      </td>

                      <td className="p-4">
                        {exhausted ? (
                          <StatusBadge label="Agotado" tone="red" />
                        ) : range.active ? (
                          <StatusBadge label="Activo" tone="green" />
                        ) : (
                          <StatusBadge label="Inactivo" />
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleRange(range)}
                            disabled={saving}
                            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 hover:bg-zinc-50 disabled:opacity-50"
                            title={range.active ? 'Desactivar' : 'Activar'}
                          >
                            {range.active ? (
                              <PowerOff size={18} />
                            ) : (
                              <Power size={18} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteRange(range)}
                            disabled={saving || used}
                            className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              used
                                ? 'Los rangos que ya utilizaron NCF no pueden eliminarse'
                                : 'Eliminar rango'
                            }
                          >
                            <Trash2 size={18} />
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
      </section>
    </AppShell>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-zinc-600">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
      />
    </label>
  )
}

function StatCard({
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
      <h3
        className={`mt-2 text-3xl font-bold ${
          green ? 'text-emerald-600' : 'text-zinc-950'
        }`}
      >
        {value}
      </h3>
    </div>
  )
}

function StatusBadge({
  label,
  tone = 'gray',
}: {
  label: string
  tone?: 'gray' | 'green' | 'red'
}) {
  const classes =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'red'
        ? 'bg-red-50 text-red-600'
        : 'bg-zinc-100 text-zinc-600'

  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-bold ${classes}`}
    >
      {label}
    </span>
  )
}

function getReceiptTypeLabel(type: string) {
  return (
    RECEIPT_TYPES.find((item) => item.value === type)?.label ||
    type
  )
}