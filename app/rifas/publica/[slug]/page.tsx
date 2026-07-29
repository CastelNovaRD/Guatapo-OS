'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatMoney } from '@/lib/format'
import { DEFAULT_WEB_SETTINGS, formatScheduleRange, getScheduleRows, getStoreOpenStatus, normalizeWebSettings, type WebSettings } from '@/lib/web-settings'
import { fileToDataUrl, getBankLogoUrl, normalizeCedula, normalizeRaffleTitleSegments, RAFFLE_TITLE_COLORS, statusLabel, type Raffle, type RaffleBankAccount, type RaffleSettings, type RaffleUpload } from '@/lib/raffles'
import { Check, Copy, Search, Ticket, Trash2, Upload } from 'lucide-react'

type TicketLookup = {
  full_name: string
  ticket_number: string | null
  status: string
  created_at: string | null
  payment_id?: string | null
  public_code?: string | null
  quantity?: number | null
  amount?: number | null
}
type PurchaseForm = { full_name: string; phone: string; cedula: string; email: string; notes: string; quantity: number; bank_account_id: string; proof_url: string; terms: boolean }
type SubmissionSummary = { code: string; full_name: string; cedula: string; raffleTitle: string; quantity: number; total: number; bankName: string; createdAt: string }
type Countdown = { days: string; hours: string; minutes: string; seconds: string; finished: boolean }

const createEmptyForm = (quantity = 1): PurchaseForm => ({ full_name: '', phone: '', cedula: '', email: '', notes: '', quantity, bank_account_id: '', proof_url: '', terms: false })
const defaultCountdown: Countdown = { days: '00', hours: '00', minutes: '00', seconds: '00', finished: false }
const officialWhatsapp = 'https://wa.me/18096361020'
const officialInstagram = 'https://www.instagram.com/guatapord'

