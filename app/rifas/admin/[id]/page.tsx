'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatMoney } from '@/lib/format'
import { RAFFLE_TICKET_CAPACITY, getRaffleStatusClass, getRemainingText, logRaffleAudit, normalizeCedula, statusLabel, type Raffle, type RaffleBankAccount, type RaffleEntry, type RafflePayment } from '@/lib/raffles'
import { ArrowLeft, Banknote, CheckCircle2, Copy, Download, Edit3, Eye, FileImage, Plus, Printer, Search, Send, ShieldAlert, Shuffle, Ticket, Trash2, UserPlus, Users, X, XCircle } from 'lucide-react'

type ParticipantInfo = { id: string; full_name: string; phone: string; cedula: string; email?: string | null; notes?: string | null; created_at?: string | null; updated_at?: string | null }
type BankInfo = { bank_name: string; account_number: string; account_holder?: string | null; account_type?: string | null }
type PaymentRow = RafflePayment & { updated_at?: string | null; raffle_participants?: ParticipantInfo | null; raffle_bank_accounts?: BankInfo | null }
type EntryRow = RaffleEntry & { created_at?: string | null; raffle_participants?: ParticipantInfo | null }
type ParticipantSummary = { participant: ParticipantInfo; entries: EntryRow[]; payments: PaymentRow[]; totalTickets: number; activeTickets: number; pendingTickets: number; cancelledTickets: number; winnerTickets: number; paidTotal: number; pendingTotal: number; rejectedPayments: number; correctionPayments: number; firstParticipation: string | null; lastPurchase: string | null; proofsCount: number; status: string; ticketText: string }
type PrintPayload = { participant: ParticipantInfo; tickets: EntryRow[]; payments: PaymentRow[]; mode: 'participant' | 'payment'; paymentId?: string; reprint: boolean }

const emptyBank = { bank_name: '', account_number: '', account_holder: '', account_type: '', logo_url: '', sort_order: '0', active: true }
const emptyParticipant = { full_name: '', phone: '', cedula: '', email: '', notes: '', quantity: '1', payment_status: 'confirmed', discount: '', amount_received: '' }
const filters = [['all','Todos'],['active','Con boletos activos'],['pending','Con pago pendiente'],['rejected','Con pagos rechazados'],['cancelled','Con boletos cancelados'],['winner','Ganador']]
const sortOptions = [['recent','Fecha mas reciente'],['name','Nombre'],['tickets_desc','Mayor cantidad de boletos'],['tickets_asc','Menor cantidad de boletos'],['paid_desc','Mayor monto pagado'],['status','Estado']]

