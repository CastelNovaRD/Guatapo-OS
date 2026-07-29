'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDate, formatMoney } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { DEFAULT_WEB_SETTINGS, normalizeWebSettings, type WebSettings } from '@/lib/web-settings'
import { RAFFLE_TICKET_CAPACITY, RAFFLE_TITLE_COLORS, calculateRaffleStats, fileToDataUrl, getEffectiveRafflePrizeValue, getRaffleEarlyFinishReason, getRaffleStatusClass, getRemainingText, logRaffleAudit, safeRaffleText, slugify, statusLabel, getBankLogoUrl, type Raffle, type RaffleBankAccount, type RaffleEntry, type RafflePayment, type RaffleTitleSegment, type RaffleUpload } from '@/lib/raffles'
import { Banknote, CalendarClock, Eye, FileImage, Gift, ImagePlus, Pencil, Plus, RefreshCw, Shuffle, Ticket, Trash2, Trophy, Users } from 'lucide-react'

type BankForm = {
  bank_name: string
  account_number: string
  account_holder: string
  account_type: string
  logo_url: string
  display_order: string
  active: boolean
}

const emptyBankForm: BankForm = {
  bank_name: '',
  account_number: '',
  account_holder: '',
  account_type: '',
  logo_url: '',
  display_order: '0',
  active: true,
}

type RaffleForm = {
  internal_name: string
  public_title: string
  promotional_title: string
  promotional_highlight: string
  promotional_highlight_color: RaffleTitleSegment['color']
  slug: string
  description: string
  detailed_description: string
  prize_value: string
  ticket_price: string
  min_tickets_per_purchase: string
  start_at: string
  end_at: string
  status: Raffle['status']
}

const RESERVED_PUBLIC_RAFFLE_SLUGS = new Set([
  'admin',
  'api',
  'auditoria',
  'caja',
  'clientes',
  'compras',
  'configuracion',
  'cooperativas',
  'cotizaciones',
  'cuadres',
  'cuentas-por-cobrar',
  'empleados',
  'inventario',
  'login',
  'pos',
  'reportes',
  'rifas',
  'ventas',
  'web',
])

const emptyForm: RaffleForm = {
  internal_name: '', public_title: '', promotional_title: '', promotional_highlight: '', promotional_highlight_color: 'green', slug: '', description: '', detailed_description: '', prize_value: '', ticket_price: '', min_tickets_per_purchase: '1', start_at: '', end_at: '', status: 'draft',
}

function buildTitleSegments(title: string, highlight: string, color: RaffleTitleSegment['color']): RaffleTitleSegment[] {
  const safeTitle = safeRaffleText(title)
  const safeHighlight = safeRaffleText(highlight)
  if (!safeTitle) return []
  if (!safeHighlight) return [{ text: safeTitle, color: 'black', bold: true }]

  const start = safeTitle.toLowerCase().indexOf(safeHighlight.toLowerCase())
  if (start < 0) return [{ text: safeTitle, color: 'black', bold: true }]

  const before = safeTitle.slice(0, start)
  const match = safeTitle.slice(start, start + safeHighlight.length)
  const after = safeTitle.slice(start + safeHighlight.length)
  return [
    before ? { text: before, color: 'black', bold: true } : null,
    { text: match, color, bold: true },
    after ? { text: after, color: 'black', bold: true } : null,
  ].filter(Boolean) as RaffleTitleSegment[]
}