export default function PublicRafflePage() {
  const params = useParams<{ slug?: string; id?: string }>()
  const slug = String(params.slug || params.id || '')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [raffle, setRaffle] = useState<Raffle | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [uploads, setUploads] = useState<RaffleUpload[]>([])
  const [banks, setBanks] = useState<RaffleBankAccount[]>([])
  const [settings, setSettings] = useState<Pick<RaffleSettings, 'whatsapp_url' | 'instagram_url'>>({ whatsapp_url: null, instagram_url: null })
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)
  const [activeImage, setActiveImage] = useState(0)
  const [form, setForm] = useState<PurchaseForm>(createEmptyForm())
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [lookupCedula, setLookupCedula] = useState('')
  const [lookup, setLookup] = useState<TicketLookup[]>([])
  const [lookupSearched, setLookupSearched] = useState(false)
  const [countdown, setCountdown] = useState<Countdown>(defaultCountdown)
  const [submission, setSubmission] = useState<SubmissionSummary | null>(null)

  const minTickets = Math.max(1, Number(raffle?.min_tickets_per_purchase || 1))
  const total = raffle ? Number(raffle.ticket_price || 0) * Number(form.quantity || 0) : 0
  const minimumTotal = raffle ? Number(raffle.ticket_price || 0) * minTickets : 0
  const mainImage = uploads[activeImage]?.file_url
  const selectedBank = banks.find((bank) => bank.id === form.bank_account_id)
  const paused = raffle?.status === 'paused'
  const finished = !raffle || raffle.status === 'finished' || countdown.finished
  const canParticipate = Boolean(raffle && raffle.status === 'active' && !finished)
  const whatsappUrl = normalizeWhatsapp(settings.whatsapp_url || webSettings.whatsapp) || officialWhatsapp
  const instagramUrl = normalizeInstagram(settings.instagram_url || webSettings.instagram) || officialInstagram
  const descriptionItems = useMemo(() => splitDescription(raffle?.detailed_description || raffle?.description || ''), [raffle?.detailed_description, raffle?.description])
  const titleSegments = useMemo(() => normalizeRaffleTitleSegments(raffle?.promotional_title_segments, raffle?.promotional_title || raffle?.public_title || ''), [raffle?.promotional_title_segments, raffle?.promotional_title, raffle?.public_title])

  const loadData = useCallback(async () => {
    setNotFound(false)
    const raffleResult = await supabase
      .from('raffles')
      .select('*')
      .eq('slug', slug)
      .in('status', ['active', 'paused', 'finished'])
      .maybeSingle()

    if (!raffleResult.data) {
      setNotFound(true)
      return
    }

    const raffleData = raffleResult.data as Raffle
    setRaffle(raffleData)
    const [uploadsResult, banksResult, settingsResult] = await Promise.all([
      supabase.from('raffle_uploads').select('id, raffle_id, file_url, is_primary, sort_order').eq('raffle_id', raffleData.id).order('sort_order'),
      supabase.from('raffle_bank_accounts').select('*').eq('store_id', raffleData.store_id).eq('active', true).order('bank_name'),
      supabase.from('raffle_settings').select('whatsapp_url, instagram_url, schedule').eq('store_id', raffleData.store_id).maybeSingle(),
    ])

    const nextUploads = (uploadsResult.data || []) as RaffleUpload[]
    setUploads(nextUploads)
    const primaryIndex = nextUploads.findIndex((upload) => upload.is_primary)
    setActiveImage(primaryIndex >= 0 ? primaryIndex : 0)
    const nextBanks = sortBanks((banksResult.data || []) as RaffleBankAccount[])
    setBanks(nextBanks)
    setSettings({ whatsapp_url: settingsResult.data?.whatsapp_url || null, instagram_url: settingsResult.data?.instagram_url || null })
    setWebSettings(normalizeWebSettings({ schedule: settingsResult.data?.schedule || undefined } as Partial<WebSettings>))
    const nextMin = Math.max(1, Number(raffleData.min_tickets_per_purchase || 1))
    setForm((current) => {
      const currentBankStillActive = nextBanks.some((bank) => bank.id === current.bank_account_id)
      return {
        ...current,
        quantity: Math.max(nextMin, current.quantity || nextMin),
        bank_account_id: currentBankStillActive ? current.bank_account_id : (nextBanks[0]?.id || ''),
      }
    })
  }, [slug])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadData])
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setForm((current) => {
        const bounded = Math.max(minTickets, Number(current.quantity || minTickets))
        return bounded === current.quantity ? current : { ...current, quantity: bounded }
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [minTickets])
  useEffect(() => {
    const update = () => setCountdown(getCountdown(raffle?.end_at || null))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [raffle?.end_at])

  async function proofChange(file: File | null) {
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      setForm((current) => ({ ...current, proof_url: dataUrl }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el comprobante.')
    }
  }

  async function submit() {
    if (!raffle) return
    setMessage('')
    if (!canParticipate) return setMessage(paused ? 'Esta rifa esta pausada temporalmente.' : 'Rifa finalizada.')
    if (!form.full_name.trim() || !form.phone.trim() || normalizeCedula(form.cedula).length < 5) return setMessage('Completa nombre, telefono y cedula.')
    if (form.quantity < minTickets) return setMessage(`El minimo es de ${minTickets} boletos.`)
    if (!form.bank_account_id) return setMessage('Selecciona el banco donde realizaste la transferencia.')
    if (!form.proof_url) return setMessage('Sube el comprobante de transferencia.')
    if (!form.terms) return setMessage('Debes aceptar las reglas y condiciones.')

    setSending(true)
    const { data, error } = await supabase.rpc('register_raffle_purchase', {
      p_raffle_id: raffle.id,
      p_full_name: form.full_name,
      p_phone: form.phone,
      p_cedula: form.cedula,
      p_email: form.email || null,
      p_notes: form.notes || null,
      p_quantity: form.quantity,
      p_bank_account_id: form.bank_account_id,
      p_proof_url: form.proof_url,
    })
    setSending(false)
    if (error) return setMessage(error.message)

    const row = Array.isArray(data) ? data[0] : data
    const code = row?.public_code || (row?.payment_id ? `RF-${String(row.payment_id).slice(0, 8).toUpperCase()}` : `RF-${Date.now()}`)
    setSubmission({ code, full_name: form.full_name.trim(), cedula: form.cedula.trim(), raffleTitle: raffle.public_title, quantity: form.quantity, total, bankName: selectedBank?.bank_name || 'Banco seleccionado', createdAt: new Date().toISOString() })
    setForm(createEmptyForm(minTickets))
  }

  async function searchTickets() {
    if (!raffle || normalizeCedula(lookupCedula).length < 5) return
    setLookupSearched(true)
    const { data, error } = await supabase.rpc('lookup_raffle_tickets', { p_raffle_id: raffle.id, p_cedula: lookupCedula })
    if (error) return setMessage(error.message)
    setLookup((data || []) as TicketLookup[])
  }

  if (notFound) return <SimpleScreen title="Rifa no encontrada." />
  if (!raffle) return <SimpleScreen title="Cargando rifa..." />

  const whatsappMessage = submission ? `Hola, realice una transferencia para participar en la rifa "${submission.raffleTitle}".\n\nNombre: ${submission.full_name}\nCedula: ${submission.cedula}\nCantidad de boletos: ${submission.quantity}\nTotal: ${formatMoney(submission.total)}\nBanco: ${submission.bankName}\nCodigo de solicitud: ${submission.code}\n\nYa subi el comprobante en la pagina.` : ''
  const whatsappHref = submission ? `${whatsappUrl}?text=${encodeURIComponent(whatsappMessage)}` : whatsappUrl

  return <main className="min-h-screen bg-white text-zinc-950">
    <RaffleHeader whatsappUrl={whatsappUrl} instagramUrl={instagramUrl} />
    <div className="mx-auto w-full max-w-[1058px] bg-white">
      {submission ? <SubmissionView submission={submission} whatsappHref={whatsappHref} onBack={()=>setSubmission(null)} onLookup={()=>{ setLookupCedula(submission.cedula); setSubmission(null); setTimeout(()=>void searchTickets(), 0) }} /> : <>
        <section className="px-5 pb-3 pt-8 text-center sm:px-10">
          <span className={`inline-flex rounded-md px-4 py-1 text-xs font-black uppercase text-white ${raffle.status === 'active' && !finished ? 'bg-emerald-600' : raffle.status === 'paused' ? 'bg-amber-500' : 'bg-zinc-700'}`}>{statusText(raffle.status, finished)}</span>
          <PromotionalTitle segments={titleSegments} />
        </section>

        <Gallery uploads={uploads} mainImage={mainImage} title={raffle.public_title} activeImage={activeImage} setActiveImage={setActiveImage} descriptionItems={descriptionItems} />
        <CountdownBlock countdown={countdown} />
        <PriceAndQuantity form={form} setForm={setForm} price={Number(raffle.ticket_price || 0)} minTickets={minTickets} total={total} />

        {!canParticipate && <section className="mx-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center font-black text-amber-800 sm:mx-10">{paused ? 'Esta rifa esta temporalmente pausada.' : 'Esta rifa ya finalizo.'}</section>}
        {canParticipate && <ParticipationForm slug={raffle.slug} form={form} setForm={setForm} minTickets={minTickets} total={total} price={Number(raffle.ticket_price || 0)} banks={banks} selectedBank={selectedBank} sending={sending} message={message} fileInputRef={fileInputRef} proofChange={proofChange} submit={submit} />}
      </>}

      <div className="grid gap-6 px-5 py-10 sm:px-10 lg:grid-cols-[1fr_360px] lg:items-start">
        <LookupSection lookupCedula={lookupCedula} setLookupCedula={setLookupCedula} searchTickets={searchTickets} lookup={lookup} searched={lookupSearched} whatsappUrl={whatsappUrl} />
        <ContactCards raffle={raffle} whatsappUrl={whatsappUrl} instagramUrl={instagramUrl} />
      </div>
    </div>
    <Footer raffle={raffle} whatsappUrl={whatsappUrl} instagramUrl={instagramUrl} webSettings={webSettings} />
  </main>
}

function PromotionalTitle({ segments }: { segments: ReturnType<typeof normalizeRaffleTitleSegments> }) {
  return <h1 className="mx-auto mt-4 max-w-4xl text-3xl font-black leading-tight sm:text-5xl">
    {segments.map((segment, index) => <span key={`${segment.text}-${index}`} className={`${RAFFLE_TITLE_COLORS[segment.color] || RAFFLE_TITLE_COLORS.black} ${segment.bold ? 'font-black' : 'font-bold'}`}>{segment.text}</span>)}
  </h1>
}

function RaffleHeader({ whatsappUrl, instagramUrl }: { whatsappUrl: string; instagramUrl: string }) {
  return <header className="bg-zinc-950 px-4 py-3 text-white">
    <div className="mx-auto grid max-w-[1058px] grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <img src="/logo-guatapo-white-cropped.png" alt="Guatapo" className="h-16 w-52 object-contain object-left sm:h-20 sm:w-64" />
      <a href="#buscar-boletos" className="hidden text-center text-2xl font-black sm:block">Perdiste tus Boletos ?</a>
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        {instagramUrl && <SocialButton href={instagramUrl} label="Instagram" type="instagram" />}
        {whatsappUrl && <SocialButton href={whatsappUrl} label="WhatsApp" type="whatsapp" />}
        <span className="hidden text-lg font-black lg:inline">Info@guatapo.com</span>
      </div>
    </div>
  </header>
}

function Gallery({ uploads, mainImage, title, activeImage, setActiveImage, descriptionItems }: { uploads: RaffleUpload[]; mainImage?: string; title: string; activeImage: number; setActiveImage: (index: number) => void; descriptionItems: string[] }) {
  const showcase = uploads.slice(0, 2)
  return <section className="px-5 sm:px-10">
    <div className="mx-auto rounded-[1.4rem] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.08)] sm:p-8">
      <div className="grid gap-5 md:grid-cols-2 md:items-center">
        {(showcase.length ? showcase : [{ id: 'main', file_url: mainImage || '', raffle_id: '', is_primary: true, sort_order: 0 } as RaffleUpload]).map((upload, index) => (
          <button key={upload.id || index} type="button" onClick={()=>setActiveImage(index)} className="flex min-h-52 items-center justify-center rounded-xl bg-white p-2">
            {upload.file_url ? <img src={upload.file_url} alt={title} loading={index === 0 ? 'eager' : 'lazy'} className="max-h-80 w-full object-contain" /> : <Ticket className="text-zinc-300" size={86}/>} 
          </button>
        ))}
      </div>
      <div className="mt-5 text-left sm:px-10">
        <h2 className="text-2xl font-black">Descripcion</h2>
        <div className="mt-2 space-y-2 text-base font-bold text-zinc-800">
          {descriptionItems.length ? descriptionItems.map((item) => <p key={item}>{item}</p>) : <p>{title}</p>}
        </div>
      </div>
    </div>
    {uploads.length > 1 && <><div className="mt-4 flex justify-center gap-2">{uploads.map((upload,index)=><button key={upload.id} onClick={()=>setActiveImage(index)} className={`h-3 w-3 rounded-full ${index===activeImage?'bg-emerald-600':'bg-zinc-300'}`} aria-label={`Imagen ${index+1}`} />)}</div><div className="mx-auto mt-4 flex max-w-xl gap-3 overflow-x-auto pb-1">{uploads.map((upload,index)=><button key={upload.id} onClick={()=>setActiveImage(index)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-zinc-100 ${index===activeImage?'border-emerald-600':'border-transparent'}`}><img src={upload.file_url} alt="Premio" loading="lazy" className="h-full w-full object-cover"/></button>)}</div></>}
  </section>
}

function CountdownBlock({ countdown }: { countdown: Countdown }) {
  return <section className="px-5 py-8 text-center sm:px-10">
    <h2 className="text-3xl font-black">Tiempo Restante</h2>
    <div className="mx-auto mt-3 grid max-w-xl grid-cols-4 gap-4">
      <TimeCard value={countdown.days} label="Dias" />
      <TimeCard value={countdown.hours} label="Horas" />
      <TimeCard value={countdown.minutes} label="Minutos" />
      <TimeCard value={countdown.seconds} label="Segundos" />
    </div>
  </section>
}

function TimeCard({ value, label }: { value: string; label: string }) { return <div className="rounded-xl bg-zinc-950 px-2 py-4 text-white"><p className="text-3xl font-black text-emerald-600 sm:text-5xl">{value}</p><p className="text-[11px] font-black uppercase sm:text-sm">{label}</p></div> }

function PriceAndQuantity({ form, setForm, price, minTickets, total }: { form: PurchaseForm; setForm: (form: PurchaseForm) => void; price: number; minTickets: number; total: number }) {
  return <section className="px-5 pb-8 sm:px-10">
    <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
      <div className="rounded-3xl border-2 border-zinc-700 bg-white p-4 text-center">
        <p className="text-xl font-black">Costo Por Boletos</p>
        <p className="mt-1 text-4xl font-black text-emerald-700">{formatMoney(price)}</p>
      </div>
      <div className="rounded-3xl border-2 border-zinc-700 bg-white p-4 text-center">
        <p className="text-xl font-black">Boletos</p>
        <div className="mt-1 grid grid-cols-3 items-center text-4xl font-black text-emerald-700">
          <button disabled={form.quantity <= minTickets} onClick={()=>setForm({...form, quantity: Math.max(minTickets, form.quantity - 1)})} className="disabled:opacity-30">-</button>
          <span>{form.quantity}</span>
          <button onClick={()=>setForm({...form, quantity: form.quantity + 1})}>+</button>
        </div>
      </div>
    </div>
    <p className="mt-6 text-center text-3xl font-black sm:text-4xl">Total a Pagar <span className="text-emerald-700">{formatMoney(total)}</span></p>
  </section>
}

function PrizeDescription({ items, uploads, setActiveImage }: { items: string[]; uploads: RaffleUpload[]; setActiveImage: (index: number) => void }) {
  return <section className="py-5">
    <h2 className="text-xl font-black uppercase">Descripcion del premio</h2>
    <div className="mt-3 space-y-2">{items.length ? items.map((item)=><p key={item} className="flex gap-2 text-sm font-bold text-zinc-800"><Check className="mt-0.5 shrink-0 text-emerald-600" size={16}/>{item}</p>) : <p className="text-sm font-bold text-zinc-600">Los detalles del premio estaran disponibles pronto.</p>}</div>
    {uploads.length > 1 && <div className="mt-5 flex gap-3 overflow-x-auto pb-1">{uploads.map((upload,index)=><button key={upload.id} onClick={()=>setActiveImage(index)} className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100"><img src={upload.file_url} alt="Premio" loading="lazy" className="h-full w-full object-cover"/></button>)}</div>}
  </section>
}

function ParticipationForm({ slug, form, setForm, minTickets, total, price, banks, selectedBank, sending, message, fileInputRef, proofChange, submit }: { slug: string; form: PurchaseForm; setForm: (form: PurchaseForm) => void; minTickets: number; total: number; price: number; banks: RaffleBankAccount[]; selectedBank?: RaffleBankAccount; sending: boolean; message: string; fileInputRef: MutableRefObject<HTMLInputElement | null>; proofChange: (file: File | null) => void; submit: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copyAccountNumber() {
    if (!selectedBank?.account_number) return
    try {
      await navigator.clipboard.writeText(selectedBank.account_number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  return <section className="mx-5 rounded-[1.6rem] border-2 border-zinc-800 bg-white p-5 sm:mx-10 sm:p-8">
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
      <div className="space-y-4">
        <h2 className="text-3xl font-black uppercase">Datos del participante</h2>
        <Input label="Nombre completo *" placeholder="Escribe tu nombre completo" value={form.full_name} onChange={(v)=>setForm({...form, full_name:v})}/>
        <Input label="Cedula *" placeholder="Ej: 001-1234567-8" value={form.cedula} onChange={(v)=>setForm({...form, cedula:v})}/>
        <Input label="Telefono / WhatsApp *" placeholder="Ej: 809-123-4567" value={form.phone} onChange={(v)=>setForm({...form, phone:v})}/>
        <div><h3 className="text-3xl font-black uppercase">Metodo de pago</h3><div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4">{banks.length === 0 ? <div className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">No hay cuentas bancarias disponibles.</div> : banks.map((bank)=><button type="button" key={bank.id} onClick={()=>setForm({ ...form, bank_account_id: bank.id })} className={`grid h-16 place-items-center rounded-xl border bg-white p-2 transition ${form.bank_account_id===bank.id?'border-emerald-600 ring-2 ring-emerald-100':'border-zinc-200 hover:border-emerald-300'}`} aria-pressed={form.bank_account_id===bank.id}><BankLogo bank={bank} /></button>)}</div></div>
        <div><button type="button" onClick={()=>fileInputRef.current?.click()} className="mt-4 w-full rounded-xl border border-dashed border-zinc-400 bg-white p-6 text-center"><Upload className="mx-auto"/><p className="mt-2 font-black">Sube tu comprobante aqui</p><p className="text-xs text-zinc-500">Formatos: JPG, PNG, WEBP - Max. 5MB</p></button><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e)=>void proofChange(e.target.files?.[0] || null)} className="hidden" />{form.proof_url && <div className="mt-3 rounded-xl border bg-zinc-50 p-2"><img src={form.proof_url} alt="Comprobante" className="max-h-52 w-full rounded-lg object-contain"/><button onClick={()=>setForm({...form, proof_url:''})} className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-red-600"><Trash2 size={14} className="mr-1 inline"/>Eliminar comprobante</button></div>}</div>
        <div className="space-y-2 pt-2"><a href={`/rifas/${slug}/normas`} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl border border-emerald-600 px-4 py-3 font-black text-emerald-700">Normas de la Rifa</a><label className="flex items-start gap-3 text-lg font-black"><input type="checkbox" checked={form.terms} onChange={(e)=>setForm({...form, terms:e.target.checked})} className="mt-1 h-7 w-7"/><span>Acepto las reglas y condiciones de la rifa.</span></label></div>
      </div>
      <div className="space-y-5 text-center">
        {selectedBank ? <div key={selectedBank.id} className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-[0_14px_35px_rgba(0,0,0,0.10)]"><div className="flex items-center justify-center gap-3"><BankLogo bank={selectedBank} className="h-12 max-w-28"/><p className="text-3xl font-black">{selectedBank.bank_name}</p></div><div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-2xl font-black"><span>{selectedBank.account_number}</span><button type="button" onClick={()=>void copyAccountNumber()} className="rounded-md border p-1"><Copy size={24}/></button><span className="rounded-xl bg-emerald-200 px-3 py-1">{selectedBank.account_type || 'Cuenta'}</span></div><p className="mt-5 text-lg font-black uppercase">Titular: {selectedBank.account_holder}</p>{copied && <p className="mt-2 text-sm font-black text-emerald-700">Cuenta copiada</p>}</div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 font-black text-amber-800">Selecciona una cuenta bancaria.</div>}
        <div className="rounded-2xl bg-emerald-50 p-4 text-center"><p className="text-sm font-black uppercase text-zinc-600">Total a pagar</p><p className="text-4xl font-black text-emerald-700">{formatMoney(total)}</p></div>
        {message && <div className="rounded-xl bg-amber-50 p-3 text-sm font-black text-amber-800">{message}</div>}
        <button disabled={sending || banks.length === 0} onClick={()=>void submit()} className="mx-auto w-full max-w-sm rounded-[2rem] bg-emerald-500 px-8 py-5 text-3xl font-black uppercase leading-tight text-black disabled:opacity-50">{sending ? 'Enviando...' : 'Enviar comprobante'}</button>
      </div>
    </div>
  </section>
}

function BankLogo({ bank, className = 'max-h-12 max-w-full' }: { bank: RaffleBankAccount; className?: string }) {
  const [failed, setFailed] = useState(false)
  const logo = failed ? '' : getBankLogoUrl(bank)
  if (!logo) return <span className="px-1 text-center text-xs font-black leading-tight">{bank.bank_name}</span>
  return <img src={logo} alt={bank.bank_name} className={`${className} object-contain`} onError={() => setFailed(true)} />
}

function SubmissionView({ submission, whatsappHref, onBack, onLookup }: { submission: SubmissionSummary; whatsappHref: string; onBack: () => void; onLookup: () => void }) {
  return <section className="px-4 py-8 text-center"><div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-emerald-600 text-white shadow-lg"><Check size={64}/></div><h1 className="mt-6 text-3xl font-black uppercase text-emerald-700">Transferencia enviada!</h1><p className="mt-2 font-bold">Tu solicitud ha sido recibida correctamente.</p><p className="font-bold">Estamos verificando tu transferencia.</p><div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm"><h2 className="mb-3 text-center font-black uppercase">Detalles de tu solicitud</h2><InfoLine label="Codigo de solicitud" value={submission.code}/><InfoLine label="Rifa" value={submission.raffleTitle}/><InfoLine label="Cantidad de boletos" value={String(submission.quantity)}/><InfoLine label="Total pagado" value={formatMoney(submission.total)}/><InfoLine label="Banco seleccionado" value={submission.bankName}/><InfoLine label="Fecha y hora" value={formatDateTime(submission.createdAt)}/><InfoLine label="Estado" value="Pendiente de verificacion"/></div><div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left font-bold text-amber-800">Tus boletos quedaran activos despues de que confirmemos tu pago.</div><div className="mt-5 grid gap-3"><a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 font-black uppercase text-white">Notificar a Guatapo por WhatsApp <BrandIcon type="whatsapp" className="h-5 w-5" /></a><button onClick={onLookup} className="rounded-xl border border-zinc-200 px-4 py-4 font-black uppercase">Ver mis boletos</button><button onClick={onBack} className="rounded-xl border border-zinc-200 px-4 py-4 font-black uppercase">Volver a la rifa</button></div></section>
}

function LookupSection({ lookupCedula, setLookupCedula, searchTickets, lookup, searched, whatsappUrl }: { lookupCedula: string; setLookupCedula: (v:string)=>void; searchTickets: () => void; lookup: TicketLookup[]; searched: boolean; whatsappUrl: string }) {
  const active = lookup.filter((item)=>item.status === 'active' || item.status === 'winner')
  const pending = lookup.filter((item)=>item.status === 'pending')
  const rejected = lookup.filter((item)=>item.status === 'cancelled' || item.status === 'rejected')
  const participant = lookup[0]
  return <section id="buscar-boletos" className="space-y-3 text-center scroll-mt-8"><h2 className="text-4xl font-black uppercase">Busca tus boletos</h2><p className="text-sm font-bold text-zinc-600">Ingresa tu cedula para ver tus boletos activos</p><div className="flex gap-2"><input value={lookupCedula} onChange={(e)=>setLookupCedula(e.target.value)} placeholder="Ej: 001-1234567-8" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-4 py-3 font-bold outline-none focus:border-emerald-600"/><button onClick={()=>void searchTickets()} className="rounded-full border-2 border-black bg-white px-5 py-3 font-black text-black"><Search size={34}/></button></div>{active.length > 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="text-center text-lg font-black text-emerald-700">Tienes boletos activos!</h3><p className="text-center text-sm">Estos son los boletos registrados a tu nombre.</p><div className="mt-4 rounded-xl bg-white p-4"><Info label="Participante" value={participant?.full_name || '-'}/><Info label="Cedula" value={lookupCedula}/><Info label="Total de boletos activos" value={String(active.length)}/></div><h4 className="mt-4 font-black uppercase">Tus boletos activos</h4><div className="mt-2 space-y-2">{active.map((item)=><div key={item.ticket_number || item.created_at} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm"><span className="font-mono text-xl font-black text-emerald-700">{item.ticket_number}</span><span className="text-sm font-black text-emerald-700">{statusLabel(item.status)}</span></div>)}</div><p className="mt-4 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">Guarda tu comprobante. Cada boleto representa una oportunidad de ganar.</p></div>}{pending.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><h3 className="font-black uppercase">Transferencia pendiente de verificacion</h3><p className="mt-1 text-sm font-bold">Recibimos tu solicitud. Tus boletos quedaran activos despues de que GUATAPO confirme el pago.</p><p className="mt-2 font-black">Cantidad solicitada: {pending.length}</p><a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">Contactar por WhatsApp</a></div>}{rejected.length > 0 && active.length === 0 && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700"><h3 className="font-black uppercase">No fue posible confirmar tu transferencia.</h3><p className="mt-1 text-sm font-bold">Comunicate con GUATAPO para recibir asistencia.</p><a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">Contactar por WhatsApp</a></div>}{searched && lookup.length === 0 && <div className="rounded-2xl bg-zinc-50 p-4 text-center"><p className="font-black">No encontramos boletos asociados con esta cedula en esta rifa.</p><p className="mt-1 text-sm text-zinc-600">Verifica que la cedula este escrita correctamente.</p><a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">Contactar por WhatsApp</a></div>}</section>
}

function ContactCards({ raffle, whatsappUrl, instagramUrl }: { raffle: Raffle; whatsappUrl: string; instagramUrl: string }) { return <section className="space-y-8 text-center"><div><h2 className="text-4xl font-black">Tienes algun<br/>Inconveniente ?</h2><a href={whatsappHelpHref(whatsappUrl, raffle, 'inconveniente')} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-emerald-500 px-5 py-2 text-2xl font-black text-black">Escribenos !!</a></div><div><h2 className="text-3xl font-black uppercase">Siguenos!!</h2><p className="text-2xl">@guatapord</p>{instagramUrl && <SocialButton href={instagramUrl} label="Instagram" type="instagram" size="lg" />}</div></section> }
function Footer({ raffle, whatsappUrl, instagramUrl, webSettings }: { raffle: Raffle; whatsappUrl: string; instagramUrl: string; webSettings: WebSettings }) {
  const scheduleRows = getScheduleRows(webSettings.schedule)
  const openStatus = getStoreOpenStatus(webSettings.schedule)
  return <footer className="bg-zinc-950 px-5 py-9 text-white"><div className="mx-auto grid max-w-[1058px] gap-8 sm:grid-cols-[180px_1fr_220px] sm:items-start"><div className="flex gap-4 sm:block">{instagramUrl && <SocialButton href={instagramUrl} label="Instagram" type="instagram" size="lg" />}{whatsappUrl && <SocialButton href={whatsappUrl} label="WhatsApp" type="whatsapp" size="lg" />}<img src="/logo-guatapo-white-cropped.png" alt="Guatapo" className="mt-6 hidden h-28 w-28 object-contain sm:block"/></div><div className="grid gap-3 text-xl font-black leading-relaxed"><a href="#buscar-boletos" className="text-left hover:text-emerald-400">No sabes tu numero de boleto ?</a><a href={whatsappHelpHref(whatsappUrl, raffle, 'duda')} target="_blank" rel="noreferrer" className="text-left hover:text-emerald-400">Tienes alguna duda ?</a><a href={whatsappHelpHref(whatsappUrl, raffle, 'inconveniente')} target="_blank" rel="noreferrer" className="text-left hover:text-emerald-400">Hay algun inconveniente ?</a><a href={whatsappHelpHref(whatsappUrl, raffle, 'registro')} target="_blank" rel="noreferrer" className="text-left hover:text-emerald-400">No puedes registrarte ?</a></div><div><h2 className="text-5xl font-black">Horario</h2><span className={`mt-4 inline-flex rounded-lg px-3 py-1 text-xl font-black ${openStatus.isOpen ? 'bg-emerald-600' : 'bg-red-600'}`}>{openStatus.label}</span>{scheduleRows.map((row) => <div key={row.key} className="mt-4"><p className="text-xl font-black">{row.label}</p><p>{formatScheduleRange(row.group)}</p></div>)}</div></div></footer>
}

function BrandIcon({ type, className = 'h-7 w-7' }: { type: 'instagram' | 'whatsapp'; className?: string }) {
  if (type === 'instagram') {
    return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><defs><linearGradient id="raffle-instagram-gradient" x1="0" y1="64" x2="64" y2="0"><stop stopColor="#FFD600"/><stop offset=".35" stopColor="#FF0069"/><stop offset=".7" stopColor="#D300C5"/><stop offset="1" stopColor="#7638FA"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#raffle-instagram-gradient)"/><path fill="#fff" d="M32 18.4c4.4 0 4.9 0 6.7.1 1.6.1 2.5.3 3.1.6.8.3 1.3.7 1.9 1.3.6.6 1 1.1 1.3 1.9.2.6.5 1.5.6 3.1.1 1.8.1 2.3.1 6.7s0 4.9-.1 6.7c-.1 1.6-.3 2.5-.6 3.1-.3.8-.7 1.3-1.3 1.9-.6.6-1.1 1-1.9 1.3-.6.2-1.5.5-3.1.6-1.8.1-2.3.1-6.7.1s-4.9 0-6.7-.1c-1.6-.1-2.5-.3-3.1-.6-.8-.3-1.3-.7-1.9-1.3-.6-.6-1-1.1-1.3-1.9-.2-.6-.5-1.5-.6-3.1-.1-1.8-.1-2.3-.1-6.7s0-4.9.1-6.7c.1-1.6.3-2.5.6-3.1.3-.8.7-1.3 1.3-1.9.6-.6 1.1-1 1.9-1.3.6-.2 1.5-.5 3.1-.6 1.8-.1 2.3-.1 6.7-.1Zm0-3c-4.5 0-5.1 0-6.8.1-1.8.1-3 .4-4.1.8-1.1.4-2.1 1-3 2-1 1-1.6 1.9-2 3-.4 1.1-.7 2.3-.8 4.1-.1 1.8-.1 2.4-.1 6.8s0 5.1.1 6.8c.1 1.8.4 3 .8 4.1.4 1.1 1 2.1 2 3 1 1 1.9 1.6 3 2 1.1.4 2.3.7 4.1.8 1.8.1 2.4.1 6.8.1s5.1 0 6.8-.1c1.8-.1 3-.4 4.1-.8 1.1-.4 2.1-1 3-2 1-1 1.6-1.9 2-3 .4-1.1.7-2.3.8-4.1.1-1.8.1-2.4.1-6.8s0-5.1-.1-6.8c-.1-1.8-.4-3-.8-4.1-.4-1.1-1-2.1-2-3-1-1-1.9-1.6-3-2-1.1-.4-2.3-.7-4.1-.8-1.8-.1-2.4-.1-6.8-.1Zm0 8.2a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8Zm0 13.8a5.4 5.4 0 1 1 0-10.8 5.4 5.4 0 0 1 0 10.8Zm8.7-16.1a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>
  }
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect width="64" height="64" rx="14" fill="#25D366"/><path fill="#fff" d="M32 11.5A20.2 20.2 0 0 0 14.8 42.3L12 53l11-2.9A20.1 20.1 0 1 0 32 11.5Zm0 36.7c-3.4 0-6.5-1-9.2-2.8l-.7-.4-6.5 1.7 1.7-6.3-.5-.7a16.6 16.6 0 1 1 15.2 8.5Zm9.2-12.4c-.5-.3-3-1.5-3.5-1.6-.5-.2-.9-.3-1.2.3-.4.5-1.4 1.6-1.7 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-3-2.8-3.5-.3-.5 0-.8.2-1 .2-.2.5-.6.8-.9.2-.3.3-.5.5-.9.2-.3.1-.7 0-.9-.1-.3-1.2-2.9-1.7-3.9-.4-.9-.9-.8-1.2-.8h-1c-.4 0-.9.1-1.4.7-.5.5-1.8 1.8-1.8 4.3 0 2.6 1.9 5 2.1 5.4.3.3 3.7 5.7 9 8 1.3.5 2.2.9 3 .1 1.3.4 2.4.4 3.3.3 1-.2 3-1.2 3.4-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.5-.4-1-.6Z"/></svg>
}

function SocialButton({ href, label, type, size = 'sm' }: { href: string; label: string; type: 'instagram' | 'whatsapp'; size?: 'sm' | 'lg' }) {
  const iconSize = size === 'lg' ? 'h-12 w-12' : 'h-7 w-7'
  const boxSize = size === 'lg' ? 'inline-flex h-16 w-16' : 'grid h-9 w-9 sm:h-10 sm:w-10'
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={`${boxSize} items-center justify-center rounded-xl bg-white shadow-sm transition hover:scale-105`}><BrandIcon type={type} className={iconSize} /></a>
}

function SimpleScreen({ title }: { title: string }) { return <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-center text-white"><div><img src="/logo-guatapo-white-cropped.png" alt="Guatapo" className="mx-auto h-16 w-44 object-contain"/><h1 className="mt-6 text-2xl font-black">{title}</h1></div></main> }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-b border-zinc-100 py-3 text-sm last:border-b-0"><span className="font-bold text-zinc-600">{label}</span><span className="text-right font-black">{value}</span></div> }
function Info({ label, value }: { label: string; value: string }) { return <div className="border-b py-2 last:border-b-0"><p className="text-xs font-black uppercase text-zinc-500">{label}</p><p className="font-black">{value}</p></div> }
function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v:string)=>void; placeholder?: string }) { return <label className="block"><span className="mb-1 block text-sm font-black">{label}</span><input value={value} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-4 py-3 font-bold outline-none focus:border-emerald-600"/></label> }
function Mini({ label, value, green = false }: { label: string; value: string | number; green?: boolean }) { return <div><p className="text-[10px] font-black uppercase text-zinc-600">{label}</p><p className={`mt-1 text-sm font-black ${green ? 'text-emerald-700' : ''}`}>{value}</p></div> }
function statusText(status: string, finished: boolean) { if (finished) return 'Rifa finalizada'; if (status === 'active') return 'Rifa activa'; if (status === 'paused') return 'Rifa pausada'; return 'Proximamente' }
function splitDescription(value: string) { return value.split(/\r?\n/).flatMap((line) => line.split('•')).map((item) => item.replace(/^-\s*/, '').trim()).filter(Boolean) }
function getCountdown(endAt: string | null): Countdown { if (!endAt) return defaultCountdown; const diff = new Date(endAt).getTime() - Date.now(); if (diff <= 0) return { ...defaultCountdown, finished: true }; const days = Math.floor(diff / 86400000); const hours = Math.floor((diff % 86400000) / 3600000); const minutes = Math.floor((diff % 3600000) / 60000); const seconds = Math.floor((diff % 60000) / 1000); return { days: pad(days), hours: pad(hours), minutes: pad(minutes), seconds: pad(seconds), finished: false } }
function pad(value: number) { return String(value).padStart(2, '0') }
function normalizeWhatsapp(value?: string | null) { if (!value) return ''; if (value.includes('wa.me')) return value.split('?')[0]; const digits = value.replace(/\D/g, ''); return digits ? `https://wa.me/${digits.startsWith('1') ? digits : `1${digits}`}` : '' }
function normalizeInstagram(value?: string | null) { if (!value) return ''; if (value.startsWith('http')) return value; const handle = value.replace('@', '').trim(); return handle ? `https://www.instagram.com/${handle}` : '' }
function whatsappHelpHref(base: string, raffle: Raffle, type: 'duda' | 'inconveniente' | 'registro') {
  const messages = {
    duda: `Hola, tengo una duda relacionada con la rifa ${raffle.public_title}. Pueden ayudarme?`,
    inconveniente: `Hola, estoy teniendo un inconveniente en la pagina de la rifa ${raffle.public_title}. Necesito ayuda.`,
    registro: `Hola, no puedo completar mi registro para la rifa ${raffle.public_title}. Pueden ayudarme?`,
  }
  return `${base}?text=${encodeURIComponent(`${messages[type]}\nRifa: ${raffle.slug}`)}`
}











function sortBanks(banks: RaffleBankAccount[]) { return [...banks].sort((a, b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0) || a.bank_name.localeCompare(b.bank_name)) }
