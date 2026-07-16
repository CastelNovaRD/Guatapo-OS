import type { ExportColumn } from './export-types'

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function formatExportMoney(value: unknown) {
  const number = Number(value || 0)
  return `RD$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatExportDate(value: unknown) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('es-DO')
}

export function formatExportDateTime(value: unknown) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.toLocaleDateString('es-DO')} ${date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`
}

export function valueForColumn(row: Record<string, unknown>, column: ExportColumn) {
  return row[column.key as string]
}

export function displayValue(value: unknown, column?: Pick<ExportColumn, 'type'>) {
  if (column?.type === 'money') return formatExportMoney(value)
  if (column?.type === 'date') return formatExportDate(value)
  if (column?.type === 'datetime') return formatExportDateTime(value)
  if (value === null || value === undefined) return ''
  return String(value)
}

export function safeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
