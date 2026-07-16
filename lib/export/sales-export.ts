import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { ExportFormat, SalesExportChannel, SalesExportPeriod, SalesExportStatus } from './export-types'
import { safeFilename } from './export-common'

type SalesExportRow = {
  invoice: string
  createdAt: string
  customer: string
  channel: string
  status: string
  paymentMethod: string
  itemCount: number
  total: number
  cost: number
  profit: number
  cardFee: number
  cooperativeFee: number
  shipping: number
}

type SalesExportParams = {
  rows: SalesExportRow[]
  format: ExportFormat
  period: SalesExportPeriod
  fromDate?: string
  toDate?: string
  channel: SalesExportChannel
  status: SalesExportStatus
}

function periodLabel(params: SalesExportParams) {
  if (params.period === 'day') return 'Dia'
  if (params.period === 'month') return 'Mes'
  if (params.period === 'year') return 'Año'
  return `Personalizado ${params.fromDate || ''} - ${params.toDate || ''}`.trim()
}

function normalizeStatus(status: string) {
  const value = status.toLowerCase()
  if (value.includes('paid') || value.includes('pagad') || value.includes('complete')) return 'paid'
  if (value.includes('cancel') || value.includes('anulad')) return 'cancelled'
  return 'pending'
}

function normalizeChannel(channel: string) {
  const value = channel.toLowerCase()
  if (value.includes('coop')) return 'cooperative'
  if (value.includes('cot') || value.includes('quote')) return 'quotation'
  return 'pos'
}

export async function exportSales(params: SalesExportParams) {
  const filtered = params.rows.filter((row) => {
    const channelOk = params.channel === 'all' || normalizeChannel(row.channel) === params.channel
    const statusOk = params.status === 'all' || normalizeStatus(row.status) === params.status
    return channelOk && statusOk
  })
  const period = periodLabel(params)
  const document = {
    title: 'Ventas',
    filename: `ventas-guatapo-${safeFilename(period)}.${params.format === 'excel' ? 'xlsx' : 'pdf'}`,
    period,
    filters: [
      params.channel === 'all' ? 'Canal: Todos' : `Canal: ${params.channel}`,
      params.status === 'all' ? 'Estado: Todos' : `Estado: ${params.status}`,
    ],
    orientation: 'landscape' as const,
    summary: [
      { label: 'Cantidad de ventas', value: filtered.length, type: 'number' as const },
      { label: 'Total facturado', value: filtered.reduce((sum, row) => sum + row.total, 0), type: 'money' as const },
      { label: 'Items vendidos', value: filtered.reduce((sum, row) => sum + row.itemCount, 0), type: 'number' as const },
      { label: 'Beneficio neto', value: filtered.reduce((sum, row) => sum + row.profit, 0), type: 'money' as const },
      { label: 'Comision de tarjeta', value: filtered.reduce((sum, row) => sum + row.cardFee, 0), type: 'money' as const },
      { label: 'Comision de cooperativas', value: filtered.reduce((sum, row) => sum + row.cooperativeFee, 0), type: 'money' as const },
      { label: 'Envios', value: filtered.reduce((sum, row) => sum + row.shipping, 0), type: 'money' as const },
    ],
    columns: [
      { key: 'invoice', header: 'Factura', width: 18 },
      { key: 'createdAt', header: 'Fecha y hora', type: 'datetime' as const, width: 18 },
      { key: 'customer', header: 'Cliente', width: 24 },
      { key: 'channel', header: 'Canal', width: 14 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'paymentMethod', header: 'Metodo de pago', width: 16 },
      { key: 'itemCount', header: 'Items', type: 'number' as const, width: 10 },
      { key: 'total', header: 'Total', type: 'money' as const, width: 14 },
      { key: 'cost', header: 'Costo', type: 'money' as const, width: 14 },
      { key: 'profit', header: 'Beneficio', type: 'money' as const, width: 14 },
      { key: 'cardFee', header: 'Comision tarjeta', type: 'money' as const, width: 16 },
      { key: 'cooperativeFee', header: 'Comision cooperativa', type: 'money' as const, width: 18 },
      { key: 'shipping', header: 'Envio', type: 'money' as const, width: 12 },
    ],
    rows: filtered,
  }
  if (params.format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}
