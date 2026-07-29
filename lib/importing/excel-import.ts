
import { downloadBlob } from '@/lib/export/export-common'
import type { ImportableColumn } from '@/lib/export/shared-templates'

export type ImportMode = 'create' | 'upsert' | 'update'
export type ImportAction = 'new' | 'update' | 'duplicate' | 'skip' | 'warning' | 'error'

export type ImportPreviewRow<T = Record<string, unknown>> = {
  rowNumber: number
  original: Record<string, unknown>
  data: T
  key: string
  action: ImportAction
  message: string
  existingId?: string
  errors: string[]
  warnings: string[]
}

export type ImportPreview<T = Record<string, unknown>> = {
  rows: ImportPreviewRow<T>[]
  headers: string[]
  criticalError?: string
}

async function getExcelJS(): Promise<typeof import('exceljs')> {
  return await import('exceljs')
}

type ExcelCellLike = { value: unknown }
type ExcelRowLike = {
  number: number
  eachCell: (options: { includeEmpty: boolean }, callback: (cell: ExcelCellLike, colNumber: number) => void) => void
  getCell: (colNumber: number) => ExcelCellLike
}
type ExcelWorksheetLike = {
  rowCount: number
  eachRow: (callback: (row: ExcelRowLike) => void) => void
  getRow: (rowNumber: number) => ExcelRowLike
}

function normalizeHeader(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function columnHeaderKeys(column: ImportableColumn) {
  return [column.header, column.importKey, column.key, ...(column.aliases || [])].filter(Boolean).map(normalizeHeader)
}

function cellToPlainValue(value: unknown) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const objectValue = value as { result?: unknown; text?: unknown; richText?: unknown; hyperlink?: unknown }
    if ('result' in objectValue) return cellToPlainValue(objectValue.result)
    if ('text' in objectValue) return String(objectValue.text || '')
    if (Array.isArray(objectValue.richText)) return objectValue.richText.map((part) => String((part as { text?: unknown }).text || '')).join('')
    if ('hyperlink' in objectValue && 'text' in objectValue) return String(objectValue.text || '')
  }
  return typeof value === 'string' ? value.trim() : value
}

export async function readExcelTable(file: File, columns: ImportableColumn[]) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Solo se aceptan archivos Excel .xlsx.')
  const ExcelJS = await getExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = (workbook.getWorksheet('Productos') || workbook.worksheets[0]) as ExcelWorksheetLike | undefined
  if (!sheet) throw new Error('El archivo Excel no tiene hojas.')

  let headerRowNumber = 0
  let headerValues: string[] = []
  let columnIndexes = new Map<string, number>()

  sheet.eachRow((row) => {
    if (headerRowNumber) return
    const currentValues: string[] = []
    const normalizedByColumn = new Map<number, string>()
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const raw = String(cellToPlainValue(cell.value)).trim()
      if (!raw) return
      currentValues[colNumber - 1] = raw
      normalizedByColumn.set(colNumber, normalizeHeader(raw))
    })

    const candidateIndexes = new Map<string, number>()
    let matches = 0
    columns.forEach((column) => {
      const keys = columnHeaderKeys(column)
      for (const [colNumber, normalized] of normalizedByColumn.entries()) {
        if (keys.includes(normalized)) {
          candidateIndexes.set(String(column.key), colNumber)
          matches += 1
          break
        }
      }
    })

    if (matches >= Math.min(columns.filter((column) => column.required).length || columns.length, 3)) {
      headerRowNumber = row.number
      headerValues = currentValues.map((value) => value || '')
      columnIndexes = candidateIndexes
    }
  })

  if (!headerRowNumber) throw new Error('No se encontraron encabezados compatibles para importar.')
  const missing = columns.filter((column) => column.required && !columnIndexes.has(String(column.key))).map((column) => column.header)
  if (missing.length) throw new Error('Faltan columnas obligatorias: ' + missing.join(', '))

  const rows: { rowNumber: number; values: Record<string, unknown> }[] = []
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const values: Record<string, unknown> = {}
    let hasValue = false
    columns.forEach((column) => {
      const colNumber = columnIndexes.get(String(column.key))
      const value = colNumber ? cellToPlainValue(row.getCell(colNumber).value) : ''
      values[String(column.key)] = value
      if (value !== '') hasValue = true
    })
    if (hasValue) rows.push({ rowNumber, values })
  }
  return { headers: headerValues, rows }
}

export function normalizeDocument(value: unknown) {
  return String(value || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

export function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 && digits.startsWith('1') ? digits.slice(-10) : digits
}

export function normalizeTextKey(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/s$/i, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function parseNumber(value: unknown) {
  if (value === '' || value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const cleaned = String(value).replace(/RD\$|,/gi, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : NaN
}

export async function downloadImportResult(filename: string, rows: ImportPreviewRow[]) {
  const ExcelJS = await getExcelJS()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Resultado')
  const headers = ['Fila', 'Producto', 'Categor?a', 'Acci?n realizada', 'Estado', 'SKU final', 'C?digo de barras final', 'Mensaje', 'ID del producto']
  sheet.addRow(headers)
  rows.forEach((row) => {
    const data = row.data as Record<string, unknown>
    sheet.addRow([
      row.rowNumber,
      data.name || data.product || row.key,
      data.category || '',
      row.action === 'new' ? 'Crear' : row.existingId ? 'Actualizar' : row.action === 'duplicate' ? 'Posible duplicado' : row.action === 'error' ? 'Error' : 'Omitir',
      row.errors.length ? 'Error' : row.action === 'skip' ? 'Omitido' : 'Correcto',
      data.finalSku || data.code || '',
      data.finalBarcode || data.barcode || '',
      [...row.errors, ...row.warnings, row.message].filter(Boolean).join(' | '),
      row.existingId || data.productId || '',
    ])
  })
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '111827' } }
  sheet.columns = headers.map(() => ({ width: 24 }))
  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
