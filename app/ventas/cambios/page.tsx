'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
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
  const [returnRestockQuantities, setReturnRestockQuantities] = useState<Record<string, number>>({})
  const [returnDamagedQuantities, setReturnDamagedQuantities] = useState<Record<string, number>>({})
  const [exchangeReason, setExchangeReason] = useState('')
  const [exchangeReasonOther, setExchangeReasonOther] = useState('')
  const [exchangeNotes, setExchangeNotes] = useState('')
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

  useEffect(() => {
    if (!storeId) return

    const invoice = new URLSearchParams(window.location.search).get('invoice')
    if (!invoice) return

    setInvoiceSearch(invoice)
    void searchInvoice(invoice)
  }, [storeId])

  async function loadCatalog() {
  const currentStoreId = await getCurrentStoreId()
  setStoreId(currentStoreId)

  if (!currentStoreId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  try {
    const [productsResponse, methodsResponse] = await Promise.all([
      fetch('/api/products', {
        cache: 'no-store',
      }),
      fetch('/api/payment-methods', {
        cache: 'no-store',
      }),
    ])

    const productsData = productsResponse.ok
      ? await productsResponse.json()
      : []

    const methodsData = methodsResponse.ok
      ? await methodsResponse.json()
      : []

    const nextProducts: Product[] = Array.isArray(productsData)
      ? productsData
      : Array.isArray(productsData?.products)
        ? productsData.products
        : []

    const nextPaymentMethods: PaymentMethod[] =
      Array.isArray(methodsData) && methodsData.length
        ? methodsData
        : FALLBACK_PAYMENT_METHODS

    setProducts(nextProducts)
    setPaymentMethods(nextPaymentMethods)

    if (nextPaymentMethods.length) {
      setPaymentMethodId((current) =>
        current || nextPaymentMethods[0].id
      )
    }
  } catch (error) {
    console.error('Error cargando catalogo de cambios:', error)
    alert('No se pudo cargar el catalogo.')
  }
}

 async function searchInvoice(invoiceOverride?: string) {
  const query = (invoiceOverride || invoiceSearch).trim()

  if (!query) {
    return alert('Escribe el numero de factura')
  }

  if (!storeId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  setLoading(true)
  setSale(null)
  setSaleItems([])
  setReturnRestockQuantities({})
  setReturnDamagedQuantities({})
  setExchangeReason('')
  setExchangeReasonOther('')
  setExchangeNotes('')
  setReplacements([])
  setLastPrintId(null)

  try {
    const params = new URLSearchParams()

    if (isUuid(query)) {
      params.set('saleId', query)
    } else {
      params.set('invoiceNumber', query)
    }

    const response = await fetch(`/api/sales?${params.toString()}`, {
      cache: 'no-store',
    })

    const data = await response.json().catch(() => null)

    if (response.status === 404) {
      return alert('No encontre esa factura')
    }

    if (!response.ok) {
      return alert(
        'Error buscando factura: ' +
          (data?.error || 'No se pudo consultar la factura.')
      )
    }

    const saleData = data?.sale as Sale | undefined
    const itemsData = Array.isArray(data?.items)
      ? (data.items as SaleItem[])
      : []

    if (!saleData) {
      return alert('No encontre esa factura')
    }

    setSale(saleData)
    setSaleItems(itemsData)

    if (saleData.payment_method_id) {
      setPaymentMethodId(saleData.payment_method_id)
    }
  } catch (error) {
    console.error('Error buscando factura para cambio:', error)
    alert('No se pudo consultar la factura.')
  } finally {
    setLoading(false)
  }
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
    const qty = getReturnedQuantity(item.id)
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

  function getReturnedQuantity(itemId: string) {
    return Number(returnRestockQuantities[itemId] || 0) + Number(returnDamagedQuantities[itemId] || 0)
  }

  function changeReturnQuantity(
    item: SaleItem,
    destination: 'restock' | 'damaged',
    amount: number
  ) {
    const currentMap = destination === 'restock' ? returnRestockQuantities : returnDamagedQuantities
    const otherQuantity =
      destination === 'restock'
        ? Number(returnDamagedQuantities[item.id] || 0)
        : Number(returnRestockQuantities[item.id] || 0)
    const currentQuantity = Number(currentMap[item.id] || 0)
    const maxForDestination = Math.max(0, Number(item.quantity || 0) - otherQuantity)
    const nextValue = Math.max(0, Math.min(maxForDestination, currentQuantity + amount))

    if (destination === 'restock') {
      setReturnRestockQuantities((current) => ({ ...current, [item.id]: nextValue }))
    } else {
      setReturnDamagedQuantities((current) => ({ ...current, [item.id]: nextValue }))
    }
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

    const returnedItems = saleItems.filter((item) => getReturnedQuantity(item.id) > 0)
    if (returnedItems.length === 0 && replacements.length === 0) {
      return alert('Selecciona articulos devueltos o agrega un producto nuevo')
    }

    if (returnedItems.length > 0 && !exchangeReason) {
      return alert('Selecciona el motivo del cambio.')
    }

    if (exchangeReason === 'Otro' && !exchangeReasonOther.trim()) {
      return alert('Escribe el motivo del cambio.')
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

try {
  const response = await fetch('/api/product-exchanges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      saleId: sale.id,

      reason: exchangeReason || 'Cambio de producto',
      reasonOther:
        exchangeReason === 'Otro'
          ? exchangeReasonOther.trim() || null
          : null,
      notes: exchangeNotes.trim() || null,

      returnedItems: returnedItems.map((item) => ({
        saleItemId: item.id,
        restockQuantity: Number(
          returnRestockQuantities[item.id] || 0
        ),
        damagedQuantity: Number(
          returnDamagedQuantities[item.id] || 0
        ),
      })),

      replacements: replacements.map((item) => ({
        productId: item.id,
        quantity: Number(item.quantity),
        discount: Number(item.discount || 0),
        imei: item.imei.trim() || null,
      })),

      paymentMethodId:
        difference > 0
          ? paymentMethodId || null
          : null,

      cashReceived:
        difference > 0 && isCashPayment
          ? Number(cashReceived || 0)
          : 0,

      extraCardFee:
        difference > 0
          ? Number(extraCardFee || 0)
          : 0,
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return finishWithError(
      data?.error || 'No se pudo completar el cambio.'
    )
  }

  alert('Cambio aplicado correctamente')

  await loadCatalog()
  await searchInvoice()

  setLastPrintId(sale.id)
} catch (error) {
  console.error('Error aplicando cambio:', error)

  return finishWithError(
    error instanceof Error
      ? error.message
      : 'No se pudo completar el cambio.'
  )
  } finally {
    setSaving(false)
  }
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
            onClick={() => void searchInvoice()}
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

              <div className="grid gap-4 border-b border-zinc-200 p-5 md:grid-cols-2">
                <label className="block text-sm font-semibold text-zinc-600">
                  Motivo del cambio
                  <select
                    value={exchangeReason}
                    onChange={(event) => setExchangeReason(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-500"
                  >
                    <option value="">Seleccionar motivo</option>
                    <option value="Producto defectuoso">Producto defectuoso</option>
                    <option value="Producto dañado">Producto dañado</option>
                    <option value="No era compatible">No era compatible</option>
                    <option value="No era lo que el cliente necesitaba">No era lo que el cliente necesitaba</option>
                    <option value="Error en la venta">Error en la venta</option>
                    <option value="Cambio por otro producto">Cambio por otro producto</option>
                    <option value="Otro">Otro</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-zinc-600">
                  Observaciones
                  <input
                    value={exchangeReason === 'Otro' ? exchangeReasonOther : exchangeNotes}
                    onChange={(event) =>
                      exchangeReason === 'Otro'
                        ? setExchangeReasonOther(event.target.value)
                        : setExchangeNotes(event.target.value)
                    }
                    placeholder={exchangeReason === 'Otro' ? 'Describe el motivo' : 'Nota opcional'}
                    className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-3 text-base outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="divide-y divide-zinc-100">
                {saleItems.length === 0 && (
                  <div className="p-5 text-sm font-semibold text-amber-700">
                    Esta factura no tiene productos disponibles para cambio. Si esto ocurrio despues de un intento fallido, revisa la venta original antes de guardar otro cambio.
                  </div>
                )}
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
                        <ReturnQuantityControl
                          label="Al inventario"
                          value={returnRestockQuantities[item.id] || 0}
                          onMinus={() => changeReturnQuantity(item, 'restock', -1)}
                          onPlus={() => changeReturnQuantity(item, 'restock', 1)}
                        />
                        <ReturnQuantityControl
                          label="Dañado"
                          value={returnDamagedQuantities[item.id] || 0}
                          danger
                          onMinus={() => changeReturnQuantity(item, 'damaged', -1)}
                          onPlus={() => changeReturnQuantity(item, 'damaged', 1)}
                        />
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

function ReturnQuantityControl({
  label,
  value,
  danger = false,
  onMinus,
  onPlus,
}: {
  label: string
  value: number
  danger?: boolean
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="mt-2">
      <p className={`text-xs font-bold ${danger ? 'text-red-600' : 'text-emerald-700'}`}>
        {label}
      </p>
      <div className="mt-1 flex items-center justify-end gap-2">
        <button onClick={onMinus} className="rounded-lg bg-zinc-100 p-2 hover:bg-zinc-200">
          <Minus size={15} />
        </button>
        <span className="w-8 text-center font-black">{value}</span>
        <button onClick={onPlus} className="rounded-lg bg-zinc-100 p-2 hover:bg-zinc-200">
          <Plus size={15} />
        </button>
      </div>
    </div>
  )
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