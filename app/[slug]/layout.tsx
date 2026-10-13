import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPublicRaffleMetadata } from '@/lib/public-raffle-metadata'
import { isPublicStoreHost, noIndexMetadata } from '@/lib/public-seo'

type PublicRaffleLayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PublicRaffleLayoutProps): Promise<Metadata> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
  if (!isPublicStoreHost(host)) return noIndexMetadata()

  const { slug } = await params
  return getPublicRaffleMetadata(slug)
}

export default function PublicRaffleLayout({ children }: PublicRaffleLayoutProps) {
  return children
}
