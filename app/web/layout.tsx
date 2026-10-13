import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { isPublicStoreHost, noIndexMetadata, publicStoreMetadata } from '@/lib/public-seo'

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')

  return isPublicStoreHost(host) ? publicStoreMetadata() : noIndexMetadata()
}

export default function WebLayout({ children }: { children: React.ReactNode }) {
  return children
}
