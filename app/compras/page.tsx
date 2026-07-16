'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import {
  CalendarDays,
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

type PurchaseCartItem = Product & {
  quantity: number
  unitCost: number
}

type PurchaseItem = {
  id: string
  product_name: string
  quantity: number
  unit_cost: number
  total: number
}

type Purchase = {
  id: string
  supplier_name: string | null
  invoice_number: string | null
  purchase_date: string
  subtotal: number
  total: number
  notes: string | null
  created_at: string
  purchase_items?: PurchaseItem[]
}

export default function ComprasPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [cart, setCart] = useState<PurchaseCartItem[]>([])
  const [search, setSearch] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [])

  async function loadData() {
    setLoading(true)
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, barcode, image_url, cost, stock, active')
      .eq('store_id', currentStoreId)
      .order('name')

    const { data: purchasesData, error: purchasesError } = await supabase
      .from('purchases')
      .select(
        'id, supplier_name, invoice_number, purchase_date, subtotal, total, notes, created_at, purchase_items(id, product_name, quantity, unit_cost, total)'
      )
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (productsError) alert('Error cargando productos: ' + productsError.message)
    if (purchasesError) {
      alert('Error cargando compras: ejecuta primero el SQL de compras en Supabase.')
    }

    setProducts(productsData || [])
    setPurchases((purchasesData as Purchase[]) || [])
    setLoading(false)
  }

  const activeProducts = products.filter((product) => product.active !== false)

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim()

    return activeProducts.filter((product) => {
      const text = `${product.name} ${product.sku || ''} ${product.barcode || ''}`.toLowerCase()
      return query ? text.includes(query) : true
    })
  }, [activeProducts, search])

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
  const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0)

  function addToCart(product: Product) {
    const existing = cart.find((item) => item.id === product.id)

    if (existing) {
      changeQuantity(product.id, 1)
      return
    }

    setCart([
      ...cart,
      {
        ...product,
        quantity: 1,
        unitCost: Number(product.cost || 0),
      },
    ])
    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function changeQuantity(productId: string, amount: number) {
    setCart((items) =>
      items.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + amount) }
          : item
      )
    )
  }

  function updateQuantity(productId: string, value: string) {
    const quantity = Math.max(1, Number(value || 1))
    setCart((items) => items.map((item) => (item.id === productId ? { ...item, quantity } : item)))
  }

  function updateUnitCost(productId: string, value: string) {
    const unitCost = Math.max(0, Number(value || 0))
    setCart((items) => items.map((item) => (item.id === productId ? { ...item, unitCost } : item)))
  }

  function removeFromCart(productId: string) {
    setCart((items) => items.filter((item) => item.id !== productId))
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return

    e.preventDefault()
    const exactProduct = products.find((product) => product.barcode === search.trim())

    if (exactProduct) {
      addToCart(exactProduct)
      return
    }

    if (filteredProducts[0]) addToCart(filteredProducts[0])
  }

  function clearForm() {
    setCart([])
    setSupplierName('')
    setInvoiceNumber('')
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setSearch('')
    searchRef.current?.focus()
  }

  async function savePurchase() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (cart.length === 0) return alert('Agrega productos a la compra.')
    if (!supplierName.trim()) return alert('Escribe el nombre del proveedor.')

    setSaving(true)

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        store_id: storeId,
        supplier_name: supplierName.trim(),
        invoice_number: invoiceNumber.trim() || null,
        purchase_date: purchaseDate,
        subtotal,
        total: subtotal,
        notes: notes.trim() || null,
      })
      .select('id')
      .single()

    if (purchaseError) {
      setSaving(false)
      return alert('Error registrando compra: ' + purchaseError.message)
    }

    const purchaseItems = cart.map((item) => ({
      store_id: storeId,
      purchase_id: purchase.id,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_cost: item.unitCost,
      total: item.quantity * item.unitCost,
    }))

    const { error: itemsError } = await supabase.from('purchase_items').insert(purchaseItems)

    if (itemsError) {
      setSaving(false)
      return alert('Compra creada, pero error guardando productos: ' + itemsError.message)
    }

    for (const item of cart) {
      const previousStock = Number(item.stock || 0)
      const newStock = previousStock + item.quantity

      const { error: productError } = await supabase
        .from('products')
        .update({
          stock: newStock,
          cost: item.unitCost,
        })
        .eq('store_id', storeId)
        .eq('id', item.id)

      if (productError) {
        setSaving(false)
        return alert('Compra guardada, pero error actualizando inventario: ' + productError.message)
      }

      await supabase.from('inventory_movements').insert({
        store_id: storeId,
        product_id: item.id,
        movement_type: 'purchase',          
        quantity: item.quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        reference_type: 'purchase',
        reference_id: purchase.id,         
        notes: `Compra ${invoiceNumber.trim() || purchase.id.slice(0, 8).toUpperCase()} - ${supplierName.trim()}`,
      })
    }

    setSaving(false)
    clearForm()
    await loadData()
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-500">Cargando compras...</p>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-zinc-950">
            <ShoppingBag className="text-emerald-600" />
            Compras
          </h1>
          <p className="mt-1 text-zinc-600">
            Registra mercancia comprada, actualiza costos y suma unidades al inventario.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-xs font-bold uppercase text-emerald-700">Compra actual</p>
          <p className="mt-1 text-xl font-black text-emerald-800">{formatMoney(subtotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Truck className="text-emerald-600" size={22} />
              <h2 className="text-xl font-bold">Datos de la compra</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Proveedor"
                value={supplierName}
                onChange={setSupplierName}
                placeholder="Nombre del proveedor"
              />
              <Input
                label="Factura / referencia"
                value={invoiceNumber}
                onChange={setInvoiceNumber}
                placeholder="Ej: F001-000123"
              />
              <Input
                label="Fecha"
                type="date"
                value={purchaseDate}
                onChange={setPurchaseDate}
              />

              <div className="md:col-span-3">
                <label className="mb-2 block text-sm font-medium text-zinc-600">Notas</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Opcional: condiciones, transporte o detalle de la compra"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PackagePlus className="text-emerald-600" size={22} />
              <h2 className="text-xl font-bold">Agregar productos</h2>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <Search className="text-emerald-500" size={20} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar por nombre, referencia o codigo de barras..."
                className="w-full bg-transparent outline-none"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.slice(0, 12).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 text-left shadow-sm hover:border-emerald-500"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="text-zinc-300" size={26} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 font-bold text-zinc-950">{product.name}</h3>
                    <p className="truncate text-sm text-zinc-500">Ref: {product.sku || '-'}</p>
                    <p className="mt-1 text-sm font-bold text-emerald-700">
                      Stock: {product.stock} · Costo: {formatMoney(product.cost)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Detalle</h2>
              <p className="text-sm text-zinc-500">{totalUnits} unidades agregadas</p>
            </div>
            <FileText className="text-emerald-600" size={24} />
          </div>

          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">
                Todavia no hay productos en esta compra.
              </p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 font-bold">{item.name}</h3>
                      <p className="text-sm text-zinc-500">Stock actual: {item.stock}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.id)}
                      className="rounded-lg border border-red-200 bg-white p-2 text-red-500 hover:bg-red-50"
                      aria-label="Eliminar producto"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-500">Cantidad</label>
                      <div className="flex overflow-hidden rounded-xl border border-zinc-300 bg-white">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.id, -1)}
                          className="px-2 hover:bg-zinc-100"
                        >
                          <Minus size={15} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.id, e.target.value)}
                          className="min-w-0 flex-1 px-2 py-2 text-center outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.id, 1)}
                          className="px-2 hover:bg-zinc-100"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>

                    <Input
                      label="Costo unitario"
                      type="number"
                      value={String(item.unitCost)}
                      onChange={(value) => updateUnitCost(item.id, value)}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
                    <span className="text-sm text-zinc-500">Subtotal</span>
                    <span className="font-black text-zinc-950">
                      {formatMoney(item.quantity * item.unitCost)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
            <Row label="Unidades" value={String(totalUnits)} />
            <Row label="Total compra" value={formatMoney(subtotal)} strong />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={clearForm}
              className="rounded-xl border border-zinc-300 px-4 py-3 font-bold text-zinc-700 hover:bg-zinc-100"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={savePurchase}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Save size={18} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </aside>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <div>
            <h2 className="text-xl font-bold">Compras recientes</h2>
            <p className="text-sm text-zinc-500">Ultimas 20 compras registradas.</p>
          </div>
          <CalendarDays className="text-emerald-600" size={24} />
        </div>

        {purchases.length === 0 ? (
          <p className="p-5 text-zinc-500">Todavia no hay compras registradas.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[1fr_160px_160px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-zinc-950">
                      {purchase.supplier_name || 'Proveedor sin nombre'}
                    </h3>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                      {purchase.invoice_number || `#${purchase.id.slice(0, 8).toUpperCase()}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{formatDateTime(purchase.created_at)}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {(purchase.purchase_items || [])
                      .map((item) => `${item.quantity} x ${item.product_name}`)
                      .join(' · ') || 'Sin detalle'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Fecha compra</p>
                  <p className="font-bold">{purchase.purchase_date}</p>
                </div>

                <div className="text-left xl:text-right">
                  <p className="text-sm text-zinc-500">Total</p>
                  <p className="text-xl font-black text-emerald-700">{formatMoney(purchase.total)}</p>
                </div>
              </div>
            ))}
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
  type = 'text',
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-600">{label}</span>
      <span className={strong ? 'text-xl font-black text-zinc-950' : 'font-bold text-zinc-950'}>
        {value}
      </span>
    </div>
  )
}