export default function RaffleDetailPage() {
  const params = useParams<{ id: string }>()
  const raffleId = String(params.id)
  const [raffle, setRaffle] = useState<Raffle | null>(null)
  const [banks, setBanks] = useState<RaffleBankAccount[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bankForm, setBankForm] = useState(emptyBank)
  const [participantForm, setParticipantForm] = useState(emptyParticipant)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [profileId, setProfileId] = useState<string | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketFilter, setTicketFilter] = useState('all')
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true); setError('')
    const raffleResult = await supabase.from('raffles').select('*').eq('id', raffleId).maybeSingle()
    if (raffleResult.error || !raffleResult.data) { setError(raffleResult.error?.message || 'Rifa no encontrada.'); setLoading(false); return }
    const raffleData = raffleResult.data as Raffle
    setRaffle(raffleData)
    const [bankResult, paymentResult, entryResult] = await Promise.all([
      supabase.from('raffle_bank_accounts').select('*').eq('store_id', raffleData.store_id).order('bank_name'),
      supabase.from('raffle_payments').select('*, raffle_participants(id, full_name, phone, cedula, email, notes, created_at, updated_at), raffle_bank_accounts(bank_name, account_number, account_holder, account_type)').eq('raffle_id', raffleId).order('created_at', { ascending: false }),
      supabase.from('raffle_entries').select('id, raffle_id, participant_id, payment_id, ticket_number, status, created_at, raffle_participants(id, full_name, phone, cedula, email, notes, created_at, updated_at)').eq('raffle_id', raffleId).order('created_at', { ascending: false }),
    ])
    setBanks(sortBanks((bankResult.data || []) as RaffleBankAccount[]))
    setPayments(((paymentResult.data || []) as unknown) as PaymentRow[])
    setEntries(((entryResult.data || []) as unknown) as EntryRow[])
    setLoading(false)
  }, [raffleId])

  useEffect(() => { void loadData() }, [loadData])

  const participantRows = useMemo(() => {
    const map = new Map<string, ParticipantSummary>()
    for (const payment of payments) { const participant = payment.raffle_participants; if (!participant) continue; const key = participant.id || normalizeCedula(participant.cedula); const current = map.get(key) || createSummary(participant); current.payments.push(payment); map.set(key, current) }
    for (const entry of entries) { const participant = entry.raffle_participants; if (!participant) continue; const key = participant.id || normalizeCedula(participant.cedula); const current = map.get(key) || createSummary(participant); current.entries.push(entry); map.set(key, current) }
    const rows = Array.from(map.values()).map((row) => finalizeSummary(row))
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch = !q || `${row.participant.full_name} ${row.participant.cedula} ${row.participant.phone} ${row.ticketText}`.toLowerCase().includes(q)
      const matchesFilter = filter === 'all' || (filter === 'active' && row.activeTickets > 0) || (filter === 'pending' && (row.pendingTickets > 0 || row.pendingTotal > 0 || row.correctionPayments > 0)) || (filter === 'rejected' && row.rejectedPayments > 0) || (filter === 'cancelled' && row.cancelledTickets > 0) || (filter === 'winner' && row.winnerTickets > 0)
      return matchesSearch && matchesFilter
    }).sort(sortParticipants(sortBy))
  }, [entries, payments, search, filter, sortBy])

  const selectedRows = participantRows.filter((row) => selectedIds.includes(row.participant.id))
  const profile = participantRows.find((row) => row.participant.id === profileId) || null
  const confirmed = payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const pending = payments.filter((payment) => payment.status === 'pending' || payment.status === 'correction').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const activeTickets = entries.filter((entry) => entry.status === 'active' || entry.status === 'winner').length
  const pendingTickets = entries.filter((entry) => entry.status === 'pending').length
  const cancelledTickets = entries.filter((entry) => entry.status === 'cancelled').length
  const winnerTickets = entries.filter((entry) => entry.status === 'winner').length
  const generatedTickets = entries.length
  const availableCombinations = Math.max(0, RAFFLE_TICKET_CAPACITY - generatedTickets)

  async function saveBank() {
    if (!raffle) return
    if (!bankForm.bank_name.trim() || !bankForm.account_number.trim() || !bankForm.account_holder.trim()) return alert('Completa banco, cuenta y titular.')
    const { error } = await supabase.from('raffle_bank_accounts').insert({ ...bankForm, store_id: raffle.store_id, bank_name: bankForm.bank_name.trim(), account_number: bankForm.account_number.trim(), account_holder: bankForm.account_holder.trim(), account_type: bankForm.account_type.trim() || null, logo_url: bankForm.logo_url.trim() || null, sort_order: Number(bankForm.sort_order || 0), active: Boolean(bankForm.active) })
    if (error) return alert('Error creando banco: ' + error.message)
    await logRaffleAudit({ storeId: raffle.store_id, raffleId, action: 'bank.create', detail: `Banco agregado: ${bankForm.bank_name}.` })
    setBankForm(emptyBank); await loadData()
  }

  async function addParticipantPurchase() {
    if (!raffle) return
    const qty = Number(participantForm.quantity || 0)
    const minTickets = Number(raffle.min_tickets_per_purchase || 1)
    const discount = Math.max(0, Number(participantForm.discount || 0))
    const amountReceivedRaw = participantForm.amount_received.trim()
    const expectedTotal = Math.max(0, Number(raffle.ticket_price || 0) * qty - discount)
    const amountReceived = amountReceivedRaw === '' ? expectedTotal : Math.max(0, Number(amountReceivedRaw || 0))
    if (!participantForm.full_name.trim() || !participantForm.phone.trim() || normalizeCedula(participantForm.cedula).length < 5) return alert('Completa nombre, telefono y cedula.')
    if (qty <= 0) return alert('La cantidad de boletos debe ser mayor que 0.')
    if (qty < minTickets) return alert(`La compra minima es de ${minTickets} boletos.`)
    if (discount < 0 || amountReceived < 0) return alert('Los montos no pueden ser negativos.')
    setSaving(true)
    const { data, error } = await supabase.rpc('register_raffle_manual_purchase', {
      p_raffle_id: raffle.id,
      p_full_name: participantForm.full_name,
      p_phone: participantForm.phone,
      p_cedula: participantForm.cedula,
      p_email: participantForm.email || null,
      p_notes: participantForm.notes || null,
      p_quantity: qty,
      p_payment_status: participantForm.payment_status,
      p_discount_amount: discount,
      p_amount_received: amountReceived,
    })
    setSaving(false)
    if (error) return alert('Error agregando participante: ' + error.message)
    await logRaffleAudit({ storeId: raffle.store_id, raffleId, action: participantForm.payment_status === 'confirmed' ? 'manual.purchase.paid' : 'manual.purchase.pending', detail: `Compra presencial registrada: ${participantForm.full_name}.`, metadata: { result: data, quantity: qty, discount, amount_received: amountReceived } })
    setParticipantForm(emptyParticipant); setShowManualForm(false); await loadData()
  }

  async function setPaymentStatus(payment: PaymentRow, status: 'confirmed' | 'rejected' | 'correction') {
    if (!raffle) return
    const reason = status === 'rejected' ? prompt('Motivo del rechazo') || '' : status === 'correction' ? prompt('Que debe corregir el participante?') || '' : ''
    if (status === 'rejected' && !reason.trim()) return alert('Debes indicar el motivo del rechazo.')
    if (status === 'correction' && !reason.trim()) return alert('Debes indicar que debe corregir el participante.')
    let amount = Number(payment.amount || 0)
    if (status === 'confirmed') {
      const confirmedAmount = prompt('Monto confirmado', String(amount))
      if (confirmedAmount === null) return
      amount = Number(confirmedAmount || 0)
      if (Number.isNaN(amount) || amount < 0) return alert('Monto confirmado invalido.')
    }
    const patch: Record<string, unknown> = { status, rejection_reason: reason || null, updated_at: new Date().toISOString() }
    if (status === 'confirmed') patch.amount = amount
    const { error } = await supabase.from('raffle_payments').update(patch).eq('id', payment.id).eq('raffle_id', raffle.id)
    if (error) return alert(error.message)
    const entryStatus = status === 'confirmed' ? 'active' : status === 'rejected' ? 'cancelled' : 'pending'
    const { error: entriesError } = await supabase.from('raffle_entries').update({ status: entryStatus }).eq('payment_id', payment.id).eq('raffle_id', raffle.id)
    if (entriesError) return alert(entriesError.message)
    await logRaffleAudit({ storeId: raffle.store_id, raffleId, action: `payment.${status}`, detail: `${statusLabel(status)}: ${payment.raffle_participants?.full_name || payment.id}.`, metadata: { payment_id: payment.id, amount_confirmed: status === 'confirmed' ? amount : null, reason: reason || null } })
    await loadData()
  }

  async function confirmSelectedPayments() {
    if (!raffle || selectedRows.length === 0) return
    const pendingPayments = selectedRows.flatMap((row) => row.payments).filter((payment) => payment.status === 'pending' || payment.status === 'correction')
    if (pendingPayments.length === 0) return alert('No hay pagos pendientes seguros para confirmar.')
    if (!confirm(`Confirmar ${pendingPayments.length} pagos pendientes?`)) return
    for (const payment of pendingPayments) await setPaymentStatus(payment, 'confirmed')
  }

  async function cancelParticipantTickets(row: ParticipantSummary) {
    if (!raffle) return
    if (row.winnerTickets > 0) return alert('No se puede eliminar un participante que tiene boleto ganador.')
    if (!confirm(`Eliminar participante ${row.participant.full_name}? Sus boletos quedaran como cancelados y sus pagos dejaran de contar en ventas/ganancias de la rifa.`)) return

    const { error } = await supabase.from('raffle_entries').update({ status: 'cancelled' }).eq('raffle_id', raffle.id).eq('participant_id', row.participant.id).neq('status', 'winner')
    if (error) return alert(error.message)

    const paymentIds = row.payments.map((payment) => payment.id).filter(Boolean)
    if (paymentIds.length) {
      const { error: paymentsError } = await supabase.from('raffle_payments').update({ status: 'rejected', rejection_reason: 'Participante eliminado/cancelado desde administracion.', updated_at: new Date().toISOString() }).eq('raffle_id', raffle.id).in('id', paymentIds)
      if (paymentsError) return alert(paymentsError.message)
    }

    await logRaffleAudit({ storeId: raffle.store_id, raffleId, action: 'participant.delete', detail: `Participante eliminado/cancelado: ${row.participant.full_name}.`, metadata: { participant_id: row.participant.id, payment_ids: paymentIds, tickets_cancelled: row.entries.length } })
    setProfileId(null)
    setSelectedIds((current) => current.filter((id) => id !== row.participant.id))
    await loadData()
  }

  async function updateParticipantNotes(row: ParticipantSummary) {
    if (!raffle) return
    const notes = prompt('Observacion interna', row.participant.notes || '')
    if (notes === null) return
    const { error } = await supabase.from('raffle_participants').update({ notes, updated_at: new Date().toISOString() }).eq('id', row.participant.id)
    if (error) return alert(error.message)
    await logRaffleAudit({ storeId: raffle.store_id, raffleId, action: 'participant.note', detail: `Observacion actualizada: ${row.participant.full_name}.` })
    await loadData()
  }

  function toggleSelected(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function exportParticipants() { const rows = (selectedRows.length ? selectedRows : participantRows).map((row) => ({ nombre: row.participant.full_name, cedula: row.participant.cedula, telefono: row.participant.phone, boletos: row.totalTickets, activos: row.activeTickets, pendientes: row.pendingTickets, cancelados: row.cancelledTickets, pagado: row.paidTotal, pendiente: row.pendingTotal, estado: participantStatusLabel(row.status) })); downloadCsv(`participantes-rifa-${raffle?.slug || raffleId}.csv`, rows) }
  function exportTickets() { const ids = selectedRows.length ? selectedRows.map((row) => row.participant.id) : participantRows.map((row) => row.participant.id); const rows = entries.filter((entry) => ids.includes(entry.participant_id)).map((entry) => ({ boleto: entry.ticket_number, estado: statusLabel(entry.status), participante: entry.raffle_participants?.full_name || '', cedula: entry.raffle_participants?.cedula || '', fecha: entry.created_at ? formatDateTime(entry.created_at) : '' })); downloadCsv(`boletos-rifa-${raffle?.slug || raffleId}.csv`, rows) }

  function getConfirmedActiveTickets(row: ParticipantSummary, paymentId?: string) {
    return row.entries.filter((entry) => {
      if (paymentId && entry.payment_id !== paymentId) return false
      if (entry.status !== 'active' && entry.status !== 'winner') return false
      const payment = row.payments.find((item) => item.id === entry.payment_id)
      return payment?.status === 'confirmed'
    })
  }

  async function openTicketPrint(row: ParticipantSummary, mode: 'participant' | 'payment' = 'participant', paymentId?: string) {
    if (!raffle) return
    const tickets = getConfirmedActiveTickets(row, paymentId)
    if (tickets.length === 0) return alert('Este participante todavia no tiene boletos confirmados.')
    const relatedPayments = paymentId ? row.payments.filter((payment) => payment.id === paymentId) : row.payments.filter((payment) => tickets.some((entry) => entry.payment_id === payment.id))
    const { data: userData } = await supabase.auth.getUser()
    await logRaffleAudit({ storeId: raffle.store_id, raffleId, userId: userData.user?.id || null, action: mode === 'payment' ? 'tickets.print.payment' : 'tickets.print.participant', detail: `Impresion de boletos: ${row.participant.full_name}.`, metadata: { participant_id: row.participant.id, payment_id: paymentId || null, quantity: tickets.length, tickets: tickets.map((entry) => entry.ticket_number), print_type: mode === 'payment' ? 'Boletos de una compra especifica' : 'Todos los boletos del participante', reprint: true } })
    setPrintPayload({ participant: row.participant, tickets, payments: relatedPayments, mode, paymentId, reprint: true })
  }

  if (loading) return <AppShell><p className="text-zinc-500">Cargando rifa...</p></AppShell>
  if (error || !raffle) return <AppShell><div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-800">{error || 'Rifa no encontrada.'}</div></AppShell>

  return <AppShell>
    <section className="space-y-6">
      <Link href="/rifas" className="font-bold text-emerald-700"><ArrowLeft className="mr-1 inline" size={18}/>Volver a rifas</Link>
      <header className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-4xl font-black">{raffle.public_title}</h1><p className="mt-1 text-zinc-600">{raffle.internal_name}</p><p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 font-black text-emerald-800">Tiempo restante: {getRemainingText(raffle.end_at)}</p></div>
        <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-4 py-2 font-black ${getRaffleStatusClass(raffle.status)}`}>{statusLabel(raffle.status)}</span><Link href={`/rifas/${raffle.slug}`} target="_blank" className="rounded-xl bg-zinc-950 px-4 py-2 font-bold text-white"><Eye className="mr-1 inline" size={16}/>Pagina publica</Link><Link href={`/rifas/admin/${raffle.id}/ruleta`} target="_blank" className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white"><Shuffle className="mr-1 inline" size={16}/>ABRIR RULETA</Link><button onClick={()=>setShowManualForm((v)=>!v)} className="rounded-xl border px-4 py-2 font-bold"><UserPlus className="mr-1 inline" size={16}/>Agregar participante</button><Link href="/rifas" className="rounded-xl border px-4 py-2 font-bold"><Edit3 className="mr-1 inline" size={16}/>Editar rifa</Link></div>
      </header>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat title="Recaudado confirmado" value={formatMoney(confirmed)} />
        <Stat title="Pendiente de confirmar" value={formatMoney(pending)} />
        <Stat title="Participantes unicos" value={participantRows.length} />
        <Stat title="Boletos generados" value={generatedTickets} />
        <Stat title="Combinaciones disponibles" value={availableCombinations} />
        <Stat title="Boletos activos" value={activeTickets} />
        <Stat title="Boletos pendientes" value={pendingTickets} />
        <Stat title="Boletos cancelados" value={cancelledTickets} />
        <Stat title="Boletos ganadores" value={winnerTickets} />
      </div>

      {showManualForm && <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black"><Ticket className="text-emerald-600"/> Agregar participante presencial</h2>
            <p className="text-zinc-600">Formulario rapido para ventas en tienda. No usa banco ni comprobante.</p>
          </div>
          <button onClick={()=>setShowManualForm(false)} className="rounded-xl border px-3 py-2 font-bold">Cerrar</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Nombre completo" value={participantForm.full_name} onChange={(v)=>setParticipantForm({...participantForm, full_name:v})}/>
          <Input label="Telefono" value={participantForm.phone} onChange={(v)=>setParticipantForm({...participantForm, phone:v})}/>
          <Input label="Cedula" value={participantForm.cedula} onChange={(v)=>setParticipantForm({...participantForm, cedula:v})}/>
          <Input label="Correo opcional" value={participantForm.email} onChange={(v)=>setParticipantForm({...participantForm, email:v})}/>
          <Input label="Cantidad de boletos" type="number" value={participantForm.quantity} onChange={(v)=>setParticipantForm({...participantForm, quantity:v})}/>
          <label><span className="mb-1 block font-bold text-zinc-600">Estado del pago</span><select value={participantForm.payment_status} onChange={(e)=>setParticipantForm({...participantForm, payment_status:e.target.value})} className="w-full rounded-xl border px-4 py-3"><option value="confirmed">Pagado</option><option value="pending">Pendiente</option></select></label>
          <Input label="Descuento autorizado" type="number" value={participantForm.discount} onChange={(v)=>setParticipantForm({...participantForm, discount:v})}/>
          <Input label="Monto recibido" type="number" value={participantForm.amount_received} onChange={(v)=>setParticipantForm({...participantForm, amount_received:v})}/>
        </div>
        <label className="mt-3 block"><span className="mb-1 block font-bold text-zinc-600">Observacion interna</span><textarea value={participantForm.notes} onChange={(e)=>setParticipantForm({...participantForm, notes:e.target.value})} className="min-h-24 w-full rounded-xl border px-4 py-3 outline-none focus:border-emerald-500" /></label>
        <div className="mt-4 grid gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-950 md:grid-cols-5">
          <Info label="Precio individual" value={formatMoney(raffle.ticket_price)} />
          <Info label="Compra minima" value={`${raffle.min_tickets_per_purchase || 1} boletos`} />
          <Info label="Cantidad seleccionada" value={participantForm.quantity || '0'} />
          <Info label="Total a cobrar" value={formatMoney(Math.max(0, Number(raffle.ticket_price || 0) * Number(participantForm.quantity || 0) - Math.max(0, Number(participantForm.discount || 0))))} />
          <Info label="Oportunidades" value={participantForm.quantity || '0'} />
        </div>
        <button disabled={saving} onClick={() => void addParticipantPurchase()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Registrar participante'}</button>
      </div>}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><Banknote className="text-emerald-600"/> Cuentas bancarias publicas</h2><p className="mb-4 text-zinc-600">Estas cuentas solo se muestran en la pagina publica cuando el cliente sube una transferencia.</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input label="Banco" value={bankForm.bank_name} onChange={(v)=>setBankForm({...bankForm, bank_name:v})}/><Input label="Numero de cuenta" value={bankForm.account_number} onChange={(v)=>setBankForm({...bankForm, account_number:v})}/><Input label="Titular" value={bankForm.account_holder} onChange={(v)=>setBankForm({...bankForm, account_holder:v})}/><Input label="Tipo de cuenta" value={bankForm.account_type} onChange={(v)=>setBankForm({...bankForm, account_type:v})}/><Input label="Logo del banco URL" value={bankForm.logo_url} onChange={(v)=>setBankForm({...bankForm, logo_url:v})}/><Input label="Orden" value={bankForm.sort_order} onChange={(v)=>setBankForm({...bankForm, sort_order:v})}/><label><span className="mb-1 block font-bold text-zinc-600">Estado</span><select value={bankForm.active ? 'active' : 'inactive'} onChange={(e)=>setBankForm({...bankForm, active:e.target.value==='active'})} className="w-full rounded-xl border px-4 py-3"><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label></div><button onClick={() => void saveBank()} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white"><Plus className="mr-1 inline" size={18}/>Agregar banco</button><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{banks.map((bank)=><div key={bank.id} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3"><div><p className="font-black">{bank.bank_name}</p><p className="text-sm text-zinc-500">{bank.account_number} - {bank.account_holder}</p><p className="text-xs font-bold text-zinc-400">Orden: {bank.sort_order ?? 0} - {bank.active ? 'Activo' : 'Inactivo'}</p></div><button onClick={()=>navigator.clipboard.writeText(bank.account_number)} className="rounded-lg border px-3 py-2"><Copy size={16}/></button></div>)}</div></section>

      <section id="participantes" className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="space-y-4 border-b p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><h2 className="flex items-center gap-2 text-2xl font-black"><Users className="text-emerald-600"/> Participantes</h2><div className="flex flex-wrap gap-2"><button onClick={exportParticipants} className="rounded-xl border px-4 py-2 font-bold"><Download className="mr-1 inline" size={16}/>Exportar participantes</button><button onClick={exportTickets} className="rounded-xl border px-4 py-2 font-bold"><Download className="mr-1 inline" size={16}/>Exportar boletos</button><button onClick={()=>void confirmSelectedPayments()} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white"><CheckCircle2 className="mr-1 inline" size={16}/>Confirmar seleccionados</button><button onClick={()=>alert('La notificacion se integrara cuando este listo el canal de mensajes.')} className="rounded-xl border px-4 py-2 font-bold"><Send className="mr-1 inline" size={16}/>Notificar</button><button onClick={()=>void logRaffleAudit({ storeId: raffle.store_id, raffleId, action: 'participants.review', detail: `Marcados para revision: ${selectedIds.length}.` })} className="rounded-xl border px-4 py-2 font-bold"><ShieldAlert className="mr-1 inline" size={16}/>Marcar revision</button></div></div>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_240px]"><div className="relative"><Search className="absolute left-3 top-3 text-emerald-600" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar nombre, cedula, telefono o boleto..." className="w-full rounded-xl border py-3 pl-10 pr-4" /></div><select value={filter} onChange={(e)=>setFilter(e.target.value)} className="rounded-xl border px-4 py-3 font-bold">{filters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="rounded-xl border px-4 py-3 font-bold">{sortOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-zinc-50 text-sm text-zinc-500"><tr><th className="p-4"><input type="checkbox" checked={participantRows.length > 0 && selectedIds.length === participantRows.length} onChange={(e)=>setSelectedIds(e.target.checked ? participantRows.map((row)=>row.participant.id) : [])}/></th><th className="p-4">Participante</th><th className="p-4">Boletos</th><th className="p-4">Pagos</th><th className="p-4">Fechas</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead><tbody>{participantRows.map((row)=><tr key={row.participant.id} className="border-t hover:bg-zinc-50"><td className="p-4"><input type="checkbox" checked={selectedIds.includes(row.participant.id)} onChange={()=>toggleSelected(row.participant.id)}/></td><td className="p-4"><button onClick={()=>setProfileId(row.participant.id)} className="text-left"><p className="font-black">{row.participant.full_name}</p><p className="text-sm text-zinc-500">Cedula: {maskDocument(row.participant.cedula)}</p><p className="text-sm text-zinc-500">Tel: {maskPhone(row.participant.phone)}</p></button></td><td className="p-4"><p className="font-black">{row.totalTickets} boletos</p><p className="text-sm text-emerald-700">Activos: {row.activeTickets}</p><p className="text-sm text-amber-700">Pendientes: {row.pendingTickets}</p><p className="text-sm text-red-600">Cancelados: {row.cancelledTickets}</p></td><td className="p-4"><p className="font-black">Pagado {formatMoney(row.paidTotal)}</p><p className="text-sm text-amber-700">Pendiente {formatMoney(row.pendingTotal)}</p><p className="text-sm text-zinc-500">Comprobantes: {row.proofsCount}</p></td><td className="p-4 text-sm"><p>Primera: {row.firstParticipation ? formatDateTime(row.firstParticipation) : '-'}</p><p>Reciente: {row.lastPurchase ? formatDateTime(row.lastPurchase) : '-'}</p></td><td className="p-4"><span className={`rounded-full border px-3 py-1 text-sm font-black ${getRaffleStatusClass(row.status)}`}>{participantStatusLabel(row.status)}</span></td><td className="space-y-2 p-4"><div className="flex flex-wrap gap-2"><button title="Ver participante" onClick={()=>setProfileId(row.participant.id)} className="rounded-lg border px-3 py-2"><Eye size={16}/></button><button title={getConfirmedActiveTickets(row).length ? 'Imprimir boletos' : 'Este participante todavia no tiene boletos confirmados.'} disabled={getConfirmedActiveTickets(row).length === 0} onClick={()=>void openTicketPrint(row)} className="rounded-lg border px-3 py-2 disabled:opacity-40"><Printer size={16}/></button><button title="Agregar compra" onClick={()=>{ setShowManualForm(true); setParticipantForm((current)=>({ ...current, full_name: row.participant.full_name, phone: row.participant.phone, cedula: row.participant.cedula, email: row.participant.email || '' })) }} className="rounded-lg border px-3 py-2"><UserPlus size={16}/></button><button title="Confirmar pagos pendientes" disabled={row.pendingTotal <= 0 && row.correctionPayments === 0} onClick={()=>void Promise.all(row.payments.filter((payment)=>payment.status === 'pending' || payment.status === 'correction').map((payment)=>setPaymentStatus(payment,'confirmed')))} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-40"><CheckCircle2 size={16}/></button><button title="Observacion" onClick={()=>void updateParticipantNotes(row)} className="rounded-lg border px-3 py-2"><Edit3 size={16}/></button><button title="Eliminar participante" onClick={()=>void cancelParticipantTickets(row)} className="rounded-lg border border-red-200 px-3 py-2 text-red-600"><Trash2 size={16}/></button></div></td></tr>)}{participantRows.length===0 && <tr><td colSpan={7} className="p-8 text-center text-zinc-500">No hay participantes para mostrar.</td></tr>}</tbody></table></div>
      </section>
    </section>
    {profile && <ParticipantProfile row={profile} payments={profile.payments} entries={profile.entries} ticketSearch={ticketSearch} setTicketSearch={setTicketSearch} ticketFilter={ticketFilter} setTicketFilter={setTicketFilter} onClose={()=>setProfileId(null)} onConfirm={(payment)=>void setPaymentStatus(payment, 'confirmed')} onReject={(payment)=>void setPaymentStatus(payment, 'rejected')} onCorrection={(payment)=>void setPaymentStatus(payment, 'correction')} onCancelTickets={()=>void cancelParticipantTickets(profile)} onNote={()=>void updateParticipantNotes(profile)} onPrintAll={()=>void openTicketPrint(profile)} onPrintPayment={(paymentId)=>void openTicketPrint(profile, 'payment', paymentId)} />}
    {printPayload && raffle && <TicketPrintPreview raffle={raffle} payload={printPayload} onClose={()=>setPrintPayload(null)} />}
  </AppShell>
}

function createSummary(participant: ParticipantInfo): ParticipantSummary { return { participant, entries: [], payments: [], totalTickets: 0, activeTickets: 0, pendingTickets: 0, cancelledTickets: 0, winnerTickets: 0, paidTotal: 0, pendingTotal: 0, rejectedPayments: 0, correctionPayments: 0, firstParticipation: null, lastPurchase: null, proofsCount: 0, status: 'pending', ticketText: '' } }
function finalizeSummary(row: ParticipantSummary) {
  row.totalTickets = row.entries.length
  row.activeTickets = row.entries.filter((entry)=>entry.status === 'active').length
  row.pendingTickets = row.entries.filter((entry)=>entry.status === 'pending').length
  row.cancelledTickets = row.entries.filter((entry)=>entry.status === 'cancelled').length
  row.winnerTickets = row.entries.filter((entry)=>entry.status === 'winner').length
  row.paidTotal = row.payments.filter((payment)=>payment.status === 'confirmed').reduce((sum,payment)=>sum+Number(payment.amount||0),0)
  row.pendingTotal = row.payments.filter((payment)=>payment.status === 'pending' || payment.status === 'correction').reduce((sum,payment)=>sum+Number(payment.amount||0),0)
  row.rejectedPayments = row.payments.filter((payment)=>payment.status === 'rejected').length
  row.correctionPayments = row.payments.filter((payment)=>payment.status === 'correction').length
  row.proofsCount = row.payments.filter((payment)=>Boolean(payment.proof_url)).length
  row.firstParticipation = oldest(row.entries.map((entry)=>entry.created_at).concat(row.payments.map((payment)=>payment.created_at)))
  row.lastPurchase = newest(row.payments.map((payment)=>payment.created_at)) || newest(row.entries.map((entry)=>entry.created_at))
  row.ticketText = row.entries.map((entry)=>entry.ticket_number).join(' ')
  row.status = row.winnerTickets > 0 ? 'winner' : row.rejectedPayments > 0 ? 'rejected' : row.pendingTickets > 0 || row.pendingTotal > 0 ? 'pending' : row.activeTickets > 0 ? 'active' : row.cancelledTickets > 0 ? 'cancelled' : 'pending'
  return row
}
function sortParticipants(sortBy: string) { return (a: ParticipantSummary, b: ParticipantSummary) => { if (sortBy === 'name') return a.participant.full_name.localeCompare(b.participant.full_name); if (sortBy === 'tickets_desc') return b.totalTickets - a.totalTickets; if (sortBy === 'tickets_asc') return a.totalTickets - b.totalTickets; if (sortBy === 'paid_desc') return b.paidTotal - a.paidTotal; if (sortBy === 'status') return participantStatusLabel(a.status).localeCompare(participantStatusLabel(b.status)); return new Date(b.lastPurchase || 0).getTime() - new Date(a.lastPurchase || 0).getTime() } }
function oldest(values: Array<string | null | undefined>) { const dates = values.filter(Boolean).map(String).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime()); return dates[0] || null }
function newest(values: Array<string | null | undefined>) { const dates = values.filter(Boolean).map(String).sort((a,b)=>new Date(b).getTime()-new Date(a).getTime()); return dates[0] || null }
function participantStatusLabel(status: string) { const labels: Record<string,string> = { active: 'Activo', pending: 'Pendiente', rejected: 'Rechazado', cancelled: 'Cancelado', winner: 'Ganador', correction: 'Correccion' }; return labels[status] || statusLabel(status) }
function maskDocument(value?: string | null) { const clean = normalizeCedula(value || ''); if (clean.length <= 5) return clean || '-'; return `${clean.slice(0,3)}-***-${clean.slice(-5)}` }
function maskPhone(value?: string | null) { const clean = (value || '').replace(/\D/g, ''); if (clean.length < 7) return value || '-'; return `${clean.slice(0,3)}-***-${clean.slice(-4)}` }
function downloadCsv(filename: string, rows: Record<string, unknown>[]) { const headers = Object.keys(rows[0] || { vacio: '' }); const csv = [headers.join(','), ...rows.map((row)=>headers.map((header)=>`"${String(row[header] ?? '').replace(/"/g,'""')}"`).join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url) }

