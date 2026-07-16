'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Heart, Menu, Search, ShoppingCart, UserCircle } from 'lucide-react'
import { readCart } from './cart'
import type { WebSettings } from '@/lib/web-settings'

type WebHeaderProps = {
  search?: string
  onSearchChange?: (value: string) => void
  settings?: WebSettings
  onMenuClick?: () => void
}

export type SocialType = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'youtube'
type SocialLink = { label: string; value?: string; href: string; type: SocialType }

function cleanSocialUrl(value = '', fallback?: (value: string) => string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return fallback ? fallback(trimmed.replace(/^@/, '')) : `https://${trimmed}`
}

export function SocialIcon({ type }: { type: SocialType }) {
  const common = 'h-4 w-4 fill-current'
  if (type === 'facebook') {
    return <svg viewBox="0 0 24 24" className={common} aria-hidden="true"><path d="M14 8.8V6.9c0-.8.2-1.2 1.3-1.2H17V2.3c-.8-.1-1.6-.2-2.4-.2-2.9 0-4.8 1.8-4.8 5v1.7H6.7v3.8h3.1V22h3.8v-9.4h3.1l.5-3.8H14Z" /></svg>
  }
  if (type === 'instagram') {
    return <svg viewBox="0 0 24 24" className={common} aria-hidden="true"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm8.7 2.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" /></svg>
  }
  if (type === 'tiktok') {
    return <svg viewBox="0 0 24 24" className={common} aria-hidden="true"><path d="M15.8 2c.4 3 2.1 4.8 5.2 5v3.4a8.4 8.4 0 0 1-5.1-1.7v6.7c0 3.4-2.2 6.6-6.5 6.6A6.4 6.4 0 0 1 3 15.7a6.3 6.3 0 0 1 7.6-6.2v3.7a2.8 2.8 0 0 0-3.9 2.6 2.8 2.8 0 0 0 2.9 2.8c1.7 0 2.8-1 2.8-3.1V2h3.4Z" /></svg>
  }
  if (type === 'whatsapp') {
    return <svg viewBox="0 0 24 24" className={common} aria-hidden="true"><path d="M12 2a9.7 9.7 0 0 0-8.4 14.6L2.4 22l5.5-1.4A9.7 9.7 0 1 0 12 2Zm0 17.6c-1.4 0-2.8-.4-4-1.1l-.3-.2-3.2.8.9-3.1-.2-.3a7.7 7.7 0 1 1 6.8 3.9Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.2 6.2 0 0 1-3.1-2.7c-.1-.2 0-.4.1-.5l.4-.5.2-.4c.1-.1 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.3-.6-.3h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s1 2.6 1.1 2.8c.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1 0-.1-.2-.2-.4-.3Z" /></svg>
  }
  return <svg viewBox="0 0 24 24" className={common} aria-hidden="true"><path d="M21.6 7.2s-.2-1.5-.8-2.1c-.8-.8-1.6-.8-2-.9C16 4 12 4 12 4s-4 0-6.8.2c-.4.1-1.3.1-2 .9-.6.6-.8 2.1-.8 2.1S2.2 9 2.2 10.9v1.7c0 1.9.2 3.7.2 3.7s.2 1.5.8 2.1c.8.8 1.8.8 2.3.9 1.7.2 6.5.2 6.5.2s4 0 6.8-.2c.4-.1 1.3-.1 2-.9.6-.6.8-2.1.8-2.1s.2-1.9.2-3.7v-1.7c0-1.9-.2-3.7-.2-3.7ZM10.1 14.8V8.4l5.7 3.2-5.7 3.2Z" /></svg>
}

