'use client'

function escapeCsvValue(value: string | number | null | undefined) {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const content = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type ExcelCell = string | number | Date | null | undefined

export type ExcelSheet = {
  name: string
  title?: string
  subtitle?: string
  columns: string[]
  rows: ExcelCell[][]
  summary?: Array<[string, ExcelCell]>
}

function escapeXml(value: ExcelCell) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function excelCell(value: ExcelCell, styleId = 'Cell') {
  if (value instanceof Date) {
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="DateTime">${value.toISOString()}</Data></Cell>`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${value}</Data></Cell>`
  }

  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`
}

function worksheetXml(sheet: ExcelSheet) {
  const columnCount = Math.max(sheet.columns.length, 2)
  const rows: string[] = []

  if (sheet.title) {
    rows.push(
      `<Row ss:Height="30"><Cell ss:StyleID="Title" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(sheet.title)}</Data></Cell></Row>`
    )
  }

  if (sheet.subtitle) {
    rows.push(
      `<Row ss:Height="24"><Cell ss:StyleID="Subtitle" ss:MergeAcross="${columnCount - 1}"><Data ss:Type="String">${escapeXml(sheet.subtitle)}</Data></Cell></Row>`
    )
  }

  if (sheet.summary?.length) {
    rows.push('<Row />')
    sheet.summary.forEach(([label, value]) => {
      rows.push(`<Row>${excelCell(label, 'SummaryLabel')}${excelCell(value, 'SummaryValue')}</Row>`)
    })
  }

  rows.push('<Row />')
  rows.push(`<Row>${sheet.columns.map((column) => excelCell(column, 'Header')).join('')}</Row>`)
  sheet.rows.forEach((row) => {
    rows.push(`<Row>${row.map((cell) => excelCell(cell)).join('')}</Row>`)
  })

  const columns = Array.from({ length: columnCount })
    .map(() => '<Column ss:AutoFitWidth="1" ss:Width="130"/>')
    .join('')

  return `
    <Worksheet ss:Name="${escapeXml(sheet.name).slice(0, 31)}">
      <Table>${columns}${rows.join('')}</Table>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes/><FrozenNoSplit/><SplitHorizontal>${sheet.summary?.length ? 5 + sheet.summary.length : 3}</SplitHorizontal>
      </WorksheetOptions>
    </Worksheet>`
}

export function downloadExcelWorkbook(filename: string, sheets: ExcelSheet[]) {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Cell">
      <Font ss:FontName="Arial" ss:Size="11"/>
      <Alignment ss:Vertical="Center"/>
      <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E4E7"/></Borders>
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Arial" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#008F11" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="Subtitle">
      <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#3F3F46"/>
      <Interior ss:Color="#F4F4F5" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#008F11" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SummaryLabel">
      <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#3F3F46"/>
      <Interior ss:Color="#F4F4F5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SummaryValue">
      <Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#008F11"/>
      <Interior ss:Color="#F4F4F5" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${sheets.map(worksheetXml).join('')}
</Workbook>`

  const blob = new Blob([workbook], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type WorkbookLike = any
type WorksheetLike = any

async function loadTemplateWorkbook(templateUrl: string): Promise<WorkbookLike> {
  // @ts-ignore - ExcelJS exposes a browser bundle that Next can load dynamically.
  const ExcelJS = await import('exceljs/dist/exceljs.min.js')
  const workbook = new ExcelJS.Workbook()
  const response = await fetch(templateUrl)
  const buffer = await response.arrayBuffer()
  await workbook.xlsx.load(buffer)
  return workbook
}

async function saveTemplateWorkbook(workbook: WorkbookLike, filename: string) {
  workbook.calcProperties = {
    ...(workbook.calcProperties || {}),
    fullCalcOnLoad: true,
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function cloneCellStyle(from: any, to: any) {
  if (!from || !to) return
  to.style = JSON.parse(JSON.stringify(from.style || {}))
}

function writeStyledRow(sheet: WorksheetLike, rowNumber: number, values: Array<string | number | null | undefined>, styleRowNumber: number) {
  const styleRow = sheet.getRow(styleRowNumber)
  const row = sheet.getRow(rowNumber)

  values.forEach((value, index) => {
    const cell = row.getCell(index + 1)
    cloneCellStyle(styleRow.getCell(index + 1), cell)
    cell.value = value ?? ''
  })

  row.height = styleRow.height
  row.commit?.()
}

function clearRows(sheet: WorksheetLike, startRow: number, endRow: number, columnCount: number) {
  const lastRow = Math.max(endRow, sheet.rowCount || 0)
  for (let rowNumber = startRow; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    for (let column = 1; column <= columnCount; column += 1) row.getCell(column).value = null
  }
}

function replaceTemplateRows(
  sheet: WorksheetLike,
  startRow: number,
  values: Array<Array<string | number | null | undefined>>,
  styleRowNumber: number,
  columnCount: number
) {
  const styleRow = sheet.getRow(styleRowNumber)
  const templateHeight = styleRow.height
  const templateStyles = Array.from({ length: columnCount }, (_, index) =>
    JSON.parse(JSON.stringify(styleRow.getCell(index + 1).style || {}))
  )
  const rowsToRemove = Math.max(1, (sheet.rowCount || startRow) - startRow + 1)

  sheet.spliceRows(startRow, rowsToRemove, ...values)

  const rowsToStyle = Math.max(values.length, 1)
  for (let rowIndex = 0; rowIndex < rowsToStyle; rowIndex += 1) {
    const row = sheet.getRow(startRow + rowIndex)
    row.height = templateHeight
    for (let column = 1; column <= columnCount; column += 1) {
      row.getCell(column).style = JSON.parse(JSON.stringify(templateStyles[column - 1] || {}))
    }
    row.commit?.()
  }
}

function resizeTable(sheet: WorksheetLike, tableName: string, range: string) {
  try {
    const table = sheet.getTable?.(tableName)
    table?.ref && (table.ref = range)
    table?.commit?.()
  } catch {
    // Some templates do not expose tables in the browser build. Values still export correctly.
  }
}

export type InventoryTemplateRow = {
  name: string
  stock: number
  category: string
  cost: number
  salePrice: number
}

export async function downloadInventoryTemplateExcel(params: {
  filename: string
  rows: InventoryTemplateRow[]
  inventoryValue: number
  lowStockCount: number
  activeCount: number
  itemCount: number
}) {
  const workbook = await loadTemplateWorkbook('/templates/plantilla-inventario.xlsx')
  const sheet = workbook.getWorksheet('Hoja1') || workbook.worksheets[0]

  sheet.getCell('E2').value = new Date()
  sheet.getCell('B6').value = params.inventoryValue
  sheet.getCell('D6').value = params.lowStockCount
  sheet.getCell('E6').value = params.activeCount
  sheet.getCell('F6').value = params.itemCount

  replaceTemplateRows(
    sheet,
    10,
    params.rows.map((item, index) => [index + 1, item.name, item.stock, item.category, item.cost, item.salePrice]),
    10,
    6
  )

  await saveTemplateWorkbook(workbook, params.filename)
}

export type InvoiceTemplateRow = {
  invoice: string
  customer: string
  ncf?: string
  date: string
  product: string
  paymentMethod: string
  total: number
}

function fillInvoiceSheet(sheet: WorksheetLike, title: string, subtitle: string, rows: InvoiceTemplateRow[], withNcf: boolean) {
  if (!sheet) return

  sheet.getCell('A2').value = title
  sheet.getCell('E2').value = subtitle
  replaceTemplateRows(
    sheet,
    6,
    rows.map((item) =>
      withNcf
        ? [item.invoice, item.customer, item.ncf || '', item.date, item.product, item.paymentMethod, item.total]
        : [item.invoice, item.customer, item.date, item.product, item.paymentMethod, item.total]
    ),
    6,
    withNcf ? 7 : 6
  )
}

export async function downloadInvoicesTemplateExcel(params: {
  filename: string
  periodLabel: string
  normalRows: InvoiceTemplateRow[]
  ncfRows: InvoiceTemplateRow[]
  cooperativeRows: InvoiceTemplateRow[]
}) {
  const workbook = await loadTemplateWorkbook('/templates/plantilla-facturas.xlsx')

  fillInvoiceSheet(
    workbook.getWorksheet('CLIENTES'),
    'REPORTE DE FACTURA DE: GUATAPO OS',
    params.periodLabel,
    params.normalRows,
    false
  )
  fillInvoiceSheet(
    workbook.getWorksheet('CON NCF'),
    'REPORTE DE FACTURA DE: GUATAPO OS CON NCF',
    params.periodLabel,
    params.ncfRows,
    true
  )
  fillInvoiceSheet(
    workbook.getWorksheet('COOPSEMA'),
    'REPORTE DE FACTURA DE: GUATAPO OS. COOPERATIVAS',
    params.periodLabel,
    params.cooperativeRows,
    false
  )

  await saveTemplateWorkbook(workbook, params.filename)
}

export type ReportTemplateSale = {
  date: string
  invoice: string
  customer: string
  cooperative: string
  channel: string
  status: string
  items: number
  total: number
  profit: number
  cardFee: number
}

export type ReportTemplateProduct = {
  product: string
  category: string
  stock: number
  cost: number
  inventoryValue: number
  status: string
  alert: string
}

export type ReportTemplatePurchase = {
  date: string
  supplier: string
  reference: string
  products: string
  units: number
  unitPrice: number
  total: number
}

export async function downloadReportsTemplateExcel(params: {
  filename: string
  periodLabel: string
  generatedAt: string
  sales: ReportTemplateSale[]
  products: ReportTemplateProduct[]
  purchases: ReportTemplatePurchase[]
}) {
  const workbook = await loadTemplateWorkbook('/templates/plantilla-reportes.xlsx')
  const config = workbook.getWorksheet('Config')
  const report = workbook.getWorksheet('Reporte')
  const ventas = workbook.getWorksheet('Ventas')
  const productos = workbook.getWorksheet('Productos')
  const compras = workbook.getWorksheet('Compras')

  if (config) {
    config.getCell('B2').value = params.periodLabel.toUpperCase()
    config.getCell('B5').value = params.periodLabel
    config.getCell('B6').value = new Date()
  }

  if (report) {
    report.getCell('J4').value = `${params.periodLabel.toUpperCase()} | ${params.generatedAt}`
  }

  if (ventas) {
    replaceTemplateRows(
      ventas,
      2,
      params.sales.map((sale) => [sale.date, sale.invoice, sale.customer, sale.cooperative, sale.channel, sale.status, sale.items, sale.total, sale.profit, sale.cardFee]),
      2,
      10
    )
    resizeTable(ventas, 'VentasTable', `A1:J${Math.max(2, params.sales.length + 1)}`)
  }

  if (productos) {
    replaceTemplateRows(
      productos,
      2,
      params.products.map((product) => [product.product, product.category, '', '', product.stock, product.cost, product.inventoryValue, product.status, product.alert]),
      2,
      9
    )
    resizeTable(productos, 'ProductosTable', `A1:I${Math.max(2, params.products.length + 1)}`)
  }

  if (compras) {
    replaceTemplateRows(
      compras,
      2,
      params.purchases.map((purchase) => [purchase.date, purchase.supplier, purchase.reference, purchase.products, purchase.units, purchase.unitPrice, purchase.total]),
      2,
      7
    )
    resizeTable(compras, 'ComprasTable', `A1:G${Math.max(2, params.purchases.length + 1)}`)
  }

  await saveTemplateWorkbook(workbook, params.filename)
}
