
import type { ExportColumn } from './export-types'

export type ImportableColumn = ExportColumn & {
  required?: boolean
  importKey?: string
  aliases?: string[]
}

export const INVENTORY_QUICK_TEMPLATE_COLUMNS: ImportableColumn[] = [
  { key: 'product', importKey: 'name', header: 'Nombre', width: 32, required: true, aliases: ['Producto', 'Nombre del producto'] },
  { key: 'category', importKey: 'category', header: 'Categoria', width: 22, required: true, aliases: ['Categoría'] },
  { key: 'stock', importKey: 'stock', header: 'Stock', type: 'number', align: 'right', width: 12, required: true, aliases: ['Cantidad', 'Existencia'] },
  { key: 'cost', importKey: 'cost', header: 'Costo', type: 'money', width: 14, required: true, aliases: ['Precio de costo'] },
  { key: 'salePrice', importKey: 'sale_price', header: 'Precio de venta', type: 'money', width: 16, required: true, aliases: ['Precio', 'Precio venta'] },
]

export const INVENTORY_TEMPLATE_COLUMNS: ImportableColumn[] = [
  { key: 'code', importKey: 'code', header: 'SKU o codigo', width: 18, aliases: ['SKU', 'Codigo', 'C?digo', 'Referencia'] },
  { key: 'product', importKey: 'name', header: 'Producto', width: 32, required: true, aliases: ['Nombre', 'Nombre del producto'] },
  { key: 'category', importKey: 'category', header: 'Categoria', width: 18, required: true, aliases: ['Categoría'] },
  { key: 'stock', importKey: 'stock', header: 'Stock', type: 'number', align: 'right', width: 10, required: true, aliases: ['Cantidad', 'Existencia'] },
  { key: 'cost', importKey: 'cost', header: 'Costo', type: 'money', width: 14, required: true, aliases: ['Precio de costo'] },
  { key: 'salePrice', importKey: 'sale_price', header: 'Precio de venta', type: 'money', width: 16, required: true, aliases: ['Precio', 'Precio venta'] },
  { key: 'inventoryValue', header: 'Valor del inventario', type: 'money', width: 18 },
  { key: 'stockStatus', header: 'Estado', width: 14 },
  { key: 'activeStatus', importKey: 'active', header: 'Activo/Inactivo', width: 15 },
]

export const CUSTOMER_TEMPLATE_COLUMNS: ImportableColumn[] = [
  { key: 'name', importKey: 'full_name', header: 'Nombre', width: 28, required: true },
  { key: 'phone', importKey: 'phone', header: 'Telefono', width: 16 },
  { key: 'document', importKey: 'cedula', header: 'Cedula o RNC', width: 18 },
  { key: 'type', header: 'Tipo', width: 16 },
  { key: 'purchases', header: 'Cantidad de compras', type: 'number', width: 18 },
  { key: 'totalPurchased', header: 'Total comprado', type: 'money', width: 16 },
  { key: 'lastPurchase', header: 'Ultima compra', type: 'date', width: 16 },
  { key: 'createdAt', header: 'Fecha de registro', type: 'date', width: 18 },
]

export function headersFromColumns(columns: ImportableColumn[]) {
  return columns.map((column) => column.header)
}


export const PURCHASE_TEMPLATE_COLUMNS: ImportableColumn[] = [
  { key: 'purchaseCode', importKey: 'purchase_code', header: 'Codigo de compra', width: 18 },
  { key: 'supplierInvoice', importKey: 'invoice_number', header: 'Numero de factura del suplidor', width: 24, required: true },
  { key: 'purchaseDate', importKey: 'purchase_date', header: 'Fecha de compra', type: 'date', width: 16 },
  { key: 'receivedDate', importKey: 'received_date', header: 'Fecha de recepcion', type: 'date', width: 16 },
  { key: 'supplierName', importKey: 'supplier_name', header: 'Nombre del suplidor', width: 24, required: true },
  { key: 'supplierDocument', importKey: 'supplier_document', header: 'RNC o cedula del suplidor', width: 20 },
  { key: 'supplierPhone', importKey: 'supplier_phone', header: 'Telefono del suplidor', width: 18 },
  { key: 'productSku', importKey: 'sku', header: 'SKU del producto', width: 18, required: true },
  { key: 'productName', importKey: 'product_name', header: 'Nombre del producto', width: 28, required: true },
  { key: 'quantity', importKey: 'quantity', header: 'Cantidad', type: 'number', width: 12, required: true },
  { key: 'unitCost', importKey: 'unit_cost', header: 'Costo unitario', type: 'money', width: 16, required: true },
  { key: 'discount', importKey: 'discount', header: 'Descuento', type: 'money', width: 14 },
  { key: 'taxAmount', importKey: 'tax_amount', header: 'ITBIS', type: 'money', width: 14 },
  { key: 'shippingTransportCost', importKey: 'shipping_transport_cost', header: 'Envíos / Transporte', type: 'money', width: 20 },
  { key: 'otherExpenses', importKey: 'other_expenses', header: 'Otros gastos', type: 'money', width: 14 },
  { key: 'paymentMethod', importKey: 'payment_method', header: 'Metodo de pago', width: 16 },
  { key: 'paymentStatus', importKey: 'payment_status', header: 'Estado del pago', width: 16 },
  { key: 'amountPaid', importKey: 'amount_paid', header: 'Monto pagado', type: 'money', width: 16 },
  { key: 'notes', importKey: 'notes', header: 'Observaciones', width: 28 },
  { key: 'purchaseStatus', importKey: 'status', header: 'Estado de la compra', width: 18 },
]
