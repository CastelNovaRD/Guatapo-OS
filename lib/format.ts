export function formatMoney(value: number | string | null | undefined) {
  return `RD$${Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo',
  })
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}