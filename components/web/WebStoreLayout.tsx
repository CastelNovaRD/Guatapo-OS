'use client'

import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { BadgePercent, ChevronRight, Computer, Headphones, Laptop, MapPin, MonitorSmartphone, Phone, Smartphone, TabletSmartphone, X, Zap } from 'lucide-react'
import type { WebCategory } from './types'
import WebHeader, { SocialIcon, type SocialType } from './WebHeader'
import { DEFAULT_WEB_SETTINGS, formatScheduleRange, getScheduleRows, getStoreOpenStatus, type WebSettings } from '@/lib/web-settings'
import { buildCategoryUrl, orderCategoryNames } from '@/lib/web-categories'

type WebStoreLayoutProps = {
  categories: WebCategory[]
  selectedCategory: string
  search?: string
  onSearchChange?: (value: string) => void
  onSelectCategory: (category: string) => void
  children: ReactNode
  settings?: WebSettings
}

export const WEB_CATEGORY_ICON_OPTIONS = [
  { key: 'auto', label: 'Automatico' },
  { key: 'computer', label: 'Computadora' },
  { key: 'laptop', label: 'Laptop' },
  { key: 'tablet', label: 'Tableta' },
  { key: 'smartphone', label: 'Celular' },
  { key: 'adapter', label: 'Adaptador' },
  { key: 'audio', label: 'Audio' },
  { key: 'tv', label: 'TV / Cine' },
  { key: 'portable', label: 'Tecnologia portatil' },
  { key: 'offer', label: 'Oferta' },
]

function autoCategoryIcon(name: string, size: number) {
  const text = name.toLowerCase()
  if (text.includes('cel')) return <Smartphone size={size} />
  if (text.includes('tablet')) return <TabletSmartphone size={size} />
  if (text.includes('comput') || text.includes('laptop')) return <Laptop size={size} />
  if (text.includes('audio') || text.includes('bocina')) return <Headphones size={size} />
  if (text.includes('tv') || text.includes('cine')) return <Computer size={size} />
  if (text.includes('oferta')) return <BadgePercent size={size} />
  if (text.includes('adapt')) return <Zap size={size} />
  return <MonitorSmartphone size={size} />
}

export function renderWebCategoryIcon(name: string, iconValue?: string, size = 18) {
  const value = (iconValue || 'auto').trim()
  const key = value.toLowerCase()
  if (!value || key === 'auto') return autoCategoryIcon(name, size)
  if (key === 'computer') return <Computer size={size} />
  if (key === 'laptop') return <Laptop size={size} />
  if (key === 'tablet') return <TabletSmartphone size={size} />
  if (key === 'smartphone') return <Smartphone size={size} />
  if (key === 'adapter') return <Zap size={size} />
  if (key === 'audio') return <Headphones size={size} />
  if (key === 'tv') return <Computer size={size} />
  if (key === 'portable') return <MonitorSmartphone size={size} />
  if (key === 'offer') return <BadgePercent size={size} />
  return <span className="inline-flex min-w-5 items-center justify-center text-base leading-none" aria-hidden="true">{value.slice(0, 3)}</span>
}

function socialHref(value = '', type?: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  const clean = trimmed.replace(/^@/, '')
  if (type === 'instagram') return `https://instagram.com/${clean}`
  if (type === 'tiktok') return `https://tiktok.com/@${clean}`
  return `https://${clean}`
}

