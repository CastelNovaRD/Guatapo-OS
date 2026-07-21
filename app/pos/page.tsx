'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { logAudit } from '@/lib/audit'
import { calculateCashRegisterTotals } from '@/lib/cash-register'
import {
  CheckCircle,
  FileBadge2,
  ImageIcon,
  Minus,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
  Wallet,
} from 'lucide-react'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  image_url: string | null
  sale_price: number
  cost: number
  stock: number
  product_type: string
  category: string | null
}

type ProductCategory = {
  id: string
  name: string
}

type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

type PaymentMethod = {
  id: string
  name: string
  fee_percent: number
}

type AvailableNcf = {
  id: string
  ncf: string
}

const FALLBACK_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'virtual:cash', name: 'Efectivo', fee_percent: 0 },
  { id: 'virtual:transfer', name: 'Transferencia', fee_percent: 0 },
  { id: 'virtual:card', name: 'Tarjeta', fee_percent: 8 },
]

const CARD_FEE_PERCENT = 8
const CARD_SURCHARGE_TYPES = ['phone', 'tablet', 'laptop']

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

type CartItem = Product & {
  cartId: string
  quantity: number
  imei: string
  discount: number
}

type CashRegister = {
  id: string
  opening_amount: number
  opened_at: string
  status: string
}

type LastInvoice = {
  saleId: string
  total: number
  customerName: string
  createdAt: string
  invoiceNumber: string | null
}

type CloseSummary = {
  cashId: string
  openingAmount: number
  manualIn: number
  manualOut: number
  totalSales: number
  totalCardFee: number
  totalProfit: number
  difference: number
  closingAmount: number
  expectedCash: number
  cashSales: number
  cardSales: number
  transferSales: number
  cashRefunds: number
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

function formatPhone(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 10)

  if (numbers.length <= 3) return numbers
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`
}

function formatCedula(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 11)

  if (numbers.length <= 3) return numbers
  if (numbers.length <= 10) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 10)}-${numbers.slice(10)}`
}

function formatFiscalDocument(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 11)
  if (numbers.length === 9) return numbers
  return formatCedula(numbers)
}

function formatImei(value: string) {
  return value.replace(/\D/g, '').slice(0, 15)
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([])
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [posFeaturedProductsLimit, setPosFeaturedProductsLimit] = useState(10)
  const [productsLoading, setProductsLoading] = useState(false)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerCedula, setCustomerCedula] = useState('')
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null)
  const [customerLookupMessage, setCustomerLookupMessage] = useState('')
  const [customers, setCustomers] = useState<ExistingCustomer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [fiscalCustomerMode, setFiscalCustomerMode] = useState<'search' | 'new'>('search')
  const [fiscalLookupValue, setFiscalLookupValue] = useState('')
  const [fiscalQuoteCustomerId, setFiscalQuoteCustomerId] = useState<string | null>(null)
  const [shippingCost, setShippingCost] = useState('')
  const [fiscalSale, setFiscalSale] = useState(false)
  const [taxPercent, setTaxPercent] = useState('0')
  const [fiscalReceiptType, setFiscalReceiptType] = useState('B01')
  const [availableNcf, setAvailableNcf] = useState<AvailableNcf | null>(null)
  const [loadingNcf, setLoadingNcf] = useState(false)
  const [fiscalCustomerName, setFiscalCustomerName] = useState('')
  const [fiscalCustomerRnc, setFiscalCustomerRnc] = useState('')
  const [fiscalCustomerPhone, setFiscalCustomerPhone] = useState('')
  const [fiscalCustomerAddress, setFiscalCustomerAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [cashModal, setCashModal] = useState(false)
  const [cashReceived, setCashReceived] = useState('')
  const [productImages, setProductImages] = useState<ProductImage[]>([])

  const [openCash, setOpenCash] = useState<CashRegister | null>(null)
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [cashLoading, setCashLoading] = useState(true)
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closePreview, setClosePreview] = useState<CloseSummary | null>(null)
  const [closingProcessing, setClosingProcessing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [lastInvoice, setLastInvoice] = useState<LastInvoice | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setCashLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    await Promise.all([loadCash(currentStoreId), loadData(currentStoreId)])
  }

  async function loadCash(currentStoreId = storeId) {
    if (!currentStoreId) return

    setCashLoading(true)

    const { data, error } = await supabase
      .from('cash_registers')
      .select('id, opening_amount, opened_at, status')
      .eq('store_id', currentStoreId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('[Caja] Error cargando caja abierta en POS:', error.message)
      setCashLoading(false)
      return alert('No se pudo verificar la caja. Reintentando...')
    }

    setOpenCash(data || null)
    setCashLoading(false)
  }

  async function loadData(currentStoreId = storeId) {
    if (!currentStoreId) return

    const [
      { data: methodsData, error: methodsError },
      { data: customersData },
      { data: categoriesData },
      { data: storeData },
    ] = await Promise.all([
      supabase
        .from('payment_methods')
        .select('id, name, fee_percent')
        .eq('active', true)
        .order('fee_percent'),
      supabase
        .from('customers')
        .select('id, full_name, phone, cedula')
        .eq('store_id', currentStoreId)
        .order('full_name'),
      supabase
        .from('categories')
        .select('id, name')
        .eq('store_id', currentStoreId)
        .eq('active', true)
        .order('name'),
      supabase
        .from('stores')
        .select('pos_featured_products_limit')
        .eq('id', currentStoreId)
        .maybeSingle(),
    ])

    const configuredLimit = Number((storeData as { pos_featured_products_limit?: number } | null)?.pos_featured_products_limit || 10)
    const safeLimit = [5, 10, 20, 50].includes(configuredLimit) ? configuredLimit : 10
    setPosFeaturedProductsLimit(safeLimit)

    const nextPaymentMethods =
      methodsError || !methodsData?.length ? FALLBACK_PAYMENT_METHODS : methodsData

    setPaymentMethods(nextPaymentMethods)
    setCustomers((customersData || []) as ExistingCustomer[])
    setProductCategories(categoriesData || [])

    if (nextPaymentMethods.length) setPaymentMethodId(nextPaymentMethods[0].id)
    await loadPosProducts(currentStoreId, safeLimit)
  }

  async function loadPosProducts(currentStoreId = storeId, limit = posFeaturedProductsLimit) {
    if (!currentStoreId) return

    setProductsLoading(true)
    const cleanSearch = debouncedSearch.replace(/[%_]/g, '').trim()
    let productsData: Product[] = []

    if (!cleanSearch && !categoryFilter) {
      const { data, error } = await supabase.rpc('get_pos_featured_products', {
        p_store_id: currentStoreId,
        p_limit: limit,
      })

      if (!error && data) productsData = data as Product[]

      if (error) {
        const { data: fallbackData } = await supabase
          .from('products')
          .select('id, name, sku, barcode, image_url, sale_price, cost, stock, product_type, category')
          .eq('store_id', currentStoreId)
          .eq('active', true)
          .gt('stock', 0)
          .order('name')
          .limit(limit)

        productsData = fallbackData || []
      }
    } else {
      let query = supabase
        .from('products')
        .select('id, name, sku, barcode, image_url, sale_price, cost, stock, product_type, category')
        .eq('store_id', currentStoreId)
        .eq('active', true)
        .gt('stock', 0)

      if (cleanSearch) {
        query = query.or(`name.ilike.%${cleanSearch}%,sku.ilike.%${cleanSearch}%,barcode.ilike.%${cleanSearch}%,category.ilike.%${cleanSearch}%`)
      }

      if (categoryFilter) query = query.eq('category', categoryFilter)

      const { data } = await query.order('name').limit(50)
      productsData = data || []
    }

    setProducts(productsData)

    const productIds = productsData.map((product) => product.id)
    if (productIds.length > 0) {
      const { data: imagesData } = await supabase
        .from('product_images')
        .select('id, product_id, image_url, is_primary, sort_order')
        .eq('store_id', currentStoreId)
        .in('product_id', productIds)
        .order('sort_order')

      setProductImages(imagesData || [])
    } else {
      setProductImages([])
    }

    setProductsLoading(false)
  }

  async function loadNextAvailableNcf(type = fiscalReceiptType) {
    if (!storeId) return

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
      return alert('No pude cargar comprobantes disponibles. Revisa Ventas > Comprobantes.')
    }

    setAvailableNcf(data || null)
  }

