'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate, formatMoney } from '@/lib/format'

type Quote = {
  id: string
  quote_number: string | null
  subtotal: number
  tax_percent: number
  tax_amount: number
  discount: number
  total: number
  status: string
  created_at: string
  quote_customer_id: string | null
}

type Customer = {
  company_name: string
  rnc: string | null
}

type Item = {
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
}

export default function QuotationA4() {
  const params = useParams()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const loadQuote = useCallback(async () => {
    setLoading(true)

    const { data: quoteData, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single()

    if (error) {
      alert('Error cargando cotización: ' + error.message)
      setLoading(false)
      return
    }

    setQuote(quoteData)

    if (quoteData?.quote_customer_id) {
      const { data: customerData } = await supabase
        .from('quote_customers')
        .select('company_name, rnc')
        .eq('id', quoteData.quote_customer_id)
        .maybeSingle()

      setCustomer(customerData || null)
    }

    const { data: itemsData } = await supabase
      .from('quote_items')
      .select('product_name, quantity, unit_price, discount, total')
      .eq('quote_id', quoteId)

    setItems(itemsData || [])
    setLoading(false)
  }, [quoteId])

  useEffect(() => {
    loadQuote()
  }, [loadQuote])

  if (loading) return <main className="p-10">Cargando cotización...</main>
  if (!quote) return <main className="p-10">No se encontró la cotización.</main>

  const rows = items.slice(0, 4)
  const rowTops = ['147.5mm', '160.8mm', '174.2mm', '187.5mm']

  return (
    <main className="min-h-screen bg-zinc-200 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex w-[218mm] justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white"
        >
          Imprimir cotización
        </button>
      </div>

      <section className="quote-page relative mx-auto h-[312mm] w-[218mm] overflow-hidden bg-white shadow-xl print:shadow-none">
        <img
          src="/quotation-template.png"
          alt="Plantilla cotización"
          className="absolute inset-0 h-full w-full object-fill"
        />

        {/* Datos cliente */}
        <Text x="35.5mm" y="101.7mm" w="85mm" size="4mm">
          {customer?.company_name || 'Sin cliente'}
        </Text>

        <Text x="30.5mm" y="109mm" w="50mm" size="5mm">
          {customer?.rnc || '-'}
        </Text>

        <Text x="32.5mm" y="118mm" w="50mm" size="5mm">
          {formatDate(quote.created_at)}
        </Text>

        {/* Número cotización */}
        <Text x="151mm" y="91.6mm" w="45mm" size="5mm" center>
          {quote.quote_number || `COT-${quote.id.slice(0, 8).toUpperCase()}`}
        </Text>

        {/* Productos */}
        {rows.map((item, index) => {
          const base = Number(item.total || 0)
          const itbis = Math.max(0, base) * (Number(quote.tax_percent || 0) / 100)
          const totalWithTax = Math.max(0, base) + itbis

          return (
            <div key={index}>
              <Text x="18mm" y={rowTops[index]} w="60mm" size="3.8mm" center>
                {item.product_name}
              </Text>

              <Text x="88mm" y={rowTops[index]} w="20mm" size="3.8mm" center>
                {item.quantity}
              </Text>

              <Text x="109mm" y={rowTops[index]} w="31mm" size="3.8mm" center>
                {formatMoney(item.unit_price)}
              </Text>

              <Text x="148mm" y={rowTops[index]} w="12mm" size="3.8mm" center>
                {formatMoney(itbis)}
              </Text>

              <Text x="176mm" y={rowTops[index]} w="20mm" size="3.8mm" center>
                {formatMoney(totalWithTax)}
              </Text>
            </div>
          )
        })}

        {/* Totales */}
        <Text x="150mm" y="207.5mm" w="49mm" size="4mm" right>
          {formatMoney(quote.subtotal)}
        </Text>

        <Text x="150mm" y="215.3mm" w="49mm" size="4mm" right>
          {formatMoney(quote.tax_amount)}
        </Text>

        <Text x="150mm" y="222.5mm" w="49mm" size="4mm" right>
          {formatMoney(quote.discount)}
        </Text>

        <Text x="140mm" y="230.7mm" w="60mm" size="6.4mm" right bold green>
          {formatMoney(quote.total)}
        </Text>
      </section>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }

          html,
          body,
          main {
            width: 218mm !important;
            height: 312mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }

          .quote-page {
            width: 218mm !important;
            height: 312mm !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </main>
  )
}

function Text({
  x,
  y,
  w,
  size,
  children,
  center = false,
  right = false,
  bold = false,
  green = false,
}: {
  x: string
  y: string
  w: string
  size: string
  children: React.ReactNode
  center?: boolean
  right?: boolean
  bold?: boolean
  green?: boolean
}) {
  return (
    <div
      className={`absolute leading-tight ${bold ? 'font-black' : 'font-medium'} ${
        center ? 'text-center' : right ? 'text-right' : 'text-left'
      } ${green ? 'text-[#078a0c]' : 'text-[#15171c]'}`}
      style={{
        left: x,
        top: y,
        width: w,
        fontSize: size,
      }}
    >
      {children}
    </div>
  )
}