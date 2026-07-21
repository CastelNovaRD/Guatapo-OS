export type SaleStatusVisual = {
  label: string
  className: string
}

export function getSaleStatusVisual(status: string | null | undefined): SaleStatusVisual {
  const normalized = (status || 'paid').toLowerCase()

  const statuses: Record<string, SaleStatusVisual> = {
    paid: {
      label: 'Pagado',
      className: 'bg-emerald-50 text-emerald-700',
    },
    completed: {
      label: 'Completado',
      className: 'bg-emerald-50 text-emerald-700',
    },
    refunded: {
      label: 'Nota de crédito',
      className: 'bg-red-50 text-red-700',
    },
    partially_refunded: {
      label: 'Nota de crédito parcial',
      className: 'bg-orange-50 text-orange-700',
    },
    pending: {
      label: 'Pendiente',
      className: 'bg-yellow-50 text-yellow-700',
    },
    cancelled: {
      label: 'Anulada',
      className: 'bg-zinc-100 text-zinc-600',
    },
  }

  return statuses[normalized] || {
    label: status || 'Pagado',
    className: 'bg-zinc-100 text-zinc-600',
  }
}
