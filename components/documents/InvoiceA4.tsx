import type { Invoice80Customer, Invoice80Item, Invoice80PaymentMethod, Invoice80Sale } from './invoice80-helpers'
import { paymentMethodLabel, receiptDate, receiptMoney } from './invoice80-helpers'

type Props = {
  sale: Invoice80Sale
  items: Invoice80Item[]
  customer: Invoice80Customer | null
  paymentMethod: Invoice80PaymentMethod | null
}

export default function InvoiceA4({ sale, items, customer, paymentMethod }: Props) {
  const fiscalName = sale.fiscal_customer_name || customer?.full_name || null
  const fiscalDocument = sale.fiscal_customer_rnc || customer?.cedula || null

  return (
    <section className="invoice-a4 mx-auto min-h-[297mm] w-[210mm] bg-white p-[16mm] text-zinc-900 shadow-xl print:shadow-none">
      <header className="flex items-start justify-between border-b-2 border-zinc-900 pb-6">
        <div>
          <img
            src="/logo/logo-castelnova-os.png"
            alt="CastelNova OS"
            className="h-16 max-w-56 object-contain object-left"
          />
          <p className="mt-2 text-sm">ShopDesk OS</p>
        </div>

        <div className="text-right">
          <h1 className="text-2xl font-black">FACTURA</h1>
          <p className="mt-1 font-bold">{sale.invoice_number || `FAC-${sale.id.slice(0, 7)}`}</p>
          <p className="text-sm">Fecha: {receiptDate(sale.created_at)}</p>
          {sale.ncf && <p className="mt-1 text-sm font-bold">NCF: {sale.ncf}</p>}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-6 rounded-lg bg-zinc-50 p-4 text-sm">
        <div>
          <p className="font-bold text-zinc-500">CLIENTE</p>
          <p className="mt-1 font-bold">{fiscalName || 'Consumidor final'}</p>
          {fiscalDocument && <p>RNC/Cédula: {fiscalDocument}</p>}
        </div>

        <div>
          <p className="font-bold text-zinc-500">PAGO</p>
          <p className="mt-1">{paymentMethodLabel(sale, paymentMethod)}</p>
          {sale.ncf && <p>Tipo: {sale.fiscal_receipt_type || '-'}</p>}
        </div>
      </section>

      <table className="mt-7 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-zinc-900 text-left">
            <th className="py-3">Producto</th>
            <th className="py-3 text-center">Cantidad</th>
            <th className="py-3 text-right">Precio</th>
            <th className="py-3 text-right">Descuento</th>
            <th className="py-3 text-right">Total</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.product_name}-${index}`} className="border-b border-zinc-200 align-top">
              <td className="py-3 font-medium">
                {item.product_name}
                {item.imei && (
                  <span className="mt-1 block text-xs font-normal text-zinc-600">
                    IMEI: {item.imei}
                  </span>
                )}
              </td>
              <td className="py-3 text-center">{item.quantity}</td>
              <td className="py-3 text-right">{receiptMoney(item.unit_price)}</td>
              <td className="py-3 text-right">{receiptMoney(item.discount)}</td>
              <td className="py-3 text-right font-semibold">{receiptMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 ml-auto w-72 space-y-2 border-t-2 border-zinc-900 pt-3 text-sm">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{receiptMoney(sale.subtotal)}</span>
        </p>

        {Number(sale.itbis || 0) > 0 && (
          <p className="flex justify-between">
            <span>ITBIS</span>
            <span>{receiptMoney(sale.itbis)}</span>
          </p>
        )}

        <p className="flex justify-between">
          <span>Descuento</span>
          <span>{receiptMoney(sale.discount)}</span>
        </p>

        <p className="flex justify-between text-xl font-black">
          <span>Total</span>
          <span>{receiptMoney(sale.total)}</span>
        </p>
      </div>

      {sale.fiscal_notes && (
        <section className="mt-8 border-t pt-4 text-sm">
          <p className="font-bold">Notas</p>
          <p className="mt-1 whitespace-pre-wrap">{sale.fiscal_notes}</p>
        </section>
      )}
    </section>
  )
}
