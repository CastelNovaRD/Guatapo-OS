'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, ImageIcon, Minus, Plus, ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/format'
import { getProductMainImage } from '@/lib/product-images'
import { getPublicStoreBySlug } from '@/lib/store-context'
import ProductCard from '@/components/web/ProductCard'
import WebStoreLayout from '@/components/web/WebStoreLayout'
import type { WebCategory, WebProduct, WebProductImage } from '@/components/web/types'
import { addProductToCart, openProductWhatsApp, productAvailability } from '@/components/web/cart'

const specLabels: Record<string, string> = {
  cpu: 'Cpu',
  display: 'Display',
  storage: 'Storage',
  ram: 'Ram',
  camera: 'Camara',
  battery: 'Bateria',
}

function withCoopPrice(product: WebProduct): WebProduct {
  return {
    ...product,
    sale_price: Number(product.coop_price || product.sale_price || 0),
  }
}

export default function CooperativaProductDetailPage() {
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

  const loadData = useCallback(async (currentSlug: string) => {
    setLoading(true)
    setError('')
    const store = await getPublicStoreBySlug('guatapo')

    if (!store) {
      setError('Tienda no encontrada')
      setLoading(false)
      return
    }

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
      .in('web_visibility', ['coop', 'both'])

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
      .in('web_visibility', ['coop', 'both'])
      .eq('category', productData.category || '')
      .neq('id', productData.id)
      .limit(4)

    const mainImage = getProductMainImage(productData.id, productData.image_url, imagesData || [])
    const pricedProduct = withCoopPrice(productData)

    setProduct(pricedProduct)
    setRelatedProducts((relatedData || []).map(withCoopPrice))
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
    addProductToCart({ ...product, image_url: selectedImage || product.image_url }, quantity)
  }

  return (
    <WebStoreLayout
      categories={categories}
      selectedCategory={category}
      search={search}
      onSearchChange={setSearch}
      onSelectCategory={(nextCategory) => {
        window.location.href = nextCategory
          ? `/web/cooperativa?category=${encodeURIComponent(nextCategory)}`
          : '/web/cooperativa'
      }}
    >
      <Link
        href="/web/cooperativa"
        className="mb-5 inline-flex items-center gap-2 rounded-xl border-2 border-emerald-700 px-4 py-2 font-black text-emerald-700 transition hover:bg-emerald-700 hover:text-white"
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
  const description =
    product.full_description ||
    product.short_description ||
    'Este producto aun no tiene descripcion detallada.'

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section>
          <div className="flex min-h-[380px] items-center justify-center bg-white">
            {selectedImage ? (
              <img
                src={selectedImage}
                alt={product.name}
                className="max-h-[520px] w-full object-contain"
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

        <aside className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-7 shadow-sm">
          <h1 className="text-3xl font-black leading-tight text-zinc-950 sm:text-4xl">
            {product.name}
          </h1>

          <p className="mt-5 text-3xl font-black text-emerald-700 sm:text-4xl">
            {formatMoney(product.sale_price)}
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
              className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 bg-white px-5 text-sm font-black uppercase text-emerald-700 transition hover:bg-emerald-700 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-300"
            >
              Anadir
              <ShoppingCart size={21} />
            </button>
            <button
              type="button"
              onClick={() => openProductWhatsApp(product, quantity)}
              disabled={!availability.available}
              className="flex h-11 items-center justify-center rounded-xl border-2 border-emerald-700 bg-white px-5 text-sm font-black text-emerald-700 transition hover:bg-emerald-700 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-300"
            >
              Hacer pedido
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
        <section className="mt-8">
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
                productUrlBase="/web/cooperativa/producto"
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

