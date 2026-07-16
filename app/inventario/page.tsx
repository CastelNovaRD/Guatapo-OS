'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatMoney } from '@/lib/format'
import ProductGallery from '@/components/inventory/ProductGallery'
import { getCurrentStoreId } from '@/lib/store-context'
import { uploadProductImageOrFallback } from '@/lib/image-upload'
import { logAudit } from '@/lib/audit'
import ExportModal from '@/components/export/ExportModal'
import { exportInventory } from '@/lib/export/inventory-export'
import type { ExportFormat, InventoryExportScope } from '@/lib/export/export-types'
import {
  Archive,
  Download,
  Edit,
  Eye,
  EyeOff,
  History,
  ImageIcon,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

type Product = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  image_url: string | null
  cost: number
  sale_price: number
  coop_price: number | null
  stock: number
  product_type: string
  category: string | null
  active: boolean | null
  show_on_website: boolean | null
  web_visibility: string | null
  featured: boolean | null
  short_description: string | null
  slug: string | null
  full_description: string | null
  specs: any
}

type Category = {
  id: string
  name: string
}

type ProductTypeOption = {
  value: string
  label: string
}

const DEFAULT_PRODUCT_TYPES: ProductTypeOption[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'phone', label: 'Celular' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'laptop', label: 'Laptop' },
  { value: 'accessory', label: 'Accesorio' },
  { value: 'adapter', label: 'Adaptador' },
  { value: 'digital_product', label: 'Producto digital' },
  { value: 'console', label: 'Consola' },
  { value: 'tv', label: 'TV' },
]

type Movement = {
  id: string
  movement_type: string
  quantity: number
  previous_stock: number
  new_stock: number
  reference_type: string | null
  notes: string | null
  created_at: string
}

type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

type ProductForm = {
  name: string
  sku: string
  barcode: string
  image_url: string
  cost: string
  sale_price: string
  coop_price: string
  stock: string
  product_type: string
  category: string
  active: boolean
  show_on_website: boolean
  web_visibility: string
  featured: boolean
  short_description: string
  slug: string
  full_description: string
  cpu: string
  display: string
  storage: string
  ram: string
  camera: string
  battery: string
  web_discount_percent: string
}

const emptyForm: ProductForm = {
  name: '',
  sku: '',
  barcode: '',
  image_url: '',
  cost: '',
  sale_price: '',
  coop_price: '',
  stock: '',
  product_type: 'normal',
  category: '',
  active: true,
  show_on_website: true,
  web_visibility: 'normal',
  featured: false,
  short_description: '',
  slug: '',
  full_description: '',
  cpu: '',
  display: '',
  storage: '',
  ram: '',
  camera: '',
  battery: '',
  web_discount_percent: '',
}

function ean13CheckDigit(base12: string) {
  const sum = base12
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)

  return String((10 - (sum % 10)) % 10)
}

