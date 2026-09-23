'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import { formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { lookupDgiiContributor } from '@/lib/dgii-contributors'
import { productMatchesSearch } from '@/lib/product-search'
import { resolveProductImageUrl } from '@/lib/product-images'
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
import { isFiscalSalesEnabledForPlan, normalizeHubConfig } from '@/lib/hub-config'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  image_url: string | null
  product_image_id?: string | null
  sale_price: number
  cost: number
  stock: number
  product_type: string
  category: string | null
  specs?: Record<string, unknown> | null
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

type PosProductsFetchParams = {
  storeId: string
  limit: number
  searchTerm: string
  category: string
  options: { showLoading?: boolean }
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
  webOfferPrice?: number | null
  webOfferApplied?: boolean
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
  cashWithdrawals: number
  creditNotePayments: number
}

type ExistingCustomer = {
  id: string
  full_name: string
  phone: string | null
  cedula: string | null
}

type CreditNoteLookup = {
  id: string
  sale_id: string | null
  credit_note_number: string | null
  total: number
  original_amount: number | null
  available_balance: number | null
  refund_method: string | null
  used_at?: string | null
  customer_id?: string | null
  customer_name?: string | null
  customer_rnc?: string | null
}

type SalePaymentRow = {
  sale_id: string | null
  payment_method: string | null
  amount: number | null
  card_fee: number | null
}
type WithdrawalHistoryItem = {
  id: string
  user_id: string | null
  employeeName: string
  created_at: string
  amount: number
  reason: string
  notes: string | null
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

function notifyInventoryUpdated() {
  const timestamp = String(Date.now())

  try {
    window.localStorage.setItem('shopdesk_inventory_updated_at', timestamp)
  } catch {
    // localStorage puede fallar en modo privado; el evento local mantiene la app actualizada.
  }

  window.dispatchEvent(new CustomEvent('shopdesk:inventory-updated', { detail: timestamp }))
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
  const [shippingCost, setShippingCost] = useState('')
  const [fiscalSale, setFiscalSale] = useState(false)
  const [fiscalSalesEnabled, setFiscalSalesEnabled] = useState(false)
  const [fiscalPaymentPending, setFiscalPaymentPending] = useState(false)
  const [taxPercent, setTaxPercent] = useState('0')
  const [fiscalReceiptType, setFiscalReceiptType] = useState('B01')
  const [availableNcf, setAvailableNcf] = useState<AvailableNcf | null>(null)
  const [loadingNcf, setLoadingNcf] = useState(false)
  const [fiscalCustomerName, setFiscalCustomerName] = useState('')
  const [fiscalCustomerRnc, setFiscalCustomerRnc] = useState('')
  const [fiscalCustomerPhone, setFiscalCustomerPhone] = useState('')
  const [fiscalCustomerAddress, setFiscalCustomerAddress] = useState('')
  const [fiscalNotes, setFiscalNotes] = useState('')
  const [fiscalCustomerSource, setFiscalCustomerSource] = useState<string | null>(null)
  const [fiscalContributorConfirmed, setFiscalContributorConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cashModal, setCashModal] = useState(false)
  const [cashReceived, setCashReceived] = useState('')
  const [creditNoteNumber, setCreditNoteNumber] = useState('')
  const [creditNoteLookup, setCreditNoteLookup] = useState<CreditNoteLookup | null>(null)
  const [creditNoteLoading, setCreditNoteLoading] = useState(false)
  const [creditNoteMessage, setCreditNoteMessage] = useState('')
  const [creditNoteRemainderMethodId, setCreditNoteRemainderMethodId] = useState('')
  const [creditNoteRemainderCashReceived, setCreditNoteRemainderCashReceived] = useState('')
  const [productImages, setProductImages] = useState<ProductImage[]>([])

  useEffect(() => {
    let active = true

    async function loadFiscalCapability() {
      try {
        const response = await fetch('/api/hub/config', { cache: 'no-store' })
        if (!response.ok) throw new Error('No se pudo cargar la configuración del plan.')

        const enabled = isFiscalSalesEnabledForPlan(normalizeHubConfig(await response.json()))
        if (!active) return

        setFiscalSalesEnabled(enabled)
        if (!enabled) setFiscalSale(false)
      } catch {
        if (!active) return
        setFiscalSalesEnabled(false)
        setFiscalSale(false)
      }
    }

    void loadFiscalCapability()
    return () => { active = false }
  }, [])

  const [openCash, setOpenCash] = useState<CashRegister | null>(null)
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [cashLoading, setCashLoading] = useState(true)
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closePreview, setClosePreview] = useState<CloseSummary | null>(null)
  const [closingProcessing, setClosingProcessing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [withdrawalNotes, setWithdrawalNotes] = useState('')
  const [withdrawalSaving, setWithdrawalSaving] = useState(false)
  const [withdrawalError, setWithdrawalError] = useState('')
  const [withdrawalMessage, setWithdrawalMessage] = useState('')
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalHistoryItem[]>([])
  const [withdrawalHistoryLoading, setWithdrawalHistoryLoading] = useState(false)
  const [lastInvoice, setLastInvoice] = useState<LastInvoice | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const productsFetchInFlightRef = useRef(false)
  const pendingProductsFetchRef = useRef<PosProductsFetchParams | null>(null)

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

  async function loadCash(
  storeId?: string,
  options: { showLoading?: boolean } = {}
) {
  const showLoading = options.showLoading ?? true

  if (showLoading) setCashLoading(true)

  try {
    const response = await fetch('/api/cash-registers?status=open', {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      const result = await response.json().catch(() => null)
      throw new Error(result?.error || 'No se pudo consultar la caja.')
    }

    const registers = await response.json()
    const currentCash = Array.isArray(registers) ? registers[0] || null : null

    setOpenCash(currentCash)
  } catch (error) {
    console.error('Error cargando caja:', error)
    setOpenCash(null)
  } finally {
    if (showLoading) setCashLoading(false)
  }
}

  async function loadData(currentStoreId = storeId) {
  if (!currentStoreId) return

  try {
    const [
      methodsResponse,
      customersResponse,
      categoriesResponse,
      settingsResponse,
    ] = await Promise.all([
      fetch('/api/payment-methods', {
        cache: 'no-store',
      }),
      fetch('/api/customers?active=true&limit=200', {
        cache: 'no-store',
      }),
      fetch('/api/categories', {
        cache: 'no-store',
      }),
      fetch('/api/store-settings', {
        cache: 'no-store',
      }),
    ])

    const [
      methodsData,
      customersData,
      categoriesData,
      storeData,
    ] = await Promise.all([
      methodsResponse.ok ? methodsResponse.json() : Promise.resolve([]),
      customersResponse.ok ? customersResponse.json() : Promise.resolve([]),
      categoriesResponse.ok ? categoriesResponse.json() : Promise.resolve([]),
      settingsResponse.ok ? settingsResponse.json() : Promise.resolve(null),
    ])

    const configuredLimit = Number(
      (storeData as { pos_featured_products_limit?: number } | null)
        ?.pos_featured_products_limit || 10
    )

    const safeLimit = [5, 10, 20, 50].includes(configuredLimit)
      ? configuredLimit
      : 10

    setPosFeaturedProductsLimit(safeLimit)

    const basePaymentMethods =
      Array.isArray(methodsData) && methodsData.length
        ? methodsData
        : FALLBACK_PAYMENT_METHODS

    const hasCreditNoteMethod = basePaymentMethods.some(
      (method: { id: string; name: string }) =>
        method.id === 'virtual:credit-note' ||
        method.name.toLowerCase().includes('nota de credito')
    )

    const nextPaymentMethods = hasCreditNoteMethod
      ? basePaymentMethods
      : [
          ...basePaymentMethods,
          {
            id: 'virtual:credit-note',
            name: 'Nota de credito',
            fee_percent: 0,
          },
        ]

    setPaymentMethods(nextPaymentMethods)
    setCustomers(
      (Array.isArray(customersData) ? customersData : []) as ExistingCustomer[]
    )
    setProductCategories(
      Array.isArray(categoriesData) ? categoriesData : []
    )

    if (nextPaymentMethods.length && !paymentMethodId) {
      setPaymentMethodId(nextPaymentMethods[0].id)
    }

    await loadPosProducts(
      currentStoreId,
      safeLimit,
      { showLoading: products.length === 0 }
    )
  } catch (error) {
    console.error('Error cargando datos del POS:', error)
  }
}

  async function loadPosProducts(
  currentStoreId = storeId,
  limit = posFeaturedProductsLimit,
  options: { showLoading?: boolean } = {},
  filters: { searchTerm?: string; category?: string } = {}
) {
  if (!currentStoreId) return

  const fetchParams: PosProductsFetchParams = {
    storeId: currentStoreId,
    limit,
    searchTerm: filters.searchTerm ?? debouncedSearch,
    category: filters.category ?? categoryFilter,
    options,
  }

  if (productsFetchInFlightRef.current) {
    pendingProductsFetchRef.current = fetchParams
    return
  }

  productsFetchInFlightRef.current = true
  const showLoading = options.showLoading ?? products.length === 0

  if (showLoading) setProductsLoading(true)

  try {
    const cleanSearch = fetchParams.searchTerm
      .replace(/[%,_]/g, '')
      .trim()

    const params = new URLSearchParams()

    params.set('active', 'true')
    params.set('stockMin', '0.001')
    params.set('limit', String(cleanSearch ? 100 : Math.max(limit, 50)))

    if (cleanSearch) {
      params.set('search', cleanSearch)
    }

    const response = await fetch(`/api/products?${params.toString()}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn(
        '[POS] Error cargando productos desde PostgreSQL:',
        response.status
      )
      return
    }

    const rows = await response.json()

    const productsData: Product[] = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku ?? null,
        barcode: row.barcode ?? null,
        image_url: row.image_url ?? null,
        product_image_id: row.product_image_id ?? null,
        sale_price: Number(row.sale_price || 0),
        cost: Number(row.cost || 0),
        stock: Number(row.stock || 0),
        product_type: row.product_type_value ?? '',
        category: row.category_name ?? null,
        specs: row.specs ?? null,
      }))
      .filter((product) => {
        if (!fetchParams.category.trim()) return true
        return product.category === fetchParams.category.trim()
      })

    const shouldApplyResult = !pendingProductsFetchRef.current

    if (shouldApplyResult) {
      setProducts(productsData)

      setProductImages(
        productsData
          .filter((product) => Boolean(product.image_url && product.product_image_id))
          .map((product) => ({
            id: product.product_image_id as string,
            product_id: product.id,
            image_url: product.image_url as string,
            is_primary: true,
            sort_order: 0,
          }))
      )
    }
  } catch (error) {
    console.error('[POS] Error cargando productos:', error)
  } finally {
    if (showLoading) setProductsLoading(false)

    productsFetchInFlightRef.current = false

    const pendingFetch = pendingProductsFetchRef.current

    if (pendingFetch) {
      pendingProductsFetchRef.current = null

      void loadPosProducts(
        pendingFetch.storeId,
        pendingFetch.limit,
        pendingFetch.options,
        {
          searchTerm: pendingFetch.searchTerm,
          category: pendingFetch.category,
        }
      )
    }
  }
}

  async function loadNextAvailableNcf(type = fiscalReceiptType) {
  if (!storeId) return

  setLoadingNcf(true)

  try {
    const response = await fetch(
      `/api/ncf/next?type=${encodeURIComponent(type)}`,
      { cache: 'no-store' }
    )

    if (!response.ok) {
      setAvailableNcf(null)
      return alert(
        'No pude cargar comprobantes disponibles. Revisa Ventas > Comprobantes.'
      )
    }

    const data = await response.json()
    setAvailableNcf(data || null)
  } catch (error) {
    console.error('Error cargando NCF:', error)
    setAvailableNcf(null)

    alert(
      'No pude cargar comprobantes disponibles. Revisa Ventas > Comprobantes.'
    )
  } finally {
    setLoadingNcf(false)
  }
}

function getProductMainImage(product: Product) {
  const images = productImages.filter(
    (img) => img.product_id === product.id
  )

  const primary = images.find((img) => img.is_primary)

  return (
    resolveProductImageUrl(primary || images[0]) ||
    resolveProductImageUrl(
      product.product_image_id && product.image_url
        ? { id: product.product_image_id, image_url: product.image_url }
        : null
    ) ||
    product.image_url
  )
}

  async function openRegister() {
  const amount = Number(openingAmount || 0)

  if (!Number.isFinite(amount) || amount < 0) {
    return alert('El efectivo inicial no es válido.')
  }

  try {
    const response = await fetch('/api/cash-registers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        openingAmount: amount,
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      return alert(result?.error || 'No se pudo abrir la caja.')
    }

    setOpenCash(result)
    setOpeningAmount('')

    await logAudit({
      storeId,
      module: 'pos',
      action: 'cash_register.open',
      entityType: 'cash_register',
      entityId: result.id,
      summary: `Caja abierta con ${amount}.`,
      afterData: {
        openingAmount: amount,
      },
    })
  } catch (error) {
    console.error('Error abriendo caja:', error)
    alert('No se pudo abrir la caja.')
  }
}

   async function calculateCloseSummary(
    countedCash: number
  ): Promise<CloseSummary | null> {
    if (!openCash || !storeId) return null

    try {
      const params = new URLSearchParams({
        countedCash: String(countedCash),
      })

      const response = await fetch(
        `/api/cash-registers/${encodeURIComponent(openCash.id)}/summary?${params.toString()}`,
        {
          cache: 'no-store',
        }
      )

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setCloseError(
          result?.error || 'No se pudo calcular el resumen de caja.'
        )
        return null
      }

      return result as CloseSummary
    } catch (error) {
      console.error('Error calculando resumen de caja:', error)
      setCloseError('No se pudo calcular el resumen de caja.')
      return null
    }
  }

  function openWithdrawalPanel() {
    if (!openCash) {
      alert('No hay una caja abierta para retirar efectivo.')
      return
    }

    setWithdrawalAmount('')
    setWithdrawalReason('')
    setWithdrawalNotes('')
    setWithdrawalError('')
    setWithdrawalMessage('')
    setWithdrawalModalOpen(true)
    void loadWithdrawalHistory()
  }

  async function loadWithdrawalHistory() {
  if (!openCash) return

  setWithdrawalHistoryLoading(true)
  setWithdrawalError('')

  try {
    const params = new URLSearchParams({
      cashRegisterId: openCash.id,
      type: 'withdrawal',
    })

    const response = await fetch(
      `/api/cash-movements?${params.toString()}`,
      {
        cache: 'no-store',
      }
    )

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      setWithdrawalHistory([])
      setWithdrawalError(
        'No se pudo cargar el historial de retiros: ' +
          (data?.error || 'Error desconocido.')
      )
      return
    }

    const rows = Array.isArray(data) ? data.slice(0, 25) : []

    setWithdrawalHistory(
      rows.map((row) => {
        const rawNotes =
          typeof row.notes === 'string' ? row.notes : ''

        const reasonMatch = rawNotes.match(
          /(?:^|\n)Motivo:\s*(.*?)(?:\n|$)/
        )

        const notesMatch = rawNotes.match(
          /(?:^|\n)Notas:\s*([\s\S]*)$/
        )

        return {
          id: row.id,
          user_id: row.created_by || null,
          employeeName: 'Usuario del sistema',
          created_at: row.created_at,
          amount: Number(row.amount || 0),
          reason: reasonMatch?.[1]?.trim() || '',
          notes: notesMatch?.[1]?.trim() || null,
        }
      })
    )
  } catch (error) {
    console.error('Error cargando historial de retiros:', error)
    setWithdrawalHistory([])
    setWithdrawalError(
      'No se pudo cargar el historial de retiros.'
    )
  } finally {
    setWithdrawalHistoryLoading(false)
  }
}

  async function saveWithdrawal() {
    if (!openCash || !storeId) return
    if (withdrawalSaving) return

    const amount = Number(withdrawalAmount || 0)
    const reason = withdrawalReason.trim()

    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawalError('El monto a retirar debe ser mayor que cero.')
      return
    }

    if (!reason) {
      setWithdrawalError('Debes indicar el motivo del retiro.')
      return
    }

    setWithdrawalSaving(true)
    setWithdrawalError('')
    setWithdrawalMessage('')

    const summary = await calculateCloseSummary(0)
    if (!summary) {
      setWithdrawalSaving(false)
      return
    }

    if (amount > summary.expectedCash) {
      setWithdrawalSaving(false)
      setWithdrawalError('El retiro no puede superar el efectivo disponible en caja.')
      return
    }

    const withdrawalDetails = [
  `Motivo: ${reason}`,
  withdrawalNotes.trim() ? `Notas: ${withdrawalNotes.trim()}` : '',
]
  .filter(Boolean)
  .join('\n')

const response = await fetch('/api/cash-movements', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    cashRegisterId: openCash.id,
    amount,
    notes: withdrawalDetails,
  }),
})

const result = await response.json().catch(() => null)

if (!response.ok) {
  setWithdrawalSaving(false)
  setWithdrawalError(
    'Error registrando retiro: ' +
      (result?.error || 'No se pudo registrar el retiro.')
  )
  return
}

    await logAudit({
      storeId,
      module: 'caja',
      action: 'cash.withdrawal',
      entityType: 'cash_register',
      entityId: openCash.id,
      summary: 'Retiro de efectivo: ' + amount + '. Motivo: ' + reason + '.',
      afterData: { amount, reason, notes: withdrawalNotes.trim() || null },
    })

    setWithdrawalSaving(false)
    setWithdrawalAmount('')
    setWithdrawalReason('')
    setWithdrawalNotes('')
    setWithdrawalMessage('Retiro registrado correctamente.')
    await loadWithdrawalHistory()
  }

  function openCloseRegisterPanel() {
    console.log('[Cash Register] Open close dialog')

    if (!openCash) {
      alert('No hay una caja abierta para cerrar.')
      return
    }

    setClosingAmount('')
    setCloseError('')
    setClosePreview({
      cashId: openCash.id,
      openingAmount: Number(openCash.opening_amount || 0),
      manualIn: 0,
      manualOut: 0,
      totalSales: Number(openCash.opening_amount || 0),
      totalCardFee: 0,
      totalProfit: 0,
      difference: -Number(openCash.opening_amount || 0),
      closingAmount: 0,
      expectedCash: Number(openCash.opening_amount || 0),
      cashSales: 0,
      cardSales: 0,
      transferSales: 0,
      cashRefunds: 0,
      cashWithdrawals: 0,
      creditNotePayments: 0,
    })
    setCloseModalOpen(true)

    window.setTimeout(() => {
      void calculateCloseSummary(0).then((summary) => {
        if (summary) setClosePreview(summary)
      })
    }, 0)
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

      const closeResponse = await fetch(
      `/api/cash-registers/${encodeURIComponent(openCash.id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          closingAmount: counted,
        }),
      }
    )

    const closedCash = await closeResponse.json().catch(() => null)

    if (!closeResponse.ok) {
      setClosingProcessing(false)

      if (closeResponse.status === 409) {
        setCloseError('Esta caja ya fue cerrada.')
        return
      }

      setCloseError(
        'Error cerrando caja: ' +
          (closedCash?.error || 'No se pudo cerrar la caja.')
      )
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
    window.dispatchEvent(new Event('shopdesk:cash-updated'))

    if (printAfterClose) window.open(`/cuadres/${summary.cashId}/imprimir`, '_blank')

    await loadCash()
    setClosingProcessing(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (storeId) void loadPosProducts(storeId, posFeaturedProductsLimit, { showLoading: products.length === 0 }, { searchTerm: debouncedSearch, category: categoryFilter })
  }, [storeId, debouncedSearch, categoryFilter, posFeaturedProductsLimit])

  useEffect(() => {
    function refreshPosInBackground() {
      if (document.visibilityState === 'visible' && storeId) {
        void loadPosProducts(storeId, posFeaturedProductsLimit, { showLoading: false }, { searchTerm: debouncedSearch, category: categoryFilter })
        void loadCash(storeId, { showLoading: false })
      }
    }

    window.addEventListener('focus', refreshPosInBackground)
    document.addEventListener('visibilitychange', refreshPosInBackground)
    return () => {
      window.removeEventListener('focus', refreshPosInBackground)
      document.removeEventListener('visibilitychange', refreshPosInBackground)
    }
  }, [storeId, posFeaturedProductsLimit, debouncedSearch, categoryFilter])

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

  const filteredProducts = useMemo(() => products.filter((product) => productMatchesSearch(product, search)), [products, search])

  const requiresCustomer = cart.some((item) =>
    ['phone', 'tablet', 'laptop'].includes(item.product_type)
  )

  const subtotal = cart.reduce((sum, item) => {
    const itemTotal = getCartItemBasePrice(item) * item.quantity
    const discount = Number(item.discount || 0)
    return sum + Math.max(0, itemTotal - discount)
  }, 0)

  const discountAmount = cart.reduce(
  (sum, item) => sum + Math.max(0, Number(item.discount || 0)),
  0
)

  const selectedPaymentMethod = paymentMethods.find(
    (method) => method.id === paymentMethodId
  )

  const selectedPaymentName = selectedPaymentMethod?.name?.toLowerCase() || ''
  const isSalePendingPayment = fiscalPaymentPending
  const isCreditNotePayment = !isSalePendingPayment && (paymentMethodId === 'virtual:credit-note' || selectedPaymentName.includes('nota de credito'))
  const isCardPayment = !isSalePendingPayment && !isCreditNotePayment && (selectedPaymentName.includes('tarjeta') || paymentMethodId.includes('card'))
  const selectedRemainderPaymentMethod = paymentMethods.find(
    (method) => method.id === creditNoteRemainderMethodId
  )
  const selectedRemainderPaymentName = selectedRemainderPaymentMethod?.name?.toLowerCase() || ''
  const isRemainderCashPayment = selectedRemainderPaymentName.includes('efectivo')
  const isRemainderCardPayment = selectedRemainderPaymentName.includes('tarjeta') || creditNoteRemainderMethodId.includes('card')
  const shipping = Number(shippingCost || 0)
  const cardSurcharge = useMemo(() => {
    if (!isCardPayment) return 0

    return cart.reduce((sum, item) => {
      if (!shouldChargeCardSurcharge(item)) return sum

      const itemTotal = getCartItemBasePrice(item) * item.quantity
      const discount = Number(item.discount || 0)
      return sum + Math.max(0, itemTotal - discount) * (CARD_FEE_PERCENT / 100)
    }, 0)
  }, [cart, isCardPayment])

  const normalizedTaxPercent = Math.min(100, Math.max(0, Number(taxPercent || 0) || 0))
  const taxAmount = fiscalSale ? subtotal * (normalizedTaxPercent / 100) : 0
  const totalBeforeShipping = subtotal + cardSurcharge + taxAmount
  const total = totalBeforeShipping + shipping
  const creditNoteAvailable = Math.max(0, Number(creditNoteLookup?.available_balance ?? creditNoteLookup?.total ?? 0))
  const creditNoteAppliedAmount = isCreditNotePayment ? Math.min(total, creditNoteAvailable) : 0
  const creditNoteRemainingTotal = isCreditNotePayment ? Math.max(0, total - creditNoteAppliedAmount) : 0
  const cardFee = useMemo(() => {
    if (isCardPayment) return (subtotal + taxAmount) * (CARD_FEE_PERCENT / 100)
    if (isCreditNotePayment && isRemainderCardPayment && creditNoteRemainingTotal > 0) {
      return creditNoteRemainingTotal * (CARD_FEE_PERCENT / 100)
    }
    return 0
  }, [subtotal, taxAmount, isCardPayment, isCreditNotePayment, isRemainderCardPayment, creditNoteRemainingTotal])

  const netReceived = isSalePendingPayment ? 0 : isCreditNotePayment ? Math.max(0, creditNoteRemainingTotal - cardFee) : total - cardFee
  const isCashPayment = !isSalePendingPayment && !isCreditNotePayment && selectedPaymentName.includes('efectivo')
  const changeAmount = isCreditNotePayment && isRemainderCashPayment
    ? Number(creditNoteRemainderCashReceived || 0) - creditNoteRemainingTotal
    : Number(cashReceived || 0) - total

  function getWebOfferPrice(product: Product) {
    const normalPrice = Number(product.sale_price || 0)
    const specs = product.specs as { web_discount_percent?: string | number | null } | null | undefined
    const discountPercent = Math.min(100, Math.max(0, Number(specs?.web_discount_percent || 0)))

    if (!discountPercent || normalPrice <= 0) return null

    const offerPrice = normalPrice * (1 - discountPercent / 100)
    return offerPrice > 0 && offerPrice < normalPrice ? offerPrice : null
  }

  function getCartItemBasePrice(item: CartItem) {
    return item.webOfferApplied && item.webOfferPrice
      ? Number(item.webOfferPrice || 0)
      : Number(item.sale_price || 0)
  }

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
    const basePrice = getCartItemBasePrice(item)
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
        webOfferPrice: getWebOfferPrice(product),
        webOfferApplied: false,
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
  function applyWebOffer(cartId: string) {
    setCart((items) =>
      items.map((item) =>
        item.cartId === cartId && item.webOfferPrice
          ? { ...item, webOfferApplied: true }
          : item
      )
    )
  }

  function removeWebOffer(cartId: string) {
    setCart((items) =>
      items.map((item) =>
        item.cartId === cartId
          ? { ...item, webOfferApplied: false }
          : item
      )
    )
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

    if (phoneDigits.length < 7 && cedulaDigits.length < 5) {
      return null
    }

    try {
      const response = await fetch('/api/customers?active=true&limit=1000', {
        cache: 'no-store',
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        alert(
          'Error buscando cliente: ' +
            (data?.error || 'No se pudo consultar clientes.')
        )
        return null
      }

      return (
        ((Array.isArray(data) ? data : []) as ExistingCustomer[]).find(
          (customer) => {
            const savedPhone = onlyDigits(customer.phone || '')
            const savedCedula = onlyDigits(customer.cedula || '')

            return (
              (Boolean(phoneDigits) && savedPhone === phoneDigits) ||
              (Boolean(cedulaDigits) && savedCedula === cedulaDigits)
            )
          }
        ) || null
      )
    } catch (error) {
      console.error('Error buscando cliente:', error)
      alert('Error buscando cliente.')
      return null
    }
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
      setFiscalCustomerSource('cliente local')
      setFiscalContributorConfirmed(false)
      setCustomerLookupMessage('Cliente registrado encontrado. Confirma que es el contribuyente correcto.')
      return
    }

      try {
      const quotesResponse = await fetch('/api/quotes', {
        cache: 'no-store',
      })

      const quotesData = await quotesResponse.json().catch(() => null)

      if (!quotesResponse.ok) {
        return alert(
          'Error buscando cliente fiscal: ' +
            (quotesData?.error || 'No se pudieron consultar las cotizaciones.')
        )
      }

      const fiscalMatch =
        (Array.isArray(quotesData) ? quotesData : [])
          .map((quote) => quote?.customer)
          .find(
            (customer) =>
              customer &&
              onlyDigits(customer.document || '') === documentDigits
          ) || null

      if (fiscalMatch) {
        const fiscalDocument = formatFiscalDocument(
          fiscalMatch.document || documentValue
        )
        const fiscalPhone = fiscalMatch.phone
          ? formatPhone(fiscalMatch.phone)
          : ''

        setExistingCustomerId(fiscalMatch.customer_id || null)
        setCustomerSearch(fiscalMatch.full_name || '')
        setCustomerName(fiscalMatch.full_name || '')
        setCustomerPhone(fiscalPhone)
        setCustomerCedula(fiscalDocument)
        setFiscalCustomerName(fiscalMatch.full_name || '')
        setFiscalCustomerRnc(fiscalDocument)
        setFiscalCustomerPhone(fiscalPhone)
        setFiscalCustomerAddress(fiscalMatch.address || '')
        setFiscalCustomerMode('search')
        setFiscalCustomerSource('cliente fiscal local')
        setFiscalContributorConfirmed(false)
        setCustomerLookupMessage(
          'Cliente fiscal registrado encontrado. Confirma que es el contribuyente correcto.'
        )
        return
      }
    } catch (error) {
      console.error('Error buscando cliente fiscal:', error)
      return alert('Error buscando cliente fiscal.')
    }

    const dgiiResult = await lookupDgiiContributor(documentValue)
    if (dgiiResult.status === 'found') {
      const fiscalDocument = formatFiscalDocument(dgiiResult.contributor.document)
      setExistingCustomerId(null)
      setCustomerSearch(dgiiResult.contributor.registeredName)
      setCustomerName(dgiiResult.contributor.registeredName)
      setCustomerCedula(fiscalDocument)
      setFiscalCustomerName(dgiiResult.contributor.registeredName)
      setFiscalCustomerRnc(fiscalDocument)
      setFiscalCustomerPhone('')
      setFiscalCustomerAddress('')
      setFiscalCustomerSource('dataset oficial DGII')
      setFiscalContributorConfirmed(false)
      setFiscalCustomerMode('search')
      setCustomerLookupMessage('Registro encontrado en el dataset DGII. Confirma que es el contribuyente correcto.')
      return
    }

    setExistingCustomerId(null)
    setCustomerSearch('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerCedula(formatFiscalDocument(documentValue))
    setFiscalCustomerName('')
    setFiscalCustomerRnc(formatFiscalDocument(documentValue))
    setFiscalCustomerPhone('')
    setFiscalCustomerAddress('')
    setFiscalCustomerMode('new')
    setFiscalCustomerSource(dgiiResult.status === 'unavailable' ? 'captura manual (dataset DGII pendiente)' : 'captura manual')
    setFiscalContributorConfirmed(false)
    setCustomerLookupMessage(dgiiResult.status === 'unavailable'
      ? 'El dataset oficial DGII aún no está conectado. Completa y confirma los datos manualmente.'
      : 'No encontramos ese contribuyente. Completa y confirma los datos para agregarlo.')
  }

  function confirmFiscalContributor() {
    if (!fiscalCustomerName.trim() || !fiscalCustomerRnc.trim()) {
      return alert('Completa razón social y RNC o cédula antes de confirmar.')
    }
    setCustomerName(fiscalCustomerName.trim())
    setCustomerCedula(formatFiscalDocument(fiscalCustomerRnc))
    setFiscalContributorConfirmed(true)
    setCustomerLookupMessage('Contribuyente confirmado para esta factura.')
  }

  function getPaymentMethodKind(methodId: string): 'cash' | 'transfer' | 'card' {
    const method = paymentMethods.find((item) => item.id === methodId)
    const text = `${methodId} ${method?.name || ''}`.toLowerCase()

    if (text.includes('efectivo') || text.includes('cash')) return 'cash'
    if (text.includes('tarjeta') || text.includes('card')) return 'card'
    return 'transfer'
  }

  function resetCreditNotePayment() {
    setCreditNoteNumber('')
    setCreditNoteLookup(null)
    setCreditNoteMessage('')
    setCreditNoteRemainderCashReceived('')
    const firstRegularMethod = paymentMethods.find((method) => method.id !== 'virtual:credit-note')
    setCreditNoteRemainderMethodId(firstRegularMethod?.id || '')
  }

   async function searchCreditNotePayment() {
    if (!storeId) {
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const noteNumber = creditNoteNumber.trim()

    if (!noteNumber) {
      setCreditNoteMessage('Escribe el numero de nota de credito.')
      return
    }

    setCreditNoteLoading(true)
    setCreditNoteMessage('')

    try {
      const params = new URLSearchParams({
        number: noteNumber,
      })

      const response = await fetch(
        `/api/credit-notes/lookup?${params.toString()}`,
        {
          cache: 'no-store',
        }
      )

      const data = await response.json().catch(() => null)

      if (response.status === 404) {
        setCreditNoteLookup(null)
        setCreditNoteMessage(
          'No encontramos una nota de credito con ese numero.'
        )
        return
      }

      if (!response.ok) {
        setCreditNoteLookup(null)
        setCreditNoteMessage(
          'No pude buscar la nota de credito: ' +
            (data?.error || 'Error desconocido.')
        )
        return
      }

      const note = data as CreditNoteLookup

      const available = Number(
        note.available_balance ?? note.total ?? 0
      )

      const alreadyUsed =
        Boolean(note.used_at) || available <= 0

      if (alreadyUsed) {
        setCreditNoteLookup(null)
        setCreditNoteMessage(
          'Esta nota de credito ya fue usada o no tiene balance disponible.'
        )
        return
      }

      setCreditNoteLookup(note)
      setCreditNoteMessage(
        'Nota de credito disponible para aplicar.'
      )
    } catch (error) {
      console.error('Error buscando nota de credito:', error)
      setCreditNoteLookup(null)
      setCreditNoteMessage(
        'No pude buscar la nota de credito.'
      )
    } finally {
      setCreditNoteLoading(false)
    }
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
    setFiscalPaymentPending(false)
    setAvailableNcf(null)
    setFiscalCustomerName('')
    setFiscalCustomerRnc('')
    setFiscalCustomerPhone('')
    setFiscalCustomerAddress('')
    setFiscalNotes('')
    setFiscalCustomerSource(null)
    setFiscalContributorConfirmed(false)
    searchRef.current?.focus()
  }

   async function verifyCartStockBeforeSale() {
    if (!storeId) return null

    const productIds = Array.from(
      new Set(cart.map((item) => item.id))
    )

    if (productIds.length === 0) return null

    try {
      const response = await fetch('/api/products?limit=1000', {
        cache: 'no-store',
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        alert(
          'No pude verificar el stock antes de facturar: ' +
            (data?.error || 'Error desconocido.')
        )
        return null
      }

      const rows = Array.isArray(data) ? data : []

      const stockMap = new Map<string, number>(
        rows
          .filter((product) => productIds.includes(product.id))
          .map((product) => [
            product.id,
            Number(product.stock || 0),
          ])
      )

      const requestedByProduct = new Map<
        string,
        { name: string; quantity: number }
      >()

      cart.forEach((item) => {
        const current = requestedByProduct.get(item.id)

        requestedByProduct.set(item.id, {
          name: item.name,
          quantity:
            (current?.quantity || 0) +
            Number(item.quantity || 0),
        })
      })

      const insufficient = Array.from(
        requestedByProduct.entries()
      ).find(([productId, item]) => {
        return (
          Number(stockMap.get(productId) || 0) <
          item.quantity
        )
      })

      if (insufficient) {
        const [productId, item] = insufficient
        const available = Number(
          stockMap.get(productId) || 0
        )

        alert(
          `Stock insuficiente para ${item.name}. Disponible: ${available}. Solicitado: ${item.quantity}.`
        )

        await loadPosProducts(
          storeId,
          posFeaturedProductsLimit,
          { showLoading: false },
          {
            searchTerm: debouncedSearch,
            category: categoryFilter,
          }
        )

        return null
      }

      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          stockMap.has(product.id)
            ? {
                ...product,
                stock: Number(
                  stockMap.get(product.id) || 0
                ),
              }
            : product
        )
      )

      return stockMap
    } catch (error) {
      console.error(
        'Error verificando stock antes de facturar:',
        error
      )

      alert('No pude verificar el stock antes de facturar.')
      return null
    }
  }

  function handleInvoiceClick() {
  if (cart.length === 0) return alert('Agrega productos al carrito')

  if (isCreditNotePayment) {
    if (!creditNoteLookup || creditNoteAppliedAmount <= 0) {
      return alert('Busca y selecciona una nota de credito valida antes de facturar.')
    }

    if (creditNoteRemainingTotal > 0 && !creditNoteRemainderMethodId) {
      return alert('Selecciona el metodo de pago para el faltante.')
    }

    if (creditNoteRemainingTotal > 0 && isRemainderCashPayment && changeAmount < 0) {
      return alert('El efectivo entregado no cubre el faltante.')
    }

    completeSale()
    return
  }

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

    if (isSalePendingPayment && (!customerName.trim() || !customerPhone.trim())) {
      return alert('Para dejar una venta pendiente debes agregar nombre y teléfono del cliente')
    }

    if (fiscalSale && !customerName.trim()) {
      return alert('Selecciona un cliente para emitir una venta con comprobante.')
    }
    if (fiscalSale && !fiscalContributorConfirmed) {
      return alert('Confirma explícitamente el contribuyente antes de emitir el comprobante.')
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

    const verifiedStockMap = await verifyCartStockBeforeSale()
    if (!verifiedStockMap) return

    setSaving(true)
        let customerId: string | null = null

    if (requiresCustomer || fiscalSale || isSalePendingPayment) {
      const existingCustomer = existingCustomerId
        ? { id: existingCustomerId }
        : await findExistingCustomer(customerPhone, customerCedula)

      if (existingCustomer) {
        customerId = existingCustomer.id
      } else {
        const customerResponse = await fetch('/api/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName: customerName.trim(),
            phone: customerPhone.trim() || null,
            document:
              customerCedula.trim() ||
              fiscalCustomerRnc.trim() ||
              null,
            documentType: fiscalCustomerRnc.trim()
              ? 'rnc'
              : 'cedula',
          }),
        })

        const customerResult = await customerResponse
          .json()
          .catch(() => null)

        if (!customerResponse.ok) {
          setSaving(false)
          return alert(
            customerResult?.error ||
              'No se pudo registrar el cliente.'
          )
        }

        customerId = customerResult.id
      }
    }

    const paymentMethodForSale = isCreditNotePayment
      ? creditNoteRemainderMethodId
      : paymentMethodId

    const receivedForSale =
      isCreditNotePayment && isRemainderCashPayment
        ? Number(creditNoteRemainderCashReceived || 0)
        : isCashPayment
          ? Number(cashReceived || 0)
          : 0

    const changeForSale =
      isCreditNotePayment && isRemainderCashPayment
        ? Math.max(0, changeAmount)
        : isCashPayment
          ? Math.max(0, changeAmount)
          : 0

    const saleNotes = isSalePendingPayment
      ? 'Venta pendiente de pago'
      : isCreditNotePayment
      ? `Venta POS con nota de credito ${
          creditNoteLookup?.credit_note_number ||
          creditNoteNumber.trim()
        }`
      : fiscalSale
        ? 'Venta POS con comprobante fiscal'
        : requiresCustomer
          ? 'Venta con datos del cliente'
          : 'Factura rapida'

           const payments: Array<{
      paymentMethodId?: string | null
      paymentMethod: 'cash' | 'transfer' | 'card' | 'credit_note'
      amount: number
      creditNoteId?: string | null
      cardFee?: number
    }> = []

    const getPaymentType = (
      methodId: string,
      methodName: string
    ): 'cash' | 'transfer' | 'card' => {
      const id = methodId.toLowerCase()
      const name = methodName.toLowerCase()

      if (name.includes('tarjeta') || id.includes('card')) {
        return 'card'
      }

      if (
        name.includes('transfer') ||
        id.includes('transfer')
      ) {
        return 'transfer'
      }

      return 'cash'
    }

    if (isCreditNotePayment) {
      if (creditNoteLookup && creditNoteAppliedAmount > 0) {
        payments.push({
          paymentMethod: 'credit_note',
          amount: creditNoteAppliedAmount,
          creditNoteId: creditNoteLookup.id,
        })
      }

      if (creditNoteRemainingTotal > 0) {
        const remainderMethod = paymentMethods.find(
          (method) => method.id === creditNoteRemainderMethodId
        )

        payments.push({
          paymentMethodId: creditNoteRemainderMethodId || null,
          paymentMethod: getPaymentType(
            creditNoteRemainderMethodId,
            remainderMethod?.name || ''
          ),
          amount: creditNoteRemainingTotal,
          cardFee: isRemainderCardPayment ? cardFee : 0,
        })
      }
    } else if (!isSalePendingPayment) {
      payments.push({
        paymentMethodId: paymentMethodId || null,
        paymentMethod: getPaymentType(
          paymentMethodId,
          selectedPaymentMethod?.name || ''
        ),
        amount: total,
        cardFee,
      })
    }

    const saleResponse = await fetch('/api/pos/sales', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cashRegisterId: openCash.id,
        customerId,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total,
        shippingCost: shipping,
        cardFee: isSalePendingPayment ? 0 : cardFee,
        netReceived: isSalePendingPayment
          ? 0
          : Math.max(0, total - changeForSale),
        cashReceived: receivedForSale,
        cashChange: changeForSale,
        pendingPayment: isSalePendingPayment,
        paymentMethodId: paymentMethodForSale || null,

        fiscalReceiptType: fiscalSale
          ? fiscalReceiptType
          : null,
        fiscalCustomerName: fiscalSale
          ? fiscalCustomerName.trim() || customerName.trim()
          : null,
        fiscalCustomerRnc: fiscalSale
          ? fiscalCustomerRnc.trim() || customerCedula.trim()
          : null,
        fiscalCustomerPhone: fiscalSale
          ? customerPhone.trim() || null
          : null,
        fiscalCustomerAddress: fiscalSale
          ? fiscalCustomerAddress.trim() || null
          : null,
        fiscalCustomerSource: fiscalSale
          ? fiscalCustomerSource || null
          : null,
        fiscalNotes: fiscalSale
          ? fiscalNotes.trim() || null
          : null,

        notes: saleNotes,

        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          sku: item.sku,
          quantity: item.quantity,
          cost: item.cost,
          unitPrice: item.sale_price,
          discount: 0,
          tax: 0,
          total: item.sale_price * item.quantity,
          imei: item.imei.trim() || null,
        })),

        payments,
      }),
    })

    const saleResult = await saleResponse
      .json()
      .catch(() => null)

    if (!saleResponse.ok) {
      setSaving(false)
      return alert(
        saleResult?.error ||
          'No se pudo completar la venta.'
      )
    }
        const sale = {
      id: saleResult.saleId,
      invoice_number: saleResult.invoiceNumber,
      created_at: saleResult.createdAt,
      ncf: saleResult.ncf ?? null,
    }

    await logAudit({
      storeId,
      module: 'pos',
      action: fiscalSale ? 'sale.fiscal.create' : 'sale.quick.create',
      entityType: 'sale',
      entityId: sale.id,
      summary: `${isSalePendingPayment ? 'Factura pendiente' : 'Venta POS'} ${sale.invoice_number || sale.id} por ${total}.`,
      afterData: { invoiceNumber: sale.invoice_number, total, subtotal, taxAmount, cardFee: isSalePendingPayment ? 0 : cardFee, shipping, pendingPayment: isSalePendingPayment, ncf: fiscalSale ? sale.ncf : null },
    })

    setLastInvoice({
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      total,
      customerName: customerName || fiscalCustomerName || 'Consumidor Final',
      createdAt: sale.created_at,
    })

    setSaving(false)
    notifyInventoryUpdated()
    void loadPosProducts(storeId, posFeaturedProductsLimit, { showLoading: false }, { searchTerm: debouncedSearch, category: categoryFilter })
    void loadCash(storeId, { showLoading: false })
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-castelnova-50 text-castelnova-700">`n              <Wallet size={32} />
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
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-castelnova-400"
            />
          </div>

          <button
            onClick={openRegister}
            className="mt-5 w-full rounded-xl bg-castelnova-500 py-4 font-bold text-white hover:bg-castelnova-700"
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

          <button
            type="button"
            onClick={openWithdrawalPanel}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-100"
          >
            <Wallet size={18} />
            Retiros de Caja
          </button>

          <Link
            href="/ventas/cambios"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-100"
          >
            <RefreshCcw size={18} />
            Cambio
          </Link>
          <button
            type="button"
            onClick={() => {
              console.log('[Cash Register] Close button clicked')
              openCloseRegisterPanel()
            }}
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
              <Search className="text-castelnova-500" size={20} />
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

          {productsLoading && filteredProducts.length === 0 ? (
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
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm hover:border-castelnova-400 disabled:cursor-not-allowed disabled:opacity-50"
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
            <ShoppingCart className="text-castelnova-500" />
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
                          {item.webOfferPrice && !item.webOfferApplied && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-emerald-700">Oferta web: {formatMoney(item.webOfferPrice)}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  applyWebOffer(item.cartId)
                                }}
                                className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-black text-red-700 hover:bg-red-100"
                              >
                                Aplicar oferta
                              </button>
                            </div>
                          )}
                          {item.webOfferApplied && item.webOfferPrice && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-emerald-700">Oferta web aplicada: {formatMoney(item.webOfferPrice)}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  removeWebOffer(item.cartId)
                                }}
                                className="rounded-full border border-zinc-200 bg-white px-2 py-1 font-bold text-zinc-700 hover:bg-zinc-100"
                              >
                                Quitar oferta
                              </button>
                            </div>
                          )}
                          {hasCardSurcharge && (
                            <p className="text-xs font-semibold text-orange-600">
                              Incluye {CARD_FEE_PERCENT}% tarjeta
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
                    className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-castelnova-400"
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
        : 'border-zinc-300 focus:border-castelnova-400'
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

          {(requiresCustomer || isSalePendingPayment) && !fiscalSale && (
            <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="font-semibold text-emerald-700">Datos del cliente</h3>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente *"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
              />
              {customerLookupMessage && (
                <p className="text-sm font-semibold text-emerald-700">{customerLookupMessage}</p>
              )}
            </div>
          )}
          {fiscalSalesEnabled ? (
          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-center gap-3 font-bold text-zinc-800">
              <input
                type="checkbox"
                checked={fiscalSale}
                onChange={(event) => {
                  const checked = event.target.checked
                  setFiscalSale(checked)
                  setFiscalContributorConfirmed(false)
                  if (checked) {
                    setTaxPercent('18')
                    loadNextAvailableNcf(fiscalReceiptType)
                  }
                  if (!checked) {
                    setTaxPercent('0')
                    setAvailableNcf(null)
                  }
                }}
                className="h-5 w-5 accent-castelnova-500"
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
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-castelnova-400"
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
                        setFiscalContributorConfirmed(false)
                        setCustomerLookupMessage('')
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${fiscalCustomerMode === 'search' ? 'bg-castelnova-500 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}
                    >
                      Buscar registrado
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFiscalCustomerMode('new')
                        setExistingCustomerId(null)
                        setFiscalContributorConfirmed(false)
                        setCustomerLookupMessage('')
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold transition ${fiscalCustomerMode === 'new' ? 'bg-castelnova-500 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}
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
                          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-castelnova-400"
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
                          setFiscalContributorConfirmed(false)
                        }}
                        placeholder="Nombre o razon social *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
                      />
                      <input
                        value={fiscalCustomerPhone}
                        onChange={(event) => {
                          const nextPhone = formatPhone(event.target.value)
                          setFiscalCustomerPhone(nextPhone)
                          setCustomerPhone(nextPhone)
                          setFiscalContributorConfirmed(false)
                        }}
                        onBlur={() => void autocompleteCustomer(customerPhone, customerCedula)}
                        placeholder="Telefono *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
                      />
                      <input
                        value={fiscalCustomerRnc}
                        onChange={(event) => {
                          const nextDocument = formatFiscalDocument(event.target.value)
                          setFiscalCustomerRnc(nextDocument)
                          setCustomerCedula(nextDocument)
                          setFiscalContributorConfirmed(false)
                        }}
                        onBlur={() => void autocompleteCustomer(customerPhone, customerCedula)}
                        placeholder="RNC o cedula *"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
                      />
                      <input
                        value={fiscalCustomerAddress}
                        onChange={(event) => { setFiscalCustomerAddress(event.target.value); setFiscalContributorConfirmed(false) }}
                        placeholder="Direccion"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400"
                      />
                    </div>
                  )}

                  {fiscalCustomerName && fiscalCustomerRnc && (
                    <div className={`rounded-xl border p-3 text-sm ${fiscalContributorConfirmed ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                      <p className="font-black text-zinc-900">{fiscalCustomerName}</p>
                      <p className="text-zinc-700">RNC/Cédula: {fiscalCustomerRnc}</p>
                      {fiscalCustomerSource && <p className="mt-1 text-xs text-zinc-600">Origen: {fiscalCustomerSource}</p>}
                      <button type="button" onClick={confirmFiscalContributor} className={`mt-2 rounded-lg px-3 py-2 text-xs font-bold ${fiscalContributorConfirmed ? 'border border-emerald-300 bg-white text-emerald-800' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
                        {fiscalContributorConfirmed ? 'Contribuyente confirmado' : 'Confirmar contribuyente'}
                      </button>
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-2 block text-sm text-zinc-500">Notas para la factura (opcional)</span>
                    <textarea value={fiscalNotes} onChange={(event) => setFiscalNotes(event.target.value)} placeholder="Observaciones que aparecerán impresas" className="min-h-20 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-castelnova-400" />
                  </label>

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
          ) : null}

          <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 font-bold text-amber-900">
            <input
              type="checkbox"
              checked={fiscalPaymentPending}
              onChange={(event) => {
                setFiscalPaymentPending(event.target.checked)
                if (event.target.checked) resetCreditNotePayment()
              }}
              className="mt-1 h-5 w-5 accent-amber-600"
            />
            <span>
              Pago pendiente
              <span className="block text-sm font-semibold text-amber-800">
                Registra el saldo en cuentas por cobrar y no lo incorpora al cierre como dinero recibido.
              </span>
            </span>
          </label>

          <div className="mt-5">
            <label className="mb-2 block text-sm text-zinc-500">
              Método de pago
            </label>
            <select
              value={paymentMethodId}
              onChange={(e) => {
                const nextMethodId = e.target.value
                setPaymentMethodId(nextMethodId)
                if (nextMethodId === 'virtual:credit-note') {
                  const firstRegularMethod = paymentMethods.find((method) => method.id !== 'virtual:credit-note')
                  setCreditNoteRemainderMethodId(firstRegularMethod?.id || '')
                } else {
                  resetCreditNotePayment()
                }
              }}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-castelnova-400"
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

          {isCreditNotePayment && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-lg font-black text-emerald-800">Nota de credito</h3>
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                Aplica el balance disponible de una nota de credito a favor del cliente.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={creditNoteNumber}
                  onChange={(event) => {
                    setCreditNoteNumber(event.target.value)
                    setCreditNoteLookup(null)
                    setCreditNoteMessage('')
                  }}
                  placeholder="Ej: NC-000001"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 font-bold outline-none focus:border-castelnova-400"
                />
                <button
                  type="button"
                  onClick={searchCreditNotePayment}
                  disabled={creditNoteLoading}
                  className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {creditNoteLoading ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {creditNoteMessage && (
                <p className={`mt-3 text-sm font-bold ${creditNoteLookup ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {creditNoteMessage}
                </p>
              )}

              {creditNoteLookup && (
                <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-white p-3">
                  <BigRow label="Balance nota" value={creditNoteAvailable} />
                  <BigRow label="Nota aplicada" value={creditNoteAppliedAmount} />
                  <BigRow label="Faltante" value={creditNoteRemainingTotal} />
                  {creditNoteLookup.customer_name && (
                    <p className="text-sm font-semibold text-zinc-600">
                      Cliente original: {creditNoteLookup.customer_name}
                      {creditNoteLookup.customer_rnc ? ` (${creditNoteLookup.customer_rnc})` : ''}
                    </p>
                  )}
                </div>
              )}

              {creditNoteLookup && creditNoteRemainingTotal > 0 && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-bold text-zinc-600">
                    Metodo para pagar faltante
                  </label>
                  <select
                    value={creditNoteRemainderMethodId}
                    onChange={(event) => {
                      setCreditNoteRemainderMethodId(event.target.value)
                      setCreditNoteRemainderCashReceived('')
                    }}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 font-bold outline-none focus:border-castelnova-400"
                  >
                    {paymentMethods
                      .filter((method) => method.id !== 'virtual:credit-note')
                      .map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                  </select>

                  {isRemainderCashPayment && (
                    <input
                      type="number"
                      min="0"
                      value={creditNoteRemainderCashReceived}
                      onChange={(event) => setCreditNoteRemainderCashReceived(event.target.value)}
                      placeholder="Efectivo recibido para el faltante"
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 font-bold outline-none focus:border-castelnova-400"
                    />
                  )}
                </div>
              )}
            </div>
          )}



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
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 outline-none focus:border-castelnova-400"
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
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-castelnova-400"
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
            {isCreditNotePayment && <BigRow label="Nota de credito aplicada" value={creditNoteAppliedAmount} />}
            {isCreditNotePayment && creditNoteRemainingTotal > 0 && <BigRow label="Pendiente a pagar" value={creditNoteRemainingTotal} />}
            <BigRow label="Comisión tarjeta" value={cardFee} />
            <BigRow label="Neto recibido" value={netReceived} />
          </div>

          <button
            onClick={handleInvoiceClick}
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-castelnova-500 py-4 font-bold text-white hover:bg-castelnova-700 disabled:opacity-50"
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
                className="rounded-xl bg-castelnova-500 py-3 font-bold text-white hover:bg-castelnova-700"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}
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

      {withdrawalModalOpen && (
        <WithdrawalModal
          amount={withdrawalAmount}
          reason={withdrawalReason}
          notes={withdrawalNotes}
          error={withdrawalError}
          message={withdrawalMessage}
          saving={withdrawalSaving}
          history={withdrawalHistory}
          historyLoading={withdrawalHistoryLoading}
          onAmountChange={(value) => {
            setWithdrawalAmount(value)
            setWithdrawalError('')
          }}
          onReasonChange={(value) => {
            setWithdrawalReason(value)
            setWithdrawalError('')
          }}
          onNotesChange={setWithdrawalNotes}
          onCancel={() => {
            if (withdrawalSaving) return
            setWithdrawalModalOpen(false)
          }}
          onSave={saveWithdrawal}
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
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-2xl font-bold outline-none focus:border-castelnova-400"
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
          className="rounded-xl bg-castelnova-500 py-3 font-bold text-white hover:bg-castelnova-700"
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

function WithdrawalModal({
  amount,
  reason,
  notes,
  error,
  message,
  saving,
  history,
  historyLoading,
  onAmountChange,
  onReasonChange,
  onNotesChange,
  onCancel,
  onSave,
}: {
  amount: string
  reason: string
  notes: string
  error: string
  message: string
  saving: boolean
  history: WithdrawalHistoryItem[]
  historyLoading: boolean
  onAmountChange: (value: string) => void
  onReasonChange: (value: string) => void
  onNotesChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  const parsedAmount = Number(amount || 0)
  const isValid = Number.isFinite(parsedAmount) && parsedAmount > 0 && reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">Retiros de Caja</h2>
            <p className="mt-1 text-zinc-500">Registra salidas de efectivo y revisa el historial de la caja abierta.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">Caja abierta</span>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-black text-zinc-950">Nuevo retiro</h3>
            <p className="mt-1 text-sm text-zinc-500">El monto y el motivo son obligatorios.</p>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-700">Monto retirado</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="RD$0.00"
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 text-xl font-black outline-none focus:border-castelnova-400"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-700">Motivo</span>
                <input
                  value={reason}
                  onChange={(event) => onReasonChange(event.target.value)}
                  placeholder="Ej: Compra de material, pago de envio, gasto operativo"
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-castelnova-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-700">Observaciones</span>
                <textarea
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  placeholder="Opcional"
                  rows={3}
                  className="w-full rounded-2xl border border-zinc-300 px-4 py-3 outline-none focus:border-castelnova-400"
                />
              </label>
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                {error}
              </p>
            )}

            {message && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                {message}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="rounded-xl border border-zinc-300 py-3 font-bold hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!isValid || saving}
                className="rounded-xl bg-castelnova-500 py-3 font-black text-white hover:bg-castelnova-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Guardar retiro'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-zinc-950">Historial de retiros</h3>
                <p className="mt-1 text-sm text-zinc-500">Empleado, fecha, monto y motivo.</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600">{history.length}</span>
            </div>

            <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-zinc-100">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-3">Empleado</th>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3 text-right">Monto</th>
                    <th className="px-3 py-3">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center font-semibold text-zinc-500">Cargando historial...</td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center font-semibold text-zinc-500">No hay retiros registrados en esta caja.</td>
                    </tr>
                  ) : (
                    history.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-3 py-3 font-bold text-zinc-900">{item.employeeName}</td>
                        <td className="px-3 py-3 text-zinc-600">
                          {new Date(item.created_at).toLocaleString('es-DO', {
                            timeZone: 'America/Santo_Domingo',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-red-600">{formatMoney(item.amount)}</td>
                        <td className="px-3 py-3 text-zinc-700">
                          <p className="font-bold text-zinc-900">{item.reason}</p>
                          {item.notes && <p className="mt-1 text-xs text-zinc-500">{item.notes}</p>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
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
            <p className="mt-1 text-base font-bold text-emerald-700">{new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'full' })}</p>
          </div>
          <span className={`rounded-full bg-zinc-50 px-3 py-1 text-sm font-black ${statusClass}`}>{statusLabel}</span>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-zinc-50 p-4 md:grid-cols-2">
          <BigRow label="Monto de apertura" value={summary?.openingAmount || 0} />
          <BigRow label="Ventas en efectivo" value={summary?.cashSales || 0} />
          <BigRow label="Transferencias" value={summary?.transferSales || 0} />
          <BigRow label="Nota de credito" value={summary?.creditNotePayments || 0} />
          <BigRow label="Tarjetas" value={summary?.cardSales || 0} />
          <BigRow label="Devoluciones en efectivo" value={summary?.cashRefunds || 0} />
          <BigRow label="Retiros de caja" value={summary?.cashWithdrawals || 0} />
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
            className="w-full rounded-2xl border border-zinc-300 px-4 py-4 text-2xl font-black outline-none focus:border-castelnova-400"
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
            className="rounded-xl bg-castelnova-500 py-3 font-black text-white hover:bg-castelnova-700 disabled:cursor-not-allowed disabled:opacity-60"
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
          <BigRow label="Nota de credito" value={summary.creditNotePayments} />
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
            className="rounded-xl bg-castelnova-500 py-3 font-bold text-white hover:bg-castelnova-700"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}


