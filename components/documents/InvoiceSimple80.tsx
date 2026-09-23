'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type PrintSale = {
  id: string; invoice_number: string | null; subtotal: number; discount: number; itbis: number; shipping_cost: number; card_fee: number; total: number
  cash_received: number; cash_change: number; created_at: string; status: string; ncf: string | null
  fiscal_customer_name: string | null; fiscal_customer_rnc: string | null; fiscal_customer_phone: string | null
  fiscal_customer_address: string | null; cashier_name: string | null
}
type PrintItem = { id: string; product_name: string; quantity: number; unit_price: number; total: number }
type PrintCustomer = { full_name: string; phone: string | null; document: string | null }
type PrintStore = { publicName: string | null; logoUrl: string | null; rnc: string | null; phone: string | null }
type PrintInvoiceResponse = { sale: PrintSale; items: PrintItem[]; customer: PrintCustomer | null; paymentMethod: { name: string } | null; store: PrintStore | null }

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(Number(value) || 0)
const dateTime = (value: string) => new Intl.DateTimeFormat('es-DO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const quantity = (value: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(3).replace(/\.?0+$/, '') : '0'
}
function Divider() { return <div className="my-4 border-t border-dashed border-zinc-500" /> }

export default function InvoiceSimple80() {
  const params = useParams()
  const saleId = typeof params.id === 'string' ? params.id : ''
  const [invoice, setInvoice] = useState<PrintInvoiceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInvoice = useCallback(async () => {
    if (!saleId) { setError('No se encontró la venta solicitada.'); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const response = await fetch(`/api/sales?saleId=${encodeURIComponent(saleId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as PrintInvoiceResponse | { error?: string } | null
      if (!response.ok || !payload || !('sale' in payload)) throw new Error(payload && 'error' in payload && payload.error ? payload.error : 'No se pudo cargar la factura.')
      setInvoice(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la factura.')
    } finally { setLoading(false) }
  }, [saleId])

  useEffect(() => { void Promise.resolve().then(loadInvoice) }, [loadInvoice])
  if (loading) return <main className="p-6">Cargando factura...</main>
  if (error || !invoice) return <main className="p-6">{error || 'No se encontró la factura.'}</main>

  const { sale, items, customer, paymentMethod, store } = invoice
  const customerName = sale.fiscal_customer_name || customer?.full_name || 'Cliente no registrado'
  const customerPhone = sale.fiscal_customer_phone || customer?.phone
  const customerDocument = sale.fiscal_customer_rnc || customer?.document
  const businessName = store?.publicName || null
  const paymentLabel = sale.status === 'pending' ? 'Pendiente' : paymentMethod?.name || 'No registrado'

  return (
    <main className="min-h-screen bg-zinc-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex w-[80mm] justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Imprimir factura</button>
      </div>
      <section className="receipt mx-auto w-[80mm] bg-white px-[5mm] py-[6mm] text-zinc-900 shadow-sm print:shadow-none">
        <header className="text-center">
          {store?.logoUrl ? (
            // The controlled local branding route is intentionally used as-is for print.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={businessName || 'Logo del negocio'} className="mx-auto mb-2 max-h-[24mm] max-w-[64mm] object-contain" />
          ) : null}
          {businessName ? <h1 className="text-[23px] font-black tracking-[0.08em]">{businessName}</h1> : null}
          {store?.rnc ? <p className="mt-1 text-[12px]">RNC: {store.rnc}</p> : null}
          {store?.phone ? <p className="text-[12px]">Tel.: {store.phone}</p> : null}
        </header>
        <Divider />
        <h2 className="text-center text-[18px] font-black tracking-wide">FACTURA DE VENTA</h2>
        <div className="mt-3 grid grid-cols-[26mm_1fr] gap-y-1 text-[12px]">
          <span>No. Venta</span><strong>{sale.invoice_number || sale.id}</strong>
          <span>Fecha</span><span>{dateTime(sale.created_at)}</span>
          {sale.cashier_name ? <><span>Cajero</span><span>{sale.cashier_name}</span></> : null}
          {sale.ncf ? <><span>NCF</span><span>{sale.ncf}</span></> : null}
        </div>
        <Divider />
        <div className="grid grid-cols-[26mm_1fr] gap-y-1 text-[12px]">
          <span>Cliente</span><strong>{customerName}</strong>
          {customerPhone ? <><span>Teléfono</span><span>{customerPhone}</span></> : null}
          {customerDocument ? <><span>RNC/Cédula</span><span>{customerDocument}</span></> : null}
          {sale.fiscal_customer_address ? <><span>Dirección</span><span>{sale.fiscal_customer_address}</span></> : null}
        </div>
        <Divider />
        <div className="grid grid-cols-[8mm_1fr_22mm_22mm] gap-x-1 border-b border-dashed border-zinc-500 pb-2 text-[10px] font-bold uppercase"><span>Cant.</span><span>Producto</span><span className="text-right">Precio</span><span className="text-right">Total</span></div>
        <div className="space-y-3 py-3 text-[11px]">
          {items.map((item) => <div key={item.id} className="grid grid-cols-[8mm_1fr_22mm_22mm] gap-x-1 break-inside-avoid"><span>{quantity(item.quantity)}</span><span className="leading-snug">{item.product_name}</span><span className="text-right">{money(item.unit_price)}</span><span className="text-right">{money(item.total)}</span></div>)}
        </div>
        <Divider />
        <div className="ml-auto w-[49mm] space-y-1 text-[12px]">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span>Descuento</span><span>{money(sale.discount)}</span></div>
          <div className="flex justify-between"><span>Impuestos</span><span>{money(sale.itbis)}</span></div>
          {Number(sale.shipping_cost) > 0 ? <div className="flex justify-between"><span>Envío</span><span>{money(sale.shipping_cost)}</span></div> : null}
          {Number(sale.card_fee) > 0 ? <div className="flex justify-between"><span>Cargo de tarjeta</span><span>{money(sale.card_fee)}</span></div> : null}
          <div className="mt-2 flex justify-between border-t border-zinc-700 pt-2 text-[16px] font-black"><span>TOTAL</span><span>{money(sale.total)}</span></div>
        </div>
        <Divider />
        <div className="grid grid-cols-[30mm_1fr] gap-y-1 text-[12px]"><span>Método de pago</span><strong>{paymentLabel}</strong><span>Monto recibido</span><span>{money(sale.cash_received)}</span><span>Cambio</span><span>{money(sale.cash_change)}</span></div>
        <Divider />
        <footer className="pt-1 text-center text-[13px] italic"><p className="font-bold">¡Gracias por tu compra!</p>{businessName ? <p className="mt-1">{businessName}</p> : null}</footer>
      </section>
      <style jsx global>{`
        .receipt { font-family: Arial, Helvetica, sans-serif; }
        .receipt * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { @page { size: 80mm auto; margin: 0; } html, body { width: 80mm; margin: 0 !important; padding: 0 !important; background: #fff !important; } body { overflow: visible !important; } .receipt { width: 80mm !important; min-height: auto !important; box-shadow: none !important; } }
      `}</style>
    </main>
  )
}