function getNextProductSequence(products: Product[]) {
  const maxReference = products.reduce((max, product) => {
    const match = product.sku?.match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return Math.max(maxReference, products.length) + 1
}

function generateProductReference(products: Product[]) {
  let sequence = getNextProductSequence(products)
  let reference = `REF-${String(sequence).padStart(6, '0')}`

  while (products.some((product) => product.sku === reference)) {
    sequence += 1
    reference = `REF-${String(sequence).padStart(6, '0')}`
  }

  return reference
}

function generateProductBarcode(products: Product[]) {
  let sequence = getNextProductSequence(products)
  let barcode = ''

  do {
    const base12 = `746${String(Date.now()).slice(-6)}${String(sequence).padStart(3, '0')}`.slice(0, 12)
    barcode = `${base12}${ean13CheckDigit(base12)}`
    sequence += 1
  } while (products.some((product) => product.barcode === barcode))

  return barcode
}

export default function InventarioPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([])
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [stockMinFilter, setStockMinFilter] = useState('')
  const [stockMaxFilter, setStockMaxFilter] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const [exportScope, setExportScope] = useState<InventoryExportScope>('all')
  const [exportCategory, setExportCategory] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [pendingImages, setPendingImages] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const [stockModal, setStockModal] = useState(false)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [newStock, setNewStock] = useState('')
  const [stockNote, setStockNote] = useState('')

  const [kardexModal, setKardexModal] = useState(false)
  const [kardexProduct, setKardexProduct] = useState<Product | null>(null)

function getProductMainImage(product: Product) {
  const images = productImages.filter((img) => img.product_id === product.id)
  const primary = images.find((img) => img.is_primary)

  return primary?.image_url || images[0]?.image_url || product.image_url
}

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)

    if (!currentStoreId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, barcode, image_url, cost, sale_price, coop_price, stock, product_type, category, active, show_on_website, web_visibility, featured, short_description, slug, full_description, specs')
      .eq('store_id', currentStoreId)
      .order('created_at', { ascending: false })

    const { data: categoriesData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .order('name')

    const { data: productTypesData } = await supabase
      .from('product_types')
      .select('value, label')
      .eq('store_id', currentStoreId)
      .eq('active', true)
      .order('label')

    const { data: imagesData } = await supabase
     .from('product_images')
     .select('id, product_id, image_url, is_primary, sort_order')
     .eq('store_id', currentStoreId)
     .order('sort_order')

    if (productsError) alert('Error cargando inventario: ' + productsError.message)

    setProducts(productsData || [])
    setCategories(categoriesData || [])
    setProductTypes(productTypesData || [])
    setProductImages(imagesData || [])
    setLoading(false)
  }

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim()

    const filtered = products.filter((product) => {
      const text = `${product.name} ${product.sku || ''} ${product.barcode || ''} ${product.category || ''}`.toLowerCase()

      const matchSearch = q ? text.includes(q) : true
      const matchCategory = categoryFilter ? product.category === categoryFilter : true
      const matchActive =
        activeFilter === 'active'
          ? product.active !== false
          : activeFilter === 'inactive'
            ? product.active === false
            : true
      const stock = Number(product.stock || 0)
      const matchStock =
        stockFilter === 'low'
          ? stock > 0 && stock <= 2
          : stockFilter === 'out'
            ? stock <= 0
            : true
      const minStock = stockMinFilter === '' ? null : Number(stockMinFilter)
      const maxStock = stockMaxFilter === '' ? null : Number(stockMaxFilter)
      const matchMinStock = minStock === null || stock >= minStock
      const matchMaxStock = maxStock === null || stock <= maxStock

      return matchSearch && matchCategory && matchActive && matchStock && matchMinStock && matchMaxStock
    })

    return filtered
  }, [products, search, categoryFilter, activeFilter, stockFilter, stockMinFilter, stockMaxFilter])

  const allCategoryNames = useMemo(() => {
    const names = new Set<string>()

    categories.forEach((category) => {
      if (category.name?.trim()) names.add(category.name.trim())
    })

    products.forEach((product) => {
      if (product.category?.trim()) names.add(product.category.trim())
    })

    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [categories, products])

  const allProductTypes = useMemo(() => {
    const options = new Map<string, string>()

    DEFAULT_PRODUCT_TYPES.forEach((type) => options.set(type.value, type.label))
    productTypes.forEach((type) => options.set(type.value, type.label))

    products.forEach((product) => {
      if (product.product_type && !options.has(product.product_type)) {
        options.set(product.product_type, product.product_type)
      }
    })

    return Array.from(options.entries()).map(([value, label]) => ({ value, label }))
  }, [productTypes, products])

  const activeProducts = products.filter((p) => p.active !== false)
  const inventoryValue = activeProducts.reduce(
    (sum, p) => sum + Number(p.cost || 0) * Number(p.stock || 0),
    0
  )
  const inventorySaleValue = activeProducts.reduce(
    (sum, p) => sum + Number(p.sale_price || 0) * Number(p.stock || 0),
    0
  )
  const lowStock = activeProducts.filter((p) => p.stock > 0 && p.stock <= 2)
  const outOfStock = activeProducts.filter((p) => p.stock <= 0)

  function openNewProduct() {
    setEditingProduct(null)
    setPendingImages([])
    setForm({
      ...emptyForm,
      sku: generateProductReference(products),
      barcode: generateProductBarcode(products),
    })
    setModalOpen(true)
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setPendingImages([])
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      image_url: product.image_url || '',
      cost: String(product.cost || ''),
      sale_price: String(product.sale_price || ''),
      coop_price: String(product.coop_price || ''),
      stock: String(product.stock || ''),
      product_type: product.product_type || 'normal',
      category: product.category || '',
      active: product.active !== false,
      show_on_website: product.show_on_website !== false,
      web_visibility: product.web_visibility || (product.show_on_website === false ? 'hidden' : 'normal'),
      featured: product.featured === true,
      short_description: product.short_description || '',
      slug: product.slug || '',
      full_description: product.full_description || '',
      cpu: product.specs?.cpu || '',
      display: product.specs?.display || '',
      storage: product.specs?.storage || '',
      ram: product.specs?.ram || '',
      camera: product.specs?.camera || '',
      battery: product.specs?.battery || '',
      web_discount_percent: String(product.specs?.web_discount_percent || ''),
    })
    setModalOpen(true)
  }

  function updateForm(field: keyof ProductForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function regenerateReference() {
    updateForm('sku', generateProductReference(products))
  }

  function regenerateBarcode() {
    updateForm('barcode', generateProductBarcode(products))
  }

async function uploadProductImage(file: File) {
  if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

  if (!editingProduct) {
    setPendingImages((current) => [...current, file])
    return
  }

  await uploadProductImageForProduct(file, editingProduct.id)
  await loadData()
}

async function uploadProductImageForProduct(file: File, productId: string, sortOffset = 0) {
  if (!storeId) return

  const fileExt = file.name.split('.').pop()
  const fileName = `${productId}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2)}.${fileExt}`

  let imageUrl = ''

  try {
    imageUrl = await uploadProductImageOrFallback(file, fileName)
  } catch (error) {
    alert('Error subiendo imagen: ' + (error instanceof Error ? error.message : 'Error desconocido'))
    return
  }

  const existingImages = productImages.filter(
    (img) => img.product_id === productId
  )

  const isFirstImage = existingImages.length === 0 && sortOffset === 0

  const { error: insertError } = await supabase.from('product_images').insert({
    store_id: storeId,
    product_id: productId,
    image_url: imageUrl,
    is_primary: isFirstImage,
    sort_order: existingImages.length + sortOffset + 1,
  })

  if (insertError) {
    alert('Imagen subida, pero no se guardó en galería: ' + insertError.message)
    return
  }
}

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) return alert('Escribe el nombre del producto')
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    setSaving(true)

    const payload = {
      store_id: storeId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      image_url: form.image_url.trim() || null,
      cost: Number(form.cost || 0),
      sale_price: Number(form.sale_price || 0),
      coop_price: Number(form.coop_price || 0),
      stock: Number(form.stock || 0),
      product_type: form.product_type,
      category: form.category || null,
      active: form.active,
      show_on_website: form.web_visibility === 'normal' || form.web_visibility === 'both',
      web_visibility: form.web_visibility,
      featured: form.featured,
      short_description: form.short_description.trim() || null,
      slug: form.slug.trim() || null,
      full_description: form.full_description.trim() || null,
      specs: {
        ...(editingProduct?.specs || {}),
        cpu: form.cpu,
        display: form.display,
        storage: form.storage,
        ram: form.ram,
        camera: form.camera,
        battery: form.battery,
        web_discount_percent: Math.min(100, Math.max(0, Number(form.web_discount_percent || 0))),
      },
    }

    let savedProductId = editingProduct?.id || ''

    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('store_id', storeId)
        .eq('id', editingProduct.id)

      if (error) {
        setSaving(false)
        return alert('Error actualizando producto: ' + error.message)
      }
    
      await logAudit({
        storeId,
        module: 'inventario',
        action: 'product.update',
        entityType: 'product',
        entityId: editingProduct.id,
        summary: 'Producto actualizado: ' + payload.name + '.',
        beforeData: editingProduct,
        afterData: payload,
      })
    } else {
      const { data: createdProduct, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single()

      if (error) {
        setSaving(false)
        return alert('Error creando producto: ' + error.message)
      }

      savedProductId = createdProduct.id
    
      await logAudit({
        storeId,
        module: 'inventario',
        action: 'product.create',
        entityType: 'product',
        entityId: createdProduct.id,
        summary: 'Producto creado: ' + payload.name + '.',
        afterData: payload,
      })
    }

    if (savedProductId && pendingImages.length > 0) {
      for (const [index, file] of pendingImages.entries()) {
        await uploadProductImageForProduct(file, savedProductId, index)
      }
    }

    if (form.category.trim()) {
      await supabase.from('categories').upsert(
        {
          store_id: storeId,
          name: form.category.trim(),
          active: true,
        },
        { onConflict: 'store_id,name' }
      )
    }

    setSaving(false)
    setModalOpen(false)
    setEditingProduct(null)
    setPendingImages([])
    setForm(emptyForm)
    loadData()
  }

  async function toggleProductActive(product: Product) {
    const isActive = product.active !== false

    const { error } = await supabase
      .from('products')
      .update({ active: !isActive })
      .eq('store_id', storeId)
      .eq('id', product.id)

    if (error) return alert('Error cambiando estado: ' + error.message)

    
    await logAudit({
      storeId,
      module: 'inventario',
      action: 'product.toggle_active',
      entityType: 'product',
      entityId: product.id,
      summary: 'Producto ' + (!isActive ? 'activado' : 'desactivado') + ': ' + product.name + '.',
      beforeData: { active: isActive },
      afterData: { active: !isActive },
    })

    loadData()
  }

  async function deleteProduct(product: Product) {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return

    const { error } = await supabase.from('products').delete().eq('store_id', storeId).eq('id', product.id)

    if (error) return alert('Error eliminando producto: ' + error.message)

    
    await logAudit({
      storeId,
      module: 'inventario',
      action: 'product.delete',
      entityType: 'product',
      entityId: product.id,
      summary: 'Producto eliminado: ' + product.name + '.',
      beforeData: product,
    })

    loadData()
  }

  function openStockModal(product: Product) {
    setStockProduct(product)
    setNewStock(String(product.stock || 0))
    setStockNote('')
    setStockModal(true)
  }

  async function saveStockAdjustment() {
    if (!stockProduct) return
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')

    const previousStock = Number(stockProduct.stock || 0)
    const updatedStock = Number(newStock || 0)
    const difference = updatedStock - previousStock

    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: updatedStock })
      .eq('store_id', storeId)
      .eq('id', stockProduct.id)

    if (updateError) return alert('Error actualizando stock: ' + updateError.message)

    const { error: movementError } = await supabase.from('inventory_movements').insert({
      store_id: storeId,
      product_id: stockProduct.id,
      movement_type: 'adjustment',
      quantity: difference,
      previous_stock: previousStock,
      new_stock: updatedStock,
      reference_type: 'manual_adjustment',
      notes: stockNote || 'Ajuste manual de inventario',
    })

    if (movementError) return alert('Stock actualizado, pero error guardando movimiento: ' + movementError.message)

    
    await logAudit({
      storeId,
      module: 'inventario',
      action: 'stock.adjust',
      entityType: 'product',
      entityId: stockProduct.id,
      summary: 'Stock ajustado para ' + stockProduct.name + ': ' + previousStock + ' -> ' + updatedStock + '.',
      beforeData: { stock: previousStock },
      afterData: { stock: updatedStock, difference, note: stockNote },
    })

    setStockModal(false)
    setStockProduct(null)
    loadData()
  }


  async function handleExportInventory() {
    await exportInventory({
      products,
      format: exportFormat,
      scope: exportScope,
      category: exportCategory,
    })
    setExportModalOpen(false)
  }

  async function openKardex(product: Product) {
    setKardexProduct(product)
    setKardexModal(true)

    const { data, error } = await supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity, previous_stock, new_stock, reference_type, notes, created_at')
      .eq('store_id', storeId)
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })

    if (error) {
      alert('Error cargando Kardex: ' + error.message)
      setMovements([])
      return
    }

    setMovements(data || [])
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Package className="text-emerald-500" />
            Inventario
          </h1>
          <p className="text-zinc-500">
            Productos, stock, categorías, ajustes y Kardex.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            <Download size={18} />
            Exportar
          </button>

          <button
            onClick={openNewProduct}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600"
          >
            <Plus size={18} />
            Nuevo Producto
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard title="Valor inventario" value={formatMoney(inventoryValue)} compactValue />
        <StatCard title="Valor de venta" value={formatMoney(inventorySaleValue)} compactValue />
        <StatCard
          title="Productos activos"
          value={String(activeProducts.length)}
          active={stockFilter === 'all'}
          onClick={() => setStockFilter('all')}
        />
        <StatCard
          title="Stock bajo"
          value={String(lowStock.length)}
          orange
          active={stockFilter === 'low'}
          onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
        />
        <StatCard
          title="Agotados"
          value={String(outOfStock.length)}
          red
          active={stockFilter === 'out'}
          onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
        />
      </div>

      <div className="mb-3">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <Search className="text-emerald-500" size={20} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU, código o categoría..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]">
                <label className="block">
          <span className="mb-1 block text-sm font-bold text-zinc-950">Estado</span>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-500"
          >
            <option value="all">Todas</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>

                <label className="block">
          <span className="mb-1 block text-sm font-bold text-zinc-950">Categoria</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-500"
          >
            <option value="">Todas las categorias</option>
            {allCategoryNames.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-1 text-sm font-bold text-zinc-950">Cantidad</p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
            <input
              type="number"
              min="0"
              value={stockMinFilter}
              onChange={(e) => setStockMinFilter(e.target.value)}
              placeholder="Min."
              className="h-11 w-full border-b border-zinc-200 bg-white px-3 text-sm outline-none focus:bg-emerald-50"
            />
            <input
              type="number"
              min="0"
              value={stockMaxFilter}
              onChange={(e) => setStockMaxFilter(e.target.value)}
              placeholder="Máx."
              className="h-11 w-full bg-white px-3 text-sm outline-none focus:bg-emerald-50"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <h2 className="text-xl font-semibold">Productos en inventario</h2>
          <p className="text-sm text-zinc-500">
            Mostrando {filteredProducts.length} de {products.length}
            {stockFilter === 'low' && ' · Filtro: stock bajo'}
            {stockFilter === 'out' && ' · Filtro: agotados'}
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-zinc-500">Cargando inventario...</p>
        ) : filteredProducts.length === 0 ? (
          <p className="p-5 text-zinc-500">No se encontraron productos.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const isActive = product.active !== false
              const value = Number(product.cost || 0) * Number(product.stock || 0)

              return (
                <div
                  key={product.id}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                    isActive ? 'border-zinc-200' : 'border-zinc-300 opacity-70'
                  }`}
                >
                  <div className="flex h-36 items-center justify-center bg-zinc-100">
                    {getProductMainImage(product) ? (
                      <img
                        src={getProductMainImage(product) || ''}
                        alt={product.name}
                        className="h-full w-full object-contain p-3"
                      />
                    ) : (
                      <ImageIcon className="text-zinc-300" size={45} />
                    )}
                  </div>

                  <div className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h3 className="line-clamp-2 text-base font-bold">{product.name}</h3>
                        <p className="text-xs text-zinc-500">SKU: {product.sku || '-'}</p>
                      </div>

                      {isActive ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          ACTIVO
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600">
                          INACTIVO
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Info label="Categoría" value={product.category || '-'} />
                      <Info
                        label="Stock"
                        value={String(product.stock)}
                        orange={product.stock > 0 && product.stock <= 2}
                        red={product.stock <= 0}
                      />
                      <Info label="Costo" value={formatMoney(product.cost)} />
                      <Info label="Venta" value={formatMoney(product.sale_price)} green />
                      <Info label="Coop." value={formatMoney(product.coop_price || 0)} green />
                      <Info label="Valor" value={formatMoney(value)} green />
                    </div>

                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <IconButton title="Editar" onClick={() => openEditProduct(product)}>
                        <Edit size={17} />
                      </IconButton>

                      <IconButton title="Kardex" onClick={() => openKardex(product)}>
                        <History size={17} />
                      </IconButton>

                      <IconButton title="Ajustar stock" onClick={() => openStockModal(product)}>
                        <Archive size={17} />
                      </IconButton>

                      <IconButton title={isActive ? 'Desactivar' : 'Activar'} onClick={() => toggleProductActive(product)}>
                        {isActive ? <EyeOff size={17} /> : <Eye size={17} />}
                      </IconButton>

                      <IconButton title="Eliminar" danger onClick={() => deleteProduct(product)}>
                        <Trash2 size={17} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingProduct ? 'Editar producto' : 'Nuevo producto'}
                </h2>
                <p className="text-zinc-500">Datos principales del inventario.</p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={saveProduct} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
              <Input label="Nombre" value={form.name} onChange={(v) => updateForm('name', v)} />
              <InputWithAction
                label="SKU / Referencia"
                value={form.sku}
                onChange={(v) => updateForm('sku', v)}
                onAction={regenerateReference}
                actionLabel="Generar referencia"
              />
              <InputWithAction
                label="Código de barras"
                value={form.barcode}
                onChange={(v) => updateForm('barcode', v)}
                onAction={regenerateBarcode}
                actionLabel="Generar codigo de barras"
              />
              <Input label="Costo" value={form.cost} type="number" onChange={(v) => updateForm('cost', v)} />
              <Input label="Precio venta" value={form.sale_price} type="number" onChange={(v) => updateForm('sale_price', v)} />
              <Input label="Precio cooperativa" value={form.coop_price} type="number" onChange={(v) => updateForm('coop_price', v)} />
              <Input label="Stock" value={form.stock} type="number" onChange={(v) => updateForm('stock', v)} />

              <div>
                <label className="mb-2 block text-sm text-zinc-500">Categoría</label>
                <input
                  value={form.category}
                  onChange={(e) => updateForm('category', e.target.value)}
                  list="product-category-options"
                  placeholder="Selecciona o escribe una categoria"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                />
                <datalist id="product-category-options">
                  {allCategoryNames.map((categoryName) => (
                    <option key={categoryName} value={categoryName} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-500">Tipo</label>
                <select
                  value={form.product_type}
                  onChange={(e) => updateForm('product_type', e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                >
                  {allProductTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-500">Estado</label>
                <select
                  value={form.active ? 'active' : 'inactive'}
                  onChange={(e) => updateForm('active', e.target.value === 'active')}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div className="md:col-span-3 mt-8">
  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
    <h3 className="font-bold text-emerald-700 text-lg">
      Configuración de la página web
    </h3>

    <p className="text-sm text-emerald-600 mt-1">
      Configura cómo aparecerá este producto en la tienda online.
    </p>
  </div>
</div>

              <div>
  <label className="mb-2 block text-sm text-zinc-500">Página web</label>

  <select
    value={form.web_visibility}
    onChange={(e) => updateForm('web_visibility', e.target.value)}
    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
  >
    <option value="both">Ambas webs</option>
    <option value="normal">Web normal</option>
    <option value="coop">Web cooperativa</option>
    <option value="hidden">No mostrar</option>
  </select>
</div>

<div>
  <label className="mb-2 block text-sm text-zinc-500">Producto destacado</label>

  <select
    value={form.featured ? 'yes' : 'no'}
    onChange={(e) =>
      updateForm('featured', e.target.value === 'yes')
    }
    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
  >
    <option value="no">No</option>
    <option value="yes">Sí</option>
  </select>
</div>

<Input
  label="Slug de la página"
  value={form.slug}
  onChange={(v) => updateForm('slug', v)}
  placeholder="iphone-16-pro-max"
/>

<Input
  label="Descuento en la web (%)"
  value={form.web_discount_percent}
  type="number"
  onChange={(v) => updateForm('web_discount_percent', v)}
  placeholder="Ej.: 15"
/>

<div className="md:col-span-3">
  <label className="mb-2 block text-sm text-zinc-500">
    Descripción corta para la página web
  </label>

  <div className="md:col-span-3">
  <label className="mb-2 block text-sm text-zinc-500">Descripción completa</label>
  <textarea
    value={form.full_description}
    onChange={(e) => updateForm('full_description', e.target.value)}
    rows={5}
    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
    placeholder="Descripción completa del producto para la página individual..."
  />
</div>

<Input label="CPU" value={form.cpu} onChange={(v) => updateForm('cpu', v)} />
<Input label="Display" value={form.display} onChange={(v) => updateForm('display', v)} />
<Input label="Storage" value={form.storage} onChange={(v) => updateForm('storage', v)} />
<Input label="RAM" value={form.ram} onChange={(v) => updateForm('ram', v)} />
<Input label="Cámara" value={form.camera} onChange={(v) => updateForm('camera', v)} />
<Input label="Batería" value={form.battery} onChange={(v) => updateForm('battery', v)} />

  <textarea
    value={form.short_description}
    onChange={(e) =>
      updateForm('short_description', e.target.value)
    }
    rows={4}
    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
    placeholder="Descripción que aparecerá en la página web..."
  />
</div>

              <div className="md:col-span-3">
  <label className="mb-2 block text-sm text-zinc-500">
    Imagen del producto
  </label>

  <div
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files || [])

      files
        .filter((file) => file.type.startsWith('image/'))
        .forEach((file) => uploadProductImage(file))
    }}
    className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-6 text-center hover:border-emerald-500"
  >
    <Upload className="mx-auto text-emerald-500" size={32} />

    <p className="mt-3 font-semibold">
      Arrastra una imagen aquí
    </p>

    <p className="text-sm text-zinc-500">
      También puedes subirla desde tu PC o pegar una URL.
    </p>

    <input
      type="file"
      accept="image/*"
      multiple
      onChange={(e) => {
        Array.from(e.target.files || []).forEach((file) => uploadProductImage(file))
      }}
      className="mt-4"
    />
  </div>

  {!editingProduct && pendingImages.length > 0 && (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
      {pendingImages.length} imagen(es) se subirán al guardar el producto.
    </div>
  )}

  <input
    value={form.image_url}
    onChange={(e) => updateForm('image_url', e.target.value)}
    placeholder="O pega una URL de imagen..."
    className="mt-4 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
  />

  {form.image_url && (
    <div className="mt-4 flex h-40 w-40 items-center justify-center rounded-xl border border-zinc-200 bg-white">
      <img
        src={form.image_url}
        alt="Vista previa"
        className="h-full w-full object-contain p-2"
      />
    </div>
  )}
</div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 pt-5 md:col-span-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-zinc-300 px-5 py-3 font-semibold hover:bg-zinc-100"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Crear producto'}
                </button>
              </div>
            </form>

            {editingProduct && (
            <div className="border-t border-zinc-200 p-6">
              <div className="mt-8 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
  <h3 className="font-bold text-sky-700 text-lg">
    Galería de imágenes
  </h3>

  <p className="text-sm text-sky-600 mt-1">
    Las imágenes se utilizarán en Inventario, POS, Cotizaciones y Página Web.
  </p>
</div>
                <ProductGallery productId={editingProduct.id} />
            </div>
           )}
          </div>
        </div>
      )}

      {stockModal && stockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-2xl font-bold">Ajustar stock</h2>
            <p className="mt-1 text-zinc-500">{stockProduct.name}</p>

            <div className="mt-5 rounded-xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Stock actual</p>
              <p className="text-3xl font-black">{stockProduct.stock}</p>
            </div>

            <Input
              label="Nuevo stock"
              value={newStock}
              type="number"
              onChange={setNewStock}
            />

            <div className="mt-4">
              <label className="mb-2 block text-sm text-zinc-500">Motivo / Nota</label>
              <textarea
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-emerald-500"
                placeholder="Ej: Llegó mercancía, ajuste por conteo físico..."
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => setStockModal(false)}
                className="rounded-xl border border-zinc-300 py-3 font-semibold hover:bg-zinc-100"
              >
                Cancelar
              </button>

              <button
                onClick={saveStockAdjustment}
                className="rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-600"
              >
                Guardar ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {kardexModal && kardexProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-2xl font-bold">Kardex</h2>
                <p className="text-zinc-500">{kardexProduct.name}</p>
              </div>

              <button
                onClick={() => setKardexModal(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              >
                <X size={22} />
              </button>
            </div>

            {movements.length === 0 ? (
              <p className="p-6 text-zinc-500">Este producto todavía no tiene movimientos.</p>
            ) : (
              <div className="p-6">
                <div className="space-y-3">
                  {movements.map((movement) => (
                    <div key={movement.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-bold">{movementLabel(movement.movement_type)}</p>
                          <p className="text-sm text-zinc-500">
                            {formatDateTime(movement.created_at)}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {movement.notes || '-'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className={`text-2xl font-black ${movement.quantity < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {movement.quantity > 0 ? '+' : ''}
                            {movement.quantity}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {movement.previous_stock} â†’ {movement.new_stock}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ExportModal
        open={exportModalOpen}
        title="Exportar inventario"
        format={exportFormat}
        onFormatChange={setExportFormat}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExportInventory}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-zinc-700">Alcance</span>
            <select value={exportScope} onChange={(e) => setExportScope(e.target.value as InventoryExportScope)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500">
              <option value="all">Todo el inventario</option>
              <option value="active">Solo productos activos</option>
              <option value="low">Solo stock bajo</option>
              <option value="out">Solo agotados</option>
              <option value="category">Categoría</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-zinc-700">Categoría</span>
            <select value={exportCategory} onChange={(e) => setExportCategory(e.target.value)} disabled={exportScope !== 'category'} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500 disabled:bg-zinc-100 disabled:text-zinc-400">
              <option value="">Todas las categorías</option>
              {allCategoryNames.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
            </select>
          </label>
        </div>
      </ExportModal>
    </AppShell>
  )
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    purchase: 'Compra',
    sale: 'Venta',
    adjustment: 'Ajuste',
    return: 'Devolución',
    service: 'Servicio',
  }

  return labels[type] || type
}

