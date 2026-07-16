'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import InvoiceFiscal80 from './InvoiceFiscal80'
import InvoiceQuick80 from './InvoiceQuick80'
import type { Invoice80Customer, Invoice80FiscalCustomer, Invoice80Item, Invoice80PaymentMethod, Invoice80Sale } from './invoice80-helpers'

export default function InvoiceSimple80() {
  const params = useParams()
  const saleId = params.id as string

  const [sale, setSale] = useState<Invoice80Sale | null>(null)
  const [items, setItems] = useState<Invoice80Item[]>([])
  const [customer, setCustomer] = useState<Invoice80Customer | null>(null)
  const [fiscalCustomer, setFiscalCustomer] = useState<Invoice80FiscalCustomer | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<Invoice80PaymentMethod | null>(null)
  const [ncfValidUntil, setNcfValidUntil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadInvoice = useCallback(async () => {
    setLoading(true)

    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .select('id, invoice_number, ncf, subtotal, itbis, total, discount, card_fee, shipping_cost, net_received, created_at, customer_id, payment_method_id, cash_received, cash_change, sale_channel, fiscal_receipt_type, fiscal_status, fiscal_customer_name, fiscal_customer_rnc, fiscal_customer_phone, fiscal_customer_address, ecf_security_code, ecf_qr_url')
      .eq('id', saleId)
      .single()

    if (saleError) {
      alert('Error cargando factura: ' + saleError.message)
      setLoading(false)
      return
    }

    setSale(saleData as Invoice80Sale)

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('product_name, quantity, unit_price, discount, total, imei')
      .eq('sale_id', saleId)

    setItems((itemsData || []) as Invoice80Item[])

    if (saleData.customer_id) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('full_name, phone, cedula')
        .eq('id', saleData.customer_id)
        .maybeSingle()

      setCustomer((customerData || null) as Invoice80Customer | null)
    } else {
      setCustomer(null)
    }

    if (saleData.ncf) {
      const { data: receiptBySale } = await supabase
        .from('ncf_receipts')
        .select('valid_until')
        .eq('used_sale_id', saleId)
        .maybeSingle()

      if (receiptBySale?.valid_until) {
        setNcfValidUntil(receiptBySale.valid_until)
      } else {
        const { data: receiptByNcf } = await supabase
          .from('ncf_receipts')
          .select('valid_until')
          .eq('ncf', saleData.ncf)
          .maybeSingle()

        setNcfValidUntil(receiptByNcf?.valid_until || null)
      }

      const { data: quoteData } = await supabase
        .from('quotes')
        .select('quote_customer_id')
        .eq('ncf', saleData.ncf)
        .maybeSingle()

      if (quoteData?.quote_customer_id) {
        const { data: quoteCustomerData } = await supabase
          .from('quote_customers')
          .select('company_name, rnc, phone, address')
          .eq('id', quoteData.quote_customer_id)
          .maybeSingle()

        setFiscalCustomer((quoteCustomerData || null) as Invoice80FiscalCustomer | null)
      } else {
        setFiscalCustomer(null)
      }
    } else {
      setFiscalCustomer(null)
      setNcfValidUntil(null)
    }

    if (saleData.payment_method_id) {
      const { data: methodData } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('id', saleData.payment_method_id)
        .maybeSingle()

      setPaymentMethod((methodData || null) as Invoice80PaymentMethod | null)
    } else {
      setPaymentMethod(null)
    }

    setLoading(false)
  }, [saleId])

  useEffect(() => {
    void Promise.resolve().then(loadInvoice)
  }, [loadInvoice])

  if (loading) return <main className="p-6">Cargando factura...</main>
  if (!sale) return <main className="p-6">No se encontro la factura.</main>

  return (
    <main className="min-h-screen bg-zinc-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[80mm] justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white">
          Imprimir factura
        </button>
      </div>

      {sale.ncf ? (
        <InvoiceFiscal80
          sale={sale}
          items={items}
          customer={fiscalCustomer}
          fallbackCustomer={customer}
          paymentMethod={paymentMethod}
          ncfValidUntil={ncfValidUntil}
        />
      ) : (
        <InvoiceQuick80
          sale={sale}
          items={items}
          customer={customer}
          paymentMethod={paymentMethod}
        />
      )}

      <style jsx global>{`
        .receipt {
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }

        .receipt * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            width: 80mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body {
            overflow: visible !important;
          }

          .receipt {
            width: 80mm !important;
            min-height: auto !important;
            box-shadow: none !important;
            break-inside: auto;
            page-break-inside: auto;
          }
        }
      `}</style>
    </main>
  )
}