function ParticipantProfile({ row, payments, entries, ticketSearch, setTicketSearch, ticketFilter, setTicketFilter, onClose, onConfirm, onReject, onCorrection, onCancelTickets, onNote, onPrintAll, onPrintPayment }: { row: ParticipantSummary; payments: PaymentRow[]; entries: EntryRow[]; ticketSearch: string; setTicketSearch: (v:string)=>void; ticketFilter: string; setTicketFilter: (v:string)=>void; onClose: ()=>void; onConfirm: (payment: PaymentRow)=>void; onReject: (payment: PaymentRow)=>void; onCorrection: (payment: PaymentRow)=>void; onCancelTickets: ()=>void; onNote: ()=>void; onPrintAll: ()=>void; onPrintPayment: (paymentId: string)=>void }) {
  const visibleTickets = entries.filter((entry) => (!ticketSearch || entry.ticket_number.includes(ticketSearch.trim())) && (ticketFilter === 'all' || entry.status === ticketFilter))
  return <div className="fixed inset-0 z-50 bg-black/40"><aside className="ml-auto h-full w-full max-w-5xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-700">Perfil del participante</p><h2 className="text-3xl font-black">{row.participant.full_name}</h2><p className="text-zinc-500">Informacion completa dentro de esta rifa.</p></div><button onClick={onClose} className="rounded-xl border p-3"><X/></button></div>
    <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]"><div className="rounded-2xl border p-5"><h3 className="mb-3 text-xl font-black">Informacion personal</h3><Info label="Nombre" value={row.participant.full_name}/><Info label="Cedula" value={row.participant.cedula}/><Info label="Telefono" value={row.participant.phone}/><Info label="Correo" value={row.participant.email || '-'}/><Info label="Registro" value={row.participant.created_at ? formatDateTime(row.participant.created_at) : '-'}/><Info label="Ultima actualizacion" value={row.participant.updated_at ? formatDateTime(row.participant.updated_at) : '-'}/><Info label="Estado" value={participantStatusLabel(row.status)}/><Info label="Observaciones" value={row.participant.notes || '-'}/><div className="mt-4 flex flex-wrap gap-2"><button onClick={onPrintAll} className="rounded-xl bg-zinc-950 px-4 py-2 font-bold text-white"><Printer size={16} className="mr-1 inline"/>Imprimir boletos</button><button onClick={onNote} className="rounded-xl border px-4 py-2 font-bold"><Edit3 size={16} className="mr-1 inline"/>Agregar observacion</button><button onClick={onCancelTickets} className="rounded-xl border border-red-200 px-4 py-2 font-bold text-red-600"><Trash2 size={16} className="mr-1 inline"/>Eliminar participante</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat title="Total boletos" value={row.totalTickets}/><Stat title="Activos" value={row.activeTickets}/><Stat title="Pendientes" value={row.pendingTickets}/><Stat title="Cancelados" value={row.cancelledTickets}/><Stat title="Total pagado" value={formatMoney(row.paidTotal)}/><Stat title="Total pendiente" value={formatMoney(row.pendingTotal)}/><Stat title="Compras" value={payments.length}/><Stat title="Comprobantes" value={row.proofsCount}/></div></section>
    <section className="mt-6 rounded-2xl border p-5"><div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h3 className="text-xl font-black">Boletos del participante</h3><div className="flex gap-2"><input value={ticketSearch} onChange={(e)=>setTicketSearch(e.target.value)} placeholder="Buscar boleto" className="rounded-xl border px-4 py-2"/><select value={ticketFilter} onChange={(e)=>setTicketFilter(e.target.value)} className="rounded-xl border px-4 py-2"><option value="all">Todos</option><option value="pending">Pendiente</option><option value="active">Activo</option><option value="cancelled">Cancelado</option><option value="winner">Ganador</option></select></div></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{visibleTickets.map((entry)=>{ const payment = payments.find((item)=>item.id === entry.payment_id); return <div key={entry.id} className="rounded-xl bg-zinc-50 p-3"><p className="font-mono text-xl font-black">{entry.ticket_number}</p><p className="text-sm font-bold">{statusLabel(entry.status)}</p><p className="text-xs text-zinc-500">Creado: {entry.created_at ? formatDateTime(entry.created_at) : '-'}</p><p className="text-xs text-zinc-500">Compra: {entry.payment_id?.slice(0,8) || '-'}</p><p className="text-xs text-zinc-500">Pago: {payment ? statusLabel(payment.status) : '-'}</p></div>})}{visibleTickets.length===0 && <p className="text-zinc-500">No hay boletos para mostrar.</p>}</div></section>
    <section className="mt-6 rounded-2xl border p-5"><h3 className="mb-4 text-xl font-black">Compras del participante</h3><div className="space-y-3">{payments.map((payment)=>{ const paymentEntries = entries.filter((entry)=>entry.payment_id === payment.id); return <div key={payment.id} className="rounded-xl bg-zinc-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-black">Solicitud {payment.id.slice(0,8)}</p><p className="text-sm text-zinc-500">{payment.created_at ? formatDateTime(payment.created_at) : '-'}</p><p className="text-sm">Precio usado: {formatMoney(payment.unit_ticket_price || 0)} - Cantidad: {payment.quantity} - Total: {formatMoney(payment.amount)}</p><p className="text-sm">Banco: {payment.raffle_bank_accounts?.bank_name || '-'}</p><p className="text-sm">Boletos asociados: {paymentEntries.length}</p><p className="text-sm">Estado: {statusLabel(payment.status)}</p>{payment.rejection_reason && <p className="text-sm text-red-600">Motivo: {payment.rejection_reason}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={()=>onPrintPayment(payment.id)} className="rounded-lg border px-3 py-2"><Printer size={16}/></button><button onClick={()=>onConfirm(payment)} className="rounded-lg bg-emerald-600 px-3 py-2 text-white"><CheckCircle2 size={16}/></button><button onClick={()=>onCorrection(payment)} className="rounded-lg border px-3 py-2">Correccion</button><button onClick={()=>onReject(payment)} className="rounded-lg bg-red-600 px-3 py-2 text-white"><XCircle size={16}/></button></div></div></div>})}</div></section>
    <section className="mt-6 rounded-2xl border p-5"><h3 className="mb-4 flex items-center gap-2 text-xl font-black"><FileImage className="text-emerald-600"/> Comprobantes de pago</h3><div className="grid gap-4 md:grid-cols-2">{payments.filter((payment)=>payment.proof_url).map((payment)=><div key={payment.id} className="rounded-xl bg-zinc-50 p-4"><a href={payment.proof_url || '#'} target="_blank" className="block overflow-hidden rounded-xl border bg-white">{String(payment.proof_url || '').startsWith('data:image') ? <img src={payment.proof_url || ''} alt="Comprobante" className="h-56 w-full object-cover"/> : <div className="p-6 text-center font-bold text-emerald-700">Abrir comprobante</div>}</a><p className="mt-3 font-black">Compra {payment.id.slice(0,8)}</p><p className="text-sm text-zinc-500">Fecha de carga: {payment.requested_at || payment.created_at ? formatDateTime(String(payment.requested_at || payment.created_at)) : '-'}</p><p className="text-sm">Banco: {payment.raffle_bank_accounts?.bank_name || '-'}</p><p className="text-sm">Monto esperado: {formatMoney(payment.amount)}</p><p className="text-sm">Estado: {statusLabel(payment.status)}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>onConfirm(payment)} className="rounded-lg bg-emerald-600 px-3 py-2 text-white">Confirmar</button><button onClick={()=>onReject(payment)} className="rounded-lg bg-red-600 px-3 py-2 text-white">Rechazar</button><button onClick={()=>onCorrection(payment)} className="rounded-lg border px-3 py-2">Corregir</button><a href={payment.proof_url || '#'} download className="rounded-lg border px-3 py-2">Descargar</a></div></div>)}{payments.filter((payment)=>payment.proof_url).length===0 && <p className="text-zinc-500">No hay comprobantes subidos.</p>}</div></section>
  </aside></div>
}