function StatCard({
  title,
  value,
  red = false,
  orange = false,
  active = false,
  compactValue = false,
  onClick,
}: {
  title: string
  value: string
  red?: boolean
  orange?: boolean
  active?: boolean
  compactValue?: boolean
  onClick?: () => void
}) {
  const valueLength = value.length
  const valueSizeClass = compactValue
    ? valueLength >= 16
      ? 'text-[1.05rem] tracking-[-0.02em]'
      : valueLength >= 13
        ? 'text-[1.2rem] tracking-[-0.01em]'
        : 'text-[1.45rem]'
    : 'text-2xl'

  const content = (
    <>
      <p className="text-sm text-zinc-500">{title}</p>
      <h3
        className={`mt-2 max-w-full whitespace-nowrap font-bold leading-tight ${valueSizeClass} ${
          red ? 'text-red-500' : orange ? 'text-orange-500' : 'text-zinc-950'
        }`}
      >
        {value}
      </h3>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`min-w-0 overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          active ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-zinc-200'
        }`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      {content}
    </div>
  )
}

function Info({
  label,
  value,
  green = false,
  orange = false,
  red = false,
}: {
  label: string
  value: string
  green?: boolean
  orange?: boolean
  red?: boolean
}) {
  return (
    <div
      className={`min-w-0 rounded-xl p-2.5 ${
        red
          ? 'bg-red-50'
          : orange
            ? 'bg-yellow-50'
            : 'bg-zinc-50'
      }`}
    >
      <p className={`text-xs ${red ? 'text-red-600' : orange ? 'text-yellow-700' : 'text-zinc-500'}`}>
        {label}
      </p>
      <p
        className={`truncate text-xs font-semibold ${
          red
            ? 'text-red-600'
            : orange
              ? 'text-yellow-700'
              : green
                ? 'text-emerald-600'
                : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg border border-zinc-200 p-2 ${
        danger
          ? 'text-red-500 hover:border-red-500'
          : 'text-zinc-600 hover:border-emerald-500 hover:text-emerald-600'
      }`}
    >
      {children}
    </button>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-500">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

function InputWithAction({
  label,
  value,
  onChange,
  onAction,
  actionLabel,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onAction: () => void
  actionLabel: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-500">{label}</label>
      <div className="flex overflow-hidden rounded-xl border border-zinc-300 bg-white focus-within:border-emerald-500">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 px-4 py-3 outline-none"
        />
        <button
          type="button"
          onClick={onAction}
          title={actionLabel}
          aria-label={actionLabel}
          className="border-l border-zinc-200 px-3 text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <RefreshCcw size={18} />
        </button>
      </div>
    </div>
  )
}