function getProductMainImage(product: Product) {
  const images = productImages.filter(
    (img) => img.product_id === product.id
  )

  const primary = images.find((img) => img.is_primary)

  return primary?.image_url || images[0]?.image_url || product.image_url
}

  async function openRegister() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const { error } = await supabase.from('cash_registers').insert({
      store_id: storeId,
      opening_amount: Number(openingAmount || 0),
      status: 'open',
    })

    if (error) return alert('Error abriendo caja: ' + error.message)

    await logAudit({
      storeId,
      module: 'caja',
      action: 'open',
      entityType: 'cash_register',
      summary: 'Caja abierta con ' + String(openingAmount || 0) + '.',
      afterData: { openingAmount: Number(openingAmount || 0) },
    })

    setOpeningAmount('')
    await loadCash()
  }

  async function calculateCloseSummary(countedCash: number): Promise<CloseSummary | null> {
    if (!openCash || !storeId) return null

    const { data: currentCash, error: cashError } = await supabase
      .from('cash_registers')
      .select('id, status, opening_amount')
      .eq('store_id', storeId)
      .eq('id', openCash.id)
      .maybeSingle()

    if (cashError) {
      setCloseError('Error verificando caja: ' + cashError.message)
      return null
    }

    if (!currentCash || currentCash.status !== 'open') {
      setCloseError('Esta caja ya fue cerrada.')
      return null
    }

    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, total, card_fee, cash_received, cash_change, payment_method_id')
      .eq('store_id', storeId)
      .eq('cash_register_id', openCash.id)

    if (salesError) {
      setCloseError('Error cargando ventas: ' + salesError.message)
      return null
    }

    const saleIds = sales?.map((sale) => sale.id) || []
    const methodIds = Array.from(new Set((sales || []).map((sale) => sale.payment_method_id).filter(Boolean))) as string[]
    const paymentMethodMap = new Map<string, string>()

    if (methodIds.length > 0) {
      const { data: methodRows } = await supabase
        .from('payment_methods')
        .select('id, name')
        .in('id', methodIds)

      ;(methodRows || []).forEach((method) => paymentMethodMap.set(method.id, method.name || ''))
    }

    let creditNoteRefunds: { total: number; refund_method: string | null }[] = []

    if (saleIds.length > 0) {
      const { data: refundRows } = await supabase
        .from('credit_notes')
        .select('total, refund_method')
        .eq('store_id', storeId)
        .in('sale_id', saleIds)

      creditNoteRefunds = refundRows || []
    }

    let totalProfit = 0

    if (saleIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('cost, quantity, total')
        .in('sale_id', saleIds)

      if (itemsError) {
        setCloseError('Error calculando ganancias: ' + itemsError.message)
        return null
      }

      totalProfit =
        items?.reduce((sum, item) => {
          return (
            sum +
            (Number(item.total || 0) -
              Number(item.cost || 0) * Number(item.quantity || 1))
          )
        }, 0) || 0
    }

    const cashTotals = calculateCashRegisterTotals({
      openingAmount: Number(currentCash.opening_amount || 0),
      countedCash,
      sales: sales || [],
      refunds: creditNoteRefunds,
      paymentMethods: paymentMethodMap,
    })
    const totalCardFee = cashTotals.totalCardFee

    return {
      cashId: openCash.id,
      openingAmount: Number(currentCash.opening_amount || 0),
      manualIn: 0,
      manualOut: 0,
      totalSales: cashTotals.expectedCash,
      totalCardFee,
      totalProfit: Math.max(0, totalProfit - totalCardFee),
      difference: cashTotals.difference,
      closingAmount: countedCash,
      expectedCash: cashTotals.expectedCash,
      cashSales: cashTotals.cashSales,
      cardSales: cashTotals.cardSales,
      transferSales: cashTotals.transferSales,
      cashRefunds: cashTotals.cashRefunds,
    }
  }

  async function openCloseRegisterPanel() {
    if (!openCash) return
    setClosingAmount('')
    setCloseError('')
    setCloseModalOpen(true)
    const summary = await calculateCloseSummary(0)
    if (summary) setClosePreview(summary)
  }

  function isValidClosingAmount() {
    if (closingAmount.trim() === '') return false
    const counted = Number(closingAmount)
    return Number.isFinite(counted) && counted >= 0
  }

  async function closeRegister({ printAfterClose = false }: { printAfterClose?: boolean } = {}) {
    if (!openCash || !storeId) return
    if (!isValidClosingAmount()) {
      setCloseError('Debes ingresar el monto contado antes de cerrar la caja.')
      return
    }
    if (closingProcessing) return

    setClosingProcessing(true)
    setCloseError('')

    const counted = Number(closingAmount)
    const summary = await calculateCloseSummary(counted)

    if (!summary) {
      setClosingProcessing(false)
      return
    }

    const { data: closedCash, error } = await supabase
      .from('cash_registers')
      .update({
        closing_amount: counted,
        total_sales: summary.expectedCash,
        total_card_fee: summary.totalCardFee,
        total_profit: summary.totalProfit,
        difference: summary.difference,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('id', openCash.id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle()

    if (error) {
      setClosingProcessing(false)
      setCloseError('Error cerrando caja: ' + error.message)
      return
    }

    if (!closedCash) {
      setClosingProcessing(false)
      setCloseError('Esta caja ya fue cerrada.')
      return
    }

    await logAudit({
      storeId,
      module: 'caja',
      action: 'close',
      entityType: 'cash_register',
      entityId: openCash.id,
      summary: 'Caja cerrada. Conteo: ' + counted + '. Descuadre: ' + summary.difference + '.',
      afterData: { counted, totalSales: summary.expectedCash, totalCardFee: summary.totalCardFee, totalProfit: summary.totalProfit, difference: summary.difference, cashTotals: summary },
    })

    setCloseSummary(summary)
    setClosePreview(null)
    setCloseModalOpen(false)
    setOpenCash(null)
    setClosingAmount('')
    setCart([])
    window.dispatchEvent(new Event('guatapo:cash-updated'))

    if (printAfterClose) window.open(`/cuadres/${summary.cashId}/imprimir`, '_blank')

    await loadCash()
    setClosingProcessing(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (storeId) void loadPosProducts(storeId)
  }, [storeId, debouncedSearch, categoryFilter, posFeaturedProductsLimit])

  const categoryOptions = useMemo(() => {
    const names = new Set<string>()
    productCategories.forEach((category) => {
      if (category.name?.trim()) names.add(category.name.trim())
    })
    products.forEach((product) => {
      if (product.category?.trim()) names.add(product.category.trim())
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [productCategories, products])

  const filteredProducts = products

  const requiresCustomer = cart.some((item) =>
    ['phone', 'tablet', 'laptop'].includes(item.product_type)
  )

  const subtotal = cart.reduce((sum, item) => {
    const itemTotal = Number(item.sale_price) * item.quantity
    const discount = Number(item.discount || 0)
    return sum + Math.max(0, itemTotal - discount)
  }, 0)

  const selectedPaymentMethod = paymentMethods.find(
    (method) => method.id === paymentMethodId
  )

  const selectedPaymentName = selectedPaymentMethod?.name?.toLowerCase() || ''
  const isCardPayment = selectedPaymentName.includes('tarjeta') || paymentMethodId.includes('card')
  const shipping = Number(shippingCost || 0)
  const cardSurcharge = useMemo(() => {
    if (!isCardPayment) return 0

    return cart.reduce((sum, item) => {
      if (!shouldChargeCardSurcharge(item)) return sum

      const itemTotal = Number(item.sale_price) * item.quantity
      const discount = Number(item.discount || 0)
      return sum + Math.max(0, itemTotal - discount) * (CARD_FEE_PERCENT / 100)
    }, 0)
  }, [cart, isCardPayment])

  const normalizedTaxPercent = Math.min(100, Math.max(0, Number(taxPercent || 0) || 0))
  const taxAmount = fiscalSale ? subtotal * (normalizedTaxPercent / 100) : 0
  const totalBeforeShipping = subtotal + cardSurcharge + taxAmount
  const total = totalBeforeShipping + shipping
  const cardFee = useMemo(() => {
    if (!isCardPayment) return 0
    return (subtotal + taxAmount) * (CARD_FEE_PERCENT / 100)
  }, [subtotal, taxAmount, isCardPayment])

  const netReceived = total - cardFee
  const isCashPayment = selectedPaymentName.includes('efectivo')
  const changeAmount = Number(cashReceived || 0) - total


  const customerOptions = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    if (!query) return customers.slice(0, 8)
    const queryDigits = onlyDigits(query)
    return customers.filter((customer) => {
      const text = `${customer.full_name || ''} ${customer.phone || ''} ${customer.cedula || ''}`.toLowerCase()
      return text.includes(query) || (queryDigits ? `${onlyDigits(customer.phone || '')} ${onlyDigits(customer.cedula || '')}`.includes(queryDigits) : false)
    }).slice(0, 8)
  }, [customers, customerSearch])
  function shouldChargeCardSurcharge(item: CartItem) {
    return CARD_SURCHARGE_TYPES.includes(item.product_type) || Number(item.sale_price || 0) > 5000
  }

  function getCartItemUnitPrice(item: CartItem) {
    const basePrice = Number(item.sale_price || 0)
    return isCardPayment && shouldChargeCardSurcharge(item)
      ? basePrice * (1 + CARD_FEE_PERCENT / 100)
      : basePrice
  }

  function addToCart(product: Product) {
    if (product.stock <= 0) return alert('Producto agotado')

    const existing = cart.find((item) => item.id === product.id)

    if (
      existing &&
      !['phone', 'tablet', 'laptop'].includes(product.product_type)
    ) {
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
      items.map((item) =>
        item.cartId === cartId
          ? { ...item, quantity: Math.max(1, item.quantity + amount) }
          : item
      )
    )
  }

  function removeFromCart(cartId: string) {
    setCart(cart.filter((item) => item.cartId !== cartId))
  }

  function updateImei(cartId: string, imei: string) {
    setCart(cart.map((item) => item.cartId === cartId ? { ...item, imei } : item))
  }


  function updateTaxPercent(value: string) {
    if (value === '') {
      setTaxPercent('')
      return
    }
    const next = Math.min(100, Math.max(0, Number(value) || 0))
    setTaxPercent(String(next))
  }
  function updateDiscount(cartId: string, discount: string) {
    setCart(
      cart.map((item) =>
        item.cartId === cartId
          ? { ...item, discount: Number(discount || 0) }
          : item
      )
    )
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()

      const exactBarcode = products.find(
        (p) => p.barcode && p.barcode === search.trim()
      )

      if (exactBarcode) {
        addToCart(exactBarcode)
        return
      }

      if (filteredProducts[0]) addToCart(filteredProducts[0])
    }
  }

  function printInvoice() {
    window.print()
  }

  async function findExistingCustomer(phone: string, cedula: string) {
    if (!storeId) return null

    const phoneDigits = onlyDigits(phone)
    const cedulaDigits = onlyDigits(cedula)

    if (phoneDigits.length < 7 && cedulaDigits.length < 5) return null

    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, phone, cedula')
      .eq('store_id', storeId)
      .limit(1000)

    if (error) {
      alert('Error buscando cliente: ' + error.message)
      return null
    }

    return ((data || []) as ExistingCustomer[]).find((customer) => {
      const savedPhone = onlyDigits(customer.phone || '')
      const savedCedula = onlyDigits(customer.cedula || '')

      return (
        (phoneDigits && savedPhone === phoneDigits) ||
        (cedulaDigits && savedCedula === cedulaDigits)
      )
    }) || null
  }

  function selectCustomer(customer: ExistingCustomer) {
    setExistingCustomerId(customer.id)
    setCustomerName(customer.full_name || '')
    setCustomerPhone(customer.phone ? formatPhone(customer.phone) : '')
    setCustomerCedula(customer.cedula ? formatCedula(customer.cedula) : '')
    setCustomerSearch(customer.full_name || '')
    setFiscalCustomerName(customer.full_name || '')
    setFiscalCustomerRnc(customer.cedula || '')
    setFiscalCustomerPhone(customer.phone ? formatPhone(customer.phone) : '')
    setCustomerLookupMessage('Cliente existente encontrado. Se usara el mismo registro.')
  }

  async function autocompleteCustomer(phone = customerPhone, cedula = customerCedula) {
    const match = await findExistingCustomer(phone, cedula)

    if (!match) {
      setExistingCustomerId(null)
      setCustomerLookupMessage('')
      return null
    }

    selectCustomer(match)
    return match
  }

  async function searchFiscalCustomer() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const documentValue = fiscalLookupValue.trim()
    const documentDigits = onlyDigits(documentValue)

    if (documentDigits.length < 5) {
      return alert('Escribe un RNC o cedula para buscar el cliente.')
    }

    const match = await findExistingCustomer('', documentValue)

    if (match) {
      selectCustomer(match)
      setFiscalCustomerMode('search')
      setCustomerLookupMessage('Cliente registrado encontrado. Se usara para esta factura.')
      return
    }

    const { data: quoteCustomersData, error: quoteCustomersError } = await supabase
      .from('quote_customers')
      .select('id, company_name, rnc, phone, address')
      .eq('store_id', storeId)
      .limit(1000)

    if (quoteCustomersError) {
      return alert('Error buscando cliente fiscal: ' + quoteCustomersError.message)
    }

    const fiscalMatch = (quoteCustomersData || []).find((customer) => {
      return onlyDigits(customer.rnc || '') === documentDigits
    })

    if (fiscalMatch) {
      const fiscalDocument = formatFiscalDocument(fiscalMatch.rnc || documentValue)
      const fiscalPhone = fiscalMatch.phone ? formatPhone(fiscalMatch.phone) : ''

      setFiscalQuoteCustomerId(fiscalMatch.id)
      setExistingCustomerId(null)
      setCustomerSearch(fiscalMatch.company_name || '')
      setCustomerName(fiscalMatch.company_name || '')
      setCustomerPhone(fiscalPhone)
      setCustomerCedula(fiscalDocument)
      setFiscalCustomerName(fiscalMatch.company_name || '')
      setFiscalCustomerRnc(fiscalDocument)
      setFiscalCustomerPhone(fiscalPhone)
      setFiscalCustomerAddress(fiscalMatch.address || '')
      setFiscalCustomerMode('search')
      setCustomerLookupMessage('Cliente fiscal registrado encontrado. Se usara para esta factura.')
      return
    }

    setExistingCustomerId(null)
    setFiscalQuoteCustomerId(null)
    setCustomerSearch('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerCedula(formatFiscalDocument(documentValue))
    setFiscalCustomerName('')
    setFiscalCustomerRnc(formatFiscalDocument(documentValue))
    setFiscalCustomerPhone('')
    setFiscalCustomerAddress('')
    setFiscalCustomerMode('new')
    setCustomerLookupMessage('No encontramos ese cliente. Completa los datos para agregarlo.')
  }
  function newSale() {
    setLastInvoice(null)
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setCustomerCedula('')
    setExistingCustomerId(null)
    setCustomerLookupMessage('')
    setShippingCost('')
    setFiscalSale(false)
    setAvailableNcf(null)
    setFiscalCustomerName('')
    setFiscalCustomerRnc('')
    setFiscalCustomerPhone('')
    setFiscalCustomerAddress('')
    searchRef.current?.focus()
  }

  function handleInvoiceClick() {
  if (cart.length === 0) return alert('Agrega productos al carrito')

  if (isCashPayment) {
    setCashReceived('')
    setCashModal(true)
    return
  }

  completeSale()
}

  async function completeSale() {
    if (!openCash) return alert('Debes abrir caja antes de facturar.')
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (cart.length === 0) return alert('Agrega productos al carrito')

    if (requiresCustomer && (!customerName.trim() || !customerPhone.trim())) {
      return alert('Para celulares, tablets y laptops debes agregar nombre y teléfono')
    }

    if (fiscalSale && !customerName.trim()) {
      return alert('Selecciona un cliente para emitir una venta con comprobante.')
    }

    if (fiscalSale && !customerCedula.trim() && !fiscalCustomerRnc.trim()) {
      return alert('Para venta con comprobante debes completar RNC o cédula del cliente.')
    }

    if (fiscalSale) {
      if (!availableNcf) {
        return alert('No hay NCF disponible para este tipo de comprobante.')
      }
      if (!customerName.trim() || (!customerCedula.trim() && !fiscalCustomerRnc.trim())) {
        return alert('Selecciona un cliente para emitir una venta con comprobante.')
      }

      if (!availableNcf.ncf.startsWith(fiscalReceiptType)) {
        return alert(`El NCF disponible no corresponde al tipo ${fiscalReceiptType}.`)
      }
    }

    for (const item of cart) {
      if (['phone', 'tablet'].includes(item.product_type) && item.imei.trim().length !== 15) {
        return alert(`Debes agregar IMEI para ${item.name}`)
      }
    }

    setSaving(true)

    let customerId: string | null = null

    if (requiresCustomer || fiscalSale) {
      if (fiscalQuoteCustomerId) {
        customerId = null
      } else {
        const existingCustomer =
          existingCustomerId
            ? { id: existingCustomerId }
            : await findExistingCustomer(customerPhone, customerCedula)

        if (existingCustomer) {
          customerId = existingCustomer.id
        } else {
          const { data: customer, error } = await supabase
            .from('customers')
            .insert({
              store_id: storeId,
              full_name: customerName.trim(),
              phone: customerPhone.trim(),
              cedula: customerCedula.trim() || null,
            })
            .select('id')
            .single()

          if (error) {
            setSaving(false)
            return alert(error.message)
          }

          customerId = customer.id
        }
      }
    }

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        store_id: storeId,
        cash_register_id: openCash.id,
        customer_id: customerId,
        sale_channel: 'pos',
        subtotal,
        discount: cart.reduce((sum, item) => sum + Number(item.discount || 0), 0),
        itbis: taxAmount,
        total,
        shipping_cost: shipping,
        payment_method_id: paymentMethodId.startsWith('virtual:') ? null : paymentMethodId || null,
        card_fee: cardFee,
        net_received: netReceived,
        cash_received: isCashPayment ? Number(cashReceived || 0) : 0,
        cash_change: isCashPayment ? changeAmount : 0,
        status: 'paid',
        ncf: fiscalSale ? availableNcf?.ncf : null,
        fiscal_receipt_type: fiscalSale ? fiscalReceiptType : null,
        fiscal_status: fiscalSale ? 'ready_to_send' : 'not_applicable',
        fiscal_customer_name: fiscalSale ? fiscalCustomerName.trim() : null,
        fiscal_customer_rnc: fiscalSale ? fiscalCustomerRnc.trim() : null,
        fiscal_customer_phone: fiscalSale ? fiscalCustomerPhone.trim() || null : null,
        fiscal_customer_address: fiscalSale ? fiscalCustomerAddress.trim() || null : null,
        notes: fiscalSale ? 'Venta POS con comprobante fiscal' : requiresCustomer ? 'Venta con datos del cliente' : 'Factura rápida',
      })
      .select('id, invoice_number, created_at')
      .single()

    if (saleError) {
      setSaving(false)
      return alert(saleError.message)
    }

    const saleItems = cart.map((item) => {
      const unitPrice = getCartItemUnitPrice(item)
      const itemTotal = unitPrice * item.quantity
      const discount = Number(item.discount || 0)

      return {
        sale_id: sale.id,
        store_id: storeId,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: unitPrice,
        cost: item.cost,
        discount,
        total: Math.max(0, itemTotal - discount),
        imei: item.imei || null,
      }
    })

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems)

    if (itemsError) {
      setSaving(false)
      return alert(itemsError.message)
    }

    for (const item of cart) {
      await supabase
        .from('products')
        .update({ stock: item.stock - item.quantity })
        .eq('store_id', storeId)
        .eq('id', item.id)
    }

    if (fiscalSale && availableNcf) {
      const { error: ncfError } = await supabase
        .from('ncf_receipts')
        .update({
          status: 'used',
          used_sale_id: sale.id,
          used_company_name: fiscalCustomerName.trim(),
          used_customer_rnc: fiscalCustomerRnc.trim(),
          used_at: new Date().toISOString(),
        })
        .eq('store_id', storeId)
        .eq('id', availableNcf.id)

      if (ncfError) {
        setSaving(false)
        return alert('Factura creada, pero no pude marcar el NCF como usado: ' + ncfError.message)
      }
    }
    await logAudit({
      storeId,
      module: 'pos',
      action: fiscalSale ? 'sale.fiscal.create' : 'sale.quick.create',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Venta POS ${sale.invoice_number || sale.id} por ${total}.`,
      afterData: { invoiceNumber: sale.invoice_number, total, subtotal, taxAmount, cardFee, shipping, ncf: fiscalSale ? availableNcf?.ncf : null },
    })

    setLastInvoice({
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      total,
      customerName: customerName || fiscalCustomerName || 'Consumidor Final',
      createdAt: sale.created_at,
    })

    setSaving(false)
    loadData()
  }

  if (cashLoading) {
    return (
      <AppShell defaultSidebarOpen={false} showSidebarToggle>
        <p className="text-zinc-500">Cargando POS...</p>
      </AppShell>
    )
  }

  if (!openCash) {
    return (
      <AppShell defaultSidebarOpen={false} showSidebarToggle>
        <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Wallet size={32} />
            </div>
          </div>

          <h1 className="mt-5 text-center text-3xl font-bold">POS de Venta</h1>
          <p className="mt-2 text-center text-zinc-500">
            La caja está cerrada. Debes abrir caja antes de facturar.
          </p>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-zinc-600">
              Efectivo inicial
            </label>
            <input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              placeholder="Ej: 5000"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
            />
          </div>

          <button
            onClick={openRegister}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600"
          >
            Abrir caja
          </button>
        </div>

        {closeModalOpen && (
        <CloseRegisterModal
          summary={closePreview}
          amount={closingAmount}
          error={closeError}
          processing={closingProcessing}
          onAmountChange={(value) => {
            setClosingAmount(value)
            setCloseError('')
          }}
          onCancel={() => {
            if (closingProcessing) return
            setCloseModalOpen(false)
            setClosePreview(null)
            setClosingAmount('')
            setCloseError('')
          }}
          onCloseWithoutPrint={() => closeRegister({ printAfterClose: false })}
          onPrintAndClose={() => closeRegister({ printAfterClose: true })}
        />
      )}
      {closeSummary && (
          <CloseSummaryModal
            summary={closeSummary}
            onClose={() => setCloseSummary(null)}
          />
        )}
      </AppShell>
    )
  }

  return (
    <AppShell defaultSidebarOpen={false} showSidebarToggle>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-950">POS de Venta</h1>
          <p className="text-zinc-500">
            Caja abierta desde{' '}
{new Date(openCash.opened_at).toLocaleString('es-DO', {
  timeZone: 'America/Santo_Domingo',
  dateStyle: 'short',
  timeStyle: 'short',
})}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/ventas/notas-credito"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-100"
          >
            <FileBadge2 size={18} />
            Nota de crédito
          </Link>

          <Link
            href="/ventas/cambios"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-100"
          >
            <RefreshCcw size={18} />
            Cambio
          </Link>
          <button
            onClick={openCloseRegisterPanel}
            className="rounded-xl bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-600"
          >
            Cerrar caja
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
                    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
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
            <label className="block rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500">Categoria</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-transparent font-semibold text-zinc-950 outline-none"
              >
                <option value="">Todas las categorias</option>
                {categoryOptions.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>{categoryName}</option>
                ))}
              </select>
            </label>
          </div>

          {productsLoading ? (
            <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-500 shadow-sm">Cargando productos...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-500 shadow-sm">No se encontraron productos.</p>
          ) : (
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
                    RD${Number(product.sale_price).toLocaleString()}
                  </p>

                  <p className="mt-2 text-sm">
                    {product.stock <= 0 ? (
                      <span className="text-red-500">Agotado</span>
                    ) : product.stock <= 2 ? (
                      <span className="text-orange-500">Quedan {product.stock}</span>
                    ) : (
                      <span className="text-emerald-600">
                        Disponible: {product.stock}
                      </span>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
          )}
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="text-emerald-500" />
            <h2 className="text-xl font-bold">Carrito</h2>
          </div>

          <div className="space-y-4">
            {cart.length === 0 && (
              <p className="text-zinc-500">No hay productos agregados.</p>
            )}

            {cart.map((item) => {
              const unitPrice = getCartItemUnitPrice(item)
              const itemTotal = unitPrice * item.quantity
              const itemFinalTotal = Math.max(
                0,
                itemTotal - Number(item.discount || 0)
              )
              const hasCardSurcharge = isCardPayment && shouldChargeCardSurcharge(item)

              return (
                <div
                  key={item.cartId}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
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
                          <p className="text-emerald-600">
                            RD${unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                          {hasCardSurcharge && (
                            <p className="text-xs font-semibold text-orange-600">
                              Incluye 8% tarjeta
                            </p>
                          )}
                        </div>

                        <button onClick={() => removeFromCart(item.cartId)}>
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

                  <p className="mt-2 text-sm text-zinc-500">
                    Total item: RD${itemFinalTotal.toLocaleString()}
                  </p>

                  {['phone', 'tablet', 'laptop'].includes(item.product_type) && (
                    <div className="mt-3">
                   <input
                    value={item.imei}
                     onChange={(e) => updateImei(item.cartId, formatImei(e.target.value))}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                         e.preventDefault()

                        if (['phone', 'tablet'].includes(item.product_type)) {
                           if (item.imei.length !== 15) {
                            alert('El IMEI debe tener exactamente 15 números')
                           return
                          }

          searchRef.current?.focus()
        }
      }
    }}
    placeholder={
      item.product_type === 'laptop'
        ? 'Escanear serial laptop opcional'
        : 'Escanear IMEI obligatorio'
    }
    className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none ${
      item.imei.length === 15
        ? 'border-emerald-500'
        : 'border-zinc-300 focus:border-emerald-500'
    }`}
  />

  {['phone', 'tablet'].includes(item.product_type) && (
    <p
      className={`mt-1 text-xs font-medium ${
        item.imei.length === 15 ? 'text-emerald-600' : 'text-zinc-500'
      }`}
    >
      {item.imei.length === 15
        ? 'IMEI válido'
        : `${item.imei.length}/15 números`}
    </p>
  )}
</div>
                  )}
                </div>
              )
            })}
          </div>

          {requiresCustomer && !fiscalSale && (
            <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-700">Datos del cliente</h3>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente *"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
              />

              <input
                value={customerPhone}
                onChange={(e) => {
                  const nextPhone = formatPhone(e.target.value)
                  setCustomerPhone(nextPhone)
                  setExistingCustomerId(null)
                  setCustomerLookupMessage('')
                }}
                onBlur={() => void autocompleteCustomer()}
                placeholder="Teléfono *"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
              />

              <input
                value={customerCedula}
                onChange={(e) => {
                  const nextCedula = formatCedula(e.target.value)
                  setCustomerCedula(nextCedula)
                  setExistingCustomerId(null)
                  setCustomerLookupMessage('')
                }}
                onBlur={() => void autocompleteCustomer()}
                placeholder="Cedula opcional"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
              />
              {customerLookupMessage && (
                <p className="text-sm font-semibold text-emerald-700">{customerLookupMessage}</p>
              )}
            </div>
          )}
          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-center gap-3 font-bold text-zinc-800">
              <input
                type="checkbox"
                checked={fiscalSale}
                onChange={(event) => {
                  const checked = event.target.checked
                  setFiscalSale(checked)
                  if (checked) {
                    setTaxPercent('18')
                    loadNextAvailableNcf(fiscalReceiptType)
                  }
                  if (!checked) {
                    setTaxPercent('0')
                    setAvailableNcf(null)
                  }
                }}
                className="h-5 w-5 accent-emerald-600"
              />
              Venta con comprobante
            </label>

            {fiscalSale && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-2 block text-sm text-zinc-500">
                    Tipo de comprobante
                  </label>
                  <select
                    value={fiscalReceiptType}
                    onChange={(event) => {
                      const nextType = event.target.value
                      setFiscalReceiptType(nextType)
                      setAvailableNcf(null)
                      loadNextAvailableNcf(nextType)
                    }}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                  >
                    {FISCAL_RECEIPT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFiscalCustomerMode('search')
                        setCustomerLookupMessage('')
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${fiscalCustomerMode === 'search' ? 'bg-emerald-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}
                    >
                      Buscar registrado
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFiscalCustomerMode('new')
                        setExistingCustomerId(null)
                        setCustomerLookupMessage('')
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${fiscalCustomerMode === 'new' ? 'bg-emerald-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}
                    >
                      Agregar nuevo
                    </button>
                  </div>

                  {fiscalCustomerMode === 'search' ? (
                    <div>
                      <label className="mb-2 block text-sm text-zinc-500">
                        Cliente registrado
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={fiscalLookupValue}
                          onChange={(event) => setFiscalLookupValue(event.target.value)}
                          placeholder="Buscar por RNC o cedula"
                          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => void searchFiscalCustomer()}
                          className="rounded-xl bg-zinc-950 px-4 py-3 font-bold text-white hover:bg-zinc-800"
                        >
                          Buscar
                        </button>
                      </div>

                      {existingCustomerId && (
                        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-zinc-900">{customerName}</p>
                              <p className="mt-1 text-zinc-600">RNC/Cedula: {customerCedula || fiscalCustomerRnc || '-'}</p>
                              <p className="text-zinc-600">Telefono: {customerPhone || fiscalCustomerPhone || '-'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExistingCustomerId(null)
                                setFiscalLookupValue('')
                                setCustomerSearch('')
                                setCustomerName('')
                                setCustomerPhone('')
                                setCustomerCedula('')
                                setFiscalCustomerName('')
                                setFiscalCustomerRnc('')
                                setFiscalCustomerPhone('')
                                setFiscalCustomerAddress('')
                              }}
                              className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                            >
                              Cambiar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-zinc-700">Nuevo cliente fiscal</label>
                      <input
                        value={fiscalCustomerName}
                        onChange={(event) => {
                          setFiscalCustomerName(event.target.value)
                          setCustomerName(event.target.value)
                        }}
                        placeholder="Nombre o razon social *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
                      />
                      <input
                        value={fiscalCustomerPhone}
                        onChange={(event) => {
                          const nextPhone = formatPhone(event.target.value)
                          setFiscalCustomerPhone(nextPhone)
                          setCustomerPhone(nextPhone)
                        }}
                        onBlur={() => void autocompleteCustomer(customerPhone, customerCedula)}
                        placeholder="Telefono *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
                      />
                      <input
                        value={fiscalCustomerRnc}
                        onChange={(event) => {
                          const nextDocument = formatFiscalDocument(event.target.value)
                          setFiscalCustomerRnc(nextDocument)
                          setCustomerCedula(nextDocument)
                        }}
                        onBlur={() => void autocompleteCustomer(customerPhone, customerCedula)}
                        placeholder="RNC o cedula *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
                      />
                      <input
                        value={fiscalCustomerAddress}
                        onChange={(event) => setFiscalCustomerAddress(event.target.value)}
                        placeholder="Direccion"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {customerLookupMessage && (
                    <p className="text-sm font-semibold text-emerald-700">{customerLookupMessage}</p>
                  )}
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white p-3">
                  <p className="text-sm text-zinc-500">NCF disponible</p>
                  <p className="mt-1 font-black text-emerald-700">
                    {loadingNcf ? 'Cargando...' : availableNcf?.ncf || 'No hay NCF disponible'}
                  </p>
                  <button
                    type="button"
                    onClick={() => loadNextAvailableNcf()}
                    className="mt-2 text-sm font-bold text-emerald-700 hover:text-emerald-800"
                  >
                    Actualizar NCF
                  </button>
                </div>

              </div>
            )}
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm text-zinc-500">
              Método de pago
            </label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
            >
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {Number(method.fee_percent) > 0
                    ? `${method.name} - ${Number(method.fee_percent)}%`
                    : method.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm text-zinc-500">
              Envío
            </label>
            <input
              type="number"
              min="0"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="Costo del envío"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4">
            <BigRow label={fiscalSale ? 'Subtotal' : 'Productos'} value={subtotal} />
            {fiscalSale && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <label className="mb-2 block text-sm font-bold text-emerald-800">ITBIS (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxPercent}
                  onChange={(event) => updateTaxPercent(event.target.value)}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-emerald-500"
                />
                <div className="mt-3 space-y-2">
                  <BigRow label="ITBIS calculado" value={taxAmount} />
                  <p className="text-xs font-semibold text-emerald-700">Se aplica sobre el subtotal de productos despues de descuentos.</p>
                </div>
              </div>
            )}
            {cardSurcharge > 0 && <BigRow label="Recargo tarjeta al cliente" value={cardSurcharge} />}
            {shipping > 0 && <BigRow label="Envío" value={shipping} />}
            <BigRow label="Total venta" value={total} />
            <BigRow label="Comisión tarjeta" value={cardFee} />
            <BigRow label="Neto recibido" value={netReceived} />
          </div>

          <button
            onClick={handleInvoiceClick}
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-4 font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? 'Facturando...' : 'Facturar'}
          </button>
        </aside>
      </div>

      {lastInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-center">
              <CheckCircle className="text-emerald-500" size={56} />
            </div>

            <h2 className="mt-4 text-center text-2xl font-bold">
              Factura generada correctamente
            </h2>

            <div className="mt-5 rounded-xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Factura</p>
              <p className="font-bold">{lastInvoice.invoiceNumber || `#${lastInvoice.saleId.slice(0, 8).toUpperCase()}`}</p>

              <p className="mt-3 text-sm text-zinc-500">Cliente</p>
              <p className="font-bold">{lastInvoice.customerName}</p>

              <p className="mt-3 text-sm text-zinc-500">Total</p>
              <p className="text-2xl font-bold text-emerald-600">
                RD${lastInvoice.total.toLocaleString()}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => window.open(`/ventas/${lastInvoice.saleId}/imprimir`, '_blank')}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-300 py-3 font-semibold hover:bg-zinc-100"
              >
                <Printer size={18} />
                Imprimir
              </button>

              <button
                onClick={newSale}
                className="rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}

      {closeSummary && (
        <CloseSummaryModal
          summary={closeSummary}
          onClose={() => setCloseSummary(null)}
        />
      )}

      {cashModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 className="text-2xl font-bold">Pago en efectivo</h2>
      <p className="mt-1 text-zinc-500">
        Ingresa la cantidad entregada por el cliente.
      </p>

      <div className="mt-5 rounded-xl bg-zinc-50 p-4">
        <div className="flex justify-between text-lg">
          <span>Total</span>
          <span className="font-bold">{formatMoney(total)}</span>
        </div>

        <label className="mt-5 block text-sm text-zinc-500">
          Cliente entregó
        </label>
        <input
          type="number"
          value={cashReceived}
          onChange={(e) => setCashReceived(e.target.value)}
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-2xl font-bold outline-none focus:border-emerald-500"
          placeholder="Ej: 1000"
          autoFocus
        />

        <div className="mt-5 flex justify-between text-xl">
          <span>Cambio</span>
          <span
            className={`font-black ${
              changeAmount < 0 ? 'text-red-500' : 'text-emerald-600'
            }`}
          >
            {formatMoney(changeAmount)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => setCashModal(false)}
          className="rounded-xl border border-zinc-300 py-3 font-semibold hover:bg-zinc-100"
        >
          Cancelar
        </button>

        <button
          onClick={() => {
            if (changeAmount < 0) {
              alert('El dinero entregado no cubre el total.')
              return
            }

            setCashModal(false)
            completeSale()
          }}
          className="rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600"
        >
          Facturar
        </button>
      </div>
    </div>
  </div>
)}
    </AppShell>
  )
}

