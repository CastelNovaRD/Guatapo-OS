'use client'

import { supabase } from '@/lib/supabase'
import type { WebSchedule } from '@/lib/web-settings'

export const RAFFLE_TICKET_CAPACITY = 1000000

export type RaffleStatus = 'draft' | 'active' | 'paused' | 'finished'

export type RaffleTitleSegment = {
  text: string
  color: 'black' | 'green' | 'gold'
  bold: boolean
}

export const RAFFLE_TITLE_COLORS = {
  black: 'text-zinc-950',
  green: 'text-emerald-700',
  gold: 'text-amber-500',
} as const

export function normalizeRaffleTitleSegments(value: unknown, fallback = ''): RaffleTitleSegment[] {
  if (Array.isArray(value)) {
    const safe = value
      .map((item) => ({
        text: String((item as any)?.text || '').slice(0, 180),
        color: ['black', 'green', 'gold'].includes(String((item as any)?.color)) ? String((item as any)?.color) as RaffleTitleSegment['color'] : 'black',
        bold: Boolean((item as any)?.bold ?? true),
      }))
      .filter((item) => item.text.trim())
    if (safe.length) return safe
  }
  return fallback ? [{ text: fallback, color: 'black', bold: true }] : []
}

export function safeRaffleText(value: string) {
  return value.replace(/[<>]/g, '').trim()
}

export function getBankLogoUrl(bank: Partial<RaffleBankAccount> | null | undefined) {
  return String(bank?.logo_url || bank?.logo || bank?.image_url || '').trim()
}
export type RafflePaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'correction'
export type RaffleEntryStatus = 'pending' | 'active' | 'cancelled' | 'winner'

export type Raffle = {
  id: string
  store_id: string
  internal_name: string
  public_title: string
  slug: string
  description: string | null
  conditions: string | null
  promotional_title?: string | null
  promotional_title_segments?: RaffleTitleSegment[] | null
  detailed_description?: string | null
  terms_content?: string | null
  terms_version?: string | null
  terms_updated_at?: string | null
  prize_value: number
  ticket_price: number
  min_tickets_per_purchase: number
  max_tickets_per_purchase: number | null
  total_tickets: number
  start_at: string | null
  end_at: string | null
  status: RaffleStatus
  whatsapp_url: string | null
  instagram_url: string | null
  created_at: string | null
}

export type RaffleUpload = {
  id: string
  raffle_id: string
  file_url: string
  is_primary: boolean
  sort_order: number
}

export type RaffleBankAccount = {
  id: string
  store_id: string
  bank_name: string
  account_number: string
  account_holder: string
  account_type: string | null
  logo_url: string | null
  logo?: string | null
  image_url?: string | null
  active: boolean
  sort_order?: number | null
  display_order?: number | null
}

export type RaffleParticipant = {
  id: string
  store_id: string
  full_name: string
  phone: string
  cedula: string
  email: string | null
  notes: string | null
}

export type RaffleEntry = {
  id: string
  raffle_id: string
  participant_id: string
  payment_id: string | null
  ticket_number: string
  status: RaffleEntryStatus
  raffle_participants?: RaffleParticipant | null
}

export type RafflePayment = {
  id: string
  raffle_id: string
  participant_id: string
  bank_account_id: string | null
  bank_name_snapshot?: string | null
  account_number_snapshot?: string | null
  account_holder_snapshot?: string | null
  account_type_snapshot?: string | null
  bank_logo_snapshot?: string | null
  quantity: number
  amount: number
  unit_ticket_price: number | null
  min_tickets_snapshot: number | null
  opportunities: number | null
  requested_at: string | null
  proof_url: string | null
  status: RafflePaymentStatus
  rejection_reason: string | null
  notes: string | null
  created_at: string | null
  raffle_participants?: RaffleParticipant | null
  raffle_bank_accounts?: RaffleBankAccount | null
}

export type RaffleSettings = {
  id: string
  store_id: string
  whatsapp_url: string | null
  instagram_url: string | null
  schedule?: WebSchedule | null
}

export type RaffleStats = {
  participants: number
  soldTickets: number
  pendingTickets: number
  availableTickets: number
  confirmedIncome: number
  pendingIncome: number
  estimatedProfit: number
}

export function normalizeCedula(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, '').trim().toUpperCase()
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `rifa-${Date.now()}`
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activa',
    paused: 'Pausada',
    finished: 'Finalizada',
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    rejected: 'Rechazado',
    correction: 'Correccion solicitada',
    cancelled: 'Cancelado',
    winner: 'Ganador',
  }
  return labels[status] || status
}

export function getRaffleStatusClass(status: string) {
  if (status === 'active' || status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'finished' || status === 'winner') return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  if (status === 'paused' || status === 'pending' || status === 'correction') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'rejected' || status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-zinc-50 text-zinc-700 border-zinc-200'
}

export const RAFFLE_EARLY_FINISH_PREFIX = 'FINALIZADA_ANTICIPADA:'

export function getRaffleEarlyFinishReason(raffle: Pick<Raffle, 'conditions'>) {
  const text = String(raffle.conditions || '')
  return text.startsWith(RAFFLE_EARLY_FINISH_PREFIX) ? text.slice(RAFFLE_EARLY_FINISH_PREFIX.length).trim() : ''
}

export function hasRaffleReachedEnd(raffle: Pick<Raffle, 'end_at'>) {
  return Boolean(raffle.end_at && new Date(raffle.end_at).getTime() <= Date.now())
}

export function getEffectiveRafflePrizeValue(raffle: Pick<Raffle, 'prize_value' | 'conditions' | 'end_at'>) {
  return getRaffleEarlyFinishReason(raffle) || hasRaffleReachedEnd(raffle) ? 0 : Number(raffle.prize_value || 0)
}

export function calculateRaffleStats(raffle: Pick<Raffle, 'ticket_price' | 'prize_value' | 'conditions' | 'end_at'>, entries: RaffleEntry[], payments: RafflePayment[]): RaffleStats {
  const participantIds = new Set(entries.map((entry) => entry.participant_id))
  const soldTickets = entries.filter((entry) => entry.status === 'active' || entry.status === 'winner').length
  const pendingTickets = entries.filter((entry) => entry.status === 'pending').length
  const availableTickets = Math.max(0, RAFFLE_TICKET_CAPACITY - entries.length)
  const confirmedIncome = payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const pendingIncome = payments.filter((payment) => payment.status === 'pending' || payment.status === 'correction').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  return {
    participants: participantIds.size,
    soldTickets,
    pendingTickets,
    availableTickets,
    confirmedIncome,
    pendingIncome,
    estimatedProfit: confirmedIncome - getEffectiveRafflePrizeValue(raffle),
  }
}

export function getRemainingText(endAt?: string | null) {
  if (!endAt) return 'Sin fecha final'
  const diff = new Date(endAt).getTime() - Date.now()
  if (diff <= 0) return 'Finalizada'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return `${days}d ${hours}h ${minutes}m`
}

export async function fileToDataUrl(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Solo se permiten imagenes.')
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5MB.')

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

export async function logRaffleAudit(payload: {
  storeId: string
  raffleId?: string | null
  userId?: string | null
  action: string
  detail: string
  metadata?: Record<string, unknown> | null
}) {
  await supabase.from('raffle_audit_logs').insert({
    store_id: payload.storeId,
    raffle_id: payload.raffleId || null,
    user_id: payload.userId || null,
    action: payload.action,
    detail: payload.detail,
    metadata: payload.metadata || null,
  })
}

