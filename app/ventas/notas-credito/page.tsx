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
  total: number
  ncf: string | null
  created_at: string
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

export default function CreditNotesPage() {
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [sale, setSale] = useState<Sale | null>(null)
  const [items, setItems] = useState<SaleItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)

  async function searchInvoice() {
    const query = invoiceSearch.trim()
    if (!query) return alert('Escribe el numero de factura')

    const storeId = await getCurrentStoreId()
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setLoading(true)
    setSale(null)
    setItems([])
    setQuantities({})
    setCreated(false)

    const byInvoice = await supabase
      .from('sales')
      .select('id, invoice_number, total, ncf, created_at')
      .eq('store_id', storeId)
      .eq('invoice_number', query)
      .maybeSingle()

    let saleData = byInvoice.data as Sale | null
    let saleError = byInvoice.error

    if (!saleData && isUuid(query)) {
      const byId = await supabase
        .from('sales')
        .select('id, invoice_number, total, ncf, created_at')
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

  function changeQuantity(item: SaleItem, amount: number) {
    setQuantities((current) => ({
      ...current,
      [item.id]: Math.max(0, Math.min(item.quantity, (current[item.id] || 0) + amount)),
    }))
  }

  const selectedItems = items.filter((item) => (quantities[item.id] || 0) > 0)
  const creditTotal = selectedItems.reduce((sum, item) => sum + itemUnitNet(item) * (quantities[item.id] || 0), 0)

  async function createCreditNote() {
    if (!sale) return
    if (selectedItems.length === 0) return alert('Selecciona los productos a devolver')

    const storeId = await getCurrentStoreId()
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setSaving(true)

    for (const item of selectedItems) {
      const qty = quantities[item.id] || 0
      if (!item.product_id) continue

      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock')
        .eq('store_id', storeId)
        .eq('id', item.product_id)
        .maybeSingle()

      if (productError) return finishWithError(productError.message)

      const previousStock = Number(product?.stock || 0)
      const nextStock = previousStock + qty

      const { error: stockError } = await supabase
        .from('products')
        .update({ stock: nextStock })
        .eq('store_id', storeId)
        .eq('id', item.product_id)

      if (stockError) return finishWithError(stockError.message)

      const { error: movementError } = await supabase.from('inventory_movements').insert({
        store_id: storeId,
        product_id: item.product_id,
        movement_type: 'adjustment',
        quantity: qty,
        previous_stock: previousStock,
        new_stock: nextStock,
        reference_type: 'credit_note',
        notes: `Nota de credito factura ${sale.invoice_number || sale.id}`,
      })

      if (movementError) return finishWithError(movementError.message)
    }

    await supabase
      .from('sales')
      .update({ notes: `Nota de credito generada por ${formatMoney(creditTotal)} el ${new Date().toLocaleString('es-DO')}` })
      .eq('store_id', storeId)
      .eq('id', sale.id)

    setSaving(false)
    setCreated(true)
    alert('Nota de credito creada y stock devuelto correctamente')
  }

  function finishWithError(message: string) {
    setSaving(false)
    alert('No pude crear la nota de credito: ' + message)
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
            Nota de credito
          </h1>
          <p className="text-zinc-500">Busca una factura y selecciona los productos que se devolveran.</p>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold text-zinc-600">Numero de factura</label>
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
              <p className="text-sm text-zinc-500">Factura</p>
              <h2 className="text-2xl font-black">{sale.invoice_number || sale.id}</h2>
              <p className="text-zinc-500">{formatDate(sale.created_at)} {sale.ncf ? `| NCF: ${sale.ncf}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500">Total credito</p>
              <p className="text-3xl font-black text-emerald-600">{formatMoney(creditTotal)}</p>
            </div>
          </div>

          <div className="divide-y divide-zinc-200">
            {items.map((item) => {
              const qty = quantities[item.id] || 0
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div>
                    <h3 className="font-bold">{item.product_name}</h3>
                    <p className="text-sm text-zinc-500">
                      Vendidos: {item.quantity} | Unidad: {formatMoney(itemUnitNet(item))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => changeQuantity(item, -1)} className="rounded-lg border p-2 hover:bg-zinc-100">
                      <Minus size={16} />
                    </button>
                    <span className="w-8 text-center text-lg font-black">{qty}</span>
                    <button onClick={() => changeQuantity(item, 1)} className="rounded-lg border p-2 hover:bg-zinc-100">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {created && (
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-bold hover:bg-zinc-100"
              >
                <Printer size={18} />
                Imprimir nota
              </button>
            )}
            <button
              onClick={createCreditNote}
              disabled={saving || selectedItems.length === 0 || created}
              className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : created ? 'Nota creada' : 'Crear nota de credito'}
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
