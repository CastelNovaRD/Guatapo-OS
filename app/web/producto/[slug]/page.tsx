'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, ImageIcon, MessageCircle, Minus, Plus, ShoppingCart, ZoomIn } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { getProductMainImage } from '@/lib/product-images'
import { getPublicStoreBySlug } from '@/lib/store-context'
import ProductCard from '@/components/web/ProductCard'
import WebStoreLayout from '@/components/web/WebStoreLayout'
import type { WebCategory, WebProduct, WebProductImage } from '@/components/web/types'
import { addProductToCart, openProductWhatsApp, productAvailability } from '@/components/web/cart'
import { DEFAULT_WEB_SETTINGS, WebSettings, normalizeWebSettings, readLocalWebSettings, saveLocalWebSettings } from '@/lib/web-settings'
import { buildCategoryUrl } from '@/lib/web-categories'

const specLabels: Record<string, string> = {
  cpu: 'Cpu',
  display: 'Display',
  storage: 'Storage',
  ram: 'Ram',
  camera: 'Camara',
  battery: 'Bateria',
}

export default function WebProductDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [product, setProduct] = useState<WebProduct | null>(null)
  const [relatedProducts, setRelatedProducts] = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [productImages, setProductImages] = useState<WebProductImage[]>([])
  const [selectedImage, setSelectedImage] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)

  const loadData = useCallback(async (currentSlug: string) => {
    setLoading(true)
    setError('')
    const store = await getPublicStoreBySlug('guatapo')

    if (!store) {
      setError('Tienda no encontrada')
      setLoading(false)
      return
    }

    let nextSettings = readLocalWebSettings(store.id)
    const settingsResult = await supabase.from('stores').select('web_settings').eq('id', store.id).maybeSingle()
    if (!settingsResult.error && settingsResult.data?.web_settings) {
      nextSettings = normalizeWebSettings(settingsResult.data.web_settings as Partial<WebSettings>)
      saveLocalWebSettings(store.id, nextSettings)
    }
    setWebSettings(nextSettings)

    const decodedSlug = decodeURIComponent(currentSlug)
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        decodedSlug
      )

    let productQuery = supabase
      .from('products')
      .select(
        'id, name, sale_price, coop_price, web_visibility, stock, category, slug, image_url, short_description, full_description, specs, featured'
      )
      .eq('store_id', store.id)
      .eq('active', true)
      .eq('show_on_website', true)
      .in('web_visibility', ['normal', 'both'])

    productQuery = isUuid
      ? productQuery.eq('id', decodedSlug)
      : productQuery.eq('slug', decodedSlug)

    const { data: productData, error: productError } = await productQuery.maybeSingle()

    const { data: categoriesData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('store_id', store.id)
      .eq('active', true)
      .order('name')

    const { data: imagesData } = await supabase
      .from('product_images')
      .select('id, product_id, image_url, is_primary, sort_order')
      .eq('store_id', store.id)
      .order('sort_order')

    if (productError || !productData) {
      setError(productError?.message || 'Producto no encontrado')
      setProduct(null)
      setRelatedProducts([])
      setCategories(categoriesData || [])
      setProductImages(imagesData || [])
      setLoading(false)
      return
    }

    const { data: relatedData } = await supabase
      .from('products')
      .select(
        'id, name, sale_price, coop_price, web_visibility, stock, category, slug, image_url, short_description, full_description, specs, featured'
      )
      .eq('store_id', store.id)
      .eq('active', true)
      .eq('show_on_website', true)
      .in('web_visibility', ['normal', 'both'])
      .eq('category', productData.category || '')
      .neq('id', productData.id)
      .limit(4)

    const mainImage = getProductMainImage(productData.id, productData.image_url, imagesData || [])

    setProduct(productData)
    setRelatedProducts(relatedData || [])
    setCategories(categoriesData || [])
    setProductImages(imagesData || [])
    setSelectedImage(mainImage || '')
    setCategory(productData.category || '')
    setQuantity(1)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (slug) void Promise.resolve().then(() => loadData(slug))
  }, [loadData, slug])

  const galleryImages = useMemo(() => {
    if (!product) return []

    const images = productImages
      .filter((image) => image.product_id === product.id)
      .map((image) => image.image_url)

    const fallback = product.image_url ? [product.image_url] : []
    return Array.from(new Set([...images, ...fallback]))
  }, [product, productImages])

  const specs = useMemo(() => {
    if (!product?.specs) return []

    return Object.entries(specLabels)
      .map(([key, label]) => ({
        key,
        label,
        value: product.specs?.[key],
      }))
      .filter((item) => item.value)
  }, [product])

  function changeQuantity(amount: number) {
    if (!product) return
    setQuantity((current) =>
      Math.max(1, Math.min(Number(product.stock || 1), current + amount))
    )
  }

  function addCurrentProduct() {
    if (!product) return
    const discountPercent = Math.min(
      100,
      Math.max(0, Number(product.specs?.web_discount_percent || 0))
    )
    addProductToCart(
      {
        ...product,
        sale_price: Number(product.sale_price || 0) * (1 - discountPercent / 100),
        image_url: selectedImage || product.image_url,
      },
      quantity
    )
  }

  return (
    <WebStoreLayout
      categories={categories}
      selectedCategory={category}
      search={search}
      onSearchChange={setSearch}
      onSelectCategory={(nextCategory) => {
        window.location.href = nextCategory
          ? `/web?category=${encodeURIComponent(nextCategory)}`
          : '/web'
      }}
      settings={webSettings}
    >
      <Link
        href="/web"
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-white px-5 py-3 font-black text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:text-white hover:shadow-lg"
      >
        <ArrowLeft size={18} />
        Volver al catalogo
      </Link>

      {loading ? (
        <div className="h-[620px] animate-pulse rounded-[28px] bg-emerald-50" />
      ) : error || !product ? (
        <div className="rounded-[24px] border-2 border-red-500 bg-red-50 p-8 font-bold text-red-700">
          {error || 'Producto no encontrado'}
        </div>
      ) : (
        <ProductDetailContent
          product={product}
          selectedImage={selectedImage}
          galleryImages={galleryImages}
          quantity={quantity}
          specs={specs}
          productImages={productImages}
          relatedProducts={relatedProducts}
          onSelectImage={setSelectedImage}
          onChangeQuantity={changeQuantity}
          onAdd={addCurrentProduct}
        />
      )}
    </WebStoreLayout>
  )
}