function CloseRegisterModal({
  summary,
  amount,
  error,
  processing,
  onAmountChange,
  onCancel,
  onCloseWithoutPrint,
  onPrintAndClose,
}: {
  summary: CloseSummary | null
  amount: string
  error: string
  processing: boolean
  onAmountChange: (value: string) => void
  onCancel: () => void
  onCloseWithoutPrint: () => void
  onPrintAndClose: () => void
}) {
  const counted = amount.trim() === '' ? NaN : Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(counted) && counted >= 0
  const expectedCash = summary?.expectedCash || 0
  const difference = isValidAmount ? counted - expectedCash : 0
  const statusLabel = !isValidAmount
    ? 'Pendiente'
    : Math.abs(difference) < 0.01
      ? 'Cuadre correcto'
      : difference > 0
        ? 'Sobrante'
        : 'Faltante'
  const statusClass = !isValidAmount
    ? 'text-zinc-500'
    : Math.abs(difference) < 0.01
      ? 'text-emerald-600'
      : difference > 0
        ? 'text-orange-600'
        : 'text-red-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">Cierre de caja</h2>
            <p className="text-zinc-500">Verifica el resumen e ingresa el efectivo fisico contado.</p>
          </div>
          <span className={`rounded-full bg-zinc-50 px-3 py-1 text-sm font-black ${statusClass}`}>{statusLabel}</span>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-zinc-50 p-4 md:grid-cols-2">
          <BigRow label="Monto de apertura" value={summary?.openingAmount || 0} />
          <BigRow label="Ventas en efectivo" value={summary?.cashSales || 0} />
          <BigRow label="Transferencias" value={summary?.transferSales || 0} />
          <BigRow label="Tarjetas" value={summary?.cardSales || 0} />
          <BigRow label="Entradas manuales" value={summary?.manualIn || 0} />
          <BigRow label="Salidas manuales" value={summary?.manualOut || 0} />
          <BigRow label="Devoluciones en efectivo" value={summary?.cashRefunds || 0} />
          <BigRow label="Efectivo esperado" value={expectedCash} />
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-bold text-zinc-700">Monto contado en caja</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="RD$0.00"
            className="w-full rounded-2xl border border-zinc-300 px-4 py-4 text-2xl font-black outline-none focus:border-emerald-500"
            autoFocus
          />
        </label>

        <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 p-4 md:grid-cols-2">
          <BigRow label="Monto contado" value={isValidAmount ? counted : 0} />
          <BigRow label="Diferencia" value={difference} />
        </div>

        {(error || !isValidAmount) && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
            {error || 'Debes ingresar el monto contado antes de cerrar la caja.'}
          </p>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="rounded-xl border border-zinc-300 py-3 font-bold hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onCloseWithoutPrint}
            disabled={!isValidAmount || processing}
            className="rounded-xl border border-zinc-300 py-3 font-bold hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Cerrando caja...' : 'Cerrar sin imprimir'}
          </button>
          <button
            type="button"
            onClick={onPrintAndClose}
            disabled={!isValidAmount || processing}
            className="rounded-xl bg-emerald-600 py-3 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Cerrando caja...' : 'Imprimir cuadre y cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
function BigRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-lg">
      <span className="text-zinc-600">{label}</span>
      <span className="font-bold text-zinc-950">
        RD${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
    </div>
  )
}

function CloseSummaryModal({
  summary,
  onClose,
}: {
  summary: CloseSummary
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-center text-2xl font-bold">Caja cerrada</h2>

        <div className="mt-5 space-y-3 rounded-xl bg-zinc-50 p-4">
          <BigRow label="Efectivo esperado" value={summary.expectedCash} />
          <BigRow label="Ventas efectivo" value={summary.cashSales} />
          <BigRow label="Ventas tarjeta" value={summary.cardSales} />
          <BigRow label="Ventas transferencia" value={summary.transferSales} />
          <BigRow label="Devoluciones efectivo" value={summary.cashRefunds} />
          <BigRow label="Comisión tarjeta" value={summary.totalCardFee} />
          <BigRow label="Ganancia estimada" value={summary.totalProfit} />
          <BigRow label="Efectivo contado" value={summary.closingAmount} />
          <BigRow label="Descuadre" value={summary.difference} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => window.open(`/cuadres/${summary.cashId}/imprimir`, '_blank')}
            className="rounded-xl border border-zinc-300 py-3 font-semibold hover:bg-zinc-100"
          >
            Imprimir cuadre
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}







































