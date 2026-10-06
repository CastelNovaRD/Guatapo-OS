import type { ExportDocument, ExportTable } from './export-types'
import { displayValue, downloadBlob, valueForColumn } from './export-common'

type ExcelJSModule = typeof import('exceljs')

const HEADER_FILL = '111827'
const GREEN_FILL = '009A44'
const LIGHT_FILL = 'F4F4F5'

async function getExcelJS(): Promise<ExcelJSModule> {
  return await import('exceljs')
}

function addSummary(sheet: any, summary: ExportDocument['summary']) {
  if (!summary?.length) return
  sheet.addRow([])
  summary.forEach((item) => {
    const row = sheet.addRow([item.label, item.value])
    row.getCell(1).font = { bold: true, color: { argb: '3F3F46' } }
    row.getCell(2).font = { bold: true, color: { argb: item.type === 'money' ? '009A44' : '111827' } }
    if (item.type === 'money') row.getCell(2).numFmt = 'RD$ #,##0.00'
  })
}

function addTable(sheet: any, table: ExportTable) {
  if (sheet.rowCount > 1) sheet.addRow([])
  const title = sheet.addRow([table.title])
  title.font = { bold: true, size: 13, color: { argb: '111827' } }
  const header = sheet.addRow(table.columns.map((column) => column.header))
  header.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.font = { bold: true, color: { argb: 'FFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'D4D4D8' } } }
  })

  table.rows.forEach((row, index) => {
    const excelRow = sheet.addRow(table.columns.map((column) => valueForColumn(row as Record<string, unknown>, column)))
    excelRow.eachCell((cell: any, cellNumber: number) => {
      const column = table.columns[cellNumber - 1]
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_FILL } }
      if (column?.type === 'money') cell.numFmt = 'RD$ #,##0.00'
      if (column?.type === 'date') cell.numFmt = 'dd/mm/yyyy'
      if (column?.type === 'datetime') cell.numFmt = 'dd/mm/yyyy hh:mm'
      cell.alignment = { vertical: 'middle', horizontal: column?.align || (column?.type === 'money' || column?.type === 'number' ? 'right' : 'left') }
      cell.border = { bottom: { style: 'thin', color: { argb: 'E4E4E7' } } }
    })
  })

  const headerRow = sheet.getRow(sheet.rowCount - table.rows.length)
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: table.columns.length },
  }
}

export async function exportExcelDocument(document: ExportDocument) {
  const ExcelJS = await getExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CastelNova OS'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Reporte', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: document.orientation || 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  })

  const mainColumns = document.columns || document.tables?.[0]?.columns || []
  const columnCount = Math.max(mainColumns.length, 2)
  const title = sheet.addRow(['GUATAPO'])
  title.height = 24
  title.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFF' } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_FILL } }
  sheet.mergeCells(title.number, 1, title.number, columnCount)

  const report = sheet.addRow([document.title])
  report.getCell(1).font = { bold: true, size: 14, color: { argb: '111827' } }
  sheet.mergeCells(report.number, 1, report.number, columnCount)

  const meta = [document.period, ...(document.filters || []), `Generado: ${new Date().toLocaleString('es-DO')}`].filter(Boolean).join(' | ')
  const metaRow = sheet.addRow([meta])
  metaRow.getCell(1).font = { bold: true, color: { argb: '52525B' } }
  sheet.mergeCells(metaRow.number, 1, metaRow.number, columnCount)

  addSummary(sheet, document.summary)

  if (document.columns && document.rows) addTable(sheet, { title: 'Detalle', columns: document.columns, rows: document.rows })
  document.tables?.forEach((table) => addTable(sheet, table))

  sheet.columns = Array.from({ length: columnCount }).map((_, index) => ({ width: mainColumns[index]?.width || 18 }))
  sheet.eachRow((row: any) => row.commit?.())

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(document.filename.endsWith('.xlsx') ? document.filename : `${document.filename}.xlsx`, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
