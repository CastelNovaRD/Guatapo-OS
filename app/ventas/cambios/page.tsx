'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatMoney, formatDate, formatTime } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import {
  ArrowLeft,
  Minus,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

type Sale = {
  id: string
  invoice_number: string | null
  subtotal: number
  discount: number
  itbis: number
  total: number
  card_fee: number
  net_received: number
  cash_received: number
  cash_change: number
  payment_method_id: string | null
  ncf: string | null
  fiscal_status: string | null
  created_at: string
}

type SaleItem = {
  id: string
  sale_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  cost: number
  discount: number
  total: number
  imei: string | null
}

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  sale_price: number
  cost: number
  stock: number
  product_type: string
}

type PaymentMethod = {
  id: string
  name: string
  fee_percent: number
}

const FALLBACK_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'virtual:cash', name: 'Efectivo', fee_percent: 0 },
  { id: 'virtual:transfer', name: 'Transferencia', fee_percent: 0 },
  { id: 'virtual:card', name: 'Tarjeta', fee_percent: 8 },
]

type ReplacementItem = Product & {
  cartId: string
  quantity: number
  discount: number
  imei: string
}

export default function CambiosPage() {
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [sale, setSale] = useState<Sale | null>(null)
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [replacements, setReplacements] = useState<ReplacementItem[]>([])
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastPrintId, setLastPrintId] = useState<string | null>(null)

  useEffect(() => {
    loadCatalog()
  }, [])

  async function loadCatalog() {
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, sku, barcode, sale_price, cost, stock, product_type')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .order('name')

    const { data: methodsData, error: methodsError } = await supabase
      .from('payment_methods')
      .select('id, name, fee_percent')
      .eq('active', true)
      .order('fee_percent')

    const nextPaymentMethods =
      methodsError || !methodsData?.length ? FALLBACK_PAYMENT_METHODS : methodsData

    setProducts(productsData || [])
    setPaymentMethods(nextPaymentMethods)
    if (nextPaymentMethods.length) setPaymentMethodId(nextPaymentMethods[0].id)
  }

  async function searchInvoice() {
    const query = invoiceSearch.trim()
    if (!query) return alert('Escribe el numero de factura')
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setLoading(true)
    setSale(null)
    setSaleItems([])
    setReturnQuantities({})
    setReplacements([])
    setLastPrintId(null)

    let saleData: Sale | null = null
    let saleError: { message: string } | null = null

    const byInvoice = await supabase
      .from('sales')
      .select(
        'id, invoice_number, subtotal, discount, itbis, total, card_fee, net_received, cash_received, cash_change, payment_method_id, ncf, fiscal_status, created_at'
      )
      .eq('store_id', storeId)
      .eq('invoice_number', query)
      .maybeSingle()

    saleData = byInvoice.data || null
    saleError = byInvoice.error

    if (!saleData && isUuid(query)) {
      const byId = await supabase
        .from('sales')
        .select(
          'id, invoice_number, subtotal, discount, itbis, total, card_fee, net_received, cash_received, cash_change, payment_method_id, ncf, fiscal_status, created_at'
        )
        .eq('store_id', storeId)
        .eq('id', query)
        .maybeSingle()

      saleData = byId.data || null
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

    const { data: itemsData, error: itemsError } = await supabase
      .from('sale_items')
      .select('id, sale_id, product_id, product_name, quantity, unit_price, cost, discount, total, imei')
      .eq('store_id', storeId)
      .eq('sale_id', saleData.id)

    setLoading(false)

    if (itemsError) return alert('Error cargando productos: ' + itemsError.message)

    setSale(saleData)
    setPaymentMethodId(saleData.payment_method_id || paymentMethodId)
    setSaleItems(itemsData || [])
  }

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim()
    if (!q) return products.slice(0, 12)

    return products.filter((product) => {
      const text = `${product.name} ${product.sku || ''} ${product.barcode || ''}`.toLowerCase()
      return text.includes(q)
    })
  }, [products, productSearch])

  const selectedPaymentMethod = paymentMethods.find((method) => method.id === paymentMethodId)
  const selectedPaymentName = selectedPaymentMethod?.name?.toLowerCase() || ''
  const isCashPayment = selectedPaymentName.includes('efectivo')

  const returnedTotal = saleItems.reduce((sum, item) => {
    const qty = returnQuantities[item.id] || 0
    if (qty <= 0) return sum

    return sum + itemUnitNet(item, sale) * qty
  }, 0)

  const replacementSubtotal = replacements.reduce(
    (sum, item) => sum + Number(item.sale_price || 0) * item.quantity,
    0
  )

  const replacementDiscount = replacements.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  )

  const replacementTotal = Math.max(0, replacementSubtotal - replacementDiscount)
  const currentTotal = Math.max(0, Number(sale?.total || 0) - Number(sale?.card_fee || 0))
  const newTotal = Math.max(0, currentTotal - returnedTotal + replacementTotal)
  const difference = newTotal - currentTotal
  const extraCardFee = difference > 0 ? difference * (Number(selectedPaymentMethod?.fee_percent || 0) / 100) : 0
  const cashChange = Number(cashReceived || 0) - Math.max(0, difference)

  function changeReturnQuantity(item: SaleItem, amount: number) {
    setReturnQuantities((current) => {
      const nextValue = Math.max(0, Math.min(item.quantity, (current[item.id] || 0) + amount))
      return { ...current, [item.id]: nextValue }
    })
  }

  function addReplacement(product: Product) {
    if (product.stock <= 0) return alert('Producto agotado')

    const existing = replacements.find((item) => item.id === product.id)
    if (existing && !['phone', 'tablet', 'laptop'].includes(product.product_type)) {
      changeReplacementQuantity(existing.cartId, 1)
      return
    }

    setReplacements((items) => [
      ...items,
      {
        ...product,
        cartId: crypto.randomUUID(),
        quantity: 1,
        discount: 0,
        imei: '',
      },
    ])
    setProductSearch('')
  }

  function changeReplacementQuantity(cartId: string, amount: number) {
    setReplacements((items) =>
      items.map((item) => {
        if (item.cartId !== cartId) return item
        return { ...item, quantity: Math.max(1, Math.min(item.stock, item.quantity + amount)) }
      })
    )
  }

  function removeReplacement(cartId: string) {
    setReplacements((items) => items.filter((item) => item.cartId !== cartId))
  }

  function updateReplacementDiscount(cartId: string, value: string) {
    setReplacements((items) =>
      items.map((item) =>
        item.cartId === cartId ? { ...item, discount: Number(value || 0) } : item
      )
    )
  }

  function updateReplacementImei(cartId: string, value: string) {
    setReplacements((items) =>
      items.map((item) => (item.cartId === cartId ? { ...item, imei: value.replace(/\D/g, '').slice(0, 15) } : item))
    )
  }

  async function saveExchange() {
    if (!sale) return
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const returnedItems = saleItems.filter((item) => (returnQuantities[item.id] || 0) > 0)
    if (returnedItems.length === 0 && replacements.length === 0) {
      return alert('Selecciona articulos devueltos o agrega un producto nuevo')
    }

    for (const item of replacements) {
      if (item.quantity > item.stock) return alert(`${item.name} no tiene stock suficiente`)
      if (['phone', 'tablet'].includes(item.product_type) && item.imei.trim().length !== 15) {
        return alert(`Debes agregar IMEI de 15 numeros para ${item.name}`)
      }
    }

    if (difference > 0 && isCashPayment && cashChange < 0) {
      return alert('El efectivo recibido no cubre la diferencia del cambio')
    }

    setSaving(true)

    for (const item of returnedItems) {
      const returnedQty = returnQuantities[item.id] || 0
      const remainingQty = item.quantity - returnedQty
      const discountPerUnit = Number(item.discount || 0) / Math.max(1, item.quantity)
      const nextDiscount = discountPerUnit * remainingQty
      const nextTotal = Math.max(0, Number(item.unit_price || 0) * remainingQty - nextDiscount)

      if (remainingQty <= 0) {
        const { error } = await supabase.from('sale_items').delete().eq('store_id', storeId).eq('id', item.id)
        if (error) return finishWithError(error.message)
      } else {
        const { error } = await supabase
          .from('sale_items')
          .update({
            quantity: remainingQty,
            discount: nextDiscount,
            total: nextTotal,
          })
          .eq('store_id', storeId)
          .eq('id', item.id)

        if (error) return finishWithError(error.message)
      }

      if (item.product_id) {
        const product = products.find((p) => p.id === item.product_id)
        const previousStock = Number(product?.stock || 0)
        const { error } = await supabase
          .from('products')
          .update({ stock: previousStock + returnedQty })
          .eq('store_id', storeId)
          .eq('id', item.product_id)

        if (error) return finishWithError(error.message)
      }
    }

    if (replacements.length > 0) {
      const newSaleItems = replacements.map((item) => ({
        sale_id: sale.id,
        store_id: storeId,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.sale_price,
        cost: item.cost,
        discount: item.discount,
        total: Math.max(0, Number(item.sale_price || 0) * item.quantity - Number(item.discount || 0)),
        imei: item.imei || null,
      }))

      const { error } = await supabase.from('sale_items').insert(newSaleItems)
      if (error) return finishWithError(error.message)

      for (const item of replacements) {
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: item.stock - item.quantity })
          .eq('store_id', storeId)
          .eq('id', item.id)

        if (stockError) return finishWithError(stockError.message)
      }
    }

    const { data: updatedItems, error: updatedItemsError } = await supabase
      .from('sale_items')
      .select('quantity, unit_price, discount, total')
      .eq('store_id', storeId)
      .eq('sale_id', sale.id)

    if (updatedItemsError) return finishWithError(updatedItemsError.message)

    const nextSubtotal =
      updatedItems?.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0) || 0
    const nextDiscount =
      updatedItems?.reduce((sum, item) => sum + Number(item.discount || 0), 0) || 0
    const nextTotal = updatedItems?.reduce((sum, item) => sum + Number(item.total || 0), 0) || 0
    const nextCardFee = Number(sale.card_fee || 0) + extraCardFee

    const { error: saleError } = await supabase
      .from('sales')
      .update({
        subtotal: nextSubtotal,
        discount: nextDiscount,
        total: nextTotal,
        card_fee: nextCardFee,
        net_received: nextTotal - nextCardFee,
        payment_method_id: difference > 0
          ? paymentMethodId.startsWith('virtual:')
            ? null
            : paymentMethodId || sale.payment_method_id
          : sale.payment_method_id,
        cash_received: Number(sale.cash_received || 0) + (difference > 0 && isCashPayment ? Number(cashReceived || 0) : 0),
        cash_change: Number(sale.cash_change || 0) + (difference > 0 && isCashPayment ? Math.max(0, cashChange) : 0),
        notes: `Factura editada por cambio de articulos el ${new Date().toLocaleString('es-DO')}`,
      })
      .eq('store_id', storeId)
      .eq('id', sale.id)

    if (saleError) return finishWithError(saleError.message)

    alert('Cambio aplicado correctamente')
    await loadCatalog()
    await searchInvoice()
    setSaving(false)
    setLastPrintId(sale.id)
  }

  function finishWithError(message: string) {
    setSaving(false)
    alert('No pude guardar el cambio: ' + message)
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
            <RefreshCcw className="text-emerald-500" />
            Cambio de articulos
          </h1>
          <p className="text-zinc-500">
            Busca una factura, devuelve articulos al inventario y agrega reemplazos.
          </p>
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
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Search size={18} />
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </section>

      {sale && (
        <>
          <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-500">Factura</p>
                <h2 className="text-2xl font-black">
                  {sale.invoice_number || `#${sale.id.slice(0, 8).toUpperCase()}`}
                </h2>
                <p className="mt-1 text-zinc-500">
                  {formatDate(sale.created_at)} - {formatTime(sale.created_at)}
                </p>
                {sale.ncf && (
                  <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                    Esta factura tiene NCF. Para e-CF oficial luego conviene manejar nota de credito.
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="text-sm text-zinc-500">Total actual</p>
                <p className="text-3xl font-black text-emerald-600">{formatMoney(sale.total)}</p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr_380px]">
            <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 p-5">
                <h2 className="text-xl font-bold">Productos comprados</h2>
                <p className="text-sm text-zinc-500">Marca la cantidad que el cliente devuelve.</p>
              </div>

              <div className="divide-y divide-zinc-100">
                {saleItems.map((item) => (
                  <div key={item.id} className="p-5">
                    <div className="flex justify-between gap-4">
                      <div>
                        <h3 className="font-bold">{item.product_name}</h3>
                        <p className="text-sm text-zinc-500">
                          Comprado: {item.quantity} x {formatMoney(item.unit_price)}
                        </p>
                        {item.imei && <p className="text-sm text-emerald-700">IMEI/Serial: {item.imei}</p>}
                      </div>

                      <div className="text-right">
                        <p className="font-bold">{formatMoney(item.total)}</p>
                        <p className="text-sm text-zinc-500">Devuelve</p>
                        <div className="mt-1 flex items-center justify-end gap-2">
                          <button
                            onClick={() => changeReturnQuantity(item, -1)}
                            className="rounded-lg bg-zinc-100 p-2 hover:bg-zinc-200"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-8 text-center font-black">{returnQuantities[item.id] || 0}</span>
                          <button
                            onClick={() => changeReturnQuantity(item, 1)}
                            className="rounded-lg bg-zinc-100 p-2 hover:bg-zinc-200"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">Producto nuevo</h2>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-300 px-4 py-3">
                <Search className="text-emerald-500" size={20} />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar producto del inventario..."
                  className="w-full outline-none"
                />
              </div>

              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addReplacement(product)}
                    disabled={product.stock <= 0}
                    className="w-full rounded-xl border border-zinc-200 p-4 text-left hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-bold">{product.name}</p>
                        <p className="text-sm text-zinc-500">SKU: {product.sku || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-emerald-600">{formatMoney(product.sale_price)}</p>
                        <p className="text-sm text-zinc-500">Stock {product.stock}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShoppingCart className="text-emerald-500" />
                <h2 className="text-xl font-bold">Resumen</h2>
              </div>

              <div className="space-y-3">
                {replacements.length === 0 ? (
                  <p className="rounded-xl bg-zinc-50 p-4 text-zinc-500">
                    No hay productos nuevos agregados.
                  </p>
                ) : (
                  replacements.map((item) => (
                    <div key={item.cartId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-bold">{item.name}</p>
                          <p className="text-sm text-zinc-500">{formatMoney(item.sale_price)}</p>
                        </div>
                        <button onClick={() => removeReplacement(item.cartId)}>
                          <Trash2 className="text-red-500" size={18} />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          onClick={() => changeReplacementQuantity(item.cartId, -1)}
                          className="rounded-lg bg-zinc-200 p-2 hover:bg-zinc-300"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="font-black">{item.quantity}</span>
                        <button
                          onClick={() => changeReplacementQuantity(item.cartId, 1)}
                          className="rounded-lg bg-zinc-200 p-2 hover:bg-zinc-300"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      <input
                        type="number"
                        value={item.discount || ''}
                        onChange={(event) => updateReplacementDiscount(item.cartId, event.target.value)}
                        placeholder="Descuento RD$"
                        className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      />

                      {['phone', 'tablet', 'laptop'].includes(item.product_type) && (
                        <input
                          value={item.imei}
                          onChange={(event) => updateReplacementImei(item.cartId, event.target.value)}
                          placeholder={item.product_type === 'laptop' ? 'Serial opcional' : 'IMEI obligatorio'}
                          className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
                <MoneyRow label="Devuelto" value={returnedTotal} red />
                <MoneyRow label="Nuevo producto" value={replacementTotal} />
                <MoneyRow label="Nuevo total factura" value={newTotal} bold />
              </div>

              <div className="mt-5 rounded-xl bg-zinc-50 p-4">
                {difference > 0 ? (
                  <>
                    <p className="text-sm font-semibold text-zinc-600">Cliente debe pagar</p>
                    <p className="text-3xl font-black text-red-500">{formatMoney(difference)}</p>

                    <label className="mt-4 block text-sm text-zinc-500">Metodo de pago</label>
                    <select
                      value={paymentMethodId}
                      onChange={(event) => setPaymentMethodId(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {Number(method.fee_percent) > 0
                            ? `${method.name} - ${Number(method.fee_percent)}%`
                            : method.name}
                        </option>
                      ))}
                    </select>

                    {isCashPayment && (
                      <>
                        <label className="mt-4 block text-sm text-zinc-500">Efectivo recibido</label>
                        <input
                          type="number"
                          value={cashReceived}
                          onChange={(event) => setCashReceived(event.target.value)}
                          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                        />
                        <MoneyRow label="Cambio" value={cashChange} />
                      </>
                    )}
                  </>
                ) : difference < 0 ? (
                  <>
                    <p className="text-sm font-semibold text-zinc-600">Balance a favor del cliente</p>
                    <p className="text-3xl font-black text-emerald-600">{formatMoney(Math.abs(difference))}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-zinc-600">Cambio parejo</p>
                    <p className="text-2xl font-black text-zinc-950">{formatMoney(0)}</p>
                  </>
                )}
              </div>

              <button
                onClick={saveExchange}
                disabled={saving}
                className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Guardando cambio...' : 'Guardar cambio'}
              </button>

              {lastPrintId && (
                <button
                  onClick={() => window.open(`/ventas/${lastPrintId}/imprimir`, '_blank')}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 py-4 font-bold hover:bg-zinc-100"
                >
                  <Printer size={18} />
                  Imprimir factura actualizada
                </button>
              )}
            </aside>
          </div>
        </>
      )}
    </AppShell>
  )
}

function itemUnitNet(item: SaleItem, sale: Sale | null) {
  const unit = Number(item.total || 0) / Math.max(1, Number(item.quantity || 1))
  const saleTotal = Number(sale?.total || 0)
  const cardFeeRatio = saleTotal > 0 ? Number(sale?.card_fee || 0) / saleTotal : 0

  return Math.max(0, unit * (1 - cardFeeRatio))
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function MoneyRow({
  label,
  value,
  bold = false,
  red = false,
}: {
  label: string
  value: number
  bold?: boolean
  red?: boolean
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-600">{label}</span>
      <span className={`${bold ? 'font-black text-zinc-950' : 'font-bold'} ${red ? 'text-red-500' : ''}`}>
        {formatMoney(value)}
      </span>
    </div>
  )
}
