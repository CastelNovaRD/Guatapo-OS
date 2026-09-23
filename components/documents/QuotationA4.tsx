'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { formatDate, formatMoney } from '@/lib/format'

type Customer = {
  customer_id: string | null
  full_name: string
  document: string | null
  phone: string | null
  address: string | null
}

type Item = {
  id: string
  quote_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  tax: number
  total: number
}

type Quote = {
  id: string
  quote_number: string
  status: string
  subtotal: number
  tax: number
  total: number
  expires_at: string | null
  created_at: string
  customer: Customer | null
  items: Item[]
}

export default function QuotationA4() {
  const params = useParams()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadQuote = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/quotes/${encodeURIComponent(quoteId)}`,
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        }
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          data?.error || 'No se pudo cargar la cotización.'
        )
      }

      setQuote(data)
    } catch (loadError) {
      setQuote(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo cargar la cotización.'
      )
    } finally {
      setLoading(false)
    }
  }, [quoteId])

  useEffect(() => {
    void loadQuote()
  }, [loadQuote])

  if (loading) {
    return <main className="p-10">Cargando cotización...</main>
  }

  if (!quote) {
    return (
      <main className="p-10">
        {error || 'No se encontró la cotización.'}
      </main>
    )
  }

  const rows = quote.items.slice(0, 4)
  const rowTops = ['147.5mm', '160.8mm', '174.2mm', '187.5mm']

  const itemTaxTotal = quote.items.reduce(
    (sum, item) => sum + Number(item.tax || 0),
    0
  )

  const taxAmount =
    itemTaxTotal > 0
      ? itemTaxTotal
      : Math.max(0, Number(quote.tax || 0))

  const discount = Math.max(
    0,
    Number(quote.subtotal || 0) + taxAmount - Number(quote.total || 0)
  )

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

        <Text x="35.5mm" y="101.7mm" w="85mm" size="4mm">
          {quote.customer?.full_name || 'Sin cliente'}
        </Text>

        <Text x="30.5mm" y="109mm" w="50mm" size="5mm">
          {quote.customer?.document || '-'}
        </Text>

        <Text x="32.5mm" y="118mm" w="50mm" size="5mm">
          {formatDate(quote.created_at)}
        </Text>

        <Text x="151mm" y="91.6mm" w="45mm" size="5mm" center>
          {quote.quote_number || `COT-${quote.id.slice(0, 8).toUpperCase()}`}
        </Text>

        {rows.map((item, index) => {
          const lineTax = Math.max(0, Number(item.tax || 0))
          const lineTotal = Math.max(0, Number(item.total || 0))

          return (
            <div key={item.id || index}>
              <Text
                x="18mm"
                y={rowTops[index]}
                w="60mm"
                size="3.8mm"
                center
              >
                {item.product_name}
              </Text>

              <Text
                x="88mm"
                y={rowTops[index]}
                w="20mm"
                size="3.8mm"
                center
              >
                {item.quantity}
              </Text>

              <Text
                x="109mm"
                y={rowTops[index]}
                w="31mm"
                size="3.8mm"
                center
              >
                {formatMoney(item.unit_price)}
              </Text>

              <Text
                x="148mm"
                y={rowTops[index]}
                w="12mm"
                size="3.8mm"
                center
              >
                {formatMoney(lineTax)}
              </Text>

              <Text
                x="176mm"
                y={rowTops[index]}
                w="20mm"
                size="3.8mm"
                center
              >
                {formatMoney(lineTotal)}
              </Text>
            </div>
          )
        })}

        <Text x="150mm" y="207.5mm" w="49mm" size="4mm" right>
          {formatMoney(quote.subtotal)}
        </Text>

        <Text x="150mm" y="215.3mm" w="49mm" size="4mm" right>
          {formatMoney(taxAmount)}
        </Text>

        <Text x="150mm" y="222.5mm" w="49mm" size="4mm" right>
          {formatMoney(discount)}
        </Text>

        <Text
          x="140mm"
          y="230.7mm"
          w="60mm"
          size="6.4mm"
          right
          bold
          green
        >
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
      className={`absolute leading-tight ${
        bold ? 'font-black' : 'font-medium'
      } ${
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