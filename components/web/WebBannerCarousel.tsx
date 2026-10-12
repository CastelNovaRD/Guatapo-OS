'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { WebBanner } from '@/lib/web-banners'

export default function WebBannerCarousel({ banners }: { banners: WebBanner[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const activeBanner = banners[activeIndex] || banners[0]

  useEffect(() => {
    if (banners.length <= 1) return
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % banners.length), 6500)
    return () => window.clearInterval(timer)
  }, [banners.length])

  useEffect(() => {
    if (activeIndex >= banners.length) setActiveIndex(0)
  }, [activeIndex, banners.length])

  if (!activeBanner) return null

  function goTo(index: number) {
    setActiveIndex((index + banners.length) % banners.length)
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (touchStart === null) return
    const distance = event.changedTouches[0]?.clientX - touchStart
    setTouchStart(null)
    if (Math.abs(distance) < 40 || banners.length <= 1) return
    goTo(activeIndex + (distance > 0 ? -1 : 1))
  }

  const destination = activeBanner.link_url?.trim()
  const content = (
    <>
      <picture>
        {activeBanner.mobile_image_url && <source media="(max-width: 640px)" srcSet={activeBanner.mobile_image_url} />}
        <img src={activeBanner.image_url} alt={activeBanner.title || 'Promoción'} className="h-full w-full object-cover" fetchPriority="high" />
      </picture>
      {(activeBanner.title || activeBanner.subtitle || activeBanner.button_text) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/40 to-transparent p-5 text-white sm:p-8">
          {activeBanner.title && <h2 className="max-w-2xl text-2xl font-black sm:text-4xl">{activeBanner.title}</h2>}
          {activeBanner.subtitle && <p className="mt-2 max-w-xl text-sm font-semibold text-zinc-100 sm:text-base">{activeBanner.subtitle}</p>}
          {activeBanner.button_text && <span className="mt-4 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-black shadow-lg">{activeBanner.button_text}</span>}
        </div>
      )}
    </>
  )

  return (
    <section className="bg-white px-6 pt-8 sm:px-10" aria-label="Banners promocionales">
      <div
        className="relative aspect-[16/8] overflow-hidden rounded-3xl bg-zinc-100 shadow-sm sm:aspect-[21/8]"
        onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
        onTouchEnd={onTouchEnd}
      >
        {destination ? <a href={destination} className="absolute inset-0 block" aria-label={activeBanner.title || 'Ver promoción'}>{content}</a> : content}
        {banners.length > 1 && (
          <>
            <button type="button" onClick={() => goTo(activeIndex - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/60" aria-label="Banner anterior"><ChevronLeft size={20} /></button>
            <button type="button" onClick={() => goTo(activeIndex + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/60" aria-label="Banner siguiente"><ChevronRight size={20} /></button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">{banners.map((banner, index) => <button key={banner.id} type="button" onClick={() => goTo(index)} className={`h-2.5 rounded-full transition ${index === activeIndex ? 'w-7 bg-white' : 'w-2.5 bg-white/60'}`} aria-label={`Mostrar banner ${index + 1}`} />)}</div>
          </>
        )}
      </div>
    </section>
  )
}
