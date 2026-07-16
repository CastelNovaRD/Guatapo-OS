'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getProductMainImage, type ProductImage } from '@/lib/product-images'
import { getCurrentStoreId } from '@/lib/store-context'
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
  company_name: string
  rnc: string | null
  phone: string | null
  address: string | null
}

type Quote = {
  id: string
  quote_number: string | null
  quote_customer_id: string | null
  subtotal: number
  tax_percent: number
  tax_amount: number
  discount: number
  total: number
  status: string
  ncf: string | null
  created_at: string
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

type AvailableNcf = {
  id: string
  ncf: string
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
  const [storeId, setStoreId] = useState<string | null>(null)
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
  const [availableNcf, setAvailableNcf] = useState<AvailableNcf | null>(null)
  const [loadingNcf, setLoadingNcf] = useState(false)
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null)
  const [lastInvoicePrintId, setLastInvoicePrintId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, sku, sale_price, stock')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .order('name')

    const { data: customersData } = await supabase
      .from('quote_customers')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    const { data: quotesData } = await supabase
      .from('quotes')
      .select('*')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    const { data: imagesData } = await supabase
  .from('product_images')
  .select('id, product_id, image_url, is_primary, sort_order')
  .eq('store_id', currentStoreId)
  .order('sort_order')

    setProducts(productsData || [])
    setProductImages(imagesData || [])
    setCustomers(customersData || [])
    setQuotes(quotesData || [])
  }

  const filteredProducts = products.filter((product) => {
    const text = `${product.name} ${product.sku || ''}`.toLowerCase()
    return text.includes(search.toLowerCase())
  })

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
    const existing = quoteItems.find((item) => item.product_id === product.id)

    if (existing) {
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
    setQuoteItems(
      quoteItems.map((item, i) =>
        i === index ? { ...item, [field]: Number(value || 0) } : item
      )
    )
  }

  function removeItem(index: number) {
    setQuoteItems(quoteItems.filter((_, i) => i !== index))
  }

  async function saveQuote() {
    if (!selectedCustomerId) return alert('Selecciona un cliente/empresa')
    if (quoteItems.length === 0) return alert('Agrega productos a la cotización')
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const payload = {
      store_id: storeId,
      quote_customer_id: selectedCustomerId,
      subtotal,
      tax_percent: Number(taxPercent || 18),
      tax_amount: taxAmount,
      discount,
      total,
      status: 'pending',
    }

    let quoteId = editingQuote?.id

    if (editingQuote) {
      if (editingQuote.status === 'completed') {
        return alert('Esta cotización ya fue facturada y no se puede editar.')
      }

      const { error } = await supabase
        .from('quotes')
        .update(payload)
        .eq('store_id', storeId)
        .eq('id', editingQuote.id)

      if (error) return alert(error.message)

      await supabase.from('quote_items').delete().eq('store_id', storeId).eq('quote_id', editingQuote.id)
    } else {
      const { data: quote, error } = await supabase
        .from('quotes')
        .insert(payload)
        .select('id, quote_number')
        .single()

      if (error) return alert(error.message)
      quoteId = quote.id
    }

    const items = quoteItems.map((item) => ({
      quote_id: quoteId,
      store_id: storeId,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_percent: Number(taxPercent || 18),
      discount: Number(item.discount || 0),
      total: Math.max(
        0,
        item.unit_price * item.quantity - Number(item.discount || 0)
      ),
    }))

    const { error: itemsError } = await supabase.from('quote_items').insert(items)
    if (itemsError) return alert(itemsError.message)

    alert(editingQuote ? 'Cotización actualizada' : 'Cotización guardada')

    resetQuoteForm()
    setTab('quotes')
    loadData()
  }

  async function editQuote(quote: Quote) {
    if (quote.status === 'completed') {
      return alert('Esta cotización ya fue facturada y no se puede editar.')
    }

    const { data: items, error } = await supabase
      .from('quote_items')
      .select('product_id, product_name, quantity, unit_price, tax_percent, discount, total')
      .eq('store_id', storeId)
      .eq('quote_id', quote.id)

    if (error) return alert(error.message)

    const itemDiscounts =
      items?.reduce((sum, item) => sum + Number(item.discount || 0), 0) || 0

    setEditingQuote(quote)
    setSelectedCustomerId(quote.quote_customer_id || '')
    setTaxPercent(String(quote.tax_percent || 18))
    setQuoteDiscount(String(Math.max(0, Number(quote.discount || 0) - itemDiscounts)))
    setQuoteItems(items || [])
    setTab('new')
  }

  function openInvoiceModal(quote: Quote) {
    if (quote.status === 'completed') return alert('Esta cotización ya fue facturada')

    setQuoteToInvoice(quote)
    setNcfNumber('')
    setFiscalReceiptType('B01')
    setAvailableNcf(null)
    setLastInvoiceId(null)
    setLastInvoicePrintId(null)
    setInvoiceModal(true)
    loadNextAvailableNcf('B01')
  }

  async function loadNextAvailableNcf(type = fiscalReceiptType) {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setLoadingNcf(true)

    const { data, error } = await supabase
      .from('ncf_receipts')
      .select('id, ncf')
      .eq('store_id', storeId)
      .eq('receipt_type', type)
      .neq('status', 'used')
      .order('ncf', { ascending: true })
      .limit(1)
      .maybeSingle()

    setLoadingNcf(false)

    if (error) {
      setAvailableNcf(null)
      return alert(
        'No pude cargar comprobantes disponibles. Revisa Ventas > Comprobantes.'
      )
    }

    setAvailableNcf(data || null)
    setNcfNumber(data?.ncf || '')
  }

  async function confirmInvoiceQuote() {
    if (!quoteToInvoice) return
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (!availableNcf) {
      return alert('No hay NCF disponibles. Agrega comprobantes en Ventas > Comprobantes.')
    }

    const fiscalCustomer = customers.find((customer) => customer.id === quoteToInvoice.quote_customer_id)
    const fiscalName = fiscalCustomer?.company_name?.trim() || ''
    const fiscalRnc = fiscalCustomer?.rnc?.trim() || ''

    if (!fiscalName || !fiscalRnc) {
      return alert('Para facturar con comprobante debes completar la razon social y RNC/Cedula del cliente.')
    }

    const nextNcf = availableNcf.ncf.trim()
    if (!nextNcf.startsWith(fiscalReceiptType)) {
      return alert(`El NCF disponible no corresponde al tipo ${fiscalReceiptType}. Actualiza el comprobante disponible.`)
    }

    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('store_id', storeId)
      .eq('quote_id', quoteToInvoice.id)

    const { data: sale, error } = await supabase
      .from('sales')
      .insert({
        store_id: storeId,
        sale_channel: 'quote',
        subtotal: quoteToInvoice.subtotal,
        discount: quoteToInvoice.discount,
        itbis: quoteToInvoice.tax_amount,
        total: quoteToInvoice.total,
        card_fee: 0,
        net_received: quoteToInvoice.total,
        status: 'paid',
        ncf: nextNcf,
        fiscal_receipt_type: fiscalReceiptType,
        fiscal_status: 'ready_to_send',
        fiscal_customer_name: fiscalName,
        fiscal_customer_rnc: fiscalRnc,
        fiscal_customer_phone: fiscalCustomer?.phone || null,
        fiscal_customer_address: fiscalCustomer?.address || null,
        notes: `Venta generada desde cotización ${
          quoteToInvoice.quote_number ||
          `#${quoteToInvoice.id.slice(0, 8).toUpperCase()}`
        }`,
      })
      .select('id, invoice_number')
      .single()

    if (error) return alert(error.message)

    const saleItems =
      items?.map((item: any) => ({
        sale_id: sale.id,
        store_id: storeId,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost: 0,
        discount: item.discount,
        total: item.total,
      })) || []

    if (saleItems.length > 0) {
      await supabase.from('sale_items').insert(saleItems)

      for (const item of items || []) {
        const product = products.find((p) => p.id === item.product_id)
        if (product) {
          await supabase
            .from('products')
            .update({ stock: product.stock - item.quantity })
            .eq('store_id', storeId)
            .eq('id', item.product_id)
        }
      }
    }

    await supabase
      .from('quotes')
      .update({
        status: 'completed',
        ncf: nextNcf,
        fiscal_receipt_type: fiscalReceiptType,
        fiscal_status: 'ready_to_send',
        fiscal_customer_name: fiscalName,
        fiscal_customer_rnc: fiscalRnc,
      })
      .eq('store_id', storeId)
      .eq('id', quoteToInvoice.id)

    await supabase
      .from('ncf_receipts')
      .update({
        status: 'used',
        used_sale_id: sale.id,
        used_company_name: fiscalName,
        used_customer_rnc: fiscalRnc,
        used_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('id', availableNcf.id)

    setLastInvoiceId(sale.invoice_number || sale.id)
    setNcfNumber(nextNcf)
    setLastInvoicePrintId(sale.id)
    loadData()
  }

  async function deleteQuote(quote: Quote) {
    if (quote.status === 'completed') {
      return alert('Esta cotización ya fue facturada y no se puede borrar.')
    }

    if (!confirm('¿Eliminar esta cotización?')) return

    await supabase.from('quotes').delete().eq('store_id', storeId).eq('id', quote.id)
    loadData()
  }

  function openCustomerModal(customer?: QuoteCustomer) {
    if (customer) {
      setEditingCustomer(customer)
      setCompanyName(customer.company_name)
      setRnc(customer.rnc || '')
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
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const payload = {
      store_id: storeId,
      company_name: companyName,
      rnc: rnc || null,
      phone: phone || null,
      address: address || null,
    }

    if (editingCustomer) {
      await supabase.from('quote_customers').update(payload).eq('store_id', storeId).eq('id', editingCustomer.id)
    } else {
      await supabase.from('quote_customers').insert(payload)
    }

    setCustomerModal(false)
    loadData()
  }

  async function deleteCustomer(id: string) {
    if (!confirm('¿Eliminar este cliente?')) return
    await supabase.from('quote_customers').delete().eq('store_id', storeId).eq('id', id)
    loadData()
  }

  function customerName(id: string | null) {
    return customers.find((c) => c.id === id)?.company_name || 'Sin cliente'
  }

  function customerFiscalData(id: string | null) {
    return customers.find((customer) => customer.id === id) || null
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
          label={editingQuote ? 'Editar cotización' : 'Nueva cotización'}
          active={tab === 'new'}
          onClick={() => setTab('new')}
        />
        <Tab label="Cotizaciones" active={tab === 'quotes'} onClick={() => setTab('quotes')} />
        <Tab label="Clientes" active={tab === 'customers'} onClick={() => setTab('customers')} />
      </div>

      {tab === 'new' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            {editingQuote && (
              <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-700">
                Editando cotización{' '}
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredProducts.map((product) => (
                <button

                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm hover:border-emerald-500"
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
                    SKU: {product.sku || '-'} · Stock: {product.stock}
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
              {editingQuote ? 'Editar cotización' : 'Nueva cotización'}
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
                  {customer.company_name}
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
              {editingQuote ? 'Guardar cambios' : 'Guardar cotización'}
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
                  <th className="p-4">Cotización</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">NCF</th>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} className="border-b border-zinc-100">
                    <td className="p-4 font-bold">
                      {quote.quote_number ||
                        `#${quote.id.slice(0, 8).toUpperCase()}`}
                    </td>

                    <td className="p-4">{customerName(quote.quote_customer_id)}</td>
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
                              ? 'No se puede editar una cotización facturada'
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
              <h3 className="text-xl font-bold">{customer.company_name}</h3>
              <p className="text-sm text-zinc-500">RNC: {customer.rnc || '-'}</p>
              <p className="text-sm text-zinc-500">Tel: {customer.phone || '-'}</p>
              <p className="text-sm text-zinc-500">
                Dirección: {customer.address || '-'}
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
              <Input label="Teléfono" value={phone} onChange={setPhone} />
              <Input label="Dirección opcional" value={address} onChange={setAddress} />

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
                      setAvailableNcf(null)
                      loadNextAvailableNcf(nextType)
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
                    const fiscalCustomer = customerFiscalData(quoteToInvoice.quote_customer_id)

                    return (
                      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                        <p className="text-sm font-bold text-zinc-700">Datos fiscales del cliente</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-zinc-700">
                          <p>Razon social: <strong>{fiscalCustomer?.company_name || '-'}</strong></p>
                          <p>RNC/Cedula: <strong>{fiscalCustomer?.rnc || 'Falta completar'}</strong></p>
                          <p>Telefono: <strong>{fiscalCustomer?.phone || '-'}</strong></p>
                          <p>Direccion: <strong>{fiscalCustomer?.address || '-'}</strong></p>
                        </div>
                      </div>
                    )
                  })()}

                  <label className="mt-5 block text-sm text-zinc-500">
                    Número de comprobante fiscal / NCF
                  </label>
                  <input
                    value={ncfNumber}
                    readOnly
                    placeholder={loadingNcf ? 'Cargando NCF...' : 'No hay NCF disponible'}
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 font-black text-emerald-700 outline-none"
                  />

                  <button
                    onClick={() => loadNextAvailableNcf()}
                    className="mt-3 w-full rounded-xl border border-emerald-300 py-3 font-bold text-emerald-700 hover:bg-emerald-50"
                  >
                    Actualizar NCF disponible
                  </button>

                  <button
                    onClick={confirmInvoiceQuote}
                    disabled={!availableNcf || loadingNcf}
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
