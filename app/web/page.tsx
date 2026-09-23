'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgePercent, ChevronRight, PackageSearch, ShieldCheck, Store, Truck } from 'lucide-react'
import { getProductMainImage } from '@/lib/product-images'
import { DEFAULT_WEB_SETTINGS, WebSettings, normalizeWebSettings, readLocalWebSettings, saveLocalWebSettings } from '@/lib/web-settings'
import ProductCard from '@/components/web/ProductCard'
import WebStoreLayout, { renderWebCategoryIcon } from '@/components/web/WebStoreLayout'
import type { WebCategory, WebProduct, WebProductImage } from '@/components/web/types'
import { buildCategoryUrl, orderCategoryNames, readCategoryFromSearchParams } from '@/lib/web-categories'

type StorefrontPayload = {
  store: { id: string }
  webSettings: Partial<WebSettings> | null
  categories: WebCategory[]
  products: WebProduct[]
  productImages: WebProductImage[]
}

export default function WebPage() {
  const [products, setProducts] = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [productImages, setProductImages] = useState<WebProductImage[]>([])
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [heroIndex, setHeroIndex] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/public/storefront/shopdesk')
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok || !payload || typeof payload !== 'object') {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String(payload.error)
          : 'No se pudo cargar el catálogo.'
        setError(message)
        return
      }

      const storefront = payload as StorefrontPayload
      let nextSettings = readLocalWebSettings(storefront.store.id)
      if (storefront.webSettings) {
        nextSettings = normalizeWebSettings(storefront.webSettings)
        saveLocalWebSettings(storefront.store.id, nextSettings)
      }
      setWebSettings(nextSettings)
      setProducts(
        nextSettings.showFeaturedFirst
          ? [...storefront.products].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
          : storefront.products
      )
      setCategories(storefront.categories)
      setProductImages(storefront.productImages)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialCategory = readCategoryFromSearchParams(window.location.search)
    if (initialCategory) setCategory(initialCategory)
  }, [])

  useEffect(() => { void Promise.resolve().then(loadData) }, [loadData])

  useEffect(() => {
    const refresh = () => void loadData()
    window.addEventListener('shopdesk:web-settings-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('shopdesk:web-settings-updated', refresh); window.removeEventListener('storage', refresh) }
  }, [loadData])

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim()
    return products.filter((product) => {
      const searchableText = [product.name, product.category, product.short_description, product.full_description].filter(Boolean).join(' ').toLowerCase()
      return (query ? searchableText.includes(query) : true) && (category ? product.category === category : true)
    })
  }, [products, search, category])

  const categoryNames = orderCategoryNames(categories.length ? categories.map((item) => item.name) : ['Computadoras', 'Celulares', 'Adaptadores', 'Tabletas', 'Audio', 'Bocinas'], webSettings.categoryOrder)
  const categoryCards = categoryNames.slice(0, 12).map((name) => {
    const product = products.find((item) => item.category === name)
    return { name, image: product ? getProductMainImage(product.id, product.image_url, productImages) : null }
  })

  const heroSlides = useMemo(() => {
    const first = products[0]
    const second = products[1]
    const third = products[2]
    return [
      { eyebrow: webSettings.heroBadge, title: webSettings.heroTitle, subtitle: webSettings.heroSubtitle, button: webSettings.heroButtonText, category: '', image: webSettings.heroImageUrl || (first ? getProductMainImage(first.id, first.image_url, productImages) : null), color: webSettings.primaryColor },
      ...webSettings.promotions.slice(0, 2).map((promo, index) => {
        const fallback = index === 0 ? second : third
        return { eyebrow: promo.eyebrow, title: promo.title, subtitle: promo.subtitle, button: promo.button, category: promo.category, image: promo.imageUrl || (fallback ? getProductMainImage(fallback.id, fallback.image_url, productImages) : null), color: promo.color || webSettings.primaryColor }
      }),
    ]
  }, [products, productImages, webSettings])

  useEffect(() => {
    if (heroSlides.length <= 1) return
    const id = window.setInterval(() => setHeroIndex((current) => (current + 1) % heroSlides.length), 5200)
    return () => window.clearInterval(id)
  }, [heroSlides.length])

  const activeHero = heroSlides[heroIndex] || heroSlides[0]

  useEffect(() => {
    if (!category || loading) return
    if (window.location.hash === '#productos') {
      window.setTimeout(() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }, [category, loading])

  function handleSelectCategory(nextCategory: string) {
    setCategory(nextCategory)
    window.history.replaceState(null, '', buildCategoryUrl(nextCategory))
  }

  return (
    <WebStoreLayout categories={categories} selectedCategory={category} search={search} onSearchChange={setSearch} onSelectCategory={handleSelectCategory} settings={webSettings}>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[420px] animate-pulse rounded-3xl border border-zinc-200 bg-white" />)}
        </div>
      ) : error ? (
        <div className="my-8 rounded-3xl border border-red-300 bg-red-50 p-6 font-bold text-red-700">Error cargando productos: {error}</div>
      ) : !webSettings.storeOnline ? (
        <div className="my-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center"><Store className="mx-auto text-emerald-700" size={48} /><h1 className="mt-4 text-3xl font-black">Tienda temporalmente pausada</h1><p className="mt-2 font-semibold text-zinc-700">Estamos actualizando el catalogo. Vuelve pronto.</p></div>
      ) : filteredProducts.length === 0 ? (
        <div className="my-8 rounded-3xl border border-zinc-200 bg-white p-10 text-center"><PackageSearch className="mx-auto text-emerald-700" size={44} /><h2 className="mt-3 text-2xl font-black">No hay productos disponibles</h2><p className="mt-2 font-semibold text-zinc-800">{webSettings.emptyMessage}</p></div>
      ) : (
        <>
          {!search && !category && webSettings.showHero && activeHero && (
            <section className="overflow-hidden rounded-b-[34px] bg-white pb-8">
              <div className="relative min-h-[520px] overflow-hidden bg-zinc-950 text-white">
                {activeHero.image && <img src={activeHero.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/20" />
                <div className="relative z-10 grid min-h-[520px] items-center gap-8 px-7 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.8fr)] lg:px-12">
                  <div className="max-w-2xl">
                    <span className="inline-flex rounded-full px-4 py-2 text-sm font-black uppercase tracking-wide text-white" style={{ backgroundColor: activeHero.color }}>{activeHero.eyebrow}</span>
                    <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">{activeHero.title}</h1>
                    <p className="mt-5 max-w-xl text-lg font-semibold text-zinc-200 sm:text-xl">{activeHero.subtitle}</p>
                    <button type="button" onClick={() => activeHero.category ? handleSelectCategory(activeHero.category) : window.scrollTo({ top: webSettings.heroScrollTarget, behavior: 'smooth' })} className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl" style={{ backgroundColor: webSettings.buttonColor }}>{activeHero.button}<ChevronRight size={20} /></button>
                  </div>
                  <div className="hidden items-center justify-center lg:flex">
                    <div className="flex aspect-square w-full max-w-[430px] items-center justify-center rounded-full bg-white/10 p-8 backdrop-blur">
                      {activeHero.image ? <img src={activeHero.image} alt="" className="max-h-full w-full object-contain drop-shadow-2xl" /> : <ShieldCheck size={120} />}
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-6 left-7 z-20 flex gap-2 lg:left-12">
                  {heroSlides.map((_, index) => <button key={index} type="button" onClick={() => setHeroIndex(index)} className={`h-2.5 rounded-full transition ${index === heroIndex ? 'w-10 bg-white' : 'w-2.5 bg-white/40'}`} aria-label={`Banner ${index + 1}`} />)}
                </div>
              </div>
            </section>
          )}

          {!search && !category && (
            <section className="bg-white px-6 py-12 sm:px-10">
              <div className="mb-7 flex items-center justify-between gap-4"><div><p className="font-black uppercase tracking-wide text-emerald-700">Explora rapido</p><h2 className="text-3xl font-black">Comprar por categoria</h2></div></div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {categoryCards.map((item) => <button key={item.name} type="button" onClick={() => handleSelectCategory(item.name)} className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl"><div className="mb-4 flex h-28 items-center justify-center rounded-2xl bg-zinc-50 text-emerald-700">{item.image ? <img src={item.image} alt="" className="h-full w-full object-contain transition group-hover:scale-105" /> : renderWebCategoryIcon(item.name, webSettings.categoryIcons?.[item.name], 30)}</div><p className="font-black text-zinc-950">{item.name}</p><p className="mt-1 text-xs font-bold text-zinc-500">Ver productos</p></button>)}
              </div>
            </section>
          )}

          {webSettings.showBenefits && !search && !category && (
            <section className="grid gap-4 border-y border-zinc-200 bg-white px-6 py-8 md:grid-cols-3 sm:px-10">
              {webSettings.benefits.slice(0, 3).map((benefit, index) => <div key={benefit.id} className="flex items-center gap-4 rounded-3xl bg-zinc-50 p-5"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">{index === 0 ? <Store /> : index === 1 ? <Truck /> : <BadgePercent />}</span><div><p className="text-lg font-black">{benefit.title}</p><p className="text-sm font-semibold text-zinc-600">{benefit.description}</p></div></div>)}
            </section>
          )}

          <section id="productos" className="scroll-mt-32 bg-white px-6 py-14 sm:px-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-black uppercase tracking-wide text-emerald-700">Catalogo</p><h2 className="text-3xl font-black">{search || category ? 'Resultados' : 'Mas vendidos'}</h2></div><p className="font-bold text-zinc-500">{filteredProducts.length} productos</p></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  image={getProductMainImage(product.id, product.image_url, productImages)}
                  whatsappNumber={webSettings.whatsapp}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </WebStoreLayout>
  )
}