export default function RafflesPage() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [raffles, setRaffles] = useState<Raffle[]>([])
  const [entries, setEntries] = useState<RaffleEntry[]>([])
  const [payments, setPayments] = useState<RafflePayment[]>([])
  const [uploads, setUploads] = useState<RaffleUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Raffle | null>(null)
  const [form, setForm] = useState<RaffleForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deletingRaffleId, setDeletingRaffleId] = useState<string | null>(null)
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [raffleSettings, setRaffleSettings] = useState({ whatsapp_url: '', instagram_url: '' })
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)
  const [banks, setBanks] = useState<RaffleBankAccount[]>([])
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm)
  const [editingBankId, setEditingBankId] = useState<string | null>(null)
  const [bankSaving, setBankSaving] = useState(false)
  const [formImages, setFormImages] = useState<FileList | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true); setError('')
    const currentStoreId = await getCurrentStoreId()
    setStoreId(currentStoreId)
    if (!currentStoreId) { setError('Este usuario no tiene una tienda asignada.'); setLoading(false); return }

    const [rafflesResult, entriesResult, paymentsResult, uploadsResult, settingsResult, banksResult] = await Promise.all([
      supabase.from('raffles').select('*').eq('store_id', currentStoreId).order('created_at', { ascending: false }),
      supabase.from('raffle_entries').select('id, raffle_id, participant_id, payment_id, ticket_number, status').eq('store_id', currentStoreId),
      supabase.from('raffle_payments').select('id, raffle_id, participant_id, bank_account_id, quantity, amount, proof_url, status, rejection_reason, notes, created_at, raffle_participants(full_name, cedula, phone), raffle_bank_accounts(bank_name)').eq('store_id', currentStoreId),
      supabase.from('raffle_uploads').select('id, store_id, raffle_id, file_url, is_primary, sort_order').eq('store_id', currentStoreId).order('sort_order'),
      supabase.from('raffle_settings').select('whatsapp_url, instagram_url, schedule').eq('store_id', currentStoreId).maybeSingle(),
      supabase.from('raffle_bank_accounts').select('*').eq('store_id', currentStoreId).order('bank_name'),
    ])

    if (rafflesResult.error) {
      setError(rafflesResult.error.code === '42P01' ? 'El modulo Rifas todavia no tiene tablas. Ejecuta outputs/supabase-rifas.sql en Supabase.' : rafflesResult.error.message)
      setRaffles([]); setEntries([]); setPayments([]); setUploads([]); setLoading(false); return
    }

    setRaffles((rafflesResult.data || []) as Raffle[])
    setEntries((entriesResult.data || []) as RaffleEntry[])
    setPayments(((paymentsResult.data || []) as unknown) as RafflePayment[])
    setUploads((uploadsResult.data || []) as RaffleUpload[])
    if (!banksResult.error) setBanks(sortBanks((banksResult.data || []) as RaffleBankAccount[]))
    const savedSettings = settingsResult.data
    if (!settingsResult.error && savedSettings) {
      setRaffleSettings({ whatsapp_url: savedSettings.whatsapp_url || '', instagram_url: savedSettings.instagram_url || '' })
      setWebSettings((current) => normalizeWebSettings({ ...current, schedule: savedSettings.schedule || current.schedule }))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadData])

  const totals = useMemo(() => {
    const active = raffles.filter((raffle) => raffle.status === 'active').length
    const finished = raffles.filter((raffle) => raffle.status === 'finished').length
    const confirmed = payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const participants = new Set(entries.map((entry) => entry.participant_id)).size
    const sold = entries.filter((entry) => entry.status === 'active' || entry.status === 'winner').length
    const pending = entries.filter((entry) => entry.status === 'pending').length
    const available = raffles.reduce((sum, raffle) => sum + Math.max(0, RAFFLE_TICKET_CAPACITY - entries.filter((entry) => entry.raffle_id === raffle.id).length), 0)
    const prizeValue = raffles.reduce((sum, raffle) => sum + getEffectiveRafflePrizeValue(raffle), 0)
    return { active, finished, confirmed, participants, sold, pending, available, estimatedProfit: confirmed - prizeValue, prizeValue }
  }, [raffles, entries, payments])

  const pendingTransfers = useMemo(() => {
    return payments
      .filter((payment) => payment.status === 'pending' || payment.status === 'correction')
      .map((payment) => ({ payment, raffle: raffles.find((item) => item.id === payment.raffle_id) }))
      .sort((a, b) => new Date(b.payment.created_at || 0).getTime() - new Date(a.payment.created_at || 0).getTime())
  }, [payments, raffles])
  const pendingTransferTotal = pendingTransfers.reduce((sum, item) => sum + Number(item.payment.amount || 0), 0)
  const latestPending = pendingTransfers[0]

  function openCreate() { setEditing(null); setForm(emptyForm); setFormImages(null); setFormOpen(true) }
  function openEdit(raffle: Raffle) {
    setEditing(raffle)
    setForm({
      internal_name: raffle.internal_name || '',
      public_title: raffle.public_title || '',
      promotional_title: raffle.promotional_title || raffle.public_title || '',
      promotional_highlight: '',
      promotional_highlight_color: 'green',
      slug: raffle.slug || '',
      description: raffle.description || '',
      detailed_description: raffle.detailed_description || '',
      prize_value: String(raffle.prize_value || ''),
      ticket_price: String(raffle.ticket_price || ''),
      min_tickets_per_purchase: String(raffle.min_tickets_per_purchase || '1'),
      start_at: raffle.start_at ? raffle.start_at.slice(0, 16) : '',
      end_at: raffle.end_at ? raffle.end_at.slice(0, 16) : '',
      status: raffle.status,
    })
    setFormOpen(true)
  }

  function updateForm(key: keyof RaffleForm, value: string) {
    setForm((current) => ({ ...current, [key]: value, ...(key === 'public_title' && !editing ? { slug: slugify(value) } : {}) }))
  }

  async function saveRaffleSettings() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    setSettingsSaving(true)
    const normalized = normalizeWebSettings(webSettings)
    const settingsResult = await supabase.from('raffle_settings').upsert({ store_id: storeId, whatsapp_url: raffleSettings.whatsapp_url.trim() || null, instagram_url: raffleSettings.instagram_url.trim() || null, schedule: normalized.schedule, updated_at: new Date().toISOString() }, { onConflict: 'store_id' })
    setSettingsSaving(false)
    if (settingsResult.error) return alert('Error guardando configuracion de rifas: ' + settingsResult.error.message)
    setWebSettings(normalized)
    alert('Configuracion de rifas guardada correctamente.')
  }


  function resetBankForm() {
    setBankForm(emptyBankForm)
    setEditingBankId(null)
  }

  function editBank(bank: RaffleBankAccount) {
    setEditingBankId(bank.id)
    setBankForm({
      bank_name: bank.bank_name || '',
      account_number: bank.account_number || '',
      account_holder: bank.account_holder || '',
      account_type: bank.account_type || '',
      logo_url: getBankLogoUrl(bank),
      display_order: String(bank.display_order ?? bank.sort_order ?? 0),
      active: Boolean(bank.active),
    })
  }

  async function updateBankLogo(file: File | null) {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      setBankForm((current) => ({ ...current, logo_url: dataUrl }))
    } catch (logoError) {
      alert(logoError instanceof Error ? logoError.message : 'No se pudo leer el logo del banco.')
    }
  }

  async function saveBank() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (!bankForm.bank_name.trim() || !bankForm.account_number.trim() || !bankForm.account_holder.trim()) {
      return alert('Completa banco, numero de cuenta y titular.')
    }

    setBankSaving(true)
    const payload = {
      store_id: storeId,
      bank_name: bankForm.bank_name.trim(),
      account_number: bankForm.account_number.trim(),
      account_holder: bankForm.account_holder.trim(),
      account_type: bankForm.account_type.trim() || null,
      logo_url: bankForm.logo_url.trim() || null,
      logo: bankForm.logo_url.trim() || null,
      image_url: bankForm.logo_url.trim() || null,
      sort_order: Number(bankForm.display_order || 0),
      display_order: Number(bankForm.display_order || 0),
      active: Boolean(bankForm.active),
    }

    const result = editingBankId
      ? await supabase.from('raffle_bank_accounts').update(payload).eq('store_id', storeId).eq('id', editingBankId)
      : await supabase.from('raffle_bank_accounts').insert(payload)

    setBankSaving(false)
    if (result.error) return alert('Error guardando cuenta bancaria: ' + result.error.message)
    resetBankForm()
    await loadData()
  }

  async function toggleBankActive(bank: RaffleBankAccount) {
    if (!storeId) return
    const { error } = await supabase.from('raffle_bank_accounts').update({ active: !bank.active }).eq('store_id', storeId).eq('id', bank.id)
    if (error) return alert('Error actualizando cuenta bancaria: ' + error.message)
    await loadData()
  }


  function getRaffleUploads(raffleId: string) {
    return uploads
      .filter((upload) => upload.raffle_id === raffleId)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  }

  function getStorageTarget(fileUrl: string) {
    const value = String(fileUrl || '').trim()
    if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null

    try {
      const url = new URL(value)
      const marker = '/storage/v1/object/public/'
      const markerIndex = url.pathname.indexOf(marker)
      if (markerIndex < 0) return null
      const rest = decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
      const [bucket, ...pathParts] = rest.split('/')
      const storagePath = pathParts.join('/')
      if (!bucket || !storagePath) return null
      return { bucket, path: storagePath }
    } catch {
      return null
    }
  }

  async function removeUploadFileIfStored(fileUrl: string) {
    const target = getStorageTarget(fileUrl)
    if (!target) return

    const { error } = await supabase.storage.from(target.bucket).remove([target.path])
    if (error && !String(error.message || '').toLowerCase().includes('not found')) {
      throw new Error(`Storage ${target.bucket}/${target.path}: ${error.message}`)
    }
  }

  async function deleteRaffleUpload(upload: RaffleUpload) {
    if (!storeId || deletingUploadId) return
    if (!confirm('Eliminar esta imagen de la rifa? Esta accion no se puede deshacer.')) return

    setDeletingUploadId(upload.id)
    try {
      await removeUploadFileIfStored(upload.file_url)

      const { data, error } = await supabase
        .from('raffle_uploads')
        .delete()
        .eq('store_id', storeId)
        .eq('raffle_id', upload.raffle_id)
        .eq('id', upload.id)
        .select('id')

      if (error) throw error
      if (!data?.length) throw new Error('Supabase no elimino el registro de la imagen. Revisa permisos/RLS o si ya fue eliminada.')

      const remaining = getRaffleUploads(upload.raffle_id).filter((item) => item.id !== upload.id)
      if (remaining.length > 0 && (upload.is_primary || !remaining.some((item) => item.is_primary))) {
        await supabase
          .from('raffle_uploads')
          .update({ is_primary: true })
          .eq('store_id', storeId)
          .eq('id', remaining[0].id)
      }

      await loadData()
      alert('Imagen eliminada correctamente.')
    } catch (uploadError) {
      console.error('Error eliminando imagen de rifa:', uploadError)
      alert('Error eliminando imagen: ' + (uploadError instanceof Error ? uploadError.message : 'Error desconocido'))
    } finally {
      setDeletingUploadId(null)
    }
  }

  async function saveRaffle() {
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    if (!form.internal_name.trim() || !form.public_title.trim()) return alert('Completa el nombre interno y el titulo publico.')
    if (Number(form.ticket_price || 0) <= 0) return alert('El precio por boleto debe ser mayor que 0.')
    if (Number(form.min_tickets_per_purchase || 0) <= 0) return alert('La compra minima debe ser mayor que 0.')
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    const publicSlug = slugify(form.slug || form.public_title)
    if (!publicSlug) { setSaving(false); return alert('El slug publico no es valido.') }
    if (RESERVED_PUBLIC_RAFFLE_SLUGS.has(publicSlug)) {
      setSaving(false)
      return alert('Ese slug esta reservado por el sistema. Usa otro slug publico para la rifa.')
    }
    const duplicateSlug = raffles.find((raffle) => raffle.slug === publicSlug && raffle.id !== editing?.id)
    if (duplicateSlug) {
      setSaving(false)
      return alert('Ya existe una rifa con ese slug publico. Usa otro slug.')
    }

    const payload = {
      store_id: storeId,
      internal_name: form.internal_name.trim(),
      public_title: form.public_title.trim(),
      promotional_title: form.promotional_title.trim() || form.public_title.trim(),
      promotional_title_segments: buildTitleSegments(form.promotional_title || form.public_title, form.promotional_highlight, form.promotional_highlight_color),
      slug: publicSlug,
      description: form.description.trim() || null,
      detailed_description: form.detailed_description.trim() || null,
      prize_value: Number(form.prize_value || 0),
      ticket_price: Number(form.ticket_price || 0),
      min_tickets_per_purchase: Number(form.min_tickets_per_purchase || 1),
      max_tickets_per_purchase: null,
      total_tickets: RAFFLE_TICKET_CAPACITY,
      start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      status: form.status,
      created_by: userData.user?.id || null,
      updated_at: new Date().toISOString(),
    }
    let raffleId = editing?.id || ''
    if (editing) {
      const { error } = await supabase.from('raffles').update(payload).eq('store_id', storeId).eq('id', editing.id)
      if (error) { setSaving(false); return alert('Error actualizando rifa: ' + error.message) }
    } else {
      const { data, error } = await supabase.from('raffles').insert(payload).select('id').single()
      if (error) { setSaving(false); return alert('Error creando rifa: ' + error.message) }
      raffleId = data.id
    }
    if (formImages?.length) {
      const currentUploads = uploads.filter((upload) => upload.raffle_id === raffleId)
      const rows = []
      for (const file of Array.from(formImages)) {
        const dataUrl = await fileToDataUrl(file)
        rows.push({ store_id: storeId, raffle_id: raffleId, file_url: dataUrl, file_name: file.name, is_primary: currentUploads.length === 0 && rows.length === 0, sort_order: currentUploads.length + rows.length })
      }
      if (rows.length) await supabase.from('raffle_uploads').insert(rows)
    }
    await logRaffleAudit({ storeId, raffleId, userId: userData.user?.id || null, action: editing ? 'raffle.update' : 'raffle.create', detail: `${editing ? 'Rifa actualizada' : 'Rifa creada'}: ${payload.public_title}.` })
    setSaving(false); setFormOpen(false); await loadData()
  }

  async function uploadImages(raffle: Raffle, files: FileList | null) {
    if (!storeId || !files?.length) return
    const currentUploads = uploads.filter((upload) => upload.raffle_id === raffle.id)
    const rows = []
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file)
      rows.push({ store_id: storeId, raffle_id: raffle.id, file_url: dataUrl, file_name: file.name, is_primary: currentUploads.length === 0 && rows.length === 0, sort_order: currentUploads.length + rows.length })
    }
    const { error } = await supabase.from('raffle_uploads').insert(rows)
    if (error) return alert('Error subiendo imagen: ' + error.message)
    await loadData()
  }

  async function finishRaffle(raffle: Raffle) {
    if (!storeId) return
    const endTime = raffle.end_at ? new Date(raffle.end_at).getTime() : 0
    const isEarlyFinish = Boolean(endTime && endTime > Date.now())
    let reason = ''

    if (isEarlyFinish) {
      reason = prompt(`Esta rifa todavia no ha terminado. Escribe el motivo para finalizarla:
${raffle.public_title}`)?.trim() || ''
      if (!reason) return alert('Debes escribir el motivo para finalizar esta rifa antes de tiempo.')
    } else if (!confirm(`Finalizar la rifa ${raffle.public_title}?`)) {
      return
    }

    const payload = {
      status: 'finished' as const,
      conditions: isEarlyFinish ? `FINALIZADA_ANTICIPADA:${reason}` : raffle.conditions,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('raffles').update(payload).eq('store_id', storeId).eq('id', raffle.id)
    if (error) return alert(error.message)
    await logRaffleAudit({
      storeId,
      raffleId: raffle.id,
      action: isEarlyFinish ? 'raffle.finish.early' : 'raffle.finish',
      detail: isEarlyFinish ? `Rifa finalizada antes de tiempo: ${raffle.public_title}. Motivo: ${reason}` : `Rifa finalizada manualmente: ${raffle.public_title}.`,
      metadata: isEarlyFinish ? { reason, prize_value_removed_from_estimates: Number(raffle.prize_value || 0), end_at: raffle.end_at } : null,
    })
    await loadData()
  }

  async function deleteRaffle(raffle: Raffle) {
    if (!storeId || deletingRaffleId) return
    const raffleEntries = entries.filter((entry) => entry.raffle_id === raffle.id)
    const rafflePayments = payments.filter((payment) => payment.raffle_id === raffle.id)
    const hasActivity = raffleEntries.length > 0 || rafflePayments.length > 0
    const confirmation = prompt(`Para eliminar definitivamente la rifa escribe ELIMINAR:
${raffle.public_title}

${hasActivity ? 'Esta rifa tiene participantes/pagos. Se eliminaran boletos, pagos e imagenes relacionados.' : 'Esta rifa no tiene participantes registrados.'}`)
    if ((confirmation || '').trim().toUpperCase() !== 'ELIMINAR') return

    setDeletingRaffleId(raffle.id)

    type SupabaseDeleteError = { code?: string; message?: string; details?: string | null; hint?: string | null }
    const formatDeleteError = (error: SupabaseDeleteError) => [
      error.code ? `Codigo: ${error.code}` : '',
      error.message ? `Mensaje: ${error.message}` : '',
      error.details ? `Detalle: ${error.details}` : '',
      error.hint ? `Pista: ${error.hint}` : '',
    ].filter(Boolean).join('\n')

    const runDeleteStep = async (label: string, request: PromiseLike<{ error: SupabaseDeleteError | null }>, optional = false) => {
      const { error } = await request
      if (!error) return
      if (optional && (error.code === '42P01' || String(error.message || '').includes('does not exist'))) {
        console.warn(`${label}: tabla opcional no existe`, error)
        return
      }
      throw new Error(`${label}\n${formatDeleteError(error)}`)
    }

    const raffleUploads = getRaffleUploads(raffle.id)

    const deleteStorageFiles = async () => {
      for (const upload of raffleUploads) {
        await removeUploadFileIfStored(upload.file_url)
      }
    }

    const deleteFromClient = async () => {
      const { data: userData } = await supabase.auth.getUser()
      await logRaffleAudit({ storeId, raffleId: raffle.id, userId: userData.user?.id || null, action: 'raffle.delete', detail: `Rifa eliminada: ${raffle.public_title}.`, metadata: { slug: raffle.slug, internal_name: raffle.internal_name, had_activity: hasActivity } })
      await runDeleteStep('Error eliminando ganadores', supabase.from('raffle_winners').delete().eq('store_id', storeId).eq('raffle_id', raffle.id), true)
      await runDeleteStep('Error eliminando sorteos', supabase.from('raffle_draws').delete().eq('store_id', storeId).eq('raffle_id', raffle.id), true)
      await runDeleteStep('Error eliminando boletos', supabase.from('raffle_entries').delete().eq('store_id', storeId).eq('raffle_id', raffle.id))
      await runDeleteStep('Error eliminando pagos', supabase.from('raffle_payments').delete().eq('store_id', storeId).eq('raffle_id', raffle.id))
      await runDeleteStep('Error eliminando imagenes', supabase.from('raffle_uploads').delete().eq('store_id', storeId).eq('raffle_id', raffle.id))
      const { data, error } = await supabase.from('raffles').delete().eq('store_id', storeId).eq('id', raffle.id).select('id')
      if (error) throw new Error(`Error eliminando rifa\n${formatDeleteError(error)}`)
      if (!data?.length) throw new Error('Supabase no elimino la rifa. No devolvio filas eliminadas; puede ser permiso/RLS o que la rifa ya no exista.')
    }

    try {
      await deleteStorageFiles()

      const { data, error } = await supabase.rpc('delete_raffle_admin', { p_raffle_id: raffle.id })
      if (error) {
        console.error('RPC delete_raffle_admin fallo, usando fallback cliente:', error)
        await deleteFromClient()
      } else if (!data || (typeof data === 'object' && 'ok' in data && !data.ok)) {
        throw new Error('La funcion delete_raffle_admin no confirmo la eliminacion.')
      }

      if (editing?.id === raffle.id) { setEditing(null); setFormOpen(false) }
      await loadData()
      alert('Rifa eliminada correctamente.')
    } catch (deleteError) {
      console.error('Error eliminando rifa:', deleteError)
      alert(`Error eliminando rifa:\n${deleteError instanceof Error ? deleteError.message : 'Error desconocido'}`)
      setDeletingRaffleId(null)
      return
    }

    setDeletingRaffleId(null)
  }

  return <AppShell>
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-4xl font-black"><Ticket className="text-emerald-600" /> Rifas</h1>
          <p className="text-zinc-600">Sistema independiente de rifas, participantes, boletos, pagos y sorteos.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-black shadow-sm"><RefreshCw className="mr-2 inline" size={18}/>Actualizar</button>
          <button onClick={openCreate} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm"><Plus className="mr-2 inline" size={18}/>Nueva rifa</button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-800">{error}</div>}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Configuracion general de Rifas</h2>
        <p className="text-sm text-zinc-500">Estos enlaces oficiales se usan automaticamente en todas las rifas publicas.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input label="WhatsApp oficial" value={raffleSettings.whatsapp_url} onChange={(v) => setRaffleSettings((current) => ({ ...current, whatsapp_url: v }))} />
          <Input label="Instagram oficial" value={raffleSettings.instagram_url} onChange={(v) => setRaffleSettings((current) => ({ ...current, instagram_url: v }))} />
          <button disabled={settingsSaving || !storeId} onClick={() => void saveRaffleSettings()} className="self-end rounded-xl bg-zinc-950 px-5 py-3 font-black text-white disabled:opacity-50">{settingsSaving ? 'Guardando...' : 'Guardar'}</button>
        </div>
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <h3 className="text-lg font-black">Horario publico</h3>
          <p className="text-sm text-zinc-500">Este horario se muestra automaticamente en la pagina publica de Rifas.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ScheduleEditor label="Lunes - Viernes" group={webSettings.schedule.weekdays} onChange={(group) => setWebSettings((current) => normalizeWebSettings({ ...current, schedule: { ...current.schedule, weekdays: group } }))} />
            <ScheduleEditor label="Sabado" group={webSettings.schedule.saturday} onChange={(group) => setWebSettings((current) => normalizeWebSettings({ ...current, schedule: { ...current.schedule, saturday: group } }))} />
            <ScheduleEditor label="Domingo" group={webSettings.schedule.sunday} onChange={(group) => setWebSettings((current) => normalizeWebSettings({ ...current, schedule: { ...current.schedule, sunday: group } }))} />
          </div>
          <div className="mt-4 flex justify-end"><button disabled={settingsSaving || !storeId} onClick={() => void saveRaffleSettings()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{settingsSaving ? 'Guardando...' : 'Guardar horario'}</button></div>
        </div>
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-black"><Banknote className="text-emerald-600" size={20}/>Cuentas bancarias</h3>
              <p className="text-sm text-zinc-500">Estas cuentas aparecen como botones en la pagina publica de las rifas.</p>
            </div>
            {editingBankId && <button onClick={resetBankForm} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black">Nueva cuenta</button>}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Input label="Banco" value={bankForm.bank_name} onChange={(value) => setBankForm((current) => ({ ...current, bank_name: value }))} />
            <Input label="Numero de cuenta" value={bankForm.account_number} onChange={(value) => setBankForm((current) => ({ ...current, account_number: value }))} />
            <Input label="Titular" value={bankForm.account_holder} onChange={(value) => setBankForm((current) => ({ ...current, account_holder: value }))} />
            <Input label="Tipo de cuenta" value={bankForm.account_type} onChange={(value) => setBankForm((current) => ({ ...current, account_type: value }))} />
            <Input label="Orden" type="number" value={bankForm.display_order} onChange={(value) => setBankForm((current) => ({ ...current, display_order: value }))} />
            <Select label="Estado" value={bankForm.active ? 'active' : 'inactive'} onChange={(value) => setBankForm((current) => ({ ...current, active: value === 'active' }))} options={[["active", "Activo"], ["inactive", "Inactivo"]]} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[120px_1fr_auto] lg:items-end">
            <div className="flex h-24 w-28 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2">
              {bankForm.logo_url ? <img src={bankForm.logo_url} alt="Logo banco" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-black text-zinc-400">LOGO</span>}
            </div>
            <Input label="Logo del boton bancario" value={bankForm.logo_url} onChange={(value) => setBankForm((current) => ({ ...current, logo_url: value }))} />
            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 font-black text-emerald-700 shadow-sm">
              Subir logo
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void updateBankLogo(event.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button disabled={bankSaving || !storeId} onClick={() => void saveBank()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{bankSaving ? 'Guardando...' : editingBankId ? 'Guardar cambios del banco' : 'Agregar banco'}</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {banks.map((bank) => {
              const logo = getBankLogoUrl(bank)
              return <div key={bank.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 p-2">
                    {logo ? <img src={logo} alt={bank.bank_name} className="max-h-full max-w-full object-contain" /> : <Banknote className="text-zinc-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{bank.bank_name}</p>
                    <p className="truncate text-sm text-zinc-600">{bank.account_type || 'Cuenta'} - {bank.account_number}</p>
                    <p className="truncate text-sm text-zinc-500">{bank.account_holder}</p>
                    <p className={`mt-1 text-xs font-black ${bank.active ? 'text-emerald-700' : 'text-red-600'}`}>{bank.active ? 'Activo' : 'Inactivo'} - Orden {bank.display_order ?? bank.sort_order ?? 0}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => editBank(bank)} className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-black">Editar</button>
                  <button onClick={() => void toggleBankActive(bank)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-black ${bank.active ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{bank.active ? 'Desactivar' : 'Activar'}</button>
                </div>
              </div>
            })}
            {banks.length === 0 && <p className="rounded-xl bg-white p-4 text-sm font-bold text-zinc-500">No hay cuentas bancarias registradas.</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat title="Rifas activas" value={totals.active} />
        <Stat title="Rifas finalizadas" value={totals.finished} />
        <Stat title="Total recaudado" value={formatMoney(totals.confirmed)} />
        <Stat title="Participantes" value={totals.participants} />
        <Stat title="Boletos vendidos" value={totals.sold} />
        <Stat title="Boletos pendientes" value={totals.pending} />
        <Stat title="Combinaciones disponibles" value={totals.available} />
        <Stat title="Ganancia estimada" value={formatMoney(totals.estimatedProfit)} />
        <Stat title="Valor premios" value={formatMoney(totals.prizeValue)} />
      </div>

      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="flex items-center gap-2"><FileImage className="text-amber-700"/><h2 className="text-xl font-black">Transferencias pendientes</h2></div>
          <p className="mt-3 text-4xl font-black">{pendingTransfers.length}</p>
          <p className="font-bold">Monto pendiente: {formatMoney(pendingTransferTotal)}</p>
          {latestPending && <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm"><p className="font-black">Ultima solicitud</p><p>{latestPending.raffle?.public_title || 'Rifa'}</p><p>{latestPending.payment.created_at ? formatDate(latestPending.payment.created_at) : '-'}</p></div>}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-black">Pagos pendientes</h2>
          <div className="space-y-3">{pendingTransfers.slice(0, 5).map(({ payment, raffle }) => <div key={payment.id} className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 md:flex-row md:items-center md:justify-between"><div><p className="font-black">{payment.raffle_participants?.full_name || 'Participante'}</p><p className="text-sm text-zinc-600">Cedula: {payment.raffle_participants?.cedula || '-'} ? Tel: {payment.raffle_participants?.phone || '-'}</p><p className="text-sm text-zinc-600">{raffle?.public_title || 'Rifa'} ? {payment.quantity} boletos ? {payment.raffle_bank_accounts?.bank_name || 'Banco'}</p></div><div className="flex items-center gap-3"><span className="font-black text-amber-700">{formatMoney(payment.amount)}</span>{payment.proof_url && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Comprobante</span>}<Link href={raffle ? `/rifas/admin/${raffle.id}` : '/rifas'} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">Revisar transferencia</Link></div></div>)}{pendingTransfers.length === 0 && <p className="rounded-xl bg-zinc-50 p-4 text-zinc-500">No hay transferencias pendientes.</p>}</div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {loading ? <p className="text-zinc-500">Cargando rifas...</p> : raffles.length === 0 ? <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm"><Gift className="mx-auto text-emerald-600" size={42}/><p className="mt-3 font-bold">No hay rifas creadas.</p></div> : raffles.map((raffle) => {
          const raffleEntries = entries.filter((entry) => entry.raffle_id === raffle.id)
          const rafflePayments = payments.filter((payment) => payment.raffle_id === raffle.id)
          const stats = calculateRaffleStats(raffle, raffleEntries, rafflePayments)
          const primary = uploads.find((upload) => upload.raffle_id === raffle.id && upload.is_primary) || uploads.find((upload) => upload.raffle_id === raffle.id)
          return <article key={raffle.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="grid md:grid-cols-[180px_1fr]">
              <div className="flex h-48 items-center justify-center bg-zinc-100 md:h-full">
                {primary ? <img src={primary.file_url} alt={raffle.public_title} className="h-full w-full object-cover" /> : <Gift className="text-zinc-300" size={56}/>} 
              </div>
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-2xl font-black">{raffle.public_title}</h2><p className="text-sm text-zinc-500">{raffle.internal_name}</p>{getRaffleEarlyFinishReason(raffle) && <p className="mt-1 text-sm font-bold text-red-600">Finalizada antes de tiempo: {getRaffleEarlyFinishReason(raffle)}</p>}</div>
                  <span className={`rounded-full border px-3 py-1 text-sm font-black ${getRaffleStatusClass(raffle.status)}`}>{getRaffleEarlyFinishReason(raffle) ? 'Finalizada anticipada' : statusLabel(raffle.status)}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <Mini label="Recaudado" value={formatMoney(stats.confirmedIncome)} />
                  <Mini label="Pendiente" value={formatMoney(stats.pendingIncome)} />
                  <Mini label="Vendidos" value={stats.soldTickets} />
                  <Mini label="Combinaciones disponibles" value={stats.availableTickets} />
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800"><CalendarClock size={18}/> Tiempo restante: {getRemainingText(raffle.end_at)}</div>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded-xl bg-zinc-950 px-4 py-2 font-bold text-white" href={`/rifas/admin/${raffle.id}`}><Eye size={16} className="mr-1 inline"/>Ver</Link>
                  <button className="rounded-xl border px-4 py-2 font-bold" onClick={() => openEdit(raffle)}><Pencil size={16} className="mr-1 inline"/>Editar</button>
                  <Link className="rounded-xl border px-4 py-2 font-bold" href={`/rifas/admin/${raffle.id}#participantes`}><Users size={16} className="mr-1 inline"/>Participantes</Link>
                  <Link className="rounded-xl border px-4 py-2 font-bold" href={`/${raffle.slug}`} target="_blank">Pagina publica</Link>
                  <Link className="rounded-xl border px-4 py-2 font-bold" href={`/rifas/admin/${raffle.id}/ruleta`} target="_blank"><Shuffle size={16} className="mr-1 inline"/>ABRIR RULETA</Link>
                  <label className="cursor-pointer rounded-xl border px-4 py-2 font-bold"><ImagePlus size={16} className="mr-1 inline"/>Imagenes<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void uploadImages(raffle, event.target.files)} /></label>
                  <button className="rounded-xl border border-red-200 px-4 py-2 font-bold text-red-600" onClick={() => void finishRaffle(raffle)}><Trophy size={16} className="mr-1 inline"/>Finalizar</button>
                  <button disabled={deletingRaffleId === raffle.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void deleteRaffle(raffle)}><Trash2 size={16} className="mr-1 inline"/>{deletingRaffleId === raffle.id ? 'Eliminando...' : 'Eliminar'}</button>
                </div>
              </div>
            </div>
          </article>
        })}
      </div>
    </section>

    {formOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"><div className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between"><div><h2 className="text-3xl font-black">{editing ? 'Editar rifa' : 'Nueva rifa'}</h2><p className="text-zinc-500">Datos independientes del sistema principal.</p></div><button onClick={() => setFormOpen(false)} className="text-2xl">x</button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Nombre interno" value={form.internal_name} onChange={(v) => updateForm('internal_name', v)} />
        <Input label="Titulo publico" value={form.public_title} onChange={(v) => updateForm('public_title', v)} />
        <Input label="Titulo promocional publico" value={form.promotional_title} onChange={(v) => updateForm('promotional_title', v)} />
        <Input label="Fragmento destacado" value={form.promotional_highlight} onChange={(v) => updateForm('promotional_highlight', v)} />
        <Select label="Color del fragmento" value={form.promotional_highlight_color} onChange={(v) => updateForm('promotional_highlight_color', v)} options={[['black','Negro'],['green','Verde'],['gold','Dorado']]} />
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
          <p className="mb-2 text-sm font-bold text-zinc-600">Vista previa del titulo promocional</p>
          <p className="text-3xl font-black leading-tight">{buildTitleSegments(form.promotional_title || form.public_title, form.promotional_highlight, form.promotional_highlight_color).map((segment, index) => <span key={`${segment.text}-${index}`} className={`${RAFFLE_TITLE_COLORS[segment.color]} ${segment.bold ? 'font-black' : 'font-bold'}`}>{segment.text}</span>)}</p>
        </div>
        <Input label="Slug publico" value={form.slug} onChange={(v) => updateForm('slug', v)} />
        <Select label="Estado" value={form.status} onChange={(v) => updateForm('status', v)} options={[['draft','Borrador'],['active','Activa'],['paused','Pausada'],['finished','Finalizada']]} />
        <Input label="Valor del premio" type="number" value={form.prize_value} onChange={(v) => updateForm('prize_value', v)} />
        <Input label="Precio individual de cada boleto" type="number" value={form.ticket_price} onChange={(v) => updateForm('ticket_price', v)} />
        <Input label="Cantidad minima por compra" type="number" value={form.min_tickets_per_purchase} onChange={(v) => updateForm('min_tickets_per_purchase', v)} />
        <Input label="Fecha inicio" type="datetime-local" value={form.start_at} onChange={(v) => updateForm('start_at', v)} />
        <Input label="Fecha finalizacion" type="datetime-local" value={form.end_at} onChange={(v) => updateForm('end_at', v)} />
        <label className="block md:col-span-2"><span className="mb-1 block font-bold text-zinc-600">Imagenes del premio</span><input type="file" accept="image/*" multiple onChange={(event) => setFormImages(event.target.files)} className="w-full rounded-xl border border-zinc-200 px-4 py-3" /></label>
        {editing && <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><h3 className="font-black text-zinc-950">Imagenes actuales</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{getRaffleUploads(editing.id).map((upload) => <div key={upload.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><div className="flex h-36 items-center justify-center bg-zinc-100"><img src={upload.file_url} alt="Imagen de rifa" className="h-full w-full object-cover" /></div><div className="flex items-center justify-between gap-2 p-3"><span className="text-xs font-black text-zinc-600">{upload.is_primary ? 'Principal' : 'Imagen'}</span><button type="button" disabled={deletingUploadId === upload.id} onClick={() => void deleteRaffleUpload(upload)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50">{deletingUploadId === upload.id ? 'Eliminando...' : 'Eliminar'}</button></div></div>)}{getRaffleUploads(editing.id).length === 0 && <p className="text-sm font-bold text-zinc-500">Esta rifa no tiene imagenes cargadas.</p>}</div></div>}
      </div>
      <TextArea label="Descripcion" value={form.description} onChange={(v) => updateForm('description', v)} />
      <TextArea label="Descripcion detallada del premio" value={form.detailed_description} onChange={(v) => updateForm('detailed_description', v)} />
      <div className="mt-6 flex justify-end gap-3"><button onClick={() => setFormOpen(false)} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button><button disabled={saving} onClick={() => void saveRaffle()} className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar rifa'}</button></div>
    </div></div>}
  </AppShell>
}



function sortBanks(banks: RaffleBankAccount[]) {
  return [...banks].sort((a, b) => {
    const orderA = Number(a.display_order ?? a.sort_order ?? 0)
    const orderB = Number(b.display_order ?? b.sort_order ?? 0)
    return orderA - orderB || String(a.bank_name || '').localeCompare(String(b.bank_name || ''))
  })
}

function ScheduleEditor({ label, group, onChange }: { label: string; group: WebSettings['schedule']['weekdays']; onChange: (group: WebSettings['schedule']['weekdays']) => void }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-3">
    <label className="flex items-center gap-2 font-black"><input type="checkbox" checked={group.enabled} onChange={(event) => onChange({ ...group, enabled: event.target.checked })} />{label}</label>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Input label="Apertura" value={group.open} onChange={(value) => onChange({ ...group, open: value })} />
      <Input label="Cierre" value={group.close} onChange={(value) => onChange({ ...group, close: value })} />
    </div>
  </div>
}

function Stat({ title, value }: { title: string; value: string | number }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Ticket /></div><p className="text-sm font-bold text-zinc-500">{title}</p><p className="mt-1 text-2xl font-black">{value}</p></div> }
function Mini({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-zinc-50 p-3"><p className="text-xs font-bold text-zinc-500">{label}</p><p className="font-black">{value}</p></div> }
function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) { return <label className="block"><span className="mb-1 block font-bold text-zinc-600">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-500" /></label> }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) { return <label className="block"><span className="mb-1 block font-bold text-zinc-600">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-500">{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label> }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <label className="mt-4 block"><span className="mb-1 block font-bold text-zinc-600">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-emerald-500" /></label> }
