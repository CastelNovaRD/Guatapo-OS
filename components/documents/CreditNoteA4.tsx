'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { formatDate, formatMoney } from '@/lib/format'

type CreditNoteItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  tax_amount: number
  total: number
  restock_quantity: number
  damaged_quantity: number
  disposition: 'restocked' | 'damaged' | 'mixed' | null
  notes: string | null
}

type CreditNoteDocument = {
  id: string
  credit_note_number: string
  fiscal_number: string | null
  refund_method: string | null
  reason: string | null
  reason_other: string | null
  notes: string | null
  subtotal: number
  tax_amount: number
  total: number
  status: string
  created_at: string
  sale: {
    id: string
    invoice_number: string | null
    ncf: string | null
    fiscal_customer_name: string | null
    fiscal_customer_rnc: string | null
    created_at: string
  } | null
  items: CreditNoteItem[]
}

export default function CreditNoteA4() {
  const params = useParams()
  const creditNoteId = typeof params.id === 'string' ? params.id : ''
  const [creditNote, setCreditNote] = useState<CreditNoteDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!creditNoteId) {
      const timer = window.setTimeout(() => {
        setError('No se encontró la nota de crédito.')
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const controller = new AbortController()

    async function loadCreditNote() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`/api/credit-notes/${encodeURIComponent(creditNoteId)}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudo cargar la nota de crédito.')
        }
        setCreditNote(data as CreditNoteDocument)
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la nota de crédito.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadCreditNote()
    return () => controller.abort()
  }, [creditNoteId])

  if (loading) return <main className="p-6">Cargando nota de crédito...</main>
  if (!creditNote) return <main className="p-6">{error || 'No se encontró la nota de crédito.'}</main>

  const sale = creditNote.sale

  return (
    <main className="min-h-screen bg-zinc-100 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white">
          Imprimir nota de crédito
        </button>
      </div>

      <section className="mx-auto min-h-[297mm] w-[210mm] bg-white p-10 text-zinc-950 shadow-xl print:min-h-0 print:w-full print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-4 border-emerald-600 pb-6">
          <div>
            <div className="relative h-20 w-64">
              <Image src="/logo/logo-castelnova-os.png" alt="CastelNova OS" fill className="object-contain object-left" />
            </div>
            <p className="mt-2 font-bold">ShopDesk OS</p>
          </div>

          <div className="text-right">
            <h1 className="text-4xl font-black text-emerald-700">NOTA DE CRÉDITO</h1>
            <p className="mt-3 text-xl font-bold">{creditNote.credit_note_number || creditNote.id.slice(0, 8).toUpperCase()}</p>
            <p>Fecha: {formatDate(creditNote.created_at)}</p>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-6">
          <Info label="Factura original" value={sale?.invoice_number || sale?.id || '-'} />
          <Info label="Fecha factura" value={sale?.created_at ? formatDate(sale.created_at) : '-'} />
          <Info label="Cliente" value={sale?.fiscal_customer_name || 'Consumidor final'} />
          <Info label="RNC/Cédula cliente" value={sale?.fiscal_customer_rnc || '-'} />
          {sale?.ncf && <Info label="NCF original" value={sale.ncf} />}
          {creditNote.fiscal_number && <Info label="Número fiscal nota" value={creditNote.fiscal_number} />}
          {creditNote.refund_method && <Info label="Método devolución/aplicación" value={creditNote.refund_method} />}
          <Info label="Motivo" value={creditNote.reason === 'Otro' ? creditNote.reason_other || 'Otro' : creditNote.reason || '-'} />
        </section>

        <table className="mt-8 w-full border-collapse text-left">
          <thead>
            <tr className="bg-emerald-700 text-white">
              <th className="p-3">Producto devuelto</th>
              <th className="p-3 text-center">Cant.</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">ITBIS</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {creditNote.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-200 align-top">
                <td className="p-3 font-semibold">{item.product_name}</td>
                <td className="p-3 text-center">{item.quantity}</td>
                <td className="p-3 text-right">{formatMoney(item.unit_price)}</td>
                <td className="p-3 text-right">{formatMoney(item.tax_amount)}</td>
                <td className="p-3 text-right font-bold">{formatMoney(item.total)}</td>
                <td className="p-3 text-sm">
                  {item.restock_quantity > 0 && <p>Devuelto al inventario: {item.restock_quantity}</p>}
                  {item.damaged_quantity > 0 && <p>Producto dañado/defectuoso: {item.damaged_quantity}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-8 grid grid-cols-[1fr_280px] gap-8">
          <div>
            <h2 className="text-xl font-black text-emerald-700">Observaciones</h2>
            <p className="mt-2 min-h-20 rounded-xl border border-zinc-200 p-4">{creditNote.notes || '-'}</p>
          </div>

          <div className="rounded-2xl bg-zinc-50 p-5">
            <Row label="Subtotal" value={formatMoney(creditNote.subtotal)} />
            <Row label="ITBIS" value={formatMoney(creditNote.tax_amount)} />
            <Row label="Total acreditado" value={formatMoney(creditNote.total)} bold />
          </div>
        </section>

        <section className="mt-16 grid grid-cols-2 gap-12 text-center">
          <div><div className="border-t border-black pt-2">Firma cliente</div></div>
          <div><div className="border-t border-black pt-2">Autorizado por</div></div>
        </section>
      </section>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
        }
      `}</style>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  )
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${bold ? 'text-xl font-black text-emerald-700' : 'font-bold'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}