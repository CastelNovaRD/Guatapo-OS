'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageIcon, MessageCircle, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { getPublicStoreBySlug } from '@/lib/store-context'
import WebStoreLayout from '@/components/web/WebStoreLayout'
import type { WebCartItem, WebCategory } from '@/components/web/types'
import { openCartWhatsApp, productAvailability, readCart, saveCart } from '@/components/web/cart'
import { DEFAULT_WEB_SETTINGS, WebSettings, normalizeWebSettings, readLocalWebSettings, saveLocalWebSettings } from '@/lib/web-settings'
import { buildCategoryUrl } from '@/lib/web-categories'

export default function WebCartPage() {
  const [cart, setCart] = useState<WebCartItem[]>(() => readCart())
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)

  const loadCategories = useCallback(async () => {
    const store = await getPublicStoreBySlug('guatapo')
    if (!store) return

    let nextSettings = readLocalWebSettings(store.id)
    const settingsResult = await supabase.from('stores').select('web_settings').eq('id', store.id).maybeSingle()
    if (!settingsResult.error && settingsResult.data?.web_settings) {
      nextSettings = normalizeWebSettings(settingsResult.data.web_settings as Partial<WebSettings>)
      saveLocalWebSettings(store.id, nextSettings)
    }
    setWebSettings(nextSettings)

    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('store_id', store.id)
      .eq('active', true)
      .order('name')

    setCategories(data || [])
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadCategories)
  }, [loadCategories])

  const visibleCart = useMemo(() => {
    const query = search.toLowerCase().trim()

    return cart.filter((item) => {
      const matchesSearch = query
        ? `${item.name} ${item.category || ''}`.toLowerCase().includes(query)
        : true
      const matchesCategory = category ? item.category === category : true

      return matchesSearch && matchesCategory
    })
  }, [cart, search, category])

  const total = cart.reduce(
    (sum, item) => sum + Number(item.sale_price || 0) * item.quantity,
    0
  )

  function updateCart(nextCart: WebCartItem[]) {
    setCart(nextCart)
    saveCart(nextCart)
  }

  function removeItem(id: string) {
    updateCart(cart.filter((item) => item.id !== id))
  }

  function changeQuantity(id: string, amount: number) {
    updateCart(
      cart.map((item) => {
        if (item.id !== id) return item

        const nextQuantity = Math.max(1, Math.min(item.stock || 1, item.quantity + amount))
        return { ...item, quantity: nextQuantity }
      })
    )
  }

  function requestOrder() {
    if (cart.length === 0) {
      alert('El carrito esta vacio')
      return
    }

    openCartWhatsApp(cart)
  }

  return (
    <WebStoreLayout
      categories={categories}
      selectedCategory={category}
      search={search}
      onSearchChange={setSearch}
      onSelectCategory={(nextCategory) => { window.location.href = buildCategoryUrl(nextCategory) }}
      settings={webSettings}
    >
      <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex min-w-[220px] items-center justify-center gap-5 rounded-[24px] border-2 border-emerald-700 px-8 py-3 text-3xl font-black text-emerald-700">
          Carrito
          <ShoppingCart size={38} />
        </div>

        <Link
          href="/web"
          className="rounded-xl border-2 border-emerald-700 px-5 py-2 text-center font-black text-emerald-700 transition hover:bg-emerald-700 hover:text-white"
        >
          Seguir comprando
        </Link>
      </div>

      {cart.length === 0 ? (
        <div className="rounded-[24px] border-2 border-emerald-700 bg-white p-10 text-center">
          <ShoppingCart className="mx-auto text-emerald-700" size={48} />
          <h2 className="mt-3 text-2xl font-black">Tu carrito esta vacio</h2>
          <p className="mt-2 font-semibold text-zinc-800">
            Agrega productos del catalogo para preparar tu pedido.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            {visibleCart.map((item) => (
              <div
                key={item.id}
                className="grid max-w-[820px] grid-cols-[96px_1fr] gap-4 rounded-[24px] border-2 border-emerald-700 bg-white p-4 sm:grid-cols-[150px_1fr_auto]"
              >
                <Link
                  href={`/web/producto/${item.slug || item.id}`}
                  className="flex h-28 w-24 items-center justify-center bg-white sm:h-40 sm:w-36"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <ImageIcon className="text-zinc-300" size={38} />
                  )}
                </Link>

                <div className="min-w-0">
                  <Link href={`/web/producto/${item.slug || item.id}`}>
                    <h2 className="line-clamp-2 text-xl font-black leading-tight text-zinc-950">
                      {item.name}
                    </h2>
                  </Link>
                  <p className="mt-1 text-xl font-black text-emerald-700">
                    {formatMoney(item.sale_price)}
                  </p>
                  <p className={`text-sm font-bold ${productAvailability(item.stock).className}`}>
                    {productAvailability(item.stock).label}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label="Restar cantidad"
                      onClick={() => changeQuantity(item.id, -1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white"
                    >
                      <Minus size={17} />
                    </button>
                    <span className="flex h-10 min-w-12 items-center justify-center rounded-xl border-2 border-zinc-950 px-4 text-lg font-black">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Sumar cantidad"
                      onClick={() => changeQuantity(item.id, 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white"
                    >
                      <Plus size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 font-black text-white"
                    >
                      <Trash2 size={17} />
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="col-span-2 flex items-center justify-between border-t-2 border-emerald-700 pt-3 sm:col-span-1 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
                  <span className="font-black text-zinc-950 sm:hidden">Subtotal</span>
                  <p className="text-xl font-black text-emerald-700">
                    {formatMoney(Number(item.sale_price || 0) * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <aside className="max-w-[860px]">
            <div className="mb-4 flex justify-between text-2xl font-black text-zinc-950">
              <span>Total</span>
              <span className="text-emerald-700">{formatMoney(total)}</span>
            </div>

            <button
              type="button"
              onClick={requestOrder}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-zinc-950 py-5 text-xl font-semibold uppercase tracking-wide text-white transition hover:bg-zinc-800 sm:text-2xl"
            >
              <MessageCircle size={28} />
              Hacer pedido por WhatsApp
            </button>
          </aside>
        </div>
      )}
    </WebStoreLayout>
  )
}