function ProductDetailContent({
  product,
  selectedImage,
  galleryImages,
  quantity,
  specs,
  productImages,
  relatedProducts,
  onSelectImage,
  onChangeQuantity,
  onAdd,
}: {
  product: WebProduct
  selectedImage: string
  galleryImages: string[]
  quantity: number
  specs: { key: string; label: string; value: string | null | undefined }[]
  productImages: WebProductImage[]
  relatedProducts: WebProduct[]
  onSelectImage: (image: string) => void
  onChangeQuantity: (amount: number) => void
  onAdd: () => void
}) {
  const availability = productAvailability(Number(product.stock || 0))
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(product.specs?.web_discount_percent || 0))
  )
  const effectivePrice = Number(product.sale_price || 0) * (1 - discountPercent / 100)
  const description =
    product.full_description ||
    product.short_description ||
    'Este producto aun no tiene descripcion detallada.'

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_470px]">
        <section>
          <div className="group relative flex min-h-[520px] items-center justify-center overflow-hidden rounded-[34px] border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white shadow-sm"><span className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm"><ZoomIn size={20} /></span>
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={product.name}
                className="max-h-[520px] w-full object-contain transition duration-300 group-hover:scale-110"
              />
            ) : (
              <ImageIcon className="text-zinc-300" size={64} />
            )}
          </div>

          {galleryImages.length > 1 && (
            <div className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-6">
              {galleryImages.map((image) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => onSelectImage(image)}
                  className={`flex aspect-square items-center justify-center rounded-2xl bg-white p-2 ${
                    selectedImage === image
                      ? 'outline outline-2 outline-emerald-700'
                      : 'outline outline-1 outline-zinc-200'
                  }`}
                >
                  <img src={image} alt={product.name} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-[34px] border border-zinc-200 bg-white p-7 shadow-xl shadow-zinc-200/70">
          <h1 className="text-3xl font-black leading-tight text-zinc-950 sm:text-4xl">
            {product.name}
          </h1>

          {discountPercent > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <span className="bg-red-600 px-3 py-1 text-sm font-black text-white">
                -{discountPercent}%
              </span>
              <span className="text-lg text-zinc-500 line-through">
                {formatMoney(product.sale_price)}
              </span>
            </div>
          )}
          <p className={`${discountPercent > 0 ? 'mt-2' : 'mt-5'} text-3xl font-black text-emerald-700 sm:text-4xl`}>
            {formatMoney(effectivePrice)}
          </p>

          <p className={`mt-2 text-sm font-black ${availability.className}`}>
            {availability.label}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label="Restar cantidad"
              onClick={() => onChangeQuantity(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black text-emerald-700"
            >
              <Minus size={18} />
            </button>
            <span className="flex h-11 min-w-11 items-center justify-center rounded-full border-2 border-zinc-950 bg-white px-3 text-xl font-black">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Sumar cantidad"
              onClick={() => onChangeQuantity(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black text-emerald-700"
            >
              <Plus size={18} />
            </button>

            <button
              type="button"
              onClick={onAdd}
              disabled={!availability.available}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 text-sm font-black uppercase text-white transition hover:-translate-y-0.5 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Anadir
              <ShoppingCart size={21} />
            </button>
            <button
              type="button"
              onClick={() => openProductWhatsApp({ ...product, sale_price: effectivePrice }, quantity)}
              disabled={!availability.available}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Comprar por WhatsApp
            </button>
          </div>

          <div className="mt-6">
            <h2 className="text-2xl font-black uppercase text-zinc-950">Descripcion</h2>
            <p className="mt-3 whitespace-pre-line text-base font-semibold leading-relaxed text-zinc-800">
              {description}
            </p>
          </div>

          {specs.length > 0 && (
            <div className="mt-4 grid grid-cols-[96px_1fr] gap-x-5 gap-y-1 text-base">
              {specs.map((spec) => (
                <div key={spec.key} className="contents">
                  <div className="font-black text-zinc-950">{spec.label}</div>
                  <div className="font-semibold text-zinc-800">{spec.value}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-12"><h2 className="mb-6 text-2xl font-black">Productos relacionados</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard
                key={relatedProduct.id}
                product={relatedProduct}
                image={getProductMainImage(
                  relatedProduct.id,
                  relatedProduct.image_url,
                  productImages
                )}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}




