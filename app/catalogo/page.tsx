'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, Grid2X2, Heart, ImageIcon, MessageCircle, Search, ShieldCheck, Sparkles, Star, Truck, X } from 'lucide-react'

type CatalogProduct = {
  name: string
  salePrice: number
  shortDescription: string | null
  fullDescription: string | null
  category: string | null
  imageUrl: string | null
  availability: 'Agotado' | 'Últimas unidades' | 'Disponible'
}

type CatalogData = {
  store: { name: string; systemName: string | null; logoUrl: string | null; publicName: string | null; primaryColor: string | null; accentColor: string | null; heroTitle: string | null; heroSubtitle: string | null; heroBannerUrl: string | null; whatsapp: string | null }
  categories: string[]
  products: CatalogProduct[]
}

const money = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 })

function availabilityStyle(availability: CatalogProduct['availability']) {
  if (availability === 'Agotado') return 'bg-zinc-900 text-white'
  if (availability === 'Últimas unidades') return 'bg-amber-100 text-amber-900'
  return 'bg-emerald-50 text-emerald-700'
}

function whatsappUrl(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') || ''
  const normalized = digits.length === 10 ? `1${digits}` : digits
  return normalized.length >= 11 && normalized.length <= 15 ? `https://wa.me/${normalized}` : null
}

function ProductImage({ product, className }: { product: CatalogProduct; className?: string }) {
  if (product.imageUrl) return <img src={product.imageUrl} alt={product.name} className={className} loading="lazy" />
  return <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#f9f2eb] via-[#fcfaf8] to-[#f1e5d8] px-4 text-center text-[#b18a62]"><ImageIcon size={32} strokeWidth={1.5} aria-hidden="true" /><span className="line-clamp-2 font-serif text-base italic">{product.name}</span></div>
}

