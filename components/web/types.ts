import type { ProductImage } from '@/lib/product-images'

export const WHATSAPP_NUMBER = ''

export const CART_STORAGE_KEY = 'shopdesk_cart'

export type WebProduct = {
  id: string
  name: string
  sale_price: number
  stock: number
  category: string | null
  slug: string | null
  image_url: string | null
  short_description?: string | null
  full_description?: string | null
  specs?: Record<string, string | null | undefined> | null
  featured?: boolean | null
}

export type WebCategory = {
  id: string
  name: string
}

export type WebCartItem = {
  id: string
  name: string
  sale_price: number
  quantity: number
  stock: number
  slug: string | null
  image_url: string | null
  category: string | null
}

export type WebProductImage = ProductImage
