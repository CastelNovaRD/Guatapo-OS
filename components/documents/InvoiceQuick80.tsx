import { QRCodeSVG } from 'qrcode.react'
import InvoiceWarranty from './InvoiceWarranty'
import { Invoice80Customer, Invoice80Item, Invoice80PaymentMethod, Invoice80Sale, paymentMethodLabel, receiptDate, receiptMoney, receiptQrValue } from './invoice80-helpers'

type Props = {
  sale: Invoice80Sale
  items: Invoice80Item[]
  customer: Invoice80Customer | null
  paymentMethod: Invoice80PaymentMethod | null
}

function DashedLine() {
  return <div className="my-2 border-t-[3px] border-dashed border-black" />
}

function ReceiptHeader() {
  return (
    <header className="text-center">
      <img src="/logo-guatapo-transparent.png" alt="Guatapo" className="mx-auto h-auto w-full max-w-[74mm] object-contain grayscale" />
      <div className="mt-1 text-[23px] leading-tight">
        <p>Guatapo SRL</p>
        <p className="font-bold">RNC: 131974661</p>
        <p>809-636-1020</p>
      </div>
    </header>
  )
}

function PaymentBlock({ sale, paymentMethod }: { sale: Invoice80Sale; paymentMethod: Invoice80PaymentMethod | null }) {
  const method = paymentMethodLabel(sale, paymentMethod)
  const isCash = method.includes('EFECTIVO')

  return (
    <div className="mt-7 grid grid-cols-[1fr_1fr] gap-x-5 text-[17px] font-bold uppercase leading-tight">
      <span className="text-right">MET. PAGO</span>
      <span>{method}</span>
      {isCash && (
        <>
          <span className="text-right">RECIBIDO</span>
          <span>{receiptMoney(sale.cash_received)}</span>
          <span className="text-right">DEVUELTA</span>
          <span>{receiptMoney(sale.cash_change)}</span>
        </>
      )}
    </div>
  )
}

function TotalsBlock({ sale }: { sale: Invoice80Sale }) {
  return (
    <div className="mt-8 space-y-1 text-[18px] font-bold uppercase">
      <div className="grid grid-cols-[1fr_118px] items-center">
        <span className="text-right">Descuento</span>
        <span className="text-right">{receiptMoney(sale.discount)}</span>
      </div>
      <div className="grid grid-cols-[1fr_138px] items-end text-[24px] font-black">
        <span className="text-right">Total</span>
        <span className="text-right">{receiptMoney(sale.total)}</span>
      </div>
    </div>
  )
}

export default function InvoiceQuick80({ sale, items, paymentMethod }: Props) {
  const qrValue = receiptQrValue(sale, items)

  return (
    <section className="receipt mx-auto w-[80mm] bg-white px-[5mm] py-[5mm] text-black shadow-xl print:shadow-none">
      <ReceiptHeader />

      <div className="mt-8 text-[17px] font-bold leading-tight">
        <p>{receiptDate(sale.created_at)}</p>
        <div className="mt-2 grid grid-cols-[32px_1fr_128px] items-center gap-2 uppercase">
          <span>NO.</span>
          <span>{sale.invoice_number || `FAC-${sale.id.slice(0, 7)}`}</span>
          <span className="text-right">{paymentMethodLabel(sale, paymentMethod)}</span>
        </div>
      </div>

      <DashedLine />
      <div className="grid grid-cols-[1fr_38px_104px] text-center text-[13px] font-bold uppercase">
        <span>Descripcion</span>
        <span>Catd.</span>
        <span>Valor</span>
      </div>
      <DashedLine />

      <div className="space-y-7 py-5 text-[13px] font-bold">
        {items.map((item, index) => (
          <div key={`${item.product_name}-${index}`} className="grid break-inside-avoid grid-cols-[1fr_38px_104px] items-start gap-2">
            <span className="uppercase leading-tight">{item.product_name}</span>
            <span className="text-center">{item.quantity}</span>
            <span className="text-right">{receiptMoney(item.total)}</span>
          </div>
        ))}
      </div>

      <PaymentBlock sale={sale} paymentMethod={paymentMethod} />
      <TotalsBlock sale={sale} />

      <div className="mt-6 flex break-inside-avoid justify-center">
        <QRCodeSVG value={qrValue} size={145} level="M" />
      </div>

      <InvoiceWarranty />
    </section>
  )
}

