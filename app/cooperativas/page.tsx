'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import {
  CheckCircle,
  CreditCard,
  ImageIcon,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

const COOPERATIVES = ['COOPSEMA', 'COOPSET', 'COOPECOGRAL']

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  image_url: string | null
  sale_price: number
  coop_price: number | null
  cost: number
  stock: number
  product_type: string
}

type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

type CartItem = Product & {
  cartId: string
  quantity: number
  imei: string
  discount: number
}

type CooperativeCommission = {
  cooperative_name: string
  commission_percent: number
  active: boolean
}

type LastSale = {
  saleId: string
  total: number
  cooperativeName: string
  invoiceNumber: string | null
  commissionPercent: number
  commissionAmount: number
  netReceived: number
  profitAfterCommission: number
}

type ExistingCustomer = {
  id: string
  full_name: string
  phone: string | null
  cedula: string | null
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatImei(value: string) {
  return value.replace(/\D/g, '').slice(0, 15)
}

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 10)

  if (numbers.length <= 3) return numbers
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
}

function productPrice(product: Product) {
  return Number(product.coop_price || product.sale_price || 0)
}

export default function CooperativasPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [cooperativeCommissions, setCooperativeCommissions] = useState<CooperativeCommission[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberDocument, setMemberDocument] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null)
  const [memberLookupMessage, setMemberLookupMessage] = useState('')
  const [cooperative, setCooperative] = useState(COOPERATIVES[0])
  const [customCooperative, setCustomCooperative] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastSale, setLastSale] = useState<LastSale | null>(null)
  const [visibleProductsLimit, setVisibleProductsLimit] = useState(10)

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
      .select('id, name, sku, barcode, image_url, sale_price, coop_price, cost, stock, product_type')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .in('web_visibility', ['coop', 'both'])
      .order('name')

    const { data: imagesData } = await supabase
      .from('product_images')
      .select('id, product_id, image_url, is_primary, sort_order')
      .eq('store_id', currentStoreId)
      .order('sort_order')

    const { data: storeSettings } = await supabase
      .from('stores')
      .select('cooperative_pos_products_limit')
      .eq('id', currentStoreId)
      .maybeSingle()

    const { data: commissionsData } = await supabase
      .from('cooperative_commissions')
      .select('cooperative_name, commission_percent, active')
      .eq('store_id', currentStoreId)
      .eq('active', true)

    if (productsError) alert('Error cargando productos cooperativos: ' + productsError.message)

    const configuredLimit = Number((storeSettings as { cooperative_pos_products_limit?: number } | null)?.cooperative_pos_products_limit || 10)
    setVisibleProductsLimit([5, 10, 20, 50].includes(configuredLimit) ? configuredLimit : 10)
    setProducts(productsData || [])
    setProductImages(imagesData || [])
    setCooperativeCommissions(commissionsData || [])
    setLoading(false)
  }

  function getProductMainImage(product: Product) {
    const images = productImages.filter((image) => image.product_id === product.id)
    const primary = images.find((image) => image.is_primary)

    return primary?.image_url || images[0]?.image_url || product.image_url
  }

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim()

    const matches = products.filter((product) => {
      const text = `${product.name} ${product.sku || ''} ${product.barcode || ''}`.toLowerCase()
      return query ? text.includes(query) : true
    })

    return query ? matches : matches.slice(0, visibleProductsLimit)
  }, [products, search, visibleProductsLimit])

  const selectedCooperative =
    cooperative === 'custom' ? customCooperative.trim() : cooperative

  const total = cart.reduce((sum, item) => {
    const itemTotal = productPrice(item) * item.quantity
    const discount = Number(item.discount || 0)
    return sum + Math.max(0, itemTotal - discount)
  }, 0)

  const discountTotal = cart.reduce((sum, item) => sum + Number(item.discount || 0), 0)

  const selectedCommissionPercent = Number(
    cooperativeCommissions.find(
      (item) => item.cooperative_name.toLowerCase() === selectedCooperative.toLowerCase()
    )?.commission_percent || 0
  )
  const cooperativeCommissionAmount = total * (selectedCommissionPercent / 100)
  const netReceived = Math.max(0, total - cooperativeCommissionAmount)
  const grossProfit = cart.reduce((sum, item) => {
    const itemTotal = productPrice(item) * item.quantity
    const itemFinalTotal = Math.max(0, itemTotal - Number(item.discount || 0))
    return sum + (itemFinalTotal - Number(item.cost || 0) * item.quantity)
  }, 0)
  const profitAfterCommission = grossProfit - cooperativeCommissionAmount

  function addToCart(product: Product) {
    if (product.stock <= 0) return alert('Producto agotado')

    const existing = cart.find((item) => item.id === product.id)

    if (existing && !['phone', 'tablet', 'laptop'].includes(product.product_type)) {
      changeQuantity(existing.cartId, 1)
      return
    }

    setCart([
      ...cart,
      {
        ...product,
        cartId: crypto.randomUUID(),
        quantity: 1,
        imei: '',
        discount: 0,
      },
    ])

    setSearch('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function changeQuantity(cartId: string, amount: number) {
    setCart((items) =>
      items.map((item) => {
        if (item.cartId !== cartId) return item

        const nextQuantity = Math.max(1, Math.min(item.stock, item.quantity + amount))
        return { ...item, quantity: nextQuantity }
      })
    )
  }

  function removeFromCart(cartId: string) {
    setCart(cart.filter((item) => item.cartId !== cartId))
  }

  function updateImei(cartId: string, imei: string) {
    setCart(cart.map((item) => (item.cartId === cartId ? { ...item, imei } : item)))
  }

  function updateDiscount(cartId: string, discount: string) {
    setCart(
      cart.map((item) =>
        item.cartId === cartId ? { ...item, discount: Number(discount || 0) } : item
      )
    )
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return

    e.preventDefault()
    const exactBarcode = products.find((product) => product.barcode === search.trim())

    if (exactBarcode) {
      addToCart(exactBarcode)
      return
    }

    if (filteredProducts[0]) addToCart(filteredProducts[0])
  }

  async function findExistingMember(phone: string, document: string) {
    if (!storeId) return null

    const phoneDigits = onlyDigits(phone)
    const documentDigits = onlyDigits(document)

    if (phoneDigits.length < 7 && documentDigits.length < 5) return null

    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, cedula')
      .eq('store_id', storeId)
      .limit(1000)

    if (error) {
      alert('Error buscando socio: ' + error.message)
      return null
    }

    return ((data || []) as ExistingCustomer[]).find((customer) => {
      const savedPhone = onlyDigits(customer.phone || '')
      const savedDocument = onlyDigits(customer.cedula || '')

      return (
        (phoneDigits && savedPhone === phoneDigits) ||
        (documentDigits && savedDocument === documentDigits)
      )
    }) || null
  }

  async function autocompleteMember(phone = memberPhone, document = memberDocument) {
    const match = await findExistingMember(phone, document)

    if (!match) {
      setExistingMemberId(null)
      setMemberLookupMessage('')
      return null
    }

    setExistingMemberId(match.id)
    setMemberName(match.full_name || '')
    setMemberPhone(match.phone ? formatPhone(match.phone) : formatPhone(phone))
    setMemberDocument(match.cedula || document)
    setMemberLookupMessage('Socio existente encontrado. Se usara el mismo registro.')
    return match
  }

  function newSale() {
    setLastSale(null)
    setCart([])
    setSearch('')
    setMemberName('')
    setMemberDocument('')
    setMemberPhone('')
    setExistingMemberId(null)
    setMemberLookupMessage('')
    setCooperative(COOPERATIVES[0])
    setCustomCooperative('')
    searchRef.current?.focus()
  }

  async function completeSale() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (cart.length === 0) return alert('Agrega productos al carrito')
    if (!memberName.trim()) return alert('Escribe el nombre completo del socio.')
    if (!memberDocument.trim()) return alert('Escribe la cedula o carnet del socio.')
    if (!memberPhone.trim()) return alert('Escribe el numero de telefono del socio.')
    if (!selectedCooperative) return alert('Selecciona o escribe la cooperativa.')

    for (const item of cart) {
      if (item.imei.trim().length !== 15) {
        return alert(`Debes agregar IMEI obligatorio de 15 numeros para ${item.name}`)
      }
    }

    setSaving(true)

    const existingMember =
      existingMemberId
        ? { id: existingMemberId }
        : await findExistingMember(memberPhone, memberDocument)

    let customerId = existingMember?.id || null

    if (!customerId) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          store_id: storeId,
          full_name: memberName.trim(),
          phone: memberPhone.trim(),
          cedula: memberDocument.trim(),
        })
        .select('id')
        .single()

      if (customerError) {
        setSaving(false)
        return alert('Error guardando socio: ' + customerError.message)
      }

      customerId = customer.id
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        store_id: storeId,
        customer_id: customerId,
        sale_channel: 'cooperative',
        cooperative_name: selectedCooperative,
        subtotal: total,
        discount: discountTotal,
        total,
        payment_method_id: null,
        card_fee: 0,
        cooperative_commission_percent: selectedCommissionPercent,
        cooperative_commission_amount: cooperativeCommissionAmount,
        net_received: netReceived,
        cash_received: 0,
        cash_change: 0,
        status: 'credit',
        notes: `Venta a credito cooperativa ${selectedCooperative} - Socio: ${memberName.trim()}`,
      })
      .select('id, invoice_number')
      .single()

    if (saleError) {
      setSaving(false)
      return alert('Error registrando venta cooperativa: ' + saleError.message)
    }

    const saleItems = cart.map((item) => {
      const itemTotal = productPrice(item) * item.quantity
      const discount = Number(item.discount || 0)

      return {
        sale_id: sale.id,
        store_id: storeId,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: productPrice(item),
        cost: item.cost,
        discount,
        total: Math.max(0, itemTotal - discount),
        imei: item.imei || null,
      }
    })

    const { error: itemsError } = await supabase.from('sale_items').insert(saleItems)

    if (itemsError) {
      setSaving(false)
      return alert('Error guardando productos vendidos: ' + itemsError.message)
    }

    for (const item of cart) {
      await supabase
        .from('products')
        .update({ stock: item.stock - item.quantity })
        .eq('store_id', storeId)
        .eq('id', item.id)
    }

    setLastSale({
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      total,
      cooperativeName: selectedCooperative,
      commissionPercent: selectedCommissionPercent,
      commissionAmount: cooperativeCommissionAmount,
      netReceived,
      profitAfterCommission,
    })
    setSaving(false)
    setCart([])
    setMemberName('')
    setMemberDocument('')
    setMemberPhone('')
    setExistingMemberId(null)
    setMemberLookupMessage('')
    await loadData()
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-zinc-500">Cargando POS de cooperativas...</p>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-950">POS Cooperativas</h1>
          <p className="text-zinc-600">
            Ventas a credito con precio cooperativo y descuento del inventario.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-xs font-bold uppercase text-emerald-700">Metodo de pago</p>
          <div className="mt-1 flex items-center gap-2 text-lg font-black text-emerald-800">
            <CreditCard size={20} />
            Credito
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <Search className="text-emerald-500" size={20} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar o escanear codigo de barras..."
              className="w-full bg-transparent outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={product.stock <= 0}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-40 items-center justify-center bg-zinc-100">
                  {getProductMainImage(product) ? (
                    <img
                      src={getProductMainImage(product) || ''}
                      alt={product.name}
                      className="h-full w-full object-contain p-3"
                    />
                  ) : (
                    <ImageIcon className="text-zinc-300" size={45} />
                  )}
                </div>

                <div className="p-4">
                  <h3 className="line-clamp-2 font-semibold">{product.name}</h3>
                  <p className="text-sm text-zinc-500">SKU: {product.sku || '-'}</p>

                  <p className="mt-3 text-xl font-bold text-emerald-600">
                    {formatMoney(productPrice(product))}
                  </p>

                  <p className="mt-2 text-sm">
                    {product.stock <= 0 ? (
                      <span className="text-red-500">Agotado</span>
                    ) : product.stock <= 2 ? (
                      <span className="text-orange-500">Quedan {product.stock}</span>
                    ) : (
                      <span className="text-emerald-600">Disponible: {product.stock}</span>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="text-emerald-500" />
            <h2 className="text-xl font-bold">Carrito</h2>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-bold text-emerald-800">Datos del socio</h3>

            <div className="mt-3 space-y-3">
              <CoopInput
                label="Nombre Completo"
                value={memberName}
                onChange={setMemberName}
                placeholder="Nombre del socio"
              />

              <CoopInput
                label="Cedula o Carnet"
                value={memberDocument}
                onChange={(value) => {
                  setMemberDocument(value)
                  setExistingMemberId(null)
                  setMemberLookupMessage('')
                }}
                onBlur={() => void autocompleteMember()}
                placeholder="Cedula o carnet"
              />

              <CoopInput
                label="Numero de Telefono"
                value={memberPhone}
                onChange={(value) => {
                  setMemberPhone(formatPhone(value))
                  setExistingMemberId(null)
                  setMemberLookupMessage('')
                }}
                onBlur={() => void autocompleteMember()}
                placeholder="809-000-0000"
              />

              {memberLookupMessage && (
                <p className="text-sm font-semibold text-emerald-700">{memberLookupMessage}</p>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-600">
                  Cooperativa que pertenece
                </label>
                <select
                  value={cooperative}
                  onChange={(e) => setCooperative(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                >
                  {COOPERATIVES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                  <option value="custom">Agregar otra</option>
                </select>
              </div>

              {cooperative === 'custom' && (
                <input
                  value={customCooperative}
                  onChange={(e) => setCustomCooperative(e.target.value)}
                  placeholder="Nombre de la cooperativa"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                />
              )}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {cart.length === 0 && (
              <p className="text-zinc-500">No hay productos agregados.</p>
            )}

            {cart.map((item) => {
              const itemTotal = productPrice(item) * item.quantity
              const itemFinalTotal = Math.max(0, itemTotal - Number(item.discount || 0))

              return (
                <div key={item.cartId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white">
                      {getProductMainImage(item) ? (
                        <img
                          src={getProductMainImage(item) || ''}
                          alt={item.name}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <ImageIcon className="text-zinc-300" size={24} />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{item.name}</h3>
                          <p className="text-emerald-600">{formatMoney(productPrice(item))}</p>
                        </div>

                        <button onClick={() => removeFromCart(item.cartId)} aria-label="Eliminar">
                          <Trash2 className="text-red-500" size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => changeQuantity(item.cartId, -1)}
                      className="rounded-lg bg-zinc-200 p-2 hover:bg-zinc-300"
                    >
                      <Minus size={16} />
                    </button>

                    <span className="font-bold">{item.quantity}</span>

                    <button
                      onClick={() => changeQuantity(item.cartId, 1)}
                      className="rounded-lg bg-zinc-200 p-2 hover:bg-zinc-300"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <input
                    type="number"
                    value={item.discount || ''}
                    onChange={(e) => updateDiscount(item.cartId, e.target.value)}
                    placeholder="Descuento RD$"
                    className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />

                  <input
                    value={item.imei}
                    onChange={(e) => updateImei(item.cartId, formatImei(e.target.value))}
                    placeholder="IMEI obligatorio"
                    className={`mt-3 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none ${
                      item.imei.length === 15
                        ? 'border-emerald-500'
                        : 'border-zinc-300 focus:border-emerald-500'
                    }`}
                  />

                  <p
                    className={`mt-1 text-xs font-medium ${
                      item.imei.length === 15 ? 'text-emerald-600' : 'text-zinc-500'
                    }`}
                  >
                    {item.imei.length === 15
                      ? 'IMEI valido'
                      : `${item.imei.length}/15 numeros`}
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    Total item: {formatMoney(itemFinalTotal)}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
            <BigRow label="Descuento" value={discountTotal} />
            <BigRow label={`Comision cooperativa (${selectedCommissionPercent}%)`} value={cooperativeCommissionAmount} red />
            <BigRow label="Neto despues de comision" value={netReceived} />
            <BigRow label="Ganancia estimada" value={profitAfterCommission} profit />
            <BigRow label="Total a credito" value={total} />
          </div>

          <button
            onClick={completeSale}
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Registrar credito'}
          </button>
        </aside>
      </div>

      {lastSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-center">
              <CheckCircle className="text-emerald-500" size={56} />
            </div>

            <h2 className="mt-4 text-center text-2xl font-bold">Credito registrado</h2>

            <div className="mt-5 rounded-xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Venta</p>
              <p className="font-bold">
                {lastSale.invoiceNumber || `#${lastSale.saleId.slice(0, 8).toUpperCase()}`}
              </p>

              <p className="mt-3 text-sm text-zinc-500">Cooperativa</p>
              <p className="font-bold">{lastSale.cooperativeName}</p>

              <p className="mt-3 text-sm text-zinc-500">Total</p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatMoney(lastSale.total)}
              </p>

              <p className="mt-3 text-sm text-zinc-500">Comision cooperativa ({lastSale.commissionPercent}%)</p>
              <p className="font-bold text-red-600">{formatMoney(lastSale.commissionAmount)}</p>

              <p className="mt-3 text-sm text-zinc-500">Ganancia estimada despues de comision</p>
              <p className="font-bold text-zinc-950">{formatMoney(lastSale.profitAfterCommission)}</p>
            </div>

            <button
              onClick={newSale}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600"
            >
              Nueva venta
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function BigRow({
  label,
  value,
  red,
  profit,
}: {
  label: string
  value: number
  red?: boolean
  profit?: boolean
}) {
  const valueClass = red
    ? 'font-bold text-red-600'
    : profit && value < 0
      ? 'font-bold text-red-600'
      : profit
        ? 'font-bold text-emerald-700'
        : 'font-bold text-zinc-950'

  return (
    <div className="flex justify-between gap-4 text-lg">
      <span className="text-zinc-600">{label}</span>
      <span className={valueClass}>{formatMoney(value)}</span>
    </div>
  )
}

function CoopInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

