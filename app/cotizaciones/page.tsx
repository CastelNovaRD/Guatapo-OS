'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { getProductMainImage, type ProductImage } from '@/lib/product-images'
import { ImageIcon } from 'lucide-react'
import {
  FileText,
  Search,
  Trash2,
  Edit,
  Receipt,
  X,
  Printer,
} from 'lucide-react'
import { formatDate, formatMoney } from '@/lib/format'

type Product = {
  id: string
  name: string
  sku: string | null
  sale_price: number
  stock: number
}

type QuoteCustomer = {
  id: string
  full_name: string
  document: string | null
  phone: string | null
  address: string | null
  email: string | null
}

type Quote = {
  id: string
  quote_number: string
  quote_customer_id: string | null
  subtotal: number
  tax: number
  tax_percent: number
  tax_amount: number
  discount: number
  total: number
  status: string
  ncf: string | null
  created_at: string
  customer: {
    customer_id: string | null
    full_name: string
    document: string | null
    phone: string | null
    address: string | null
  } | null
}

type QuoteItem = {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  tax_percent: number
  discount: number
  total: number
}

const FISCAL_RECEIPT_TYPES = [
  { value: 'B01', label: 'B01 - Credito fiscal' },
  { value: 'B02', label: 'B02 - Consumidor final' },
  { value: 'B14', label: 'B14 - Regimen especial' },
  { value: 'B15', label: 'B15 - Gubernamental' },
  { value: 'E31', label: 'E31 - e-CF credito fiscal' },
  { value: 'E32', label: 'E32 - e-CF consumo' },
  { value: 'E44', label: 'E44 - e-CF regimen especial' },
  { value: 'E45', label: 'E45 - e-CF gubernamental' },
]

