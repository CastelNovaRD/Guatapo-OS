import { exportExcelDocument } from './excel-common'
import { exportPdfDocument } from './pdf-common'
import type { CustomerExportScope, ExportFormat } from './export-types'
import { todayIsoDate } from './export-common'

type CustomerExportRow = {
  name: string
  phone: string
  document: string
  type: 'Cliente' | 'Cliente fiscal' | 'Socio'
  purchases: number
  totalPurchased: number
  lastPurchase: string
  createdAt: string
}

export async function exportCustomers(params: { rows: CustomerExportRow[]; format: ExportFormat; scope: CustomerExportScope }) {
  const filtered = params.rows.filter((row) => {
    if (params.scope === 'customer') return row.type === 'Cliente'
    if (params.scope === 'fiscal') return row.type === 'Cliente fiscal'
    if (params.scope === 'partner') return row.type === 'Socio'
    return true
  })
  const document = {
    title: 'Clientes',
    filename: `clientes-guatapo-${todayIsoDate()}.${params.format === 'excel' ? 'xlsx' : 'pdf'}`,
    filters: [params.scope === 'all' ? 'Todos' : params.scope === 'customer' ? 'Clientes normales' : params.scope === 'fiscal' ? 'Clientes fiscales' : 'Socios'],
    orientation: 'landscape' as const,
    summary: [
      { label: 'Total de registros', value: params.rows.length, type: 'number' as const },
      { label: 'Clientes normales', value: params.rows.filter((row) => row.type === 'Cliente').length, type: 'number' as const },
      { label: 'Clientes fiscales', value: params.rows.filter((row) => row.type === 'Cliente fiscal').length, type: 'number' as const },
      { label: 'Socios', value: params.rows.filter((row) => row.type === 'Socio').length, type: 'number' as const },
      { label: 'Total comprado', value: params.rows.reduce((sum, row) => sum + Number(row.totalPurchased || 0), 0), type: 'money' as const },
    ],
    columns: [
      { key: 'name', header: 'Nombre', width: 28 },
      { key: 'phone', header: 'Telefono', width: 16 },
      { key: 'document', header: 'Cedula o RNC', width: 18 },
      { key: 'type', header: 'Tipo', width: 16 },
      { key: 'purchases', header: 'Cantidad de compras', type: 'number' as const, width: 18 },
      { key: 'totalPurchased', header: 'Total comprado', type: 'money' as const, width: 16 },
      { key: 'lastPurchase', header: 'Ultima compra', type: 'date' as const, width: 16 },
      { key: 'createdAt', header: 'Fecha de registro', type: 'date' as const, width: 18 },
    ],
    rows: filtered,
  }
  if (params.format === 'excel') return exportExcelDocument(document)
  return exportPdfDocument(document)
}
