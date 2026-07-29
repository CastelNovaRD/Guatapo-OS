import { supabase } from '@/lib/supabase'
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
  const byName = products.find((product) => normalizeTextKey(product.name) === nameKey)
  return byName || null
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

export async function commitPurchasesImport(params: { storeId: string; preview: ImportPreview<PurchaseImportData>; mode: ImportMode; allowBlankClear: boolean }) {
  const validRows = params.preview.rows.filter((row) => row.action === 'new' || row.action === 'warning')
  let created = 0, updated = 0, omitted = params.preview.rows.length - validRows.length, errors = 0
  const groups = new Map<string, ImportPreviewRow<PurchaseImportData>[]>()
  validRows.forEach((row) => {
    const key = row.data.purchaseKey || row.data.invoiceNumber
    groups.set(key, [...(groups.get(key) || []), row])
  })

  for (const [groupKey, rows] of groups) {
    const first = rows[0].data
    let supplierId = first.supplierId
    if (!supplierId) {
      const { data: supplier, error: supplierError } = await supabase.from('suppliers').insert({ store_id: params.storeId, commercial_name: first.supplierName, document: first.supplierDocument, phone: first.supplierPhone, active: true }).select('id').single()
      if (supplierError) { rows.forEach((row) => row.errors.push(supplierError.message)); errors += rows.length; continue }
      supplierId = supplier.id
      await logAudit({ storeId: params.storeId, module: 'compras', action: 'supplier.import_create', entityType: 'supplier', entityId: supplierId, summary: `Suplidor importado: ${first.supplierName}.` })
    }

    const subtotal = rows.reduce((sum, row) => sum + row.data.quantity * row.data.unitCost - row.data.discount, 0)
    const taxTotal = rows.reduce((sum, row) => sum + row.data.taxAmount, 0)
    const shippingTransportCost = rows.reduce((sum, row) => sum + row.data.shippingTransportCost, 0)
    const otherExpensesOnly = rows.reduce((sum, row) => sum + row.data.otherExpenses, 0)
    const otherExpenses = shippingTransportCost + otherExpensesOnly
    const total = subtotal + taxTotal + otherExpenses
    const amountPaid = first.amountPaid
    const purchasePayload = {
      store_id: params.storeId,
      supplier_id: supplierId,
      supplier_name: first.supplierName,
      supplier_document: first.supplierDocument,
      invoice_number: first.invoiceNumber || groupKey,
      purchase_date: first.purchaseDate,
      received_date: first.receivedDate,
      subtotal,
      tax_total: taxTotal,
      discount_total: rows.reduce((sum, row) => sum + row.data.discount, 0),
      other_expenses: otherExpenses,
      shipping_transport_cost: shippingTransportCost,
      expense_notes: first.notes,
      total,
      payment_method: first.paymentMethod,
      payment_status: first.paymentStatus,
      amount_paid: amountPaid,
      balance_due: Math.max(0, total - amountPaid),
      status: first.status === 'cancelled' ? 'cancelled' : 'draft',
      notes: first.notes,
      cost_rule: 'weighted_average',
    }
    let purchaseResult = await supabase.from('purchases').insert(purchasePayload).select('id').single()
    if (purchaseResult.error && purchaseResult.error.message.includes('shipping_transport_cost')) {
      const { shipping_transport_cost: _shipping, expense_notes: _expenseNotes, ...fallbackPayload } = purchasePayload
      purchaseResult = await supabase.from('purchases').insert(fallbackPayload).select('id').single()
    }
    const purchase = purchaseResult.data
    const purchaseError = purchaseResult.error
    if (purchaseError || !purchase) { rows.forEach((row) => row.errors.push(purchaseError?.message || 'No se pudo crear la compra.')); errors += rows.length; continue }

    for (const row of rows) {
      let productId = row.data.productId
      if (!productId) {
        const { data: product, error: productError } = await supabase.from('products').insert({ store_id: params.storeId, name: row.data.productName, sku: row.data.productSku, cost: row.data.unitCost, sale_price: 0, stock: 0, active: true }).select('id').single()
        if (productError) { row.errors.push(productError.message); errors += 1; continue }
        productId = product.id
        await logAudit({ storeId: params.storeId, module: 'compras', action: 'product.import_create_from_purchase', entityType: 'product', entityId: productId, summary: `Producto creado desde compra importada: ${row.data.productName}.` })
      }
      const unitOther = row.data.quantity > 0 ? (row.data.shippingTransportCost + row.data.otherExpenses) / row.data.quantity : 0
      const { error: itemError } = await supabase.from('purchase_items').insert({
        store_id: params.storeId,
        purchase_id: purchase.id,
        product_id: productId,
        product_name: row.data.productName,
        sku: row.data.productSku,
        quantity: row.data.quantity,
        requested_quantity: row.data.quantity,
        received_quantity: 0,
        unit_cost: row.data.unitCost,
        discount: row.data.discount,
        tax_amount: row.data.taxAmount,
        other_expense_unit: unitOther,
        real_unit_cost: row.data.unitCost + unitOther,
        total: row.data.quantity * row.data.unitCost - row.data.discount + row.data.taxAmount + row.data.shippingTransportCost + row.data.otherExpenses,
      })
      if (itemError) { row.errors.push(itemError.message); errors += 1; continue }
    }
    created += 1
    await logAudit({ storeId: params.storeId, module: 'compras', action: 'purchase.import_create', entityType: 'purchase', entityId: purchase.id, summary: `Compra importada en borrador: ${first.invoiceNumber || groupKey}.`, metadata: { rows: rows.length, total } })
  }
  return { created, updated, omitted, errors }
}
