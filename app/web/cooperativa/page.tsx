'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getProductMainImage } from '@/lib/product-images'
import { getPublicStoreBySlug } from '@/lib/store-context'
import ProductCard from '@/components/web/ProductCard'
import WebStoreLayout from '@/components/web/WebStoreLayout'
import type { WebCategory, WebProduct, WebProductImage } from '@/components/web/types'

function withCoopPrice(product: WebProduct): WebProduct {
  return {
    ...product,
    sale_price: Number(product.coop_price || product.sale_price || 0),
  }
}

export default function CooperativaWebPage() {
  const [products, setProducts] = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [productImages, setProductImages] = useState<WebProductImage[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const store = await getPublicStoreBySlug('guatapo')

    if (!store) {
      setError('Tienda no encontrada')
      setLoading(false)
      return
    }

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select(
        'id, name, sale_price, coop_price, web_visibility, stock, category, slug, image_url, short_description, full_description, specs, featured'
      )
      .eq('store_id', store.id)
      .eq('active', true)
      .in('web_visibility', ['coop', 'both'])
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })

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

    if (productsError) setError(productsError.message)

    setProducts((productsData || []).map(withCoopPrice))
    setCategories(categoriesData || [])
    setProductImages(imagesData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const initialCategory = new URLSearchParams(window.location.search).get('category') || ''
    if (initialCategory) setCategory(initialCategory)
  }, [])
  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  const filteredProducts = useMemo(() => {
    const query = search.toLowerCase().trim()

    return products.filter((product) => {
      const searchableText = [
        product.name,
        product.category,
        product.short_description,
        product.full_description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = query ? searchableText.includes(query) : true
      const matchesCategory = category ? product.category === category : true

      return matchesSearch && matchesCategory
    })
  }, [products, search, category])

  return (
    <WebStoreLayout
      categories={categories}
      selectedCategory={category}
      search={search}
      onSearchChange={setSearch}
      onSelectCategory={setCategory}
    >
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-[360px] animate-pulse rounded-[24px] border-2 border-emerald-700 bg-emerald-50"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[24px] border-2 border-red-500 bg-red-50 p-6 font-bold text-red-700">
          Error cargando productos: {error}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-[24px] border-2 border-emerald-700 bg-white p-10 text-center">
          <PackageSearch className="mx-auto text-emerald-700" size={44} />
          <h2 className="mt-3 text-2xl font-black">No hay productos cooperativos</h2>
          <p className="mt-2 font-semibold text-zinc-800">
            Prueba con otra busqueda o categoria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              image={getProductMainImage(product.id, product.image_url, productImages)}
              productUrlBase="/web/cooperativa/producto"
            />
          ))}
        </div>
      )}
    </WebStoreLayout>
  )
}

