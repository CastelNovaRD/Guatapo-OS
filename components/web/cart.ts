import type { WebCartItem, WebProduct } from './types'
import { CART_STORAGE_KEY, WHATSAPP_NUMBER } from './types'
import { formatMoney } from '@/lib/format'

export function readCart() {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(CART_STORAGE_KEY)
    return saved ? (JSON.parse(saved) as WebCartItem[]) : []
  } catch {
    return []
  }
}

export function saveCart(cart: WebCartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  window.dispatchEvent(new Event('guatapo-cart-updated'))
}

export function productToCartItem(product: WebProduct, quantity = 1): WebCartItem {
  return {
    id: product.id,
    name: product.name,
    sale_price: Number(product.sale_price || 0),
    quantity,
    stock: Number(product.stock || 0),
    slug: product.slug,
    image_url: product.image_url,
    category: product.category,
  }
}

export function addProductToCart(product: WebProduct, quantity = 1) {
  const cart = readCart()
  const existing = cart.find((item) => item.id === product.id)

  if (existing) {
    const updated = cart.map((item) =>
      item.id === product.id
        ? {
            ...item,
            quantity: Math.min(Number(product.stock || 0), item.quantity + quantity),
            stock: Number(product.stock || 0),
          }
        : item
    )

    saveCart(updated)
    return updated
  }

  const updated = [...cart, productToCartItem(product, quantity)]
  saveCart(updated)
  return updated
}

export function productAvailability(stock: number) {
  if (stock <= 0) {
    return {
      label: 'Agotado',
      className: 'text-red-600',
      available: false,
      lowStock: false,
    }
  }

  if (stock <= 3) {
    return {
      label: `Ultimas ${stock} ${stock === 1 ? 'unidad' : 'unidades'}`,
      className: 'text-orange-500',
      available: true,
      lowStock: true,
    }
  }

  return {
    label: 'Disponible',
    className: 'text-emerald-700',
    available: true,
    lowStock: false,
  }
}

export function openProductWhatsApp(product: WebProduct, quantity = 1) {
  const lines = [
    'Hola Guatapo, quiero hacer un pedido:',
    '',
    `Producto: ${product.name}`,
    `Cantidad: ${quantity}`,
    `Precio: ${formatMoney(product.sale_price)}`,
    `Total: ${formatMoney(Number(product.sale_price || 0) * quantity)}`,
  ]

  openWhatsApp(lines.join('\n'))
}

export function openCartWhatsApp(cart: WebCartItem[]) {
  const total = cart.reduce(
    (sum, item) => sum + Number(item.sale_price || 0) * item.quantity,
    0
  )

  const productLines = cart.map((item) => {
    const lineTotal = Number(item.sale_price || 0) * item.quantity
    return `- ${item.name} x${item.quantity}: ${formatMoney(lineTotal)}`
  })

  openWhatsApp(
    [
      'Hola Guatapo, quiero hacer un pedido con estos productos:',
      '',
      ...productLines,
      '',
      `Total aproximado: ${formatMoney(total)}`,
    ].join('\n')
  )
}

function openWhatsApp(message: string) {
  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    '_blank'
  )
}

