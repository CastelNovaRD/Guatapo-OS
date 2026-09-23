
import { logAudit } from '@/lib/audit'
import { INVENTORY_TEMPLATE_COLUMNS } from '@/lib/export/shared-templates'
import { ImportMode, ImportPreview, ImportPreviewRow, normalizeTextKey, parseNumber, readExcelTable } from './excel-import'

export type ExistingImportProduct = { id: string; name: string; sku: string | null; barcode: string | null; category: string | null; cost: number; sale_price: number; stock: number; active: boolean | null }
export type InventoryImportData = {
  code: string
  barcode: string
  name: string
  category: string
  stock: number
  cost: number
  sale_price: number
  active: boolean | null
  finalSku?: string
  finalBarcode?: string
  productId?: string
  existingStock?: number
}
export type UnknownCategoryStrategy = 'cancel' | 'create' | 'other' | 'skip'
export type InventoryStockTreatment = 'replace' | 'add'

function ean13CheckDigit(base12: string) {
  const sum = base12.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return String((10 - (sum % 10)) % 10)
}

function getNextProductSequence(products: Array<{ sku: string | null }>) {
  const maxReference = products.reduce((max, product) => {
    const match = product.sku?.match(/(\d+)$/)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return Math.max(maxReference, products.length) + 1
}

function generateProductReference(products: Array<{ sku: string | null }>, reserved = new Set<string>()) {
  let sequence = getNextProductSequence(products)
  let reference = `REF-${String(sequence).padStart(6, '0')}`
  const used = new Set(products.map((product) => product.sku).filter(Boolean).map((sku) => String(sku).toLowerCase()))
  while (used.has(reference.toLowerCase()) || reserved.has(reference.toLowerCase())) {
    sequence += 1
    reference = `REF-${String(sequence).padStart(6, '0')}`
  }
  reserved.add(reference.toLowerCase())
  products.push({ sku: reference })
  return reference
}

function generateProductBarcode(products: Array<{ barcode: string | null }>, reserved = new Set<string>()) {
  let sequence = getNextProductSequence(products.map((product) => ({ sku: product.barcode })))
  let barcode = ''
  const used = new Set(products.map((product) => product.barcode).filter(Boolean).map((value) => String(value).toLowerCase()))
  do {
    const base12 = `746${String(Date.now()).slice(-6)}${String(sequence).padStart(3, '0')}`.slice(0, 12)
    barcode = `${base12}${ean13CheckDigit(base12)}`
    sequence += 1
  } while (used.has(barcode.toLowerCase()) || reserved.has(barcode.toLowerCase()))
  reserved.add(barcode.toLowerCase())
  products.push({ barcode })
  return barcode
}

function activeFromValue(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return null
  return !['inactivo', 'inactive', 'false', 'no', '0'].includes(text)
}

function sameNameAndCategory(product: ExistingImportProduct, name: string, category: string) {
  return normalizeTextKey(product.name) === normalizeTextKey(name) && normalizeTextKey(product.category) === normalizeTextKey(category)
}

function findExisting(params: { code: string; barcode: string; name: string; category: string; products: ExistingImportProduct[] }) {
  const codeKey = params.code.trim().toLowerCase()
  if (codeKey) {
    const bySku = params.products.find((product) => product.sku?.toLowerCase() === codeKey || product.barcode?.toLowerCase() === codeKey || product.id.toLowerCase() === codeKey)
    if (bySku) return { product: bySku, ambiguous: false }
  }
  const barcodeKey = params.barcode.trim().toLowerCase()
  if (barcodeKey) {
    const byBarcode = params.products.find((product) => product.barcode?.toLowerCase() === barcodeKey)
    if (byBarcode) return { product: byBarcode, ambiguous: false }
  }
  const byNameCategory = params.products.filter((product) => sameNameAndCategory(product, params.name, params.category))
  if (byNameCategory.length === 1) return { product: byNameCategory[0], ambiguous: false }
  if (byNameCategory.length > 1) return { product: null, ambiguous: true }
  return { product: null, ambiguous: false }
}

export async function previewInventoryImport(params: { file: File; products: ExistingImportProduct[]; categories: { name: string }[]; mode: ImportMode; unknownCategoryStrategy: UnknownCategoryStrategy }) {
  const table = await readExcelTable(params.file, INVENTORY_TEMPLATE_COLUMNS)
  const categoryMap = new Map(params.categories.map((category) => [normalizeTextKey(category.name), category.name]))
  const seen = new Set<string>()
  const reservedSku = new Set<string>()
  const reservedBarcode = new Set<string>()
  const skuPool = params.products.map((product) => ({ sku: product.sku }))
  const barcodePool = params.products.map((product) => ({ barcode: product.barcode }))

  const rows: ImportPreviewRow<InventoryImportData>[] = table.rows.map(({ rowNumber, values }) => {
    const errors: string[] = []
    const warnings: string[] = []
    const code = String(values.code || '').trim()
    const barcode = String((values as Record<string, unknown>).barcode || '').trim()
    const name = String(values.product || '').trim().replace(/\s+/g, ' ')
    const stock = parseNumber(values.stock)
    const cost = parseNumber(values.cost)
    const salePrice = parseNumber(values.salePrice)
    const categoryRaw = String(values.category || '').trim().replace(/\s+/g, ' ')
    let category = categoryRaw

    if (!name) errors.push('Falta nombre del producto.')
    if (!categoryRaw) errors.push('Falta categoría.')
    if (stock === null || !Number.isInteger(stock) || stock < 0) errors.push('Stock inválido. Debe ser entero y no negativo.')
    if (cost === null || !Number.isFinite(cost) || cost < 0) errors.push('Costo inválido.')
    if (salePrice === null || !Number.isFinite(salePrice) || salePrice <= 0) errors.push('Precio de venta inválido. Debe ser mayor que cero.')

    if (categoryRaw) {
      const existingCategory = categoryMap.get(normalizeTextKey(categoryRaw))
      if (existingCategory) category = existingCategory
      else if (params.unknownCategoryStrategy === 'other') { category = 'Otros'; warnings.push(`Categoría desconocida asignada a Otros: ${categoryRaw}.`) }
      else if (params.unknownCategoryStrategy === 'create') warnings.push(`Categoría nueva que se crear?: ${categoryRaw}.`)
      else if (params.unknownCategoryStrategy === 'skip') warnings.push(`Fila omitida por categoría desconocida: ${categoryRaw}.`)
      else errors.push(`Categoría desconocida: ${categoryRaw}.`)
    }

    const existingResult = errors.length ? { product: null, ambiguous: false } : findExisting({ code, barcode, name, category, products: params.products })
    const duplicateKey = code || barcode || `${normalizeTextKey(name)}|${normalizeTextKey(category)}`
    const duplicateInFile = seen.has(duplicateKey)
    if (duplicateKey) seen.add(duplicateKey)

    const finalSku = existingResult.product?.sku || code || (!errors.length ? generateProductReference(skuPool, reservedSku) : '')
    const finalBarcode = existingResult.product?.barcode || barcode || (!errors.length ? generateProductBarcode(barcodePool, reservedBarcode) : '')
    const data: InventoryImportData = {
      code,
      barcode,
      name,
      category,
      stock: Number(stock || 0),
      cost: Number(cost || 0),
      sale_price: Number(salePrice || 0),
      active: activeFromValue(values.activeStatus),
      finalSku,
      finalBarcode,
      productId: existingResult.product?.id,
      existingStock: Number(existingResult.product?.stock || 0),
    }

    let action: ImportPreviewRow['action'] = existingResult.product ? 'update' : 'new'
    if (params.unknownCategoryStrategy === 'skip' && categoryRaw && !categoryMap.has(normalizeTextKey(categoryRaw))) action = 'skip'
    if (existingResult.ambiguous || duplicateInFile) action = 'duplicate'
    if (params.mode === 'create' && existingResult.product) action = 'skip'
    if (params.mode === 'update' && !existingResult.product) action = 'skip'
    if (errors.length) action = 'error'

    const message = existingResult.product
      ? 'Producto existente encontrado.'
      : action === 'new'
        ? 'Producto nuevo. SKU y código de barras se generarán automáticamente.'
        : action === 'duplicate'
          ? 'Posible duplicado. Revisa nombre, categoría, SKU o código de barras.'
          : 'Fila omitida según el modo seleccionado.'

    return { rowNumber, original: values, data, key: finalSku || code || name || `Fila ${rowNumber}`, action, message, existingId: existingResult.product?.id, errors, warnings }
  })
  return { headers: table.headers, rows } as ImportPreview<InventoryImportData>
}

export async function commitInventoryImport(params: {
  storeId: string
  preview: ImportPreview<InventoryImportData>
  mode: ImportMode
  allowBlankClear: boolean
  createCategories: boolean
  stockTreatment: InventoryStockTreatment
}) {
  const validRows = params.preview.rows.filter(
    (row) => !['error', 'duplicate', 'skip'].includes(row.action)
  )

  const omitted = params.preview.rows.length - validRows.length

  const response = await fetch('/api/inventory-import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stockTreatment: params.stockTreatment,
      rows: validRows.map((row) => ({
        existingId: row.existingId || undefined,
        name: row.data.name,
        sku: row.data.finalSku || undefined,
        barcode: row.data.finalBarcode || undefined,
        category: row.data.category,
        stock: row.data.stock,
        existingStock: Number(row.data.existingStock || 0),
        cost: row.data.cost,
        salePrice: row.data.sale_price,
        active: row.data.active,
      })),
    }),
  })

  if (!response.ok) {
    let message = 'No se pudo completar la importación de inventario.'

    try {
      const errorData = (await response.json()) as { error?: string }
      if (errorData.error) message = errorData.error
    } catch {
      // Mantener mensaje predeterminado.
    }

    throw new Error(message)
  }

  const result = (await response.json()) as {
    created: number
    updated: number
    errors: number
  }

  await logAudit({
    storeId: params.storeId,
    module: 'inventario',
    action: 'inventory.import',
    summary: `Importación de inventario: ${result.created} creados, ${result.updated} actualizados, ${omitted} omitidos, ${result.errors} errores.`,
    metadata: {
      created: result.created,
      updated: result.updated,
      omitted,
      errors: result.errors,
      mode: params.mode,
      stockTreatment: params.stockTreatment,
    },
  })

  return {
    created: result.created,
    updated: result.updated,
    omitted,
    errors: result.errors,
  }
}