export default function WebStoreLayout({ categories, selectedCategory, search, onSearchChange, onSelectCategory, children, settings }: WebStoreLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [footerLogoBroken, setFooterLogoBroken] = useState(false)
  const [statusTime, setStatusTime] = useState(() => new Date())
  const fallbackCategories = ['Computadoras', 'Tabletas', 'Adaptadores', 'Audio', 'Celulares', 'T.V. y cine en casa', 'Tecnologia portatil', 'Oferta']
  const visibleCategories = useMemo(() => orderCategoryNames(categories.length ? categories.map((category) => category.name) : fallbackCategories, settings?.categoryOrder || []), [categories, settings?.categoryOrder])
  const footerLogo = !footerLogoBroken && settings?.logoUrl?.trim() ? settings.logoUrl : DEFAULT_WEB_SETTINGS.logoUrl
  const footerDescription = settings?.footerDescription || DEFAULT_WEB_SETTINGS.footerDescription
  const contactPhone = settings?.contactPhone || DEFAULT_WEB_SETTINGS.contactPhone
  const contactEmail = settings?.contactEmail || DEFAULT_WEB_SETTINGS.contactEmail
  const contactAddress = settings?.contactAddress || DEFAULT_WEB_SETTINGS.contactAddress
  const schedule = settings?.schedule || DEFAULT_WEB_SETTINGS.schedule
  const scheduleRows = getScheduleRows(schedule)
  const openStatus = getStoreOpenStatus(schedule, statusTime)

  useEffect(() => {
    const id = window.setInterval(() => setStatusTime(new Date()), 60000)
    return () => window.clearInterval(id)
  }, [])

  const socials = useMemo<Array<{ label: string; href: string; type: SocialType }>>(() => [
    { label: 'Facebook', href: socialHref(settings?.facebook), type: 'facebook' as SocialType },
    { label: 'Instagram', href: socialHref(settings?.instagram, 'instagram'), type: 'instagram' as SocialType },
    { label: 'TikTok', href: socialHref(settings?.tiktok, 'tiktok'), type: 'tiktok' as SocialType },
    { label: 'WhatsApp', href: settings?.whatsapp ? `https://wa.me/${settings.whatsapp}` : '', type: 'whatsapp' as SocialType },
    { label: 'YouTube', href: socialHref(settings?.youtube), type: 'youtube' as SocialType },
  ].filter((item): item is { label: string; href: string; type: SocialType } => Boolean(item.href && item.type)), [settings])

  function chooseCategory(category: string) {
    onSelectCategory(category)
    setMenuOpen(false)
  }

  function handleCategoryLink(category: string, event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === 'undefined' || window.location.pathname !== '/web') return
    event.preventDefault()
    chooseCategory(category)
    window.setTimeout(() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const categoryNav = (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => chooseCategory('')}
        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition ${selectedCategory === '' ? 'bg-zinc-950 text-white' : 'text-zinc-950 hover:bg-emerald-50 hover:text-emerald-700'}`}
      >
        <span className="flex items-center gap-3 uppercase"><BadgePercent size={18} /> GENERAL</span>
        <ChevronRight size={16} />
      </button>
      {visibleCategories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => chooseCategory(category)}
          className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition ${selectedCategory === category ? 'bg-zinc-950 text-white' : 'text-zinc-950 hover:bg-emerald-50 hover:text-emerald-700'}`}
        >
          <span className="flex items-center gap-3">{renderWebCategoryIcon(category, settings?.categoryIcons?.[category])} {category}</span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  )

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <WebHeader search={search} onSearchChange={onSearchChange} settings={settings} onMenuClick={() => setMenuOpen(true)} />

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <aside className="h-full w-[310px] max-w-[86vw] overflow-y-auto bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-black uppercase tracking-wide">CATÁLOGO</h2>
              <button type="button" onClick={() => setMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100"><X size={20} /></button>
            </div>
            {categoryNav}
          </aside>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-0 px-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-6">
        <aside className="hidden border-r border-zinc-200 bg-white py-6 pr-5 lg:sticky lg:top-[153px] lg:block lg:h-[calc(100vh-153px)] lg:overflow-y-auto">
          <h2 className="mb-5 px-4 text-2xl font-black uppercase tracking-wide">CATÁLOGO</h2>
          {categoryNav}
        </aside>
        <section className="min-w-0 bg-white lg:pl-6">{children}</section>
      </div>

      <footer className="border-t border-zinc-200 bg-zinc-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            {footerLogo && <img src={footerLogo} onError={() => setFooterLogoBroken(true)} alt="Guatapo" className="h-24 w-72 object-contain object-left" />}
            <p className="mt-4 max-w-sm text-sm font-semibold text-zinc-300">{footerDescription}</p>
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wide">CATÁLOGO</h3>
            <div className="mt-4 flex flex-col items-start gap-2 text-sm font-bold text-zinc-300">
              <a href={buildCategoryUrl('')} onClick={(event) => handleCategoryLink('', event)} className="hover:text-emerald-400">General</a>
              {visibleCategories.map((category) => <a key={category} href={buildCategoryUrl(category)} onClick={(event) => handleCategoryLink(category, event)} className="hover:text-emerald-400">{category}</a>)}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wide">CONTACTO</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-zinc-300">
              {contactPhone && <p className="flex items-center gap-2"><Phone size={17} /> {contactPhone}</p>}
              {contactEmail && <p>{contactEmail}</p>}
              {contactAddress && <p className="flex items-start gap-2"><MapPin size={17} /> {contactAddress}</p>}
              {settings?.googleMapsUrl && <a href={settings.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex font-black text-emerald-400 hover:text-emerald-300">Ver en Google Maps</a>}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wide">HORARIO</h3>
            <div className="mt-4 space-y-3 text-sm font-semibold text-zinc-300"><p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${openStatus.isOpen ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}><span className={`h-2.5 w-2.5 rounded-full ${openStatus.isOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />{openStatus.label}</p>{scheduleRows.length ? scheduleRows.map((row) => <p key={row.key}><span className="block font-black text-white">{row.label}</span>{formatScheduleRange(row.group)}</p>) : <p>Horario no configurado</p>}</div>
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-wide">REDES SOCIALES</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map((item) => <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white transition hover:scale-105 hover:bg-emerald-600"><SocialIcon type={item.type} /></a>)}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 py-5 text-center text-sm font-semibold text-zinc-400">Copyright {new Date().getFullYear()} Guatapo. Todos los derechos reservados.</div>
      </footer>
      {settings?.whatsapp && (
        <a href={`https://wa.me/${settings.whatsapp}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-5 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition hover:scale-105" style={{ backgroundColor: settings.primaryColor || '#009a44' }}>
          <SocialIcon type="whatsapp" />
        </a>
      )}
    </main>
  )
}









