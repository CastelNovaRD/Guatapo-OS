'use client'

import Link from 'next/link'
import { ImageIcon, MessageCircle, Plus, ShoppingCart, Star } from 'lucide-react'
import { formatMoney } from '@/lib/format'
import type { WebProduct } from './types'
import { addProductToCart, openProductWhatsApp, productAvailability } from './cart'

type ProductCardProps = {
  product: WebProduct
  image: string | null | undefined
  onCartChange?: () => void
  productUrlBase?: string
}

export default function ProductCard({ product, image, onCartChange, productUrlBase = '/web/producto' }: ProductCardProps) {
  const stock = Number(product.stock || 0)
  const availability = productAvailability(stock)
  const productUrl = `${productUrlBase}/${product.slug || product.id}`
  const discountPercent = Math.min(100, Math.max(0, Number(product.specs?.web_discount_percent || 0)))
  const effectivePrice = Number(product.sale_price || 0) * (1 - discountPercent / 100)
  const productWithDiscount = { ...product, sale_price: effectivePrice }

  const status = !availability.available
    ? { label: 'Agotado', className: 'bg-red-600 text-white' }
    : discountPercent > 0
      ? { label: 'Oferta', className: 'bg-red-600 text-white' }
      : { label: 'Nuevo', className: 'bg-emerald-600 text-white' }

  function handleAdd() {
    addProductToCart({ ...productWithDiscount, image_url: image || product.image_url }, 1)
    onCartChange?.()
  }

  return (
    <article className="group relative flex min-h-[420px] flex-col overflow-hidden border border-zinc-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${status.className}`}>{status.label}</span>
        {availability.lowStock && <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-black uppercase text-white">{availability.label}</span>}
        {discountPercent > 0 && <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-black text-white">-{discountPercent}%</span>}
      </div>

      <Link href={productUrl} className="flex h-56 items-center justify-center bg-gradient-to-b from-zinc-50 to-white px-5 pt-8">
        {image ? (
          <img src={image} alt={product.name} className="h-full w-full object-contain transition duration-300 group-hover:scale-105" />
        ) : (
          <ImageIcon className="text-zinc-300" size={58} />
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center gap-1 text-xs font-black text-orange-500">
          {Array.from({ length: 5 }).map((_, index) => <Star key={index} size={13} fill="currentColor" />)}
          <span className="ml-1 text-zinc-500">Guatapo</span>
        </div>

        <Link href={productUrl}>
          <h3 className="line-clamp-3 min-h-[62px] text-[15px] font-bold leading-snug text-zinc-950 transition group-hover:text-emerald-700">{product.name}</h3>
        </Link>

        <div className="mt-3">
          {discountPercent > 0 && <p className="text-sm font-semibold text-zinc-500 line-through">{formatMoney(product.sale_price)}</p>}
          <p className="text-2xl font-black leading-none text-emerald-700">{formatMoney(effectivePrice)}</p>
        </div>

        {!availability.lowStock && <p className={`mt-2 text-sm font-black ${availability.className}`}>{availability.label}</p>}

        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <button type="button" onClick={handleAdd} disabled={!availability.available} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-zinc-950 px-3 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300">
            <Plus size={18} /> Agregar
          </button>
          <button type="button" onClick={() => openProductWhatsApp(productWithDiscount, 1)} disabled={!availability.available} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
            <MessageCircle size={18} /> Comprar
          </button>
        </div>

        <Link href={productUrl} className="mt-2 flex h-10 items-center justify-center gap-2 rounded-full border border-zinc-200 text-sm font-black text-zinc-800 transition hover:border-emerald-600 hover:text-emerald-700">
          Ver detalle <ShoppingCart size={17} />
        </Link>
      </div>
    </article>
  )
}
