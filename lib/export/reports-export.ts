import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { ExportFormat, SalesExportPeriod, ExportTable } from './export-types'
import { safeFilename } from './export-common'

type ReportsParams = {
  format: ExportFormat
  period: SalesExportPeriod
  periodLabel: string
  summary: Record<string, number>
  topProducts: Array<Record<string, unknown>>
  latestSales: Array<Record<string, unknown>>
  purchases: Array<Record<string, unknown>>
  receivables: Array<Record<string, unknown>>
  inventoryAlerts: Array<Record<string, unknown>>
}

export async function exportReports(params: ReportsParams) {
  const tables: ExportTable[] = [
    {
      title: 'Productos mas vendidos',
      columns: [
        { key: 'product', header: 'Producto', width: 28 },
        { key: 'quantity', header: 'Cantidad', type: 'number', width: 12 },
        { key: 'total', header: 'Total', type: 'money', width: 16 },
      ],
      rows: params.topProducts,
    },
    {
      title: 'Ultimas ventas',
      columns: [
        { key: 'date', header: 'Fecha', type: 'date', width: 14 },
        { key: 'invoice', header: 'Factura', width: 18 },
        { key: 'channel', header: 'Canal', width: 14 },
        { key: 'status', header: 'Estado', width: 14 },
        { key: 'total', header: 'Total', type: 'money', width: 16 },
      ],
      rows: params.latestSales,
    },
    {
      title: 'Compras del periodo',
      columns: [
        { key: 'date', header: 'Fecha', type: 'date', width: 14 },
        { key: 'supplier', header: 'Proveedor', width: 24 },
        { key: 'reference', header: 'Referencia', width: 18 },
        { key: 'total', header: 'Total', type: 'money', width: 16 },
      ],
      rows: params.purchases,
    },
    {
      title: 'Cuentas por cobrar',
      columns: [
        { key: 'date', header: 'Fecha', type: 'date', width: 14 },
        { key: 'reference', header: 'Referencia', width: 18 },
        { key: 'status', header: 'Estado', width: 14 },
        { key: 'amount', header: 'Monto', type: 'money', width: 16 },
      ],
      rows: params.receivables,
    },
    {
      title: 'Alertas de inventario',
      columns: [
        { key: 'product', header: 'Producto', width: 28 },
        { key: 'category', header: 'Categoria', width: 18 },
        { key: 'stock', header: 'Stock', type: 'number', width: 10 },
        { key: 'alert', header: 'Alerta', width: 16 },
      ],
      rows: params.inventoryAlerts,
    },
  ]
  const document = {
    title: 'Reporte general',
    filename: `reporte-general-guatapo-${safeFilename(params.periodLabel)}.${params.format === 'excel' ? 'xlsx' : 'pdf'}`,
    period: params.periodLabel,
    orientation: 'landscape' as const,
    summary: [
      { label: 'Ventas', value: params.summary.sales || 0, type: 'money' as const },
      { label: 'Compras', value: params.summary.purchases || 0, type: 'money' as const },
      { label: 'Beneficio neto', value: params.summary.profit || 0, type: 'money' as const },
      { label: 'Cobros recibidos', value: params.summary.payments || 0, type: 'money' as const },
      { label: 'Pendiente por cobrar', value: params.summary.pendingReceivable || 0, type: 'money' as const },
      { label: 'Comision de tarjeta', value: params.summary.cardFee || 0, type: 'money' as const },
      { label: 'Comision de cooperativas', value: params.summary.cooperativeFee || 0, type: 'money' as const },
      { label: 'Envios', value: params.summary.shipping || 0, type: 'money' as const },
      { label: 'Productos activos', value: params.summary.activeProducts || 0, type: 'number' as const },
      { label: 'Stock bajo', value: params.summary.lowStock || 0, type: 'number' as const },
      { label: 'Agotados', value: params.summary.outOfStock || 0, type: 'number' as const },
    ],
    tables,
  }
  if (params.format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}
