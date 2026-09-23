import { logAudit } from '@/lib/audit'
import { PURCHASE_TEMPLATE_COLUMNS } from '@/lib/export/shared-templates'
import { ImportMode, ImportPreview, ImportPreviewRow, normalizeDocument, normalizeTextKey, parseNumber, readExcelTable } from './excel-import'

export type ExistingSupplier = { id: string; commercial_name: string; document: string | null; phone: string | null }
export type ExistingPurchase = { id: string; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null; purchase_date: string | null; total: number | null }
export type ExistingPurchaseProduct = { id: string; name: string; sku: string | null; barcode: string | null; cost: number; stock: number; active: boolean | null }

export type PurchaseImportData = {
  purchaseKey: string
  invoiceNumber: string
  purchaseDate: string
  receivedDate: string | null
  supplierName: string
  supplierDocument: string | null
  supplierPhone: string | null
  productSku: string
  productName: string
  productId?: string
  supplierId?: string
  quantity: number
  unitCost: number
  discount: number
  taxAmount: number
  shippingTransportCost: number
  otherExpenses: number
  paymentMethod: string | null
  paymentStatus: string
  amountPaid: number
  notes: string | null
  status: string
}

type ApiError = { error?: unknown; message?: unknown }

export function findSupplier(row: PurchaseImportData, suppliers: ExistingSupplier[]) {
  const doc = normalizeDocument(row.supplierDocument)
  if (doc) {
    const byDoc = suppliers.find((supplier) => normalizeDocument(supplier.document) === doc)
    if (byDoc) return byDoc
  }
  const nameKey = normalizeTextKey(row.supplierName)
  return suppliers.find((supplier) => normalizeTextKey(supplier.commercial_name) === nameKey) || null
}

export function findProduct(row: PurchaseImportData, products: ExistingPurchaseProduct[]) {
  const sku = row.productSku.trim().toLowerCase()
  if (sku) {
    const byCode = products.find((product) => product.id.toLowerCase() === sku || product.sku?.toLowerCase() === sku || product.barcode?.toLowerCase() === sku)
    if (byCode) return byCode
  }
  const nameKey = normalizeTextKey(row.productName)
  return products.find((product) => normalizeTextKey(product.name) === nameKey) || null
}

function cleanStatus(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  if (['received', 'recibida'].includes(text)) return 'pending'
  if (['cancelled', 'cancelada'].includes(text)) return 'cancelled'
  if (['pending', 'pendiente'].includes(text)) return 'pending'
  return 'draft'
}

function cleanPaymentStatus(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  if (['paid', 'pagada', 'pagado'].includes(text)) return 'paid'
  if (['partial', 'parcial'].includes(text)) return 'partial'
  return 'pending'
}

function rowError(response: Response, payload: ApiError | null, fallback: string) {
  const message = typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.message === 'string'
      ? payload.message
      : fallback

  return `HTTP ${response.status}: ${message}`
}

async function postJson<T>(url: string, body: unknown, fallback: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null) as T | ApiError | null

  if (!response.ok) {
    throw new Error(rowError(response, payload as ApiError | null, fallback))
  }

  return payload as T
}

function supplierKey(row: PurchaseImportData) {
  return normalizeDocument(row.supplierDocument) || normalizeTextKey(row.supplierName)
}

function productKey(row: PurchaseImportData) {
  return row.productSku.trim().toLowerCase() || normalizeTextKey(row.productName)
}

