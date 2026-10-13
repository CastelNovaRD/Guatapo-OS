import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import { PUBLIC_STORE_URL } from '@/lib/public-seo'

type PublicRaffleMetadataRow = {
  id: string
  slug: string
  public_title: string
  promotional_title: string | null
  description: string | null
  detailed_description: string | null
}

function cleanText(value: string | null | undefined, maxLength: number) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function raffleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getPublicRaffleMetadata(slug: string): Promise<Metadata> {
  const fallbackTitle = 'Rifas Guatapo'
  const fallbackDescription = 'Participa en las rifas y promociones oficiales de Guatapo.'
  const client = raffleClient()
  if (!client || !slug) return { title: fallbackTitle, description: fallbackDescription }

  const { data } = await client
    .from('raffles')
    .select('id, slug, public_title, promotional_title, description, detailed_description')
    .eq('slug', slug)
    .in('status', ['active', 'paused', 'finished'])
    .maybeSingle()

  if (!data) return { title: fallbackTitle, description: fallbackDescription }

  const raffle = data as PublicRaffleMetadataRow
  const raffleName = cleanText(raffle.promotional_title || raffle.public_title, 110) || fallbackTitle
  const prize = cleanText(raffle.public_title, 110)
  const details = cleanText(raffle.description || raffle.detailed_description, 130)
  const description = cleanText(`Participa en la rifa ${raffleName} de Guatapo.${prize ? ` Premio: ${prize}.` : ''}${details ? ` ${details}` : ''}`, 300)
  const canonical = `${PUBLIC_STORE_URL}/${encodeURIComponent(raffle.slug)}`
  const uploads = await client
    .from('raffle_uploads')
    .select('file_url')
    .eq('raffle_id', raffle.id)
    .order('is_primary', { ascending: false })
    .order('sort_order')
    .limit(1)
  const image = uploads.data?.[0]?.file_url || `${PUBLIC_STORE_URL}/logo-guatapo-transparent.png`
  const title = `${raffleName} | Rifas Guatapo`

  return {
    metadataBase: new URL(PUBLIC_STORE_URL),
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'es_DO',
      url: canonical,
      siteName: 'Guatapo',
      title,
      description,
      images: [{ url: image, alt: prize || raffleName }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}