function Stat({ title, value }: { title: string; value: string | number }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-zinc-500">{title}</p><p className="mt-1 text-2xl font-black">{value}</p></div> }
function Info({ label, value }: { label: string; value: string }) { return <div className="border-b py-2 last:border-b-0"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="font-bold">{value}</p></div> }
function Input({ label, value, onChange, type='text' }: { label: string; value: string; onChange: (v:string)=>void; type?: string }) { return <label><span className="mb-1 block font-bold text-zinc-600">{label}</span><input type={type} value={value} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-xl border px-4 py-3 outline-none focus:border-emerald-500" /></label> }

function TicketPrintPreview({ raffle, payload, onClose }: { raffle: Raffle; payload: PrintPayload; onClose: () => void }) {
  const ticketRows: EntryRow[][] = []
  for (let i = 0; i < payload.tickets.length; i += 2) ticketRows.push(payload.tickets.slice(i, i + 2))
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
    <style>{`@media print { body * { visibility: hidden !important; } .raffle-ticket-print, .raffle-ticket-print * { visibility: visible !important; } .raffle-ticket-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 80mm !important; box-shadow: none !important; } @page { size: 80mm auto; margin: 0; } }`}</style>
    <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-2xl print:m-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <div className="mb-5 flex items-start justify-between print:hidden"><div><h2 className="text-2xl font-black">Imprimir boletos</h2><p className="text-zinc-600">{payload.participant.full_name} - {payload.tickets.length} boletos activos.</p></div><button onClick={onClose} className="rounded-xl border p-3"><X/></button></div>
      <div className="raffle-ticket-print mx-auto bg-white p-4 text-black" style={{ width: '80mm', fontFamily: 'Arial, sans-serif' }}>
        <div className="text-center"><h1 className="text-3xl font-black tracking-wide">GUATAPO</h1><p className="text-base font-bold">Tel. 809-636-1020</p></div>
        <div className="my-3 border-t border-dashed border-black" />
        <LabelBlock label="RIFA" value={raffle.public_title} />
        <LabelBlock label="FINALIZA" value={raffle.end_at ? formatDateTime(raffle.end_at) : 'Fecha por anunciar'} />
        <LabelBlock label="PARTICIPANTE" value={payload.participant.full_name} />
        <LabelBlock label="CEDULA" value={payload.participant.cedula} />
        <LabelBlock label="TELEFONO" value={payload.participant.phone} />
        <div className="mt-3"><p className="text-sm font-black">CANTIDAD DE BOLETOS:</p><p className="text-xl font-black">{payload.tickets.length}</p></div>
        <div className="my-3 border-t border-dashed border-black" />
        <p className="text-center text-base font-black">SUS BOLETOS:</p>
        <div className="mt-2 space-y-1">
          {ticketRows.map((row, index) => <div key={index} className="grid grid-cols-2 gap-3 text-center font-mono text-2xl font-black">{row.map((entry) => <span key={entry.id}>{entry.ticket_number.padStart(6, '0')}</span>)}</div>)}
        </div>
        <div className="my-3 border-t border-dashed border-black" />
        <p className="text-center text-sm font-bold">Conserve este comprobante.</p>
        <p className="text-center text-sm">Cada boleto representa una oportunidad de ganar.</p>
        {payload.reprint && <p className="mt-2 text-center text-xs font-black">REIMPRESION</p>}
        <div className="mt-3 border-t border-dashed border-black pt-2 text-center text-xs">Generado por CastelNova OS</div>
      </div>
      <div className="mt-5 flex justify-end gap-3 print:hidden"><button onClick={onClose} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button><button onClick={() => window.print()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"><Printer className="mr-1 inline" size={18}/>Imprimir</button></div>
    </div>
  </div>
}
function LabelBlock({ label, value }: { label: string; value: string }) { return <div className="mt-3"><p className="text-sm font-black">{label}:</p><p className="text-base font-bold leading-tight">{value}</p></div> }


function sortBanks(banks: RaffleBankAccount[]) { return [...banks].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || a.bank_name.localeCompare(b.bank_name)) }
