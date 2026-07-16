'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { logAudit } from '@/lib/audit'
import { ArrowLeft, FileBadge2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'

type FiscalReceipt = {
  id: string
  ncf: string
  receipt_type: string | null
  status: 'available' | 'used' | string
  used_sale_id: string | null
  used_company_name: string | null
  used_customer_rnc: string | null
  used_at: string | null
  valid_until: string | null
  created_at: string | null
}

const TABLE_NAME = 'ncf_receipts'
const RECEIPT_TYPES = [
  { value: 'B01', label: 'B01 - Credito fiscal' },
  { value: 'B02', label: 'B02 - Consumidor final' },
  { value: 'B14', label: 'B14 - Regimen especial' },
  { value: 'B15', label: 'B15 - Gubernamental' },
  { value: 'E31', label: 'E31 - e-CF credito fiscal' },
  { value: 'E32', label: 'E32 - e-CF consumo' },
  { value: 'E44', label: 'E44 - e-CF regimen especial' },
  { value: 'E45', label: 'E45 - e-CF gubernamental' },
]

export default function ComprobantesPage() {
  const [receipts, setReceipts] = useState<FiscalReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [singleNcf, setSingleNcf] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [receiptType, setReceiptType] = useState('B01')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [validUntil, setValidUntil] = useState('')
  const [rangePrefix, setRangePrefix] = useState('B01')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [activeReceiptType, setActiveReceiptType] = useState('')

  const loadReceipts = useCallback(async () => {
    setLoading(true)
    setError('')
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setReceipts([])
      setLoading(false)
      setError('Este usuario no tiene una tienda asignada.')
      return
    }

    const { data, error: loadError } = await supabase
      .from(TABLE_NAME)
      .select('id, ncf, receipt_type, status, used_sale_id, used_company_name, used_customer_rnc, used_at, valid_until, created_at')
      .eq('store_id', currentStoreId)
      .order('ncf', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      setReceipts([])
      setLoading(false)
      return
    }

    setReceipts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadReceipts)
  }, [loadReceipts])

  const availableCount = receipts.filter((item) => item.status !== 'used').length
  const usedCount = receipts.filter((item) => item.status === 'used').length

  const existingNcfs = useMemo(
    () => new Set(receipts.map((item) => item.ncf.trim().toUpperCase())),
    [receipts]
  )

  const registeredReceiptTypes = useMemo(() => {
    const types = Array.from(
      new Set(
        receipts
          .map((receipt) => receipt.receipt_type || detectReceiptType(receipt.ncf))
          .filter(Boolean)
      )
    )

    return types.sort((a, b) => a.localeCompare(b))
  }, [receipts])

  const visibleReceiptType = activeReceiptType || registeredReceiptTypes[0] || ''
  const visibleReceipts = receipts.filter((receipt) => {
    const type = receipt.receipt_type || detectReceiptType(receipt.ncf)
    return visibleReceiptType ? type === visibleReceiptType : true
  })

  useEffect(() => {
    if (!registeredReceiptTypes.length) {
      if (activeReceiptType) setActiveReceiptType('')
      return
    }

    if (!activeReceiptType || !registeredReceiptTypes.includes(activeReceiptType)) {
      setActiveReceiptType(registeredReceiptTypes[0])
    }
  }, [activeReceiptType, registeredReceiptTypes])

  async function addSingleNcf() {
    const ncf = normalizeNcf(singleNcf)
    if (!ncf) return alert('Escribe un NCF')

    await insertReceipts([ncf])
    setSingleNcf('')
  }

  async function addBulkNcfs() {
    const ncfs = bulkText
      .split(/\r?\n|,|;/)
      .map(normalizeNcf)
      .filter(Boolean)

    if (ncfs.length === 0) return alert('Pega al menos un NCF')

    await insertReceipts(ncfs)
    setBulkText('')
  }

  async function addRangeNcfs() {
    const prefix = rangePrefix.trim().toUpperCase()
    const start = Number(rangeStart)
    const end = Number(rangeEnd)

    if (!prefix) return alert('Escribe el prefijo')
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
      return alert('Rango invalido')
    }

    const width = Math.max(rangeStart.length, rangeEnd.length)
    const ncfs = Array.from({ length: end - start + 1 }, (_, index) => {
      return `${prefix}${String(start + index).padStart(width, '0')}`
    })

    await insertReceipts(ncfs)
    setRangeStart('')
    setRangeEnd('')
  }

  async function insertReceipts(ncfs: string[]) {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const unique = Array.from(new Set(ncfs.map(normalizeNcf).filter(Boolean))).filter(
      (ncf) => !existingNcfs.has(ncf)
    )

    if (unique.length === 0) {
      alert('Todos esos NCF ya estan registrados')
      return
    }

    setSaving(true)

    const { error: insertError } = await supabase.from(TABLE_NAME).insert(
      unique.map((ncf) => ({
        store_id: storeId,
        ncf,
        receipt_type: detectReceiptType(ncf) || receiptType,
        valid_until: validUntil || null,
        status: 'available',
        used_sale_id: null,
        used_company_name: null,
        used_customer_rnc: null,
        used_at: null,
      }))
    )

    setSaving(false)

    if (insertError) {
      alert('Error guardando NCF: ' + insertError.message)
      return
    }

    
    await logAudit({
      storeId,
      module: 'comprobantes',
      action: 'ncf.create',
      entityType: 'ncf_receipts',
      summary: 'Se agregaron ' + unique.length + ' NCF.',
      afterData: { ncfs: unique, validUntil },
    })

    await loadReceipts()
  }

  async function deleteReceipt(receipt: FiscalReceipt) {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const usedWarning = receipt.status === 'used'
      ? '\n\nEste NCF ya fue usado. Si lo eliminas, perderas el historial visible en esta tabla.'
      : ''

    const confirmed = window.confirm(`Seguro que quieres eliminar el NCF ${receipt.ncf}?${usedWarning}`)
    if (!confirmed) return

    setSaving(true)

    const { error: deleteError } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('store_id', storeId)
      .eq('id', receipt.id)

    setSaving(false)

    if (deleteError) {
      alert('Error eliminando NCF: ' + deleteError.message)
      return
    }

    
    await logAudit({
      storeId,
      module: 'comprobantes',
      action: 'ncf.delete',
      entityType: 'ncf_receipt',
      entityId: receipt.id,
      summary: 'NCF eliminado: ' + receipt.ncf + '.',
      beforeData: receipt,
    })

    await loadReceipts()
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
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
            NCF disponibles para ventas con comprobante fiscal.
          </p>
        </div>

        <button
          onClick={loadReceipts}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold hover:bg-zinc-100"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      {error && <SetupNotice error={error} />}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Disponibles" value={String(availableCount)} green />
        <StatCard title="Usados" value={String(usedCount)} />
        <StatCard title="Total registrados" value={String(receipts.length)} />
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-zinc-600">Tipo fiscal para nuevos NCF</label>
          <select
            value={receiptType}
            onChange={(event) => {
              setReceiptType(event.target.value)
              setRangePrefix(event.target.value)
            }}
            className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
          >
            {RECEIPT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-600">Valido hasta</label>
          <input
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
          />
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Agregar un NCF</h2>
          <div className="mt-4 flex gap-2">
            <input
              value={singleNcf}
              onChange={(event) => setSingleNcf(event.target.value.toUpperCase())}
              placeholder="Ej: B0100000001"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
            />
            <button
              onClick={addSingleNcf}
              disabled={saving || Boolean(error)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <Plus size={18} />
              Agregar
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Agregar por rango</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <input
              value={rangePrefix}
              onChange={(event) => setRangePrefix(event.target.value.toUpperCase())}
              placeholder="Prefijo"
              className="rounded-xl border border-zinc-300 px-3 py-3 outline-none focus:border-emerald-500"
            />
            <input
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value.replace(/\D/g, ''))}
              placeholder="Desde"
              className="rounded-xl border border-zinc-300 px-3 py-3 outline-none focus:border-emerald-500"
            />
            <input
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value.replace(/\D/g, ''))}
              placeholder="Hasta"
              className="rounded-xl border border-zinc-300 px-3 py-3 outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={addRangeNcfs}
            disabled={saving || Boolean(error)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Upload size={18} />
            Cargar rango
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Pegar listado</h2>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value.toUpperCase())}
            rows={4}
            placeholder={'Un NCF por linea\nB0100000001\nB0100000002'}
            className="mt-4 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
          />
          <button
            onClick={addBulkNcfs}
            disabled={saving || Boolean(error)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Upload size={18} />
            Cargar listado
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">NCF registrados</h2>
          <p className="text-sm text-zinc-500">
            Los usados quedan bloqueados para futuras facturas.
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando comprobantes...</p>
        ) : receipts.length === 0 ? (
          <p className="p-5 text-zinc-500">Todavia no hay NCF registrados.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-zinc-200 p-4">
              {registeredReceiptTypes.map((type) => {
                const count = receipts.filter((receipt) => (receipt.receipt_type || detectReceiptType(receipt.ncf)) === type).length
                const isActive = visibleReceiptType === type

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveReceiptType(type)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition ${isActive ? 'bg-emerald-600 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'}`}
                  >
                    {getReceiptTypeLabel(type)}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-sm text-zinc-500">
                  <tr className="border-b border-zinc-200">
                    <th className="p-4">NCF</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Empresa</th>
                    <th className="p-4">RNC</th>
                    <th className="p-4">Vence</th>
                    <th className="p-4">Fecha usado</th>
                    <th className="p-4">Factura</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleReceipts.map((receipt) => (
                    <tr key={receipt.id} className="border-b border-zinc-100">
                      <td className="p-4 font-black">{receipt.ncf}</td>
                      <td className="p-4">{getReceiptTypeLabel(receipt.receipt_type || detectReceiptType(receipt.ncf))}</td>
                      <td className="p-4">
                        {receipt.status === 'used' ? (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-600">
                            Usado
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="p-4">{receipt.used_company_name || '-'}</td>
                      <td className="p-4">{receipt.used_customer_rnc || '-'}</td>
                      <td className="p-4">{receipt.valid_until || '-'}</td>
                      <td className="p-4">
                        {receipt.used_at ? formatDateTime(receipt.used_at) : '-'}
                      </td>
                      <td className="p-4">
                        {receipt.used_sale_id ? (
                          <Link
                            href={`/ventas/${receipt.used_sale_id}/imprimir`}
                            target="_blank"
                            className="font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            Ver factura
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => deleteReceipt(receipt)}
                          disabled={saving}
                          className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-50"
                          title="Eliminar NCF"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}      </section>
    </AppShell>
  )
}

function SetupNotice({ error }: { error: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
      <h2 className="text-lg font-bold">Falta preparar la tabla de comprobantes</h2>
      <p className="mt-1 text-sm">
        No pude cargar la tabla <strong>{TABLE_NAME}</strong>. Cuando preparemos la
        parte fiscal completa de DGI, esta tabla debe guardar los NCF disponibles y
        los usados.
      </p>
      <p className="mt-3 text-sm font-semibold">Detalle tecnico: {error}</p>
    </div>
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
      <h3 className={`mt-2 text-3xl font-bold ${green ? 'text-emerald-600' : 'text-zinc-950'}`}>
        {value}
      </h3>
    </div>
  )
}

function normalizeNcf(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function detectReceiptType(ncf: string) {
  const normalized = normalizeNcf(ncf)
  return RECEIPT_TYPES.find((type) => normalized.startsWith(type.value))?.value || ''
}

function getReceiptTypeLabel(type: string | null | undefined) {
  if (!type) return '-'
  return RECEIPT_TYPES.find((item) => item.value === type)?.label || type
}







