import { formatDate } from '@/lib/format'

export type Invoice80Sale = {
  id: string
  invoice_number: string | null
  ncf: string | null
  subtotal: number
  itbis: number
  total: number
  discount: number
  card_fee: number
  shipping_cost: number
  net_received: number
  cash_received: number
  cash_change: number
  created_at: string
  customer_id: string | null
  payment_method_id: string | null
  sale_channel: string | null
  fiscal_receipt_type: string | null
  fiscal_status: string | null
  fiscal_customer_name: string | null
  fiscal_customer_rnc: string | null
  fiscal_customer_phone: string | null
  fiscal_customer_address: string | null
  ecf_security_code: string | null
  ecf_qr_url: string | null
}

export type Invoice80Item = {
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
  imei: string | null
}

export type Invoice80Customer = {
  full_name: string
  phone: string | null
  cedula: string | null
}

export type Invoice80FiscalCustomer = {
  company_name: string
  rnc: string | null
  phone: string | null
  address: string | null
}

export type Invoice80PaymentMethod = {
  name: string
}

export function receiptMoney(value: number | string | null | undefined) {
  return `RD$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function receiptNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function receiptDate(value: string | null | undefined) {
  if (!value) return '-'
  return formatDate(value)
}

export function paymentMethodLabel(sale: Invoice80Sale, paymentMethod: Invoice80PaymentMethod | null) {
  const name = paymentMethod?.name?.trim()
  if (name) return name.toUpperCase()
  if (Number(sale.cash_received || 0) > 0) return 'EFECTIVO'
  if (Number(sale.card_fee || 0) > 0) return 'TARJETA'
  return 'TRANSFERENCIA'
}

export function receiptQrValue(sale: Invoice80Sale, items: Invoice80Item[]) {
  const products = items.map((item) => `${item.product_name} x${item.quantity}`).join(' | ')
  return [
    'Guatapo SRL',
    'RNC: 131974661',
    `Factura: ${sale.invoice_number || sale.id}`,
    sale.ncf ? `NCF: ${sale.ncf}` : null,
    `Fecha: ${receiptDate(sale.created_at)}`,
    `Total: ${receiptMoney(sale.total)}`,
    products,
  ].filter(Boolean).join('\n')
}

export function fiscalStatusLabel(status: string | null) {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    ready_to_send: 'Listo para e-CF',
    sent: 'Enviado',
    accepted: 'Aceptado',
    rejected: 'Rechazado',
    voided: 'Anulado',
  }
  return status ? labels[status] || status : 'Pendiente'
}

export function taxPercentFromSale(sale: Invoice80Sale) {
  return Number(sale.subtotal || 0) > 0 ? (Number(sale.itbis || 0) / Number(sale.subtotal || 0)) * 100 : 0
}

export function formatPercent(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