export default function CatalogoPage() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null)
  const [sortBy, setSortBy] = useState<'recent' | 'price-asc' | 'price-desc' | 'name'>('recent')
  const productsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const store = new URLSearchParams(window.location.search).get('store')?.trim()
    let active = true
    const loadCatalog = async () => {
      if (!store) { setError('Este catálogo necesita el identificador público de una tienda.'); setLoading(false); return }
      try {
        setSearching(Boolean(search.trim() || activeCategory))
        const params = new URLSearchParams({ store })
        if (search.trim()) params.set('search', search.trim())
        if (activeCategory) params.set('category', activeCategory)
        const response = await fetch(`/api/catalog?${params}`, { cache: 'no-store' })
        const data = await response.json().catch(() => null) as CatalogData & { error?: string } | null
        if (!response.ok || !data) throw new Error(data?.error || 'No fue posible cargar el catálogo.')
        if (active) { setCatalog(data); setError('') }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el catálogo.')
      } finally {
        if (active) { setLoading(false); setSearching(false) }
      }
    }
    const timer = window.setTimeout(() => void loadCatalog(), search.trim() || activeCategory ? 260 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeCategory, search])

  const products = [...(catalog?.products ?? [])].sort((left, right) => {
    if (sortBy === 'price-asc') return left.salePrice - right.salePrice
    if (sortBy === 'price-desc') return right.salePrice - left.salePrice
    if (sortBy === 'name') return left.name.localeCompare(right.name, 'es')
    return 0
  })
  const configuredPublicName = catalog?.store.publicName?.trim() || null
  const storeName = catalog?.store.name?.trim() || null
  // The development store's internal label is not public catalog branding.
  const publicStoreName = storeName && !/^shopdesk\s+desarrollo$/i.test(storeName) ? storeName : null
  const publicName = configuredPublicName || publicStoreName
  const catalogName = publicName || 'Catálogo digital'
  const hasLogo = Boolean(catalog?.store.logoUrl)
  const contactUrl = whatsappUrl(catalog?.store.whatsapp)
  const heroStyle = catalog?.store.heroBannerUrl
    ? { backgroundImage: `linear-gradient(90deg, rgba(255,255,255,.92), rgba(255,255,255,.38)), url(${catalog.store.heroBannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: catalog?.store.primaryColor || '#f6eadc' }

  return (
    <main className="min-h-screen bg-[#fcfaf8] text-zinc-900">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-1.5 sm:min-h-[110px] sm:gap-x-3 sm:gap-y-3 sm:px-6 sm:py-2 lg:min-h-[128px] lg:flex-nowrap lg:px-8">
          <div className="flex min-w-0 shrink-0 items-center">
            {hasLogo ? <div className="h-14 w-[132px] sm:h-[90px] sm:w-[150px] lg:h-[110px] lg:w-[170px]"><img src={catalog!.store.logoUrl!} alt={publicName ? `Logo de ${publicName}` : 'Logo del catálogo'} className="h-full w-full object-contain object-left" /></div> : <div className="flex min-w-0 items-center gap-2.5 sm:gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#b18a62] sm:h-12 sm:w-12"><Building2 size={23} strokeWidth={1.5} aria-hidden="true" /></div><div className="min-w-0"><p className="truncate font-serif text-lg font-semibold leading-tight text-zinc-950 sm:text-xl">{catalogName}</p><p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:block">Catálogo digital</p></div></div>}
          </div>
          <label className="relative order-3 min-w-0 basis-full md:order-2 md:ml-auto md:max-w-xl md:flex-1 lg:order-none lg:ml-8 lg:basis-auto lg:max-w-none lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar productos..." className="h-10 w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-3 text-[13px] outline-none transition placeholder:text-zinc-400 focus:border-[#b18a62] focus:bg-white focus:ring-4 focus:ring-[#ead8c4]/45 sm:hidden" aria-label="Buscar productos" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar un perfume, marca o fragancia..." className="hidden h-11 w-full rounded-full border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[#b18a62] focus:bg-white focus:ring-4 focus:ring-[#ead8c4]/45 sm:block" aria-label="Buscar un perfume, marca o fragancia" />
          </label>
          {contactUrl && <a href={contactUrl} target="_blank" rel="noreferrer" className="order-2 ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl px-1 py-1.5 text-left transition hover:bg-emerald-50 lg:order-none lg:ml-5 lg:gap-2 lg:py-2"><MessageCircle size={26} className="shrink-0 text-[#22c55e] lg:hidden" strokeWidth={2} aria-hidden="true" /><MessageCircle size={34} className="hidden shrink-0 text-[#22c55e] lg:block" strokeWidth={2} aria-hidden="true" /><span className="leading-tight"><span className="block text-xs font-bold text-zinc-950 sm:text-sm">Contáctanos</span><span className="hidden text-xs text-zinc-500 lg:block">Escríbenos por WhatsApp</span></span></a>}
        </div>
      </header>

      <section style={heroStyle} className="relative isolate overflow-hidden border-b border-[#eadfd3] bg-gradient-to-br from-[#f6eadc] via-[#f9f5ef] to-[#e8ddd1]">
        <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-[#d6af82]/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-52 w-52 rounded-full bg-white blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-16 lg:px-10 lg:py-24"><div className="max-w-2xl">{publicName && <p style={{ color: catalog?.store.accentColor || '#8d6848' }} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.28em]"><Sparkles size={14} /> {publicName}</p>}<h1 className={`${publicName ? 'mt-4' : ''} font-serif text-3xl font-semibold leading-[1.08] tracking-tight text-zinc-950 sm:text-6xl`}>{catalog?.store.heroTitle || 'Descubre tu esencia'}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-700 sm:mt-4 sm:text-lg sm:leading-7">{catalog?.store.heroSubtitle || 'Perfumes para cada ocasión. Encuentra la fragancia perfecta para ti.'}</p><button type="button" style={{ backgroundColor: catalog?.store.primaryColor || '#18181b' }} onClick={() => productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold sm:mt-7 sm:min-h-12 sm:px-6 sm:py-3 text-white shadow-lg shadow-zinc-900/15 transition hover:opacity-90">Ver productos <ArrowRight size={17} /></button></div></div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {!loading && !error && catalog && catalog.categories.length > 0 && <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]"><button type="button" onClick={() => setActiveCategory('')} className={`flex min-h-28 min-w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition ${!activeCategory ? 'border-[#9ad8ed] bg-[#eefaff] text-[#06799f]' : 'border-zinc-100 bg-white text-zinc-700 hover:border-[#d6af82]'}`}><Grid2X2 size={25} /><span>Todos</span><span className="text-[11px] font-medium">Ver todo</span></button>{catalog.categories.map((category, index) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`flex min-h-28 min-w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border px-4 text-center text-sm font-bold transition ${activeCategory === category ? 'border-[#9ad8ed] bg-[#eefaff] text-[#06799f]' : 'border-zinc-100 bg-white text-zinc-700 hover:border-[#d6af82]'}`}><Sparkles size={25} style={{ color: index % 2 ? catalog.store.accentColor || '#d6af82' : catalog.store.primaryColor || '#0f766e' }} /><span className="line-clamp-2">{category}</span><span className="text-[11px] font-medium text-zinc-500">Ver productos</span></button>)}</div>}

        <section ref={productsRef} className="scroll-mt-24 pt-3 sm:pt-7">
          <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8"><div><h2 className="font-serif text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Nuestros productos</h2><p className="mt-1 text-sm text-zinc-500 sm:text-base">Explora nuestra colección de fragancias</p></div><div className="flex items-center gap-2"><label className="hidden text-sm text-zinc-500 sm:block">Ordenar por</label><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-[#9ad8ed]"><option value="recent">Más recientes</option><option value="price-asc">Precio menor</option><option value="price-desc">Precio mayor</option><option value="name">Nombre</option></select>{searching && <span className="hidden text-sm font-medium text-zinc-500 lg:block">Actualizando…</span>}</div></div>
          {loading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-2xl border border-zinc-100 bg-white"><div className="aspect-[4/5] bg-zinc-200" /><div className="space-y-3 p-4"><div className="h-4 rounded bg-zinc-200" /><div className="h-4 w-2/3 rounded bg-zinc-200" /></div></div>)}</div>}
          {!loading && error && <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-rose-50 p-7 text-center text-rose-900"><p className="font-semibold">No pudimos abrir este catálogo.</p><p className="mt-2 text-sm">{error}</p></div>}
          {!loading && !error && !searching && products.length === 0 && <div className="mx-auto max-w-lg rounded-3xl border border-zinc-100 bg-white p-10 text-center shadow-sm"><p className="font-serif text-2xl font-semibold">No encontramos productos</p><p className="mt-2 text-sm text-zinc-500">Prueba con otro nombre o categoría.</p></div>}
          {!loading && !error && products.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">{products.map((product, index) => <article key={`${product.name}-${product.salePrice}-${index}`} className={`group overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition sm:hover:-translate-y-1 sm:hover:shadow-xl ${product.availability === 'Agotado' ? 'opacity-80' : ''}`}><div className="relative aspect-[4/5] overflow-hidden bg-[#f8f4ef]"><ProductImage product={product} className="h-full w-full object-cover transition duration-500 sm:group-hover:scale-105" /><span className={`absolute bottom-2 left-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold sm:bottom-3 sm:left-3 sm:text-xs ${availabilityStyle(product.availability)}`}>{product.availability}</span></div><div className="p-3 sm:p-4"><h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-zinc-950 sm:text-base">{product.name}</h3>{product.category && <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-[#9b714b] sm:text-xs">{product.category}</p>}{product.shortDescription && <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-zinc-500">{product.shortDescription}</p>}<p className="mt-3 text-base font-bold text-zinc-950 sm:text-lg">{money.format(product.salePrice)}</p><button type="button" onClick={() => setSelectedProduct(product)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#d8b28e] bg-[#fffaf5] px-3 text-xs font-bold text-[#855b37] transition hover:bg-[#f8eadc] sm:text-sm">Ver detalle</button></div></article>)}</div>}
        </section>
      </section>

      <section className="border-y border-cyan-50 bg-gradient-to-r from-[#f2fcff] via-white to-[#fff8ef]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            { icon: ShieldCheck, title: 'Productos de calidad', text: 'Una selección para cada ocasión.' },
            { icon: Truck, title: 'Atención personalizada', text: 'Estamos para ayudarte.' },
            { icon: Star, title: 'Variedad de marcas', text: 'Descubre nuevas fragancias.' },
            { icon: Heart, title: 'Tu esencia, nuestra pasión', text: 'Gracias por tu confianza.' },
          ].map(({ icon: Icon, title, text }) => <div key={title} className="flex min-h-24 items-center gap-4 rounded-2xl border border-white bg-white/85 p-4 shadow-sm"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#effbff] text-[#087e9f]"><Icon size={24} strokeWidth={1.8} /></div><div><p className="text-sm font-bold text-zinc-900">{title}</p><p className="mt-1 text-xs leading-4 text-zinc-500">{text}</p></div></div>)}
        </div>
      </section>

      <footer className="overflow-hidden border-t border-[#dcecf0] bg-gradient-to-br from-white via-[#f8fdff] to-[#effaff] text-[#12394b]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_0.8fr_1.15fr] lg:px-10">
          <div><div className="flex items-center gap-3">{hasLogo ? <div className="h-16 w-32 shrink-0"><img src={catalog!.store.logoUrl!} alt={publicName ? `Logo de ${publicName}` : 'Logo del catálogo'} className="h-full w-full object-contain object-left" /></div> : <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm"><Building2 size={25} strokeWidth={1.5} aria-hidden="true" /></div>}{publicName && <div><p className="font-serif text-xl font-semibold text-[#07334a]">{publicName}</p><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2c7f99]">Catálogo digital</p></div>}</div><p className="mt-4 max-w-xs text-sm leading-6 text-[#527184]">{publicName ? `Explora productos y disponibilidad actualizada de ${publicName}.` : 'Explora productos y disponibilidad actualizada.'}</p></div>
          <div><p className="text-sm font-bold text-[#07334a]">Enlaces</p><div className="mt-3 flex flex-col items-start gap-2 text-sm text-[#38647a]"><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="transition hover:text-[#087e9f]">Inicio</button><button type="button" onClick={() => productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="transition hover:text-[#087e9f]">Todos los productos</button></div></div>
          <div><p className="text-sm font-bold text-[#07334a]">Catálogo</p><p className="mt-3 max-w-sm text-sm leading-6 text-[#527184]">Consulta los productos disponibles y sus detalles. Para contacto o pedidos, utiliza los canales oficiales de la tienda.</p></div>
        </div><div className="border-t border-[#dcecf0] bg-[#06455e] text-[#d9f4fb]"><div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4 text-xs sm:flex-row sm:justify-between sm:px-8 lg:px-10"><span>© {new Date().getFullYear()} {catalogName}. Todos los derechos reservados.</span><span>Catálogo digital desarrollado por CastelNova OS</span></div></div>
      </footer>

      {selectedProduct && <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Detalle de ${selectedProduct.name}`}><button type="button" aria-label="Cerrar detalle" onClick={() => setSelectedProduct(null)} className="absolute inset-0 cursor-default" /><article className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl"><button type="button" onClick={() => setSelectedProduct(null)} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-sm transition hover:bg-zinc-100" aria-label="Cerrar"><X size={20} /></button><div className="grid sm:grid-cols-2"><div className="aspect-square overflow-hidden bg-[#f8f4ef]"><ProductImage product={selectedProduct} className="h-full w-full object-cover" /></div><div className="p-6 sm:p-8">{selectedProduct.category && <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9b714b]">{selectedProduct.category}</p>}<h2 className="mt-2 font-serif text-3xl font-semibold leading-tight text-zinc-950">{selectedProduct.name}</h2><p className="mt-4 text-2xl font-bold text-zinc-950">{money.format(selectedProduct.salePrice)}</p><span className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${availabilityStyle(selectedProduct.availability)}`}>{selectedProduct.availability}</span>{(selectedProduct.fullDescription || selectedProduct.shortDescription) && <p className="mt-5 whitespace-pre-line text-sm leading-6 text-zinc-600">{selectedProduct.fullDescription || selectedProduct.shortDescription}</p>}</div></div></article></div>}
    </main>
  )
}


