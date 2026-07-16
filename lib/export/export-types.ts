export type ExportFormat = 'excel' | 'pdf'

export type ExportColumn<T = Record<string, unknown>> = {
  key: keyof T | string
  header: string
  width?: number
  type?: 'text' | 'number' | 'money' | 'date' | 'datetime'
  align?: 'left' | 'center' | 'right'
}

export type ExportSummaryItem = {
  label: string
  value: string | number
  type?: 'text' | 'number' | 'money' | 'date'
}

export type ExportTable<T = Record<string, unknown>> = {
  title: string
  columns: ExportColumn<T>[]
  rows: T[]
}

export type ExportDocument<T = Record<string, unknown>> = {
  title: string
  filename: string
  filters?: string[]
  period?: string
  summary?: ExportSummaryItem[]
  columns?: ExportColumn<T>[]
  rows?: T[]
  tables?: ExportTable[]
  orientation?: 'portrait' | 'landscape'
}

export type InventoryExportScope = 'all' | 'active' | 'low' | 'out' | 'category'
export type CustomerExportScope = 'all' | 'customer' | 'fiscal' | 'partner'
export type SalesExportPeriod = 'day' | 'month' | 'year' | 'custom'
export type SalesExportChannel = 'all' | 'pos' | 'cooperative' | 'quotation'
export type SalesExportStatus = 'all' | 'paid' | 'pending' | 'cancelled'
