import { QRCodeSVG } from 'qrcode.react'
import InvoiceWarranty from './InvoiceWarranty'
import { formatPercent, Invoice80Customer, Invoice80FiscalCustomer, Invoice80Item, Invoice80PaymentMethod, Invoice80Sale, paymentMethodLabel, receiptDate, receiptMoney, receiptQrValue, taxPercentFromSale } from './invoice80-helpers'

type Props = {
  sale: Invoice80Sale
  items: Invoice80Item[]
  customer: Invoice80FiscalCustomer | null
  fallbackCustomer: Invoice80Customer | null
  paymentMethod: Invoice80PaymentMethod | null
  ncfValidUntil?: string | null
}

function DashedLine() {
  return <div className="my-2 border-t-[3px] border-dashed border-black" />
}

function ReceiptHeader() {
  return (
    <header className="text-center">
      <img src="/logo-guatapo-transparent.png" alt="Guatapo" className="mx-auto h-auto w-full max-w-[74mm] object-contain grayscale" />
      <div className="mt-1 text-[19px] leading-tight">
        <p>Guatapo SRL</p>
        <p>RNC: 131974661</p>
        <p>809-636-1020</p>
      </div>
    </header>
  )
}

function PaymentBlock({ sale, paymentMethod }: { sale: Invoice80Sale; paymentMethod: Invoice80PaymentMethod | null }) {
  const method = paymentMethodLabel(sale, paymentMethod)
  const isCash = method.includes('EFECTIVO')

  return (
    <div className="mt-7 grid grid-cols-[1fr_1fr] gap-x-5 text-[15px] font-bold uppercase leading-tight">
      <span className="text-right">MET. PAGO</span>
      <span>{method}</span>
      {isCash && (
        <>
          <span className="text-right">RECIBIDO</span>
          <span>{receiptMoney(sale.cash_received)}</span>
          <span className="text-right">DEVUELTO</span>
          <span>{receiptMoney(sale.cash_change)}</span>
        </>
      )}
    </div>
  )
}

function FiscalTotals({ sale }: { sale: Invoice80Sale }) {
  const taxPercent = taxPercentFromSale(sale)
  return (
    <div className="mt-8 space-y-2 text-[17px] font-bold uppercase">
      <div className="grid grid-cols-[112px_1fr] items-center gap-x-3">
        <span>Subtotal</span>
        <span className="text-right">{receiptMoney(sale.subtotal)}</span>
      </div>
      <div className="grid grid-cols-[112px_1fr] items-center gap-x-3">
        <span>ITBIS ({formatPercent(taxPercent)}%)</span>
        <span className="text-right">{receiptMoney(sale.itbis)}</span>
      </div>
      <div className="grid grid-cols-[112px_1fr] items-center gap-x-3">
        <span>Descuento</span>
        <span className="text-right">{receiptMoney(sale.discount)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[104px_1fr] items-end gap-x-4 text-[22px] font-black leading-none">
        <span>Total</span>
        <span className="text-right">{receiptMoney(sale.total)}</span>
      </div>
    </div>
  )
}

export default function InvoiceFiscal80({ sale, items, customer, fallbackCustomer, paymentMethod, ncfValidUntil }: Props) {
  const qrValue = receiptQrValue(sale, items)
  const taxTotal = Number(sale.itbis || 0)
  const itemBaseTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const fiscalName = sale.fiscal_customer_name || customer?.company_name || fallbackCustomer?.full_name || '-'
  const fiscalRnc = sale.fiscal_customer_rnc || customer?.rnc || fallbackCustomer?.cedula || '-'

  return (
    <section className="receipt mx-auto w-[80mm] bg-white px-[5mm] py-[5mm] text-black shadow-xl print:shadow-none">
      <ReceiptHeader />

      <div className="mt-1 text-center text-[17px] leading-tight">
        <p>{receiptDate(sale.created_at)}</p>
      </div>

      <DashedLine />

      <div className="space-y-1 text-[16px] font-bold uppercase leading-tight">
        <p>NCF: {sale.ncf || '-'}</p>
        <p>Valido hasta: {ncfValidUntil ? receiptDate(ncfValidUntil) : '-'}</p>
        <p>RNC: {fiscalRnc}</p>
        <p className="text-[14px] leading-tight">Cliente: {fiscalName}</p>
        <div className="grid grid-cols-[36px_1fr_120px] items-center gap-1">
          <span>NO.</span>
          <span>{sale.invoice_number || `FAC-${sale.id.slice(0, 7)}`}</span>
          <span className="text-right text-[13px]">{paymentMethodLabel(sale, paymentMethod)}</span>
        </div>
      </div>

      <DashedLine />
      <p className="text-center text-[12px] font-bold uppercase">Factura de credito fiscal electronico</p>
      <DashedLine />

      <div className="grid grid-cols-[94px_24px_68px_74px] text-center text-[11px] font-bold uppercase">
        <span>Descripcion</span>
        <span>Catd.</span>
        <span>Itbis</span>
        <span>Valor</span>
      </div>
      <DashedLine />

      <div className="space-y-7 py-5 text-[11px] font-bold">
        {items.map((item, index) => {
          const ratio = itemBaseTotal > 0 ? Number(item.total || 0) / itemBaseTotal : 0
          const itemTax = taxTotal * ratio
          return (
            <div key={`${item.product_name}-${index}`} className="grid break-inside-avoid grid-cols-[94px_24px_68px_74px] items-start gap-x-1">
              <span className="break-words uppercase leading-tight">{item.product_name}</span>
              <span className="text-center">{item.quantity}</span>
              <span className="text-right">{receiptMoney(itemTax)}</span>
              <span className="text-right">{receiptMoney(item.total)}</span>
            </div>
          )
        })}
      </div>

      <PaymentBlock sale={sale} paymentMethod={paymentMethod} />
      <FiscalTotals sale={sale} />

      <div className="mt-6 flex break-inside-avoid justify-center">
        <QRCodeSVG value={qrValue} size={145} level="M" />
      </div>

      <InvoiceWarranty />
    </section>
  )
}



