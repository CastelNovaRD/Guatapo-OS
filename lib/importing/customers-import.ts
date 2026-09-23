
import { CUSTOMER_TEMPLATE_COLUMNS } from '@/lib/export/shared-templates'
import { ImportMode, ImportPreview, ImportPreviewRow, normalizeDocument, normalizePhone, readExcelTable } from './excel-import'

export type ExistingImportCustomer = { id: string; full_name: string; phone: string | null; cedula: string | null }
export type CustomerImportData = { full_name: string; phone: string | null; cedula: string | null }

function findExisting(row: CustomerImportData, customers: ExistingImportCustomer[]) {
  const cedula = normalizeDocument(row.cedula)
  const phone = normalizePhone(row.phone)
  if (cedula) return customers.find((customer) => normalizeDocument(customer.cedula) === cedula) || null
  if (phone) return customers.find((customer) => normalizePhone(customer.phone) === phone) || null
  return null
}

export async function previewCustomersImport(params: { file: File; customers: ExistingImportCustomer[]; mode: ImportMode }) {
  const table = await readExcelTable(params.file, CUSTOMER_TEMPLATE_COLUMNS)
  const seenDocs = new Set<string>()
  const rows: ImportPreviewRow<CustomerImportData>[] = table.rows.map(({ rowNumber, values }) => {
    const errors: string[] = []
    const warnings: string[] = []
    const fullName = String(values.name || '').trim()
    const phone = String(values.phone || '').trim() || null
    const cedula = String(values.document || '').trim() || null
    if (!fullName) errors.push('Falta Nombre.')
    if (!cedula && !phone) warnings.push('Sin cedula ni telefono; se puede crear duplicado.')
    const normalizedDoc = normalizeDocument(cedula)
    const duplicateInFile = normalizedDoc ? seenDocs.has(normalizedDoc) : false
    if (normalizedDoc) seenDocs.add(normalizedDoc)
    const existing = findExisting({ full_name: fullName, phone, cedula }, params.customers)
    let action: ImportPreviewRow['action'] = existing ? 'update' : 'new'
    if (duplicateInFile) action = 'duplicate'
    if (params.mode === 'create' && existing) action = 'skip'
    if (params.mode === 'update' && !existing) action = 'skip'
    if (errors.length) action = 'error'
    return { rowNumber, original: values, data: { full_name: fullName, phone, cedula }, key: cedula || phone || fullName || `Fila ${rowNumber}`, action, message: existing ? 'Cliente existente encontrado.' : 'Cliente nuevo.', existingId: existing?.id, errors, warnings }
  })
  return { headers: table.headers, rows } as ImportPreview<CustomerImportData>
}

export async function commitCustomersImport(params: { storeId: string; preview: ImportPreview<CustomerImportData>; mode: ImportMode; allowBlankClear: boolean }) {
  const validRows = params.preview.rows.filter((row) => !['error', 'duplicate', 'skip'].includes(row.action))
  let created = 0, updated = 0, omitted = params.preview.rows.length - validRows.length, errors = 0
  for (const row of validRows) {
    const payload: Record<string, unknown> = {}
    const assign = (key: string, value: unknown) => { if (params.allowBlankClear || value !== null && value !== '') payload[key] = value }
    assign('full_name', row.data.full_name)
    assign('phone', row.data.phone)
    assign('cedula', row.data.cedula)
    if (row.existingId) {
      const response = await fetch(`/api/customers/${row.existingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) { const body = await response.json() as { error?: string }; row.action = 'error'; row.errors.push(body.error || 'No se pudo actualizar el cliente.'); errors += 1; continue }
      updated += 1
    } else {
      const response = await fetch('/api/customers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) { const body = await response.json() as { error?: string }; row.action = 'error'; row.errors.push(body.error || 'No se pudo crear el cliente.'); errors += 1; continue }
      created += 1
    }
  }
  return { created, updated, omitted, errors }
}
