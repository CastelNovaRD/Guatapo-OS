import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { ExportFormat } from './export-types'
import { todayIsoDate } from './export-common'
import { PURCHASE_TEMPLATE_COLUMNS } from './shared-templates'

export type PurchaseExportRow = {
  purchaseCode: string
  supplierInvoice: string
  purchaseDate: string
  receivedDate: string
  supplierName: string
  supplierDocument: string
  supplierPhone: string
  productSku: string
  productName: string
  quantity: number
  unitCost: number
  discount: number
  taxAmount: number
  shippingTransportCost: number
  otherExpenses: number
  paymentMethod: string
  paymentStatus: string
  amountPaid: number
  notes: string
  purchaseStatus: string
}

export async function exportPurchases(params: { rows: PurchaseExportRow[]; format: ExportFormat }) {
  const document = {
    title: 'Compras',
    filename: `compras-guatapo-${todayIsoDate()}.${params.format === 'excel' ? 'xlsx' : 'pdf'}`,
    filters: ['Compras registradas'],
    orientation: 'landscape' as const,
    summary: [
      { label: 'Compras', value: new Set(params.rows.map((row) => row.purchaseCode || row.supplierInvoice)).size, type: 'number' as const },
      { label: 'Lineas', value: params.rows.length, type: 'number' as const },
      { label: 'Total', value: params.rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitCost || 0) - Number(row.discount || 0) + Number(row.taxAmount || 0) + Number(row.shippingTransportCost || 0) + Number(row.otherExpenses || 0), 0), type: 'money' as const },
    ],
    columns: PURCHASE_TEMPLATE_COLUMNS,
    rows: params.rows,
  }
  if (params.format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}
