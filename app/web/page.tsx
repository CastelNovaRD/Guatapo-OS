'use client'

import { useCallback, useEffect, useState } from 'react'
import { BadgePercent, PackageSearch, Store, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getProductMainImage } from '@/lib/product-images'
import { getPublicStoreBySlug } from '@/lib/store-context'
import { DEFAULT_WEB_SETTINGS, WebSettings, normalizeWebSettings, readLocalWebSettings, saveLocalWebSettings } from '@/lib/web-settings'
import ProductCard from '@/components/web/ProductCard'
import WebBannerCarousel from '@/components/web/WebBannerCarousel'
import WebStoreLayout, { renderWebCategoryIcon } from '@/components/web/WebStoreLayout'
import type { WebProduct, WebProductImage } from '@/components/web/types'
import type { WebBanner } from '@/lib/web-banners'
import { OFFICIAL_WEB_CATEGORIES, getWebCategoryDatabaseValues, normalizeWebCategory, readCategoryFromSearchParams } from '@/lib/web-categories'

const GENERAL_PAGE_SIZE = 32
const CATEGORY_PAGE_SIZE = 20

export default function WebPage() {
  const [products, setProducts] = useState<WebProduct[]>([])
  const [productImages, setProductImages] = useState<WebProductImage[]>([])
  const [banners, setBanners] = useState<WebBanner[]>([])
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [error, setError] = useState('')
  const pageSize = category ? CATEGORY_PAGE_SIZE : GENERAL_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize))

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const store = await getPublicStoreBySlug('guatapo')
    if (!store) { setError('Tienda no encontrada'); setLoading(false); return }

    let nextSettings = readLocalWebSettings(store.id)
    const settingsResult = await supabase.from('stores').select('web_settings').eq('id', store.id).maybeSingle()
    if (!settingsResult.error && settingsResult.data?.web_settings) {
      nextSettings = normalizeWebSettings(settingsResult.data.web_settings as Partial<WebSettings>)
      saveLocalWebSettings(store.id, nextSettings)
    }
    setWebSettings(nextSettings)
    setStoreId(store.id)
    setCatalogLoading(true)

    const { data: bannersData } = await supabase
      .from('web_banners')
      .select('id, store_id, image_url, mobile_image_url, title, subtitle, link_url, button_text, display_order, is_active')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('display_order')
      .order('created_at')

    setBanners((bannersData || []) as WebBanner[])
    setLoading(false)
  }, [])

  const loadCatalog = useCallback(async () => {
    if (!storeId || search !== debouncedSearch) return

    setCatalogLoading(true)
    const pageSize = category ? CATEGORY_PAGE_SIZE : GENERAL_PAGE_SIZE
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const term = debouncedSearch.replace(/[%,_().,]/g, ' ').trim()
    let query = supabase
      .from('products')
      .select('id, name, sale_price, stock, category, slug, image_url, specs, featured', { count: 'exact' })
      .eq('store_id', storeId)
      .eq('active', true)
      .eq('show_on_website', true)
      .in('web_visibility', ['normal', 'both'])

    if (category) query = query.in('category', getWebCategoryDatabaseValues(category))
    if (term) query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%,short_description.ilike.%${term}%,full_description.ilike.%${term}%`)

    const { data, error: productsError, count } = await query
      .order(webSettings.showFeaturedFirst ? 'featured' : 'created_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (productsError) {
      setError(productsError.message)
      setCatalogLoading(false)
      return
    }

    const nextProducts = (data || []) as WebProduct[]
    const nextTotal = count || 0
    const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize))
    setTotalProducts(nextTotal)

    if (page > lastPage) {
      setPage(lastPage)
      setCatalogLoading(false)
      return
    }

    setProducts(nextProducts)
    const productIds = nextProducts.map((product) => product.id)
    if (productIds.length) {
      const { data: imagesData } = await supabase
        .from('product_images')
        .select('id, product_id, image_url, is_primary, sort_order')
        .eq('store_id', storeId)
        .in('product_id', productIds)
        .order('sort_order')
      setProductImages((imagesData || []) as WebProductImage[])
    } else {
      setProductImages([])
    }
    setCatalogLoading(false)
  }, [storeId, category, page, search, debouncedSearch, webSettings.showFeaturedFirst])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const initialCategory = readCategoryFromSearchParams(window.location.search)
    if (initialCategory) setCategory(initialCategory)
    const initialSearch = searchParams.get('q') || ''
    setSearch(initialSearch)
    setDebouncedSearch(initialSearch)
    const initialPage = Number(searchParams.get('page') || 1)
    if (Number.isInteger(initialPage) && initialPage > 1) setPage(initialPage)
  }, [])

  useEffect(() => { void Promise.resolve().then(loadData) }, [loadData])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  useEffect(() => {
    if (!storeId) return
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (search) params.set('q', search)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    window.history.replaceState(null, '', `/web${query ? `?${query}` : ''}${category ? '#productos' : ''}`)
  }, [storeId, category, search, page])

  useEffect(() => {
    const refresh = () => void loadData()
    window.addEventListener('guatapo:web-settings-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('guatapo:web-settings-updated', refresh); window.removeEventListener('storage', refresh) }
  }, [loadData])

  const filteredProducts = products

  const categoryCards = OFFICIAL_WEB_CATEGORIES.map((name) => {
    const product = products.find((item) => normalizeWebCategory(item.category) === name)
    return { name, image: product ? getProductMainImage(product.id, product.image_url, productImages) : null }
  })

  useEffect(() => {
    if (!category || loading) return
    if (window.location.hash === '#productos') {
      window.setTimeout(() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }, [category, loading])

  function handleSelectCategory(nextCategory: string) {
    setCategory(nextCategory)
    setPage(1)
  }

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch)
    setPage(1)
  }

  return (
    <WebStoreLayout categories={[]} selectedCategory={category} search={search} onSearchChange={handleSearchChange} onSelectCategory={handleSelectCategory} settings={webSettings} useOfficialCategories>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[420px] animate-pulse rounded-3xl border border-zinc-200 bg-white" />)}
        </div>
      ) : error ? (
        <div className="my-8 rounded-3xl border border-red-300 bg-red-50 p-6 font-bold text-red-700">Error cargando productos: {error}</div>
      ) : !webSettings.storeOnline ? (
        <div className="my-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center"><Store className="mx-auto text-emerald-700" size={48} /><h1 className="mt-4 text-3xl font-black">Tienda temporalmente pausada</h1><p className="mt-2 font-semibold text-zinc-700">Estamos actualizando el catalogo. Vuelve pronto.</p></div>
      ) : !catalogLoading && filteredProducts.length === 0 ? (
        <div className="my-8 rounded-3xl border border-zinc-200 bg-white p-10 text-center"><PackageSearch className="mx-auto text-emerald-700" size={44} /><h2 className="mt-3 text-2xl font-black">No hay productos disponibles</h2><p className="mt-2 font-semibold text-zinc-800">{webSettings.emptyMessage}</p></div>
      ) : (
        <>
          {!search && !category && <WebBannerCarousel banners={banners} />}

          <section id="productos" className="scroll-mt-32 bg-white px-6 py-14 sm:px-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-black uppercase tracking-wide text-emerald-700">Catalogo</p><h2 className="text-3xl font-black">{search || category ? 'Resultados' : 'Mas vendidos'}</h2></div><p className="font-bold text-zinc-500">{totalProducts} productos</p></div>
            {catalogLoading ? <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: category ? CATEGORY_PAGE_SIZE : GENERAL_PAGE_SIZE }).map((_, index) => <div key={index} className="h-[420px] animate-pulse rounded-3xl border border-zinc-200 bg-zinc-50" />)}</div> : <><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => <ProductCard key={product.id} product={product} image={getProductMainImage(product.id, product.image_url, productImages)} />)}
            </div><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></>}
          </section>

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
        </>
      )}
    </WebStoreLayout>
  )
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index)
  return <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Paginación de productos"><button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>{pages.map((number) => <button key={number} type="button" onClick={() => onPageChange(number)} className={`h-10 min-w-10 rounded-xl px-3 text-sm font-black ${number === page ? 'bg-emerald-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}>{number}</button>)}<button type="button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button></nav>
}







