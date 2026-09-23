'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import ExportModal from '@/components/export/ExportModal'
import ImportModal from '@/components/importing/ImportModal'
import { formatDateTime, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { logAudit } from '@/lib/audit'
import { exportPurchases, type PurchaseExportRow } from '@/lib/export/purchases-export'
import type { ExportFormat } from '@/lib/export/export-types'
import { commitPurchasesImport, previewPurchasesImport } from '@/lib/importing/purchases-import'
import type { ImportMode, ImportPreview } from '@/lib/importing/excel-import'
import {
  CalendarDays,
  Download,
  FileText,
  ImageIcon,
  Minus,
  PackagePlus,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  image_url: string | null
  cost: number
  stock: number
  active: boolean | null
}

type Supplier = {
  id: string
  commercial_name: string
  document: string | null
  phone: string | null
}

type PurchaseCartItem = Product & {
  quantity: number
  unitCost: number
  discount: number
  taxAmount: number
}

type PurchaseItem = {
  id: string
  product_id: string | null
  product_name: string
  sku: string | null
  quantity: number
  requested_quantity: number | null
  received_quantity: number | null
  unit_cost: number
  discount: number | null
  tax_amount: number | null
  other_expense_unit: number | null
  real_unit_cost: number | null
  previous_avg_cost: number | null
  new_avg_cost: number | null
  total: number
}

type Purchase = {
  id: string
  supplier_id: string | null
  supplier_name: string | null
  supplier_document: string | null
  invoice_number: string | null
  purchase_date: string
  received_date: string | null
  status: 'draft' | 'pending' | 'received' | 'partially_received' | 'cancelled'
  payment_method: string | null
  payment_status: 'pending' | 'partial' | 'paid'
  amount_paid: number
  balance_due: number
  subtotal: number
  tax_total: number
  discount_total: number
  other_expenses: number
  shipping_transport_cost?: number | null
  expense_notes?: string | null
  total: number
  cost_rule: 'last_cost' | 'weighted_average' | 'none'
  notes: string | null
  created_at: string
  purchase_items?: PurchaseItem[]
}

const emptyImportResult = null as { created: number; updated: number; omitted: number; errors: number } | null

export default function ComprasPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [cart, setCart] = useState<PurchaseCartItem[]>([])
  const [search, setSearch] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierDocument, setSupplierDocument] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receivedDate, setReceivedDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'partial' | 'paid'>('pending')
  const [amountPaid, setAmountPaid] = useState('0')
  const [shippingTransportCost, setShippingTransportCost] = useState('0')
  const [additionalOtherExpenses, setAdditionalOtherExpenses] = useState('0')
  const [expenseNotes, setExpenseNotes] = useState('')
  const [supportsPurchaseExpenseColumns, setSupportsPurchaseExpenseColumns] = useState(true)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [receivingId, setReceivingId] = useState<string | null>(null)

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('create')
  const [importAllowBlankClear, setImportAllowBlankClear] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview<any> | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importCommitting, setImportCommitting] = useState(false)
  const [importResult, setImportResult] = useState(emptyImportResult)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadData()
  }, [])

 async function loadData() {
  setLoading(true)

  try {
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      alert('Este usuario no tiene una tienda asignada.')
      return
    }

    const [
      productsResponse,
      suppliersResponse,
      purchasesResponse,
    ] = await Promise.all([
      fetch('/api/products?limit=1000', {
        cache: 'no-store',
      }),
      fetch('/api/suppliers', {
        cache: 'no-store',
      }),
      fetch('/api/purchases', {
        cache: 'no-store',
      }),
    ])

    const productsData = await productsResponse
      .json()
      .catch(() => null)

    const suppliersData = await suppliersResponse
      .json()
      .catch(() => null)

    const purchasesData = await purchasesResponse
      .json()
      .catch(() => null)

    if (!productsResponse.ok) {
      alert(
        'Error cargando productos: ' +
          (productsData?.error || 'Error desconocido.')
      )
    }

    if (!suppliersResponse.ok) {
      alert(
        'Error cargando suplidores: ' +
          (suppliersData?.error || 'Error desconocido.')
      )
    }

    if (!purchasesResponse.ok) {
      alert(
        'Error cargando compras: ' +
          (purchasesData?.error || 'Error desconocido.')
      )
    }

    const normalizedSuppliers = Array.isArray(suppliersData)
      ? suppliersData.map((supplier) => ({
          ...supplier,
          commercial_name: supplier.name || '',
          document: supplier.rnc || null,
        }))
      : []

    const normalizedPurchases = Array.isArray(purchasesData)
      ? purchasesData.map((purchase) => ({
          ...purchase,

          supplier_name:
            purchase.supplier_name || null,

          supplier_document: null,

          purchase_date:
            purchase.created_at || null,

          received_date:
            purchase.received_at || null,

          payment_method: null,
          payment_status: null,
          amount_paid: 0,

          balance_due:
            purchase.status === 'received'
              ? 0
              : Number(purchase.total || 0),

          tax_total:
            Number(purchase.tax || 0),

          discount_total: 0,
          other_expenses: 0,
          shipping_transport_cost: 0,
          expense_notes: null,

          cost_rule: 'weighted_average',
          notes: null,

          purchase_items: [],
        }))
      : []

    setSupportsPurchaseExpenseColumns(false)

    setProducts(
      Array.isArray(productsData)
        ? productsData
        : []
    )

    setSuppliers(
      normalizedSuppliers as Supplier[]
    )

    setPurchases(
      normalizedPurchases as Purchase[]
    )
  } catch (error) {
    console.error('Error cargando Compras:', error)

    alert(
      'No se pudieron cargar los datos de Compras.'
    )

    setProducts([])
    setSuppliers([])
    setPurchases([])
  } finally {
    setLoading(false)
  }
}

  const activeProducts = products.filter((product) => product.active !== false)
  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim()
    return activeProducts.filter((product) => {
      const text = `${product.name} ${product.sku || ''} ${product.barcode || ''}`.toLowerCase()
      return query ? text.includes(query) : true
    })
  }, [activeProducts, search])

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitCost - item.discount, 0)
  const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount, 0)
  const shippingTransport = Math.max(0, Number(shippingTransportCost || 0))
  const extraOtherExpenses = Math.max(0, Number(additionalOtherExpenses || 0))
  const otherExpenses = shippingTransport + extraOtherExpenses
  const discountTotal = cart.reduce((sum, item) => sum + item.discount, 0)
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0)
  const additionalExpenseUnit = totalUnits > 0 ? otherExpenses / totalUnits : 0
  const total = subtotal + taxTotal + otherExpenses
  const paidAmount = Math.max(0, Number(amountPaid || 0))
  const balanceDue = Math.max(0, total - paidAmount)

  function addToCart(product: Product) {
    const existing = cart.find((item) => item.id === product.id)
    if (existing) return changeQuantity(product.id, 1)
    setCart([...cart, { ...product, quantity: 1, unitCost: Number(product.cost || 0), discount: 0, taxAmount: 0 }])
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function changeQuantity(productId: string, amount: number) {
    setCart((items) => items.map((item) => item.id === productId ? { ...item, quantity: Math.max(1, item.quantity + amount) } : item))
  }

  function updateCartNumber(productId: string, key: 'quantity' | 'unitCost' | 'discount' | 'taxAmount', value: string) {
    const next = key === 'quantity' ? Math.max(1, Number(value || 1)) : Math.max(0, Number(value || 0))
    setCart((items) => items.map((item) => item.id === productId ? { ...item, [key]: next } : item))
  }

  function removeFromCart(productId: string) {
    setCart((items) => items.filter((item) => item.id !== productId))
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const exactProduct = products.find((product) => product.barcode === search.trim() || product.sku === search.trim())
    if (exactProduct) return addToCart(exactProduct)
    if (filteredProducts[0]) addToCart(filteredProducts[0])
  }

  function selectSupplierByName(value: string) {
    setSupplierName(value)
    const supplier = suppliers.find((item) => item.commercial_name === value)
    if (supplier) {
      setSupplierDocument(supplier.document || '')
      setSupplierPhone(supplier.phone || '')
    }
  }

  function clearForm() {
    setCart([])
    setSupplierName('')
    setSupplierDocument('')
    setSupplierPhone('')
    setInvoiceNumber('')
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setReceivedDate('')
    setPaymentMethod('efectivo')
    setPaymentStatus('pending')
    setAmountPaid('0')
    setShippingTransportCost('0')
    setAdditionalOtherExpenses('0')
    setExpenseNotes('')
    setNotes('')
    setSearch('')
    searchRef.current?.focus()
  }

  async function ensureSupplier() {
  if (!storeId) {
    throw new Error('Este usuario no tiene una tienda asignada.')
  }

  const normalizedDocument = supplierDocument
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase()

  const existing = suppliers.find((supplier) =>
    (
      normalizedDocument &&
      (supplier.document || '')
        .replace(/[^0-9A-Za-z]/g, '')
        .toUpperCase() === normalizedDocument
    ) ||
    supplier.commercial_name.trim().toLowerCase() ===
      supplierName.trim().toLowerCase()
  )

  if (existing) return existing.id

  const response = await fetch('/api/suppliers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: supplierName.trim(),
      rnc: supplierDocument.trim() || null,
      phone: supplierPhone.trim() || null,
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error || 'No se pudo crear el suplidor.'
    )
  }

  await logAudit({
    storeId,
    module: 'compras',
    action: 'supplier.create',
    entityType: 'supplier',
    entityId: data.id,
    summary: `Suplidor creado: ${supplierName.trim()}.`,
  })

  return data.id as string
}

  async function savePurchase(status: 'draft' | 'pending') {
  if (!storeId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  if (cart.length === 0) {
    return alert('Agrega productos a la compra.')
  }

  if (!supplierName.trim()) {
    return alert('Escribe el nombre del suplidor.')
  }

  if (!invoiceNumber.trim()) {
    return alert('Escribe el numero de factura del suplidor.')
  }

  setSaving(true)

  try {
    const supplierId = await ensureSupplier()

    const purchaseItems = cart.map((item) => ({
      productId: item.id,
      productName: item.name,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      tax: Number(item.taxAmount || 0),
      total:
        Number(item.quantity) * Number(item.unitCost) -
        Number(item.discount || 0) +
        Number(item.taxAmount || 0),
    }))

    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supplierId,
        invoiceNumber: invoiceNumber.trim(),
        subtotal: Number(subtotal),
        tax: Number(taxTotal),
        total: Number(total),
        items: purchaseItems,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(
        data?.error || 'No se pudo registrar la compra.'
      )
    }

    await logAudit({
      storeId,
      module: 'compras',
      action: 'purchase.create',
      entityType: 'purchase',
      entityId: data.id,
      summary: `Compra guardada como ${status}: ${invoiceNumber.trim()}.`,
      metadata: {
        total,
        items: cart.length,
      },
    })

    clearForm()
    await loadData()
  } catch (error) {
    alert(
      'Error registrando compra: ' +
        (error instanceof Error
          ? error.message
          : String(error))
    )
  } finally {
    setSaving(false)
  }
}

  async function receivePurchase(
  purchase: Purchase,
  partial = false
) {
  if (!storeId) {
    return alert('Este usuario no tiene una tienda asignada.')
  }

  if (partial) {
    alert(
      'La recepción parcial todavía no está disponible en el backend PostgreSQL nuevo.'
    )
    return
  }

  const confirmed = confirm(
    'Confirmar recepción de mercancía? Esto aumentará el inventario y recalculará el costo promedio.'
  )

  if (!confirmed) return

  setReceivingId(purchase.id)

  try {
    const response = await fetch(
      `/api/purchases/${encodeURIComponent(purchase.id)}/receive`,
      {
        method: 'POST',
      }
    )

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(
        data?.error || 'No se pudo recibir la compra.'
      )
    }

    await logAudit({
      storeId,
      module: 'compras',
      action: 'purchase.receive',
      entityType: 'purchase',
      entityId: purchase.id,
      summary: `Compra recibida: ${purchase.invoice_number || purchase.id}.`,
    })

    await loadData()
  } catch (error) {
    alert(
      'No pude recibir la compra: ' +
        (error instanceof Error
          ? error.message
          : String(error))
    )
  } finally {
    setReceivingId(null)
  }
}

  function buildPurchaseExportRows(): PurchaseExportRow[] {
    return purchases.flatMap((purchase) => (purchase.purchase_items || []).map((item, itemIndex) => ({
      purchaseCode: purchase.id,
      supplierInvoice: purchase.invoice_number || '',
      purchaseDate: purchase.purchase_date || '',
      receivedDate: purchase.received_date || '',
      supplierName: purchase.supplier_name || '',
      supplierDocument: purchase.supplier_document || '',
      supplierPhone: suppliers.find((supplier) => supplier.id === purchase.supplier_id)?.phone || '',
      productSku: item.sku || '',
      productName: item.product_name,
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unit_cost || 0),
      discount: Number(item.discount || 0),
      taxAmount: Number(item.tax_amount || 0),
      shippingTransportCost: itemIndex === 0 ? Number(purchase.shipping_transport_cost || 0) : 0,
      otherExpenses: Number(item.other_expense_unit || 0) * Number(item.quantity || 0),
      paymentMethod: purchase.payment_method || '',
      paymentStatus: purchase.payment_status || '',
      amountPaid: Number(purchase.amount_paid || 0),
      notes: purchase.notes || '',
      purchaseStatus: purchase.status || '',
    })))
  }

  async function handleExportPurchases() {
    await exportPurchases({ rows: buildPurchaseExportRows(), format: exportFormat })
    setExportModalOpen(false)
  }

  async function handlePurchasesImportFile(file: File) {
    setImportLoading(true)
    setImportResult(null)
    try {
      const preview = await previewPurchasesImport({ file, suppliers, products, purchases, mode: importMode })
      setImportPreview(preview)
    } catch (error) {
      setImportPreview({ headers: [], rows: [], criticalError: error instanceof Error ? error.message : 'Error leyendo archivo.' })
    } finally {
      setImportLoading(false)
    }
  }

  async function confirmPurchasesImport() {
    if (!storeId || !importPreview) return
    setImportCommitting(true)
    try {
      const result = await commitPurchasesImport({ storeId, preview: importPreview, mode: importMode, allowBlankClear: importAllowBlankClear })
      setImportResult(result)
      await loadData()
    } catch (error) {
      alert('Error importando compras: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setImportCommitting(false)
    }
  }

  if (loading) {
    return <AppShell><p className="text-zinc-500">Cargando compras...</p></AppShell>
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-zinc-950"><ShoppingBag className="text-emerald-600" />Compras</h1>
          <p className="mt-1 text-zinc-600">Registra compras a suplidores. El inventario aumenta solo al confirmar recepción.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setImportModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 font-bold text-emerald-700 hover:bg-emerald-100"><Upload size={18} />Importación</button>
          <button type="button" onClick={() => setExportModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-bold text-zinc-700 hover:bg-zinc-100"><Download size={18} />Exportar</button>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3"><p className="text-xs font-bold uppercase text-emerald-700">Compra actual</p><p className="mt-1 text-xl font-black text-emerald-800">{formatMoney(total)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Truck className="text-emerald-600" size={22} /><h2 className="text-xl font-bold">Datos de la compra</h2></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div><label className="mb-2 block text-sm font-medium text-zinc-600">Suplidor</label><input list="suppliers-list" value={supplierName} onChange={(e) => selectSupplierByName(e.target.value)} placeholder="Nombre del suplidor" className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /><datalist id="suppliers-list">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.commercial_name} />)}</datalist></div>
              <Input label="RNC o cedula" value={supplierDocument} onChange={setSupplierDocument} />
              <Input label="Teléfono" value={supplierPhone} onChange={setSupplierPhone} />
              <Input label="Factura suplidor" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="Ej: F001-000123" />
              <Input label="Fecha compra" type="date" value={purchaseDate} onChange={setPurchaseDate} />
              <Input label="Fecha recepción" type="date" value={receivedDate} onChange={setReceivedDate} />
              <Select label="Metodo de pago" value={paymentMethod} onChange={setPaymentMethod} options={[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['credito', 'Credito']]} />
              <Select label="Estado del pago" value={paymentStatus} onChange={(v) => setPaymentStatus(v as typeof paymentStatus)} options={[['pending', 'Pendiente'], ['partial', 'Parcial'], ['paid', 'Pagada']]} />
              <Input label="Monto pagado" type="number" value={amountPaid} onChange={setAmountPaid} />
              <div>
                <Input label="Envíos / Transporte" type="number" value={shippingTransportCost} onChange={setShippingTransportCost} />
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">Este monto se dividirá entre todas las unidades recibidas en esta compra y se añadirá al costo de los productos.</p>
              </div>
              <Input label="Otros gastos" type="number" value={additionalOtherExpenses} onChange={setAdditionalOtherExpenses} />
              <div className="md:col-span-3"><label className="mb-2 block text-sm font-medium text-zinc-600">Observación de gastos</label><textarea value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /></div>
              <div className="md:col-span-3"><label className="mb-2 block text-sm font-medium text-zinc-600">Observaciones generales</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><PackagePlus className="text-emerald-600" size={22} /><h2 className="text-xl font-bold">Agregar productos</h2></div>
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"><Search className="text-emerald-500" size={20} /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Buscar por nombre, referencia o código de barras..." className="w-full bg-transparent outline-none" autoFocus /></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.slice(0, 12).map((product) => <button key={product.id} type="button" onClick={() => addToCart(product)} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm hover:border-emerald-500"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-100">{product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-contain p-1" /> : <ImageIcon className="text-zinc-300" size={26} />}</div><div className="min-w-0"><h3 className="line-clamp-2 font-bold text-zinc-950">{product.name}</h3><p className="truncate text-sm text-zinc-500">Ref: {product.sku || '-'}</p><p className="mt-1 text-sm font-bold text-emerald-700">Stock: {product.stock} / Costo promedio: {formatMoney(product.cost)}</p></div></button>)}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Detalle</h2><p className="text-sm text-zinc-500">{totalUnits} unidades agregadas</p></div><FileText className="text-emerald-600" size={24} /></div>
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {cart.length === 0 ? <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">Todavía no hay productos en esta compra.</p> : cart.map((item) => {
              const realUnitCost = item.unitCost + additionalExpenseUnit
              const finalStock = Number(item.stock || 0) + item.quantity
              const weightedCost = finalStock > 0 ? ((Number(item.stock || 0) * Number(item.cost || 0)) + (item.quantity * realUnitCost)) / finalStock : realUnitCost
              return <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="mb-3 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="line-clamp-2 font-bold">{item.name}</h3><p className="text-sm text-zinc-500">Stock actual: {item.stock} / Costo actual: {formatMoney(item.cost)}</p></div><button type="button" onClick={() => removeFromCart(item.id)} className="rounded-lg border border-red-200 bg-white p-2 text-red-500 hover:bg-red-50" aria-label="Eliminar producto"><Trash2 size={17} /></button></div><div className="grid grid-cols-2 gap-3"><NumberInput label="Cantidad" value={String(item.quantity)} onChange={(v) => updateCartNumber(item.id, 'quantity', v)} onMinus={() => changeQuantity(item.id, -1)} onPlus={() => changeQuantity(item.id, 1)} /><Input label="Costo suplidor" type="number" value={String(item.unitCost)} onChange={(v) => updateCartNumber(item.id, 'unitCost', v)} /><Input label="Descuento" type="number" value={String(item.discount)} onChange={(v) => updateCartNumber(item.id, 'discount', v)} /><Input label="ITBIS" type="number" value={String(item.taxAmount)} onChange={(v) => updateCartNumber(item.id, 'taxAmount', v)} /><div className="rounded-xl bg-white p-3 text-sm"><p className="text-zinc-500">Gasto adicional por unidad</p><p className="font-black text-zinc-950">{formatMoney(additionalExpenseUnit)}</p></div><div className="rounded-xl bg-white p-3 text-sm"><p className="text-zinc-500">Nuevo promedio estimado</p><p className="font-black text-emerald-700">{formatMoney(weightedCost)}</p></div></div><div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3"><span className="text-sm text-zinc-500">Subtotal linea</span><span className="font-black text-zinc-950">{formatMoney(item.quantity * item.unitCost - item.discount + item.taxAmount + (additionalExpenseUnit * item.quantity))}</span></div></div>
            })}
          </div>
          <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4"><Row label="Unidades" value={String(totalUnits)} /><Row label="Subtotal" value={formatMoney(subtotal)} /><Row label="ITBIS" value={formatMoney(taxTotal)} /><Row label="Envíos / Transporte" value={formatMoney(shippingTransport)} /><Row label="Otros gastos" value={formatMoney(extraOtherExpenses)} /><Row label="Total de gastos adicionales" value={formatMoney(otherExpenses)} /><Row label="Costo total real de adquisición" value={formatMoney(subtotal + otherExpenses)} /><Row label="Pagado" value={formatMoney(paidAmount)} /><Row label="Pendiente" value={formatMoney(balanceDue)} /><Row label="Total compra" value={formatMoney(total)} strong /></div>
          <div className="mt-5 grid grid-cols-1 gap-3"><button type="button" onClick={clearForm} className="rounded-xl border border-zinc-300 px-4 py-3 font-bold text-zinc-700 hover:bg-zinc-100">Limpiar</button><button type="button" onClick={() => void savePurchase('draft')} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 px-4 py-3 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"><Save size={18} />{saving ? 'Guardando...' : 'Guardar borrador'}</button><button type="button" onClick={() => void savePurchase('pending')} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"><Save size={18} />Guardar pendiente</button></div>
        </aside>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5"><div><h2 className="text-xl font-bold">Compras recientes</h2><p className="text-sm text-zinc-500">Últimas compras registradas.</p></div><CalendarDays className="text-emerald-600" size={24} /></div>
        {purchases.length === 0 ? <p className="p-5 text-zinc-500">Todavía no hay compras registradas.</p> : <div className="divide-y divide-zinc-100">{purchases.map((purchase) => <div key={purchase.id} className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[1fr_160px_160px_190px]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-zinc-950">{purchase.supplier_name || 'Suplidor sin nombre'}</h3><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">{purchase.invoice_number || `#${purchase.id.slice(0, 8).toUpperCase()}`}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{statusLabel(purchase.status)}</span></div><p className="mt-1 text-sm text-zinc-500">{formatDateTime(purchase.created_at)}</p><p className="mt-2 text-sm text-zinc-600">{(purchase.purchase_items || []).map((item) => `${item.quantity} x ${item.product_name}`).join(' / ') || 'Sin detalle'}</p></div><div><p className="text-sm text-zinc-500">Fecha compra</p><p className="font-bold">{purchase.purchase_date}</p></div><div className="text-left xl:text-right"><p className="text-sm text-zinc-500">Total</p><p className="text-xl font-black text-emerald-700">{formatMoney(purchase.total)}</p></div><div className="flex items-center xl:justify-end">{purchase.status !== 'received' && purchase.status !== 'cancelled' && purchase.status !== 'partially_received' ? <div className="flex flex-col gap-2"><button type="button" onClick={() => void receivePurchase(purchase)} disabled={receivingId === purchase.id} className="rounded-xl bg-zinc-950 px-4 py-3 font-bold text-white hover:bg-zinc-800 disabled:opacity-60">{receivingId === purchase.id ? 'Recibiendo...' : 'Recibir completa'}</button><button type="button" onClick={() => void receivePurchase(purchase, true)} disabled={receivingId === purchase.id} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60">Recepción parcial</button></div> : <span className="rounded-xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-600">Sin acciones</span>}</div></div>)}</div>}
      </section>

      <ImportModal open={importModalOpen} title="Importación de compras" templateName="compras-shopdesk" preview={importPreview} loading={importLoading} committing={importCommitting} mode={importMode} allowBlankClear={importAllowBlankClear} onModeChange={(mode) => { setImportMode(mode); setImportPreview(null); setImportResult(null) }} onAllowBlankClearChange={setImportAllowBlankClear} onFile={(file) => void handlePurchasesImportFile(file)} onConfirm={() => void confirmPurchasesImport()} onClose={() => setImportModalOpen(false)} onDownloadTemplate={() => void exportPurchases({ rows: [], format: 'excel' })} result={importResult} />
      <ExportModal open={exportModalOpen} title="Exportar compras" format={exportFormat} onFormatChange={setExportFormat} onClose={() => setExportModalOpen(false)} onExport={handleExportPurchases}><p className="text-sm text-zinc-600">Exporta las compras registradas usando la misma plantilla que acepta Importación.</p></ExportModal>
    </AppShell>
  )
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { draft: 'Borrador', pending: 'Pendiente', received: 'Recibida', partially_received: 'Parcial', cancelled: 'Cancelada' }
  return labels[status] || status
}

function Input({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div><label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label><input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500" /></div>
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <div><label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">{options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}</select></div>
}

function NumberInput({ label, value, onChange, onMinus, onPlus }: { label: string; value: string; onChange: (value: string) => void; onMinus: () => void; onPlus: () => void }) {
  return <div><label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label><div className="flex overflow-hidden rounded-xl border border-zinc-300 bg-white"><button type="button" onClick={onMinus} className="px-2 hover:bg-zinc-100"><Minus size={15} /></button><input type="number" min="1" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 px-2 py-3 text-center outline-none" /><button type="button" onClick={onPlus} className="px-2 hover:bg-zinc-100"><Plus size={15} /></button></div></div>
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-zinc-600">{label}</span><span className={strong ? 'text-xl font-black text-zinc-950' : 'font-bold text-zinc-950'}>{value}</span></div>
}
