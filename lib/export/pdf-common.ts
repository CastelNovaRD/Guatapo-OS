import type { ExportDocument, ExportTable } from './export-types'
import { displayValue, valueForColumn } from './export-common'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTable(table: ExportTable) {
  return `
    <section class="table-section">
      <h2>${escapeHtml(table.title)}</h2>
      <table>
        <thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${table.rows.map((row) => `<tr>${table.columns.map((column) => `<td class="${column.align || ''}">${escapeHtml(displayValue(valueForColumn(row as Record<string, unknown>, column), column))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${table.columns.length}">Sin datos.</td></tr>`}
        </tbody>
      </table>
    </section>`
}

export function exportPdfDocument(document: ExportDocument) {
  const tables = document.columns && document.rows
    ? [{ title: 'Detalle', columns: document.columns, rows: document.rows }, ...(document.tables || [])]
    : document.tables || []
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.filename)}</title>
  <style>
    @page { size: A4 ${document.orientation || 'landscape'}; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
    header { border-bottom: 3px solid #009a44; padding-bottom: 10px; margin-bottom: 14px; }
    .brand { font-size: 20px; font-weight: 900; color: #009a44; letter-spacing: .08em; }
    h1 { margin: 4px 0 3px; font-size: 20px; }
    .meta { color: #52525b; font-size: 11px; font-weight: 700; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
    .summary div { border: 1px solid #d4d4d8; border-radius: 8px; padding: 8px; break-inside: avoid; }
    .summary span { display: block; color: #52525b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .summary strong { display: block; margin-top: 3px; font-size: 13px; }
    h2 { margin: 16px 0 8px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; font-size: 10px; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #111827; color: white; padding: 7px; text-align: left; border: 1px solid #111827; }
    td { padding: 6px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f4f4f5; }
    .right { text-align: right; }
    .center { text-align: center; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; color: #71717a; font-size: 10px; border-top: 1px solid #d4d4d8; padding-top: 6px; display: flex; justify-content: space-between; }
    .page-number:after { content: counter(page); }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">GUATAPO</div>
    <h1>${escapeHtml(document.title)}</h1>
    <div class="meta">${escapeHtml([document.period, ...(document.filters || []), `Generado: ${new Date().toLocaleString('es-DO')}`].filter(Boolean).join(' | '))}</div>
  </header>
  ${document.summary?.length ? `<section class="summary">${document.summary.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(displayValue(item.value, { type: item.type }))}</strong></div>`).join('')}</section>` : ''}
  ${tables.map(renderTable).join('')}
  <footer><span>Generado por CastelNova OS</span><span>Página <span class="page-number"></span></span></footer>
  <script>window.onload = () => { window.focus(); window.print(); }</script>
</body>
</html>`
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return alert('Permite ventanas emergentes para exportar PDF.')
  win.document.open()
  win.document.write(html)
  win.document.close()
}