export default function WebHeader({ search = '', onSearchChange, settings, onMenuClick }: WebHeaderProps) {
  const [cartCount, setCartCount] = useState(0)
  const primary = settings?.primaryColor || '#009a44'
  const headerColor = settings?.headerColor || '#ffffff'

  useEffect(() => {
    function refreshCount() {
      setCartCount(readCart().reduce((sum, item) => sum + item.quantity, 0))
    }

    refreshCount()
    window.addEventListener('storage', refreshCount)
    window.addEventListener('guatapo-cart-updated', refreshCount)

    return () => {
      window.removeEventListener('storage', refreshCount)
      window.removeEventListener('guatapo-cart-updated', refreshCount)
    }
  }, [])

  const socials = useMemo<SocialLink[]>(() => {
    const whatsapp = settings?.whatsapp?.trim()
    return [
      { label: 'Facebook', value: settings?.facebook, href: cleanSocialUrl(settings?.facebook), type: 'facebook' as const },
      { label: 'Instagram', value: settings?.instagram, href: cleanSocialUrl(settings?.instagram, (value) => `https://instagram.com/${value}`), type: 'instagram' as const },
      { label: 'TikTok', value: settings?.tiktok, href: cleanSocialUrl(settings?.tiktok, (value) => `https://tiktok.com/@${value}`), type: 'tiktok' as const },
      { label: 'WhatsApp', value: whatsapp, href: whatsapp ? `https://wa.me/${whatsapp}` : '', type: 'whatsapp' as const },
      { label: 'YouTube', value: settings?.youtube, href: cleanSocialUrl(settings?.youtube), type: 'youtube' as const },
    ].filter((item) => item.value && item.href)
  }, [settings])

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 shadow-sm backdrop-blur" style={{ backgroundColor: headerColor }}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
        <button type="button" onClick={onMenuClick} aria-label="Abrir menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-950 transition hover:text-white lg:hidden">
          <Menu size={24} />
        </button>

        <Link href="/web" className="flex shrink-0 items-center">
          <img src={settings?.logoUrl || '/logo-guatapo-transparent.png'} alt="Guatapo" className="h-20 w-[250px] object-contain object-left sm:h-24 sm:w-[340px] lg:w-[380px]" />
        </Link>

        <label className="mx-auto hidden min-w-0 max-w-xl flex-1 items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-5 py-3 shadow-inner transition focus-within:bg-white md:flex" style={{ borderColor: 'rgba(24,24,27,.12)' }}>
          <Search className="shrink-0 text-zinc-900" size={22} />
          <input value={search} onChange={(event) => onSearchChange?.(event.target.value)} placeholder="Buscar productos, marcas o categorias" className="w-full min-w-0 bg-transparent text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-500" />
        </label>

        <div className="ml-auto flex shrink-0 items-center gap-2 text-zinc-950">
          <button type="button" className="hidden h-11 w-11 items-center justify-center rounded-full transition hover:bg-emerald-50 hover:text-emerald-700 sm:flex" aria-label="Favoritos"><Heart size={25} /></button>
          <button type="button" className="hidden h-11 w-11 items-center justify-center rounded-full transition hover:bg-emerald-50 hover:text-emerald-700 sm:flex" aria-label="Usuario"><UserCircle size={27} /></button>
          <Link href="/web/carrito" aria-label="Carrito" className="relative flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-emerald-50 hover:text-emerald-700">
            <ShoppingCart size={29} />
            {cartCount > 0 && <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-center text-xs font-black text-white" style={{ backgroundColor: primary }}>{cartCount}</span>}
          </Link>
          <button type="button" onClick={onMenuClick} className="hidden h-11 w-11 items-center justify-center rounded-full transition hover:bg-emerald-50 hover:text-emerald-700 lg:flex" aria-label="Menu"><Menu size={25} /></button>
        </div>
      </div>

      <div className="border-t border-zinc-100 bg-zinc-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-bold lg:px-6">
          <div className="flex flex-wrap items-center gap-3">
            {socials.map((item) => (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white transition hover:scale-105 hover:border-transparent" style={{ backgroundColor: item.type === 'whatsapp' ? primary : undefined }}>
                <SocialIcon type={item.type} />
              </a>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>{settings?.contactEmail || 'Info@guatapo.com'}</span>
            <span>TEL: {settings?.contactPhone || '809-636-1020'}</span>
            <a href={`https://wa.me/${settings?.whatsapp || '18096361020'}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-300">Contactanos</a>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 md:hidden">
        <label className="flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3">
          <Search className="shrink-0 text-zinc-900" size={21} />
          <input value={search} onChange={(event) => onSearchChange?.(event.target.value)} placeholder="Buscar" className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none" />
        </label>
      </div>
    </header>
  )
}

