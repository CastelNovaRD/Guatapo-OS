'use client'

import Link from 'next/link'
import { useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDate, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { ArrowLeft, FileBadge2, Minus, Plus, Printer, Search } from 'lucide-react'

type Sale = {
  id: string
  invoice_number: string | null
  subtotal: number
  itbis: number
  total: number
  ncf: string | null
  created_at: string
  customer_id: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
}

type SaleItem = {
  id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

const RETURN_REASONS = [
  'Producto defectuoso',
  'Producto dañado',
  'No era compatible',
  'No era lo que el cliente necesitaba',
  'Error en la venta',
  'Cambio por otro producto',
  'Otro',
]

export default function CreditNotesPage() {
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [items, setItems] = useState<SaleItem[]>([])
  const [restockQuantities, setRestockQuantities] = useState<Record<string, number>>({})
  const [damagedQuantities, setDamagedQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [reasonOther, setReasonOther] = useState('')
  const [notes, setNotes] = useState('')
  const [refundMethod, setRefundMethod] = useState('Credito a favor')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createdCreditNoteId, setCreatedCreditNoteId] = useState<string | null>(null)

  async function searchInvoice() {
    const query = invoiceSearch.trim()
    if (!query) return alert('Escribe el numero de factura')

    const storeId = await getCurrentStoreId()
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setLoading(true)
    setSale(null)
    setItems([])
    setRestockQuantities({})
    setDamagedQuantities({})
    setCreatedCreditNoteId(null)

    const byInvoice = await supabase
      .from('sales')
      .select('id, invoice_number, subtotal, itbis, total, ncf, created_at, customer_id, fiscal_customer_name, fiscal_customer_rnc')
      .eq('store_id', storeId)
      .eq('invoice_number', query)
      .maybeSingle()

    let saleData = byInvoice.data as Sale | null
    let saleError = byInvoice.error

    if (!saleData && isUuid(query)) {
      const byId = await supabase
        .from('sales')
        .select('id, invoice_number, subtotal, itbis, total, ncf, created_at, customer_id, fiscal_customer_name, fiscal_customer_rnc')
        .eq('store_id', storeId)
        .eq('id', query)
        .maybeSingle()

      saleData = byId.data as Sale | null
      saleError = byId.error
    }

    if (saleError) {
      setLoading(false)
      return alert('Error buscando factura: ' + saleError.message)
    }

    if (!saleData) {
      setLoading(false)
      return alert('No encontre esa factura')
    }

    const { data, error } = await supabase
      .from('sale_items')
      .select('id, product_id, product_name, quantity, unit_price, discount, total')
      .eq('store_id', storeId)
      .eq('sale_id', saleData.id)

    setLoading(false)
    if (error) return alert('Error cargando productos: ' + error.message)

    setSale(saleData)
    setItems(data || [])
  }

  function changeQuantity(item: SaleItem, target: 'restock' | 'damaged', amount: number) {
    const currentRestock = restockQuantities[item.id] || 0
    const currentDamaged = damagedQuantities[item.id] || 0
    const nextValue = Math.max(0, (target === 'restock' ? currentRestock : currentDamaged) + amount)
    const otherValue = target === 'restock' ? currentDamaged : currentRestock
    const allowedValue = Math.min(nextValue, Math.max(0, item.quantity - otherValue))

    if (target === 'restock') {
      setRestockQuantities((current) => ({ ...current, [item.id]: allowedValue }))
    } else {
      setDamagedQuantities((current) => ({ ...current, [item.id]: allowedValue }))
    }
  }

  const selectedItems = items.filter((item) => selectedQuantity(item) > 0)
  const creditSubtotal = selectedItems.reduce((sum, item) => sum + itemUnitNet(item) * selectedQuantity(item), 0)
  const taxPercent =
    Number(sale?.subtotal || 0) > 0
      ? (Number(sale?.itbis || 0) / Number(sale?.subtotal || 0)) * 100
      : 0
  const taxAmount = creditSubtotal * (taxPercent / 100)
  const creditTotal = creditSubtotal + taxAmount

  async function createCreditNote() {
    if (!sale) return
    if (selectedItems.length === 0) return alert('Selecciona los productos a devolver')
    if (!reason) return alert('Selecciona el motivo de la devolución')
    if (reason === 'Otro' && !reasonOther.trim()) return alert('Explica el motivo de la devolución')

    const storeId = await getCurrentStoreId()
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const payloadItems = selectedItems.map((item) => {
      const quantity = selectedQuantity(item)
      const lineSubtotal = itemUnitNet(item) * quantity
      const lineTax = lineSubtotal * (taxPercent / 100)

      return {
        sale_item_id: item.id,
        quantity,
        restock_quantity: restockQuantities[item.id] || 0,
        damaged_quantity: damagedQuantities[item.id] || 0,
        unit_price: itemUnitNet(item),
        tax_amount: lineTax,
        total: lineSubtotal + lineTax,
      }
    })

    setSaving(true)

    const { data, error } = await supabase.rpc('process_credit_note', {
      p_store_id: storeId,
      p_sale_id: sale.id,
      p_refund_method: refundMethod,
      p_reason: reason,
      p_reason_other: reasonOther || null,
      p_notes: notes || null,
      p_items: payloadItems,
    })

    setSaving(false)

    if (error) return alert('No pude crear la nota de crédito: ' + error.message)

    setCreatedCreditNoteId(data as string)
    alert('Nota de crédito creada correctamente')
  }

  function selectedQuantity(item: SaleItem) {
    return (restockQuantities[item.id] || 0) + (damagedQuantities[item.id] || 0)
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/ventas" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            <ArrowLeft size={16} />
            Volver a ventas
          </Link>

          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <FileBadge2 className="text-emerald-500" />
            Nota de crédito
          </h1>
          <p className="text-zinc-500">Busca una factura y selecciona el destino de cada producto devuelto.</p>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold text-zinc-600">Número de factura</label>
        <div className="mt-2 flex gap-3">
          <input
            value={invoiceSearch}
            onChange={(event) => setInvoiceSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') searchInvoice()
            }}
            placeholder="Ej: FAC-000001"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
          />
          <button
            onClick={searchInvoice}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600"
          >
            <Search size={18} />
            Buscar
          </button>
        </div>
      </section>

      {loading && <p className="text-zinc-500">Cargando factura...</p>}

      {sale && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">Factura original</p>
              <h2 className="text-2xl font-black">{sale.invoice_number || sale.id}</h2>
              <p className="text-zinc-500">{formatDate(sale.created_at)} {sale.ncf ? `| NCF: ${sale.ncf}` : ''}</p>
              <p className="mt-2 font-semibold">{sale.fiscal_customer_name || 'Consumidor final'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500">Total acreditado</p>
              <p className="text-3xl font-black text-emerald-600">{formatMoney(creditTotal)}</p>
            </div>
          </div>

          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-semibold text-zinc-600">Motivo</span>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
              >
                <option value="">Seleccionar motivo</option>
                {RETURN_REASONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold text-zinc-600">Método para devolver o aplicar</span>
              <select
                value={refundMethod}
                onChange={(event) => setRefundMethod(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
              >
                <option>Credito a favor</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Tarjeta</option>
              </select>
            </label>

            {reason === 'Otro' && (
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-zinc-600">Explicación</span>
                <input
                  value={reasonOther}
                  onChange={(event) => setReasonOther(event.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                  placeholder="Explica el motivo"
                />
              </label>
            )}

            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-zinc-600">Observaciones</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-24 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="Observación adicional opcional"
              />
            </label>
          </div>

          <div className="divide-y divide-zinc-200">
            {items.map((item) => {
              const restock = restockQuantities[item.id] || 0
              const damaged = damagedQuantities[item.id] || 0

              return (
                <div key={item.id} className="grid gap-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <h3 className="font-bold">{item.product_name}</h3>
                    <p className="text-sm text-zinc-500">
                      Vendidos: {item.quantity} | Unidad: {formatMoney(itemUnitNet(item))}
                    </p>
                  </div>

                  <QuantityControl
                    label="Devuelve al inventario"
                    value={restock}
                    onMinus={() => changeQuantity(item, 'restock', -1)}
                    onPlus={() => changeQuantity(item, 'restock', 1)}
                  />

                  <QuantityControl
                    label="Producto dañado"
                    value={damaged}
                    onMinus={() => changeQuantity(item, 'damaged', -1)}
                    onPlus={() => changeQuantity(item, 'damaged', 1)}
                    danger
                  />
                </div>
              )
            })}
          </div>

          <div className="mt-6 rounded-2xl bg-zinc-50 p-5">
            <MoneyRow label="Subtotal" value={creditSubtotal} />
            <MoneyRow label={`ITBIS (${taxPercent}%)`} value={taxAmount} />
            <MoneyRow label="Total acreditado" value={creditTotal} bold />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {createdCreditNoteId && (
              <button
                onClick={() => window.open(`/ventas/notas-credito/${createdCreditNoteId}/imprimir`, '_blank')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-bold hover:bg-zinc-100"
              >
                <Printer size={18} />
                Imprimir nota de crédito
              </button>
            )}
            <button
              onClick={createCreditNote}
              disabled={saving || selectedItems.length === 0 || Boolean(createdCreditNoteId)}
              className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : createdCreditNoteId ? 'Nota creada' : 'Crear nota de crédito'}
            </button>
          </div>
        </section>
      )}
    </AppShell>
  )
}

function itemUnitNet(item: SaleItem) {
  const discountPerUnit = Number(item.discount || 0) / Math.max(1, Number(item.quantity || 1))
  return Math.max(0, Number(item.unit_price || 0) - discountPerUnit)
}

function QuantityControl({
  label,
  value,
  onMinus,
  onPlus,
  danger = false,
}: {
  label: string
  value: number
  onMinus: () => void
  onPlus: () => void
  danger?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3 ${danger ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <p className={`mb-2 text-sm font-bold ${danger ? 'text-red-700' : 'text-emerald-700'}`}>{label}</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={onMinus} className="rounded-lg border bg-white p-2 hover:bg-zinc-100">
          <Minus size={16} />
        </button>
        <span className="w-8 text-center text-lg font-black">{value}</span>
        <button onClick={onPlus} className="rounded-lg border bg-white p-2 hover:bg-zinc-100">
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

function MoneyRow({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-zinc-600">{label}</span>
      <span className={bold ? 'text-xl font-black text-zinc-950' : 'font-bold'}>{formatMoney(value)}</span>
    </div>
  )
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
