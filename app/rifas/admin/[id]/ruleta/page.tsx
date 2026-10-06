'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { type Raffle, type RaffleUpload } from '@/lib/raffles'
import { ArrowLeft, Maximize2, Monitor, Play, RotateCcw, Smartphone, Volume2, VolumeX } from 'lucide-react'

type EntryRow = {
  id: string
  raffle_id: string
  participant_id: string
  ticket_number: string
  status: string
  raffle_participants?: { full_name: string } | null
}

type DrawRow = {
  id: string
  winning_entry_id: string | null
  winning_ticket: string
  participant_name: string
  created_at: string | null
}

type WinnerResult = {
  draw_id: string
  winning_entry_id: string
  winning_ticket: string
  participant_name: string
  active_tickets: number
  created_at: string
}

type Phase = 'ready' | 'countdown' | 'spinning' | 'result'
type FrameMode = 'auto' | 'horizontal' | 'vertical'

const logoSrc = '/logo-guatapo-white-cropped.png'

export default function RaffleWheelPresentationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const raffleId = String(params.id)
  const [raffle, setRaffle] = useState<Raffle | null>(null)
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [draws, setDraws] = useState<DrawRow[]>([])
  const [uploads, setUploads] = useState<RaffleUpload[]>([])
  const [displayTicket, setDisplayTicket] = useState('------')
  const [winner, setWinner] = useState<WinnerResult | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [countdown, setCountdown] = useState(5)
  const [presentationMode, setPresentationMode] = useState(false)
  const [frameMode, setFrameMode] = useState<FrameMode>('auto')
  const [sound, setSound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const officialDraw = draws[0]
  const prizeImage = uploads.find((upload) => upload.is_primary)?.file_url || uploads[0]?.file_url || ''
  const layoutClass = frameMode === 'vertical' ? 'max-w-[520px]' : frameMode === 'horizontal' ? 'max-w-7xl' : 'max-w-6xl'
  const isFinal = phase === 'result' || Boolean(officialDraw)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const raffleResult = await supabase.from('raffles').select('*').eq('id', raffleId).maybeSingle()
    if (raffleResult.error || !raffleResult.data) {
      setError(raffleResult.error?.message || 'Rifa no encontrada.')
      setLoading(false)
      return
    }

    const raffleData = raffleResult.data as Raffle
    setRaffle(raffleData)

    const [entryResult, drawResult, uploadResult] = await Promise.all([
      supabase
        .from('raffle_entries')
        .select('id, raffle_id, participant_id, ticket_number, status, raffle_participants(full_name)')
        .eq('raffle_id', raffleId)
        .eq('status', 'active')
        .order('ticket_number'),
      supabase
        .from('raffle_draws')
        .select('id, winning_entry_id, winning_ticket, participant_name, created_at')
        .eq('raffle_id', raffleId)
        .order('created_at', { ascending: false }),
      supabase
        .from('raffle_uploads')
        .select('id, raffle_id, file_url, is_primary, sort_order')
        .eq('raffle_id', raffleId)
        .order('sort_order'),
    ])

    const drawRows = (drawResult.data || []) as DrawRow[]
    setEntries(((entryResult.data || []) as unknown) as EntryRow[])
    setDraws(drawRows)
    setUploads((uploadResult.data || []) as RaffleUpload[])

    if (drawRows[0]) {
      setDisplayTicket(drawRows[0].winning_ticket)
      setWinner({
        draw_id: drawRows[0].id,
        winning_entry_id: drawRows[0].winning_entry_id || '',
        winning_ticket: drawRows[0].winning_ticket,
        participant_name: drawRows[0].participant_name,
        active_tickets: 0,
        created_at: drawRows[0].created_at || '',
      })
      setPhase('result')
    }

    setLoading(false)
  }, [raffleId])

  useEffect(() => { void loadData() }, [loadData])

  const participantCount = useMemo(() => new Set(entries.map((entry) => entry.participant_id)).size, [entries])

  async function enterPresentationMode() {
    setPresentationMode(true)
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // El navegador puede rechazar fullscreen; el layout igual ocupa toda la ventana.
    }
  }

  async function startDraw() {
    if (!raffle || phase !== 'ready') return
    if (officialDraw || winner) return
    if (entries.length === 0) {
      setError('No hay boletos activos para sortear.')
      return
    }

    const confirmed = window.confirm('Vas a iniciar el sorteo oficial. El ganador quedara guardado y la rifa sera finalizada. Deseas continuar?')
    if (!confirmed) return

    setError('')
    setPresentationMode(true)

    const { data, error: drawError } = await supabase.rpc('start_raffle_draw', {
      p_raffle_id: raffle.id,
      p_presentation_mode: presentationMode,
    })

    if (drawError) {
      setError(drawError.message)
      setPhase('ready')
      return
    }

    const result = Array.isArray(data) ? data[0] as WinnerResult | undefined : data as WinnerResult | undefined
    if (!result) {
      setError('No se recibio el resultado del sorteo.')
      setPhase('ready')
      return
    }

    setWinner(result)
    setCountdown(5)
    setPhase('countdown')

    let next = 5
    const countdownTimer = window.setInterval(() => {
      next -= 1
      setCountdown(Math.max(0, next))
      if (next <= 0) {
        window.clearInterval(countdownTimer)
        spinToWinner(result)
      }
    }, 900)
  }

  function spinToWinner(result: WinnerResult) {
    setPhase('spinning')
    let tick = 0
    const ticketPool = entries.length ? entries : [{ ticket_number: result.winning_ticket } as EntryRow]
    const spinTimer = window.setInterval(() => {
      tick += 1
      const item = ticketPool[Math.floor(Math.random() * ticketPool.length)]
      setDisplayTicket(item.ticket_number)
      if (tick >= 68) {
        window.clearInterval(spinTimer)
        setDisplayTicket(result.winning_ticket)
        setPhase('result')
        void loadData()
      }
    }, 82)
  }

  function finishPresentation() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    router.push(raffle ? `/rifas/admin/${raffle.id}` : '/rifas')
  }

  if (loading) return <Shell><div className="text-center text-white"><Logo /><p className="mt-6 text-xl font-black">Cargando sorteo...</p></div></Shell>
  if (error && !raffle) return <Shell><div className="text-center text-white"><Logo /><p className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 text-xl font-black text-amber-100">{error}</p></div></Shell>

  return (
    <Shell>
      <div className={`mx-auto flex min-h-screen w-full ${layoutClass} flex-col px-4 py-5 text-white sm:px-8`}>
        {!presentationMode && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href={raffle ? `/rifas/admin/${raffle.id}` : '/rifas'} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-black text-white/80 hover:bg-white/10"><ArrowLeft size={16}/> Volver a la rifa</Link>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFrameMode('auto')} className={modeClass(frameMode === 'auto')}><RotateCcw size={16}/> Automatico</button>
            <button onClick={() => setFrameMode('horizontal')} className={modeClass(frameMode === 'horizontal')}><Monitor size={16}/> 16:9</button>
            <button onClick={() => setFrameMode('vertical')} className={modeClass(frameMode === 'vertical')}><Smartphone size={16}/> 9:16</button>
            <button onClick={() => setSound((value) => !value)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-black text-white/80 hover:bg-white/10">{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} Sonido</button>
            <button onClick={() => void enterPresentationMode()} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 font-black text-zinc-950"><Maximize2 size={16}/> Modo presentacion</button>
          </div>
        </div>}

        <header className="grid gap-4 py-3 text-center lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:text-left">
          <div className="flex justify-center lg:justify-start"><Logo /></div>
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.45em] text-emerald-300">Sorteo oficial</p>
            <h1 className="mt-2 text-3xl font-black uppercase leading-tight sm:text-5xl">{raffle?.public_title || 'Rifa Guatapo'}</h1>
            {raffle?.description && <p className="mx-auto mt-2 max-w-2xl text-sm font-bold text-white/70 sm:text-base">{firstLine(raffle.description)}</p>}
          </div>
          <div className="flex justify-center lg:justify-end">{prizeImage ? <img src={prizeImage} alt="Premio" className="h-20 w-20 rounded-2xl border border-white/10 object-cover shadow-2xl shadow-emerald-500/20"/> : <div className="h-20 w-20 rounded-2xl border border-white/10 bg-white/5"/>}</div>
        </header>

        <main className={`grid flex-1 items-center gap-6 ${frameMode === 'vertical' ? 'grid-cols-1' : 'lg:grid-cols-[1fr_1.15fr_1fr]'}`}>
          <section className={`space-y-4 ${presentationMode ? 'hidden lg:block' : ''}`}>
            <InfoCard label="Rifa" value={raffle?.public_title || '-'} />
            <InfoCard label="Premio" value={firstLine(raffle?.description || raffle?.public_title || '-')} />
            <InfoCard label="Fecha del sorteo" value={raffle?.end_at ? formatDateTime(raffle.end_at) : 'Sin fecha definida'} />
            {!presentationMode && <p className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-50">Para grabar sin distracciones, activa el modo presentacion y presiona F11 si deseas ocultar las barras del navegador.</p>}
          </section>

          <section className="relative flex flex-col items-center justify-center py-4">
            <div className={`relative flex aspect-square w-full max-w-[min(76vh,620px)] items-center justify-center rounded-full border-[18px] border-emerald-400 bg-[conic-gradient(from_0deg,#00a859,#050505,#d4af37,#050505,#00a859)] p-5 shadow-[0_0_80px_rgba(16,185,129,0.24)] ${phase === 'spinning' ? 'animate-spin' : ''}`}>
              <div className="flex h-full w-full items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-center shadow-inner">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.5em] text-emerald-300">Boleto</p>
                  <p className="mt-3 font-mono text-5xl font-black text-white sm:text-7xl lg:text-8xl">{displayTicket}</p>
                </div>
              </div>
              <div className="absolute -top-3 h-0 w-0 border-x-[18px] border-t-[34px] border-x-transparent border-t-white drop-shadow-lg" />
            </div>

            {phase === 'countdown' && <div className="absolute inset-0 grid place-items-center rounded-[2rem] bg-black/75 backdrop-blur-sm"><p className="text-8xl font-black text-emerald-300 sm:text-9xl">{countdown || 'YA'}</p></div>}
          </section>

          <section className="space-y-4 text-center lg:text-left">
            {!isFinal && <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-white/50">Oportunidades validas</p>
              <p className="mt-2 text-5xl font-black text-emerald-300">{entries.length}</p>
              <p className="mt-1 text-sm text-white/60">Participantes incluidos: {participantCount}</p>
            </div>}

            {phase === 'ready' && !officialDraw && <button disabled={entries.length === 0} onClick={() => void startDraw()} className="w-full rounded-3xl bg-emerald-500 px-6 py-5 text-2xl font-black uppercase text-zinc-950 shadow-2xl shadow-emerald-500/25 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"><Play className="mr-2 inline"/> Iniciar sorteo</button>}

            {phase === 'spinning' && <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-center"><p className="text-2xl font-black uppercase text-emerald-100">Girando...</p><p className="mt-2 text-sm font-bold text-white/60">El resultado oficial ya fue protegido por el sistema.</p></div>}

            {winner && <WinnerPanel winner={winner} prize={firstLine(raffle?.description || raffle?.public_title || '-')} />}

            {error && <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-black text-red-100">{error}</div>}
          </section>
        </main>

        {winner && <div className="pointer-events-none fixed inset-0 overflow-hidden">{Array.from({ length: 42 }).map((_, index) => <span key={index} className="absolute h-3 w-3 animate-bounce rounded-sm bg-emerald-300 opacity-80" style={{ left: `${(index * 37) % 100}%`, top: `${(index * 19) % 90}%`, animationDelay: `${(index % 8) * 0.12}s` }} />)}</div>}

        {winner && <div className="mt-4 flex justify-center"><button onClick={finishPresentation} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black uppercase text-white/80 hover:bg-white/20">Finalizar presentacion</button></div>}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#073b24_0,#050505_34%,#000_100%)] text-white">{children}</div>
}

function Logo() {
  return <img src={logoSrc} alt="Guatapo" className="h-14 w-44 object-contain sm:h-16 sm:w-56" />
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">{label}</p><p className="mt-2 text-lg font-black text-white">{value}</p></div>
}

function WinnerPanel({ winner, prize }: { winner: WinnerResult; prize: string }) {
  return <div className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 p-5 text-center shadow-2xl shadow-emerald-500/20">
    <p className="text-2xl font-black uppercase text-emerald-300">Tenemos ganador!</p>
    <p className="mt-3 text-sm font-black uppercase tracking-[0.3em] text-white/50">Numero ganador</p>
    <p className="font-mono text-5xl font-black text-white sm:text-6xl">{winner.winning_ticket}</p>
    <p className="mt-4 text-sm font-black uppercase tracking-[0.3em] text-white/50">Participante</p>
    <p className="text-3xl font-black text-white">{winner.participant_name}</p>
    <p className="mt-4 text-sm font-black uppercase tracking-[0.3em] text-white/50">Premio</p>
    <p className="text-xl font-black text-emerald-100">{prize}</p>
  </div>
}

function modeClass(active: boolean) {
  return `inline-flex items-center gap-2 rounded-full px-4 py-2 font-black ${active ? 'bg-white text-zinc-950' : 'border border-white/15 text-white/80 hover:bg-white/10'}`
}

function firstLine(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || value || '-'
}
