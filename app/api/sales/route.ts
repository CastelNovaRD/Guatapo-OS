import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  getSaleById,
  getSaleByInvoiceNumber,
  getSaleCustomer,
  getSalePaymentMethod,
  listSaleCreditNotes,
  listSaleCustomersByIds,
  listSaleItems,
  listSalePaymentMethodsByIds,
  listSales,
} from '@/lib/repositories/sales-repository'
import { getCatalogBranding, getStoreSettings } from '@/lib/repositories/store-settings-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown) {
  console.error('[SALES API]', error)

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Sales data is unavailable.',
    },
    { status: 503 }
  )
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const params = new URL(request.url).searchParams

    const saleId = params.get('saleId')?.trim()
    const invoiceNumber = params.get('invoiceNumber')?.trim()
    const mode = params.get('mode')?.trim()

    if (saleId || invoiceNumber) {
      const sale = saleId
        ? await getSaleById(context, saleId)
        : await getSaleByInvoiceNumber(context, invoiceNumber!)

      if (!sale) {
        return Response.json(
          { error: 'Sale not found.' },
          { status: 404 }
        )
      }

      const [items, customer, paymentMethod, creditNotes, store, branding] =
        await Promise.all([
          listSaleItems(context, sale.id),
          sale.customer_id
            ? getSaleCustomer(context, sale.customer_id)
            : Promise.resolve(null),
          sale.payment_method_id
            ? getSalePaymentMethod(context, sale.payment_method_id)
            : Promise.resolve(null),
          listSaleCreditNotes(context, sale.id),
          getStoreSettings(context),
          getCatalogBranding(context),
        ])

      return Response.json({
        sale,
        items,
        customer,
        paymentMethod,
        creditNotes,
        store: store
          ? {
              publicName: branding.publicName?.trim() || null,
              logoUrl: branding.logoUrl?.trim() || null,
              rnc: store.rnc,
              phone: store.phone,
            }
          : null,
      })
    }

    const sales = await listSales(context)
    const items = await listSaleItems(context)

    if (mode === 'export') {
      const customerIds = Array.from(
        new Set(
          sales
            .map((sale) => sale.customer_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      const paymentMethodIds = Array.from(
        new Set(
          sales
            .map((sale) => sale.payment_method_id)
            .filter((id): id is string => Boolean(id))
        )
      )

      const [customers, paymentMethods] = await Promise.all([
        listSaleCustomersByIds(context, customerIds),
        listSalePaymentMethodsByIds(context, paymentMethodIds),
      ])

      return Response.json({
        sales,
        items,
        customers,
        paymentMethods,
      })
    }

    return Response.json({
      sales,
      items,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