export default function CotizacionesPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<QuoteCustomer[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([])
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'new' | 'quotes' | 'customers'>('new')

  const [editingQuote, setEditingQuote] = useState<Quote | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [taxPercent, setTaxPercent] = useState('18')
  const [quoteDiscount, setQuoteDiscount] = useState('0')

  const [customerModal, setCustomerModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<QuoteCustomer | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [rnc, setRnc] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const [invoiceModal, setInvoiceModal] = useState(false)
  const [quoteToInvoice, setQuoteToInvoice] = useState<Quote | null>(null)
  const [ncfNumber, setNcfNumber] = useState('')
  const [fiscalReceiptType, setFiscalReceiptType] = useState('B01')
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null)
  const [lastInvoicePrintId, setLastInvoicePrintId] = useState<string | null>(null)
  const [visibleProductsLimit] = useState(10)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [productsResponse, customersResponse, quotesResponse] = await Promise.all([
        fetch('/api/products?active=true&limit=200'),
        fetch('/api/customers?active=true&limit=200'),
        fetch('/api/quotes'),
      ])
      if (!productsResponse.ok || !customersResponse.ok || !quotesResponse.ok) {
        throw new Error('No se pudieron cargar las cotizaciones.')
      }

      const [productsData, customersData, quotesData] = await Promise.all([
        productsResponse.json() as Promise<Product[]>,
        customersResponse.json() as Promise<QuoteCustomer[]>,
        quotesResponse.json() as Promise<Array<Omit<Quote, 'quote_customer_id' | 'tax_percent' | 'tax_amount' | 'discount' | 'ncf'>>>,
      ])
      const images = await Promise.all(
        productsData.map(async (product) => {
          const response = await fetch(`/api/products/${product.id}/images`)
          return response.ok ? response.json() as Promise<ProductImage[]> : []
        })
      )

      setProducts(productsData)
      setProductImages(images.flat())
      setCustomers(customersData)
      setQuotes(quotesData.map((quote) => ({
        ...quote,
        quote_customer_id: quote.customer?.customer_id ?? null,
        tax_percent: quote.subtotal > 0 ? (quote.tax / quote.subtotal) * 100 : 0,
        tax_amount: quote.tax,
        discount: Math.max(0, quote.subtotal + quote.tax - quote.total),
        ncf: null,
      })))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones.')
    }
  }

  const filteredProducts = (() => {
    const query = search.toLowerCase().trim()
    const matches = products.filter((product) => {
      const text = `${product.name} ${product.sku || ''}`.toLowerCase()
      return query ? text.includes(query) : true
    })

    return query ? matches : matches.slice(0, visibleProductsLimit)
  })()

  const subtotal = quoteItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  )

  const itemsDiscount = quoteItems.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  )

  const discount = Number(quoteDiscount || 0) + itemsDiscount
  const taxAmount =
    Math.max(0, subtotal - discount) * (Number(taxPercent || 0) / 100)
  const total = Math.max(0, subtotal - discount) + taxAmount

  function resetQuoteForm() {
    setEditingQuote(null)
    setQuoteItems([])
    setSelectedCustomerId('')
    setQuoteDiscount('0')
    setTaxPercent('18')
    setSearch('')
  }

  function addProduct(product: Product) {
    if (Number(product.stock || 0) <= 0) {
      return alert('Este producto est� agotado y no se puede cotizar.')
    }

    const existing = quoteItems.find((item) => item.product_id === product.id)

    if (existing) {
      if (existing.quantity + 1 > Number(product.stock || 0)) {
        return alert(`Solo hay ${product.stock} unidades disponibles de ${product.name}.`)
      }

      setQuoteItems(
        quoteItems.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      )
      return
    }

    setQuoteItems([
      ...quoteItems,
      {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: Number(product.sale_price || 0),
        tax_percent: Number(taxPercent || 18),
        discount: 0,
        total: Number(product.sale_price || 0),
      },
    ])
  }

  function updateItem(
    index: number,
    field: keyof QuoteItem,
    value: string | number
  ) {
    if (field === 'quantity') {
      const item = quoteItems[index]
      const product = products.find((product) => product.id === item.product_id)
      const nextQuantity = Math.max(0, Number(value || 0))

      if (product && nextQuantity > Number(product.stock || 0)) {
        return alert(`Solo hay ${product.stock} unidades disponibles de ${item.product_name}.`)
      }
    }

    setQuoteItems(
      quoteItems.map((item, i) =>
        i === index ? { ...item, [field]: Number(value || 0) } : item
      )
    )
  }

  function removeItem(index: number) {
    setQuoteItems(quoteItems.filter((_, i) => i !== index))
  }

  function validateQuoteStock(items: QuoteItem[]) {
    for (const item of items) {
      const product = products.find((product) => product.id === item.product_id)
      if (!product) continue

      if (Number(product.stock || 0) <= 0) {
        alert(`${item.product_name} est� agotado y no se puede cotizar.`)
        return false
      }

      if (Number(item.quantity || 0) > Number(product.stock || 0)) {
        alert(
          `${item.product_name} no tiene stock suficiente. Disponible: ${product.stock}, solicitado: ${item.quantity}.`
        )
        return false
      }
    }

    return true
  }

  async function saveQuote() {
    if (!selectedCustomerId) return alert('Selecciona un cliente/empresa')
    if (quoteItems.length === 0) return alert('Agrega productos a la cotizaci�n')

    if (!validateQuoteStock(quoteItems)) return

    const payload = {
      subtotal,
      tax: taxAmount,
      total,
      status: 'pending',
      customer: { customerId: selectedCustomerId },
      items: quoteItems.map((item) => ({
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        tax: Math.max(0, item.unit_price * item.quantity - Number(item.discount || 0)) * (Number(taxPercent || 0) / 100),
        total: Math.max(0, item.unit_price * item.quantity - Number(item.discount || 0)),
      })),
    }

    if (editingQuote?.status === 'completed') {
      return alert('Esta cotizaci�n ya fue facturada y no se puede editar.')
    }

    const response = await fetch(editingQuote ? `/api/quotes/${editingQuote.id}` : '/api/quotes', {
      method: editingQuote ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingQuote ? { ...payload, quoteNumber: editingQuote.quote_number } : payload),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      return alert(data?.error || 'No se pudo guardar la cotizaci�n.')
    }

    alert(editingQuote ? 'Cotizaci�n actualizada' : 'Cotizaci�n guardada')

    resetQuoteForm()
    setTab('quotes')
    loadData()
  }

  async function editQuote(quote: Quote) {
    if (quote.status === 'completed') {
      return alert('Esta cotizaci�n ya fue facturada y no se puede editar.')
    }

    const response = await fetch(`/api/quotes/${quote.id}`)
    if (!response.ok) return alert('No se pudo cargar la cotizaci�n.')
    const detail = await response.json() as Quote & { items: Array<Omit<QuoteItem, 'tax_percent' | 'discount'>> }
    const quoteTaxPercent = detail.subtotal > 0 ? (detail.tax / detail.subtotal) * 100 : 0

    setEditingQuote(quote)
    setSelectedCustomerId(detail.customer?.customer_id || '')
    setTaxPercent(String(quoteTaxPercent || 18))
    setQuoteDiscount(String(Math.max(0, detail.subtotal + detail.tax - detail.total)))
    setQuoteItems(detail.items.map((item) => ({ ...item, tax_percent: quoteTaxPercent, discount: 0 })))
    setTab('new')
  }

  function openInvoiceModal(quote: Quote) {
    if (quote.status === 'completed') return alert('Esta cotizaci�n ya fue facturada')

    setQuoteToInvoice(quote)
    setNcfNumber('')
    setFiscalReceiptType('B01')
    setLastInvoiceId(null)
    setLastInvoicePrintId(null)
    setInvoiceModal(true)
  }

  async function confirmInvoiceQuote() {
    if (!quoteToInvoice) return
    const fiscalName = quoteToInvoice.customer?.full_name.trim() || ''
    const fiscalRnc = quoteToInvoice.customer?.document?.trim() || ''

    if (!fiscalName || !fiscalRnc) {
      return alert('Para facturar con comprobante debes completar la raz�n social y RNC/C�dula del cliente.')
    }

    const response = await fetch(`/api/quotes/${quoteToInvoice.id}/convert-to-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiscalReceiptType }),
    })
    const result = await response.json().catch(() => null) as {
      saleId?: string
      invoiceNumber?: string | null
      ncf?: string
      error?: string
    } | null
    if (!response.ok || !result?.saleId || !result.ncf) {
      return alert(result?.error || 'No se pudo generar la factura.')
    }

    setLastInvoiceId(result.invoiceNumber || result.saleId)
    setNcfNumber(result.ncf)
    setLastInvoicePrintId(result.saleId)
    loadData()
  }

  async function deleteQuote(quote: Quote) {
    if (quote.status === 'completed') {
      return alert('Esta cotizaci�n ya fue facturada y no se puede borrar.')
    }

    if (!confirm('�Eliminar esta cotizaci�n?')) return

    const response = await fetch(`/api/quotes/${quote.id}`, { method: 'DELETE' })
    if (!response.ok) return alert('No se pudo eliminar la cotizaci�n.')
    loadData()
  }

  function openCustomerModal(customer?: QuoteCustomer) {
    if (customer) {
      setEditingCustomer(customer)
      setCompanyName(customer.full_name)
      setRnc(customer.document || '')
      setPhone(customer.phone || '')
      setAddress(customer.address || '')
    } else {
      setEditingCustomer(null)
      setCompanyName('')
      setRnc('')
      setPhone('')
      setAddress('')
    }

    setCustomerModal(true)
  }

  async function saveCustomer() {
    if (!companyName.trim()) return alert('Escribe el nombre de la empresa')

    const payload = {
      fullName: companyName,
      document: rnc || null,
      documentType: rnc ? 'rnc' : null,
      phone: phone || null,
      address: address || null,
    }

    const response = await fetch(editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers', {
      method: editingCustomer ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      return alert(data?.error || 'No se pudo guardar el cliente.')
    }

    setCustomerModal(false)
    loadData()
  }

  async function deleteCustomer(id: string) {
    if (!confirm('�Eliminar este cliente?')) return
    const response = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    if (!response.ok) return alert('No se pudo eliminar el cliente.')
    loadData()
  }

  function customerName(id: string | null) {
    return customers.find((c) => c.id === id)?.full_name || 'Sin cliente'
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <FileText className="text-emerald-500" />
            Cotizaciones
          </h1>
          <p className="text-zinc-500">
            Crea, guarda, edita, imprime y factura cotizaciones empresariales.
          </p>
        </div>

        <button
          onClick={() => openCustomerModal()}
          className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
        >
          + Cliente empresa
        </button>
      </div>

      <div className="mb-6 flex gap-3">
        <Tab
          label={editingQuote ? 'Editar cotizaci�n' : 'Nueva cotizaci�n'}
          active={tab === 'new'}
          onClick={() => setTab('new')}
        />
        <Tab label="Cotizaciones" active={tab === 'quotes'} onClick={() => setTab('quotes')} />
        <Tab label="Clientes" active={tab === 'customers'} onClick={() => setTab('customers')} />
      </div>

      {tab === 'new' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {editingQuote && (
              <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-700">
                Editando cotizaci�n{' '}
                <strong>
                  {editingQuote.quote_number ||
                    `#${editingQuote.id.slice(0, 8).toUpperCase()}`}
                </strong>
              </div>
            )}

            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
              <Search className="text-emerald-500" size={20} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto del inventario..."
                className="w-full bg-transparent outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <button

                  key={product.id}
                  onClick={() => addProduct(product)}
                  disabled={Number(product.stock || 0) <= 0}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >

                  <div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-zinc-100">
                     {getProductMainImage(product.id, null, productImages) ? (
                  <img
                       src={getProductMainImage(product.id, null, productImages) || ''}
                       alt={product.name}
                       className="h-full w-full object-contain p-3"
                      />
                   ) : (
                <ImageIcon className="text-zinc-300" size={36} />
                 )}
                </div>


                  <h3 className="font-bold">{product.name}</h3>
                  <p className="text-sm text-zinc-500">
                    SKU: {product.sku || '-'} � Stock: {product.stock}
                  </p>
                  <p className="mt-3 text-xl font-bold text-emerald-600">
                    {formatMoney(product.sale_price)}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">
              {editingQuote ? 'Editar cotizaci�n' : 'Nueva cotizaci�n'}
            </h2>

            <label className="mt-4 block text-sm text-zinc-500">Cliente empresa</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-3 outline-none focus:border-emerald-500"
            >
              <option value="">Seleccionar cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name}
                </option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Input label="ITBIS %" value={taxPercent} onChange={setTaxPercent} />
              <Input label="Descuento RD$" value={quoteDiscount} onChange={setQuoteDiscount} />
            </div>

            <div className="mt-5 space-y-4">
              {quoteItems.length === 0 && (
                <p className="text-zinc-500">No hay productos agregados.</p>
              )}

              {quoteItems.map((item, index) => (
                <div key={index} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex justify-between gap-3">
                    <h3 className="font-bold">{item.product_name}</h3>
                    <button onClick={() => removeItem(index)}>
                      <Trash2 className="text-red-500" size={18} />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Input
                      label="Cant."
                      value={String(item.quantity)}
                      onChange={(v) => updateItem(index, 'quantity', v)}
                    />
                    <Input
                      label="Precio"
                      value={String(item.unit_price)}
                      onChange={(v) => updateItem(index, 'unit_price', v)}
                    />
                    <Input
                      label="Desc."
                      value={String(item.discount)}
                      onChange={(v) => updateItem(index, 'discount', v)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 border-t border-zinc-200 pt-4">
              <Row label="Subtotal" value={formatMoney(subtotal)} />
              <Row label="Descuento" value={formatMoney(discount)} />
              <Row label={`ITBIS ${taxPercent}%`} value={formatMoney(taxAmount)} />
              <Row label="Total" value={formatMoney(total)} bold />
            </div>

            <button
              onClick={saveQuote}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600"
            >
              {editingQuote ? 'Guardar cambios' : 'Guardar cotizaci�n'}
            </button>

            {editingQuote && (
              <button
                onClick={resetQuoteForm}
                className="mt-3 w-full rounded-xl border border-zinc-300 py-3 font-bold text-zinc-700 hover:bg-zinc-100"
              >
                Cancelar edición
              </button>
            )}
          </aside>
        </div>
      )}

      {tab === 'quotes' && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-5">
            <h2 className="text-xl font-semibold">Cotizaciones realizadas</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="p-4">Cotizaci�n</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">NCF</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acci�nes</th>
                </tr>
              </thead>

              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-b border-zinc-100">
                    <td className="p-4 font-bold">
                      {quote.quote_number ||
                        `#${quote.id.slice(0, 8).toUpperCase()}`}
                    </td>

                    <td className="p-4">{quote.customer?.full_name || customerName(quote.quote_customer_id)}</td>
                    <td className="p-4">{quote.ncf || '-'}</td>
                    <td className="p-4">{formatDate(quote.created_at)}</td>

                    <td className="p-4 font-bold text-emerald-600">
                      {formatMoney(quote.total)}
                    </td>

                    <td className="p-4">
                      {quote.status === 'completed' ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                          Completado
                        </span>
                      ) : (
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-bold text-orange-600">
                          Pendiente
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => editQuote(quote)}
                          disabled={quote.status === 'completed'}
                          className="rounded-lg border border-zinc-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            quote.status === 'completed'
                              ? 'No se puede editar una cotizaci�n facturada'
                              : 'Editar'
                          }
                        >
                          <Edit size={17} />
                        </button>

                        <button
                          onClick={() =>
                            window.open(`/cotizaciones/${quote.id}/imprimir`, '_blank')
                          }
                          className="rounded-lg border border-zinc-300 p-2 text-zinc-600"
                          title="Imprimir"
                        >
                          <Printer size={17} />
                        </button>

                        <button
                          onClick={() => openInvoiceModal(quote)}
                          disabled={quote.status === 'completed'}
                          className="rounded-lg border border-zinc-300 p-2 text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Facturar"
                        >
                          <Receipt size={17} />
                        </button>

                        <button
                          onClick={() => deleteQuote(quote)}
                          disabled={quote.status === 'completed'}
                          className="rounded-lg border border-zinc-300 p-2 text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Borrar"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'customers' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-xl font-bold">{customer.full_name}</h3>
              <p className="text-sm text-zinc-500">RNC: {customer.document || '-'}</p>
              <p className="text-sm text-zinc-500">Tel: {customer.phone || '-'}</p>
              <p className="text-sm text-zinc-500">
                Direcci�n: {customer.address || '-'}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => openCustomerModal(customer)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold"
                >
                  Editar
                </button>
                <button
                  onClick={() => deleteCustomer(customer.id)}
                  className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-500"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {customerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <h2 className="text-2xl font-bold">
                {editingCustomer ? 'Editar cliente empresa' : 'Nuevo cliente empresa'}
              </h2>
              <button onClick={() => setCustomerModal(false)}>
                <X />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <Input label="Nombre empresa" value={companyName} onChange={setCompanyName} />
              <Input label="RNC" value={rnc} onChange={setRnc} />
              <Input label="Tel�fono" value={phone} onChange={setPhone} />
              <Input label="Direcci�n opcional" value={address} onChange={setAddress} />

              <button
                onClick={saveCustomer}
                className="rounded-xl bg-emerald-500 py-3 font-bold text-white md:col-span-2"
              >
                Guardar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && quoteToInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">Convertir en factura</h2>
                <p className="text-zinc-500">
                  {quoteToInvoice.quote_number ||
                    `#${quoteToInvoice.id.slice(0, 8).toUpperCase()}`}
                </p>
              </div>

              <button onClick={() => setInvoiceModal(false)}>
                <X />
              </button>
            </div>

            <div className="p-6">
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-sm text-zinc-500">Cliente</p>
                <p className="font-bold">{customerName(quoteToInvoice.quote_customer_id)}</p>

                <p className="mt-3 text-sm text-zinc-500">Total</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatMoney(quoteToInvoice.total)}
                </p>
              </div>

              {!lastInvoiceId ? (
                <>
                  <label className="mt-5 block text-sm text-zinc-500">
                    Tipo de comprobante
                  </label>
                  <select
                    value={fiscalReceiptType}
                    onChange={(event) => {
                      const nextType = event.target.value
                      setFiscalReceiptType(nextType)
                      setNcfNumber('')
                    }}
                    className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                  >
                    {FISCAL_RECEIPT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>

                  {(() => {
                    const fiscalCustomer = quoteToInvoice.customer

                    return (
                      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-bold text-zinc-700">Datos fiscales del cliente</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-zinc-700">
                          <p>Razon social: <strong>{fiscalCustomer?.full_name || '-'}</strong></p>
                          <p>RNC/C�dula: <strong>{fiscalCustomer?.document || 'Falta completar'}</strong></p>
                          <p>Tel�fono: <strong>{fiscalCustomer?.phone || '-'}</strong></p>
                          <p>Direcci�n: <strong>{fiscalCustomer?.address || '-'}</strong></p>
                        </div>
                      </div>
                    )
                  })()}

                  <label className="mt-5 block text-sm text-zinc-500">
                    N�mero de comprobante fiscal / NCF
                  </label>
                  <input
                    value={ncfNumber}
                    readOnly
                    placeholder="Se asignar� al generar la factura"
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 font-black text-emerald-700 outline-none"
                  />

                  <button
                    onClick={confirmInvoiceQuote}
                    className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generar factura
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">
                    <p className="font-bold">Factura generada correctamente</p>
                    <p>Factura {lastInvoiceId}</p>
                    <p>NCF: {ncfNumber}</p>
                  </div>

                  <button
                    onClick={() => {
                      if (lastInvoicePrintId) {
                        window.open(`/ventas/${lastInvoicePrintId}/imprimir`, '_blank')
                      }
                    }}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 py-4 font-bold hover:bg-zinc-100"
                  >
                    <Printer size={18} />
                    Imprimir factura
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-5 py-3 font-semibold ${
        active ? 'bg-emerald-500 text-white' : 'border border-zinc-300 bg-white'
      }`}
    >
      {label}
    </button>
  )
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-600">{label}</span>
      <span className={bold ? 'font-bold text-zinc-950' : ''}>{value}</span>
    </div>
  )
}