export async function previewPurchasesImport(params: { file: File; suppliers: ExistingSupplier[]; products: ExistingPurchaseProduct[]; purchases: ExistingPurchase[]; mode: ImportMode }) {
  const table = await readExcelTable(params.file, PURCHASE_TEMPLATE_COLUMNS)
  const seenRows = new Set<string>()
  const rows: ImportPreviewRow<PurchaseImportData>[] = table.rows.map(({ rowNumber, values }) => {
    const errors: string[] = []
    const warnings: string[] = []
    const invoiceNumber = String(values.supplierInvoice || '').trim()
    const supplierName = String(values.supplierName || '').trim()
    const productSku = String(values.productSku || '').trim()
    const productName = String(values.productName || '').trim()
    const quantity = parseNumber(values.quantity)
    const unitCost = parseNumber(values.unitCost)
    const discount = parseNumber(values.discount) ?? 0
    const taxAmount = parseNumber(values.taxAmount) ?? 0
    const shippingTransportCost = parseNumber(values.shippingTransportCost) ?? 0
    const otherExpenses = parseNumber(values.otherExpenses) ?? 0
    const purchaseKey = String(values.purchaseCode || invoiceNumber || `COMP-${rowNumber}`).trim()
    const data: PurchaseImportData = {
      purchaseKey,
      invoiceNumber,
      purchaseDate: String(values.purchaseDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
      receivedDate: String(values.receivedDate || '').trim() || null,
      supplierName,
      supplierDocument: String(values.supplierDocument || '').trim() || null,
      supplierPhone: String(values.supplierPhone || '').trim() || null,
      productSku,
      productName,
      quantity: Number(quantity || 0),
      unitCost: Number(unitCost || 0),
      discount: Number(discount || 0),
      taxAmount: Number(taxAmount || 0),
      shippingTransportCost: Number(shippingTransportCost || 0),
      otherExpenses: Number(otherExpenses || 0),
      paymentMethod: String(values.paymentMethod || '').trim() || null,
      paymentStatus: cleanPaymentStatus(values.paymentStatus),
      amountPaid: Number(parseNumber(values.amountPaid) || 0),
      notes: String(values.notes || '').trim() || null,
      status: cleanStatus(values.purchaseStatus),
    }

    if (!invoiceNumber) errors.push('Falta numero de factura del suplidor.')
    if (!supplierName) errors.push('Falta nombre del suplidor.')
    if (!productSku) errors.push('Falta SKU del producto.')
    if (!productName) errors.push('Falta nombre del producto.')
    if (!Number.isFinite(data.quantity) || data.quantity <= 0) errors.push('Cantidad invalida.')
    if (!Number.isFinite(data.unitCost) || data.unitCost < 0) errors.push('Costo unitario invalido.')
    if (data.discount < 0 || data.taxAmount < 0 || data.shippingTransportCost < 0 || data.otherExpenses < 0) errors.push('Descuento, ITBIS, envíos/transporte u otros gastos no pueden ser negativos.')
    if (data.discount > data.quantity * data.unitCost) errors.push('El descuento no puede superar el valor de la línea.')

    if (data.shippingTransportCost > 0 || data.otherExpenses > 0) {
      warnings.push('Transporte y otros gastos se incorporarán al total de la compra; el esquema actual no los separa por columna.')
    }
    if (data.receivedDate || data.status !== 'draft') {
      warnings.push('Las compras importadas se guardarán como borrador y no aumentarán inventario hasta recibirlas manualmente.')
    }
    if (data.paymentMethod || data.amountPaid > 0 || data.notes) {
      warnings.push('Método de pago, monto pagado y notas de la plantilla legacy no tienen columnas equivalentes y no se guardarán.')
    }

    const supplier = findSupplier(data, params.suppliers)
    const product = findProduct(data, params.products)
    if (supplier) data.supplierId = supplier.id
    else warnings.push('Suplidor nuevo o no encontrado; se creara al confirmar.')
    if (product) data.productId = product.id
    else warnings.push('Producto nuevo o no encontrado; se creara al confirmar.')

    const duplicateKey = `${purchaseKey}|${productSku}`.toLowerCase()
    const duplicateInFile = seenRows.has(duplicateKey)
    seenRows.add(duplicateKey)
    const existingPurchase = params.purchases.find((purchase) =>
      String(purchase.invoice_number || '').trim().toLowerCase() === invoiceNumber.toLowerCase() &&
      (supplier?.id ? purchase.supplier_id === supplier.id : normalizeTextKey(purchase.supplier_name) === normalizeTextKey(supplierName))
    )

    let action: ImportPreviewRow['action'] = existingPurchase ? 'duplicate' : 'new'
    if (duplicateInFile) action = 'duplicate'
    if (params.mode === 'update') action = 'skip'
    if (errors.length) action = 'error'
    return { rowNumber, original: values, data, key: `${purchaseKey} / ${productSku}`, action, message: existingPurchase ? 'Compra posible duplicada.' : 'Linea valida para importar.', existingId: existingPurchase?.id, errors, warnings }
  })
  return { headers: table.headers, rows } as ImportPreview<PurchaseImportData>
}

/**
 * Creates only draft purchases. Header-level transport/other expenses have no
 * dedicated PostgreSQL columns, so they are retained in purchases.total without
 * being fabricated as purchase_items; stock changes only via the receive API.
 */
export async function commitPurchasesImport(params: { storeId: string; preview: ImportPreview<PurchaseImportData>; mode: ImportMode; allowBlankClear: boolean }) {
  const validRows = params.preview.rows.filter((row) => row.action === 'new' || row.action === 'warning')
  let created = 0
  const updated = 0
  let omitted = params.preview.rows.length - validRows.length
  let errors = 0
  const groups = new Map<string, ImportPreviewRow<PurchaseImportData>[]>()
  const supplierIds = new Map<string, string>()
  const productIds = new Map<string, string>()

  validRows.forEach((row) => {
    const key = row.data.purchaseKey || row.data.invoiceNumber
    groups.set(key, [...(groups.get(key) || []), row])
    if (row.data.supplierId) supplierIds.set(supplierKey(row.data), row.data.supplierId)
    if (row.data.productId) productIds.set(productKey(row.data), row.data.productId)
  })

  for (const [groupKey, rows] of groups) {
    const first = rows[0].data

    try {
      let supplierId = supplierIds.get(supplierKey(first)) || first.supplierId
      if (!supplierId) {
        const supplier = await postJson<{ id: string }>('/api/suppliers', {
          name: first.supplierName,
          rnc: first.supplierDocument,
          phone: first.supplierPhone,
        }, 'No se pudo crear el suplidor.')
        supplierId = supplier.id
        supplierIds.set(supplierKey(first), supplierId)
        await logAudit({ storeId: params.storeId, module: 'compras', action: 'supplier.import_create', entityType: 'supplier', entityId: supplierId, summary: `Suplidor importado: ${first.supplierName}.` })
      }

      const items: Array<{ productId: string; quantity: number; unitCost: number; tax: number; total: number }> = []
      for (const row of rows) {
        let productId = productIds.get(productKey(row.data)) || row.data.productId
        if (!productId) {
          const product = await postJson<{ id: string }>('/api/products', {
            name: row.data.productName,
            sku: row.data.productSku,
            cost: row.data.unitCost,
            salePrice: 0,
            stock: 0,
            active: true,
          }, 'No se pudo crear el producto.')
          productId = product.id
          productIds.set(productKey(row.data), productId)
          await logAudit({ storeId: params.storeId, module: 'compras', action: 'product.import_create_from_purchase', entityType: 'product', entityId: productId, summary: `Producto creado desde compra importada: ${row.data.productName}.` })
        }

        const lineSubtotal = row.data.quantity * row.data.unitCost - row.data.discount
        items.push({
          productId,
          quantity: row.data.quantity,
          unitCost: row.data.unitCost,
          tax: row.data.taxAmount,
          total: lineSubtotal + row.data.taxAmount,
        })
      }

      const subtotal = rows.reduce((sum, row) => sum + row.data.quantity * row.data.unitCost - row.data.discount, 0)
      const tax = rows.reduce((sum, row) => sum + row.data.taxAmount, 0)
      const headerExpenses = rows.reduce((sum, row) => sum + row.data.shippingTransportCost + row.data.otherExpenses, 0)
      const total = subtotal + tax + headerExpenses

      const purchase = await postJson<{ id: string }>('/api/purchases', {
        supplierId,
        invoiceNumber: first.invoiceNumber || groupKey,
        subtotal,
        tax,
        total,
        items,
      }, 'No se pudo crear la compra.')

      created += 1
      await logAudit({
        storeId: params.storeId,
        module: 'compras',
        action: 'purchase.import_create',
        entityType: 'purchase',
        entityId: purchase.id,
        summary: `Compra importada en borrador: ${first.invoiceNumber || groupKey}.`,
        metadata: { rows: rows.length, total, headerExpenses },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo importar la compra.'
      rows.forEach((row) => row.errors.push(message))
      errors += rows.length
      omitted += rows.length
    }
  }

  return { created, updated, omitted, errors }
}