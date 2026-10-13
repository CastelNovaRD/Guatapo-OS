import type { Metadata } from 'next'

export const PUBLIC_STORE_URL = 'https://guatapo.com'

const PUBLIC_HOSTS = new Set(['guatapo.com', 'www.guatapo.com'])

export function isPublicStoreHost(host: string | null | undefined) {
  return PUBLIC_HOSTS.has((host || '').toLowerCase().trim().replace(/:\d+$/, ''))
}

export function noIndexMetadata(title = 'Guatapo OS'): Metadata {
  return {
    metadataBase: new URL(PUBLIC_STORE_URL),
    title,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  }
}

export function publicStoreMetadata(): Metadata {
  const title = 'Guatapo | Tecnología, accesorios y más'
  const description = 'Tienda de tecnología, celulares, laptops, accesorios y más. Compra productos tecnológicos y participa en promociones y rifas de Guatapo.'
  const image = `${PUBLIC_STORE_URL}/logo-guatapo-transparent.png`

  return {
    title,
    description,
    alternates: { canonical: PUBLIC_STORE_URL },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'es_DO',
      url: PUBLIC_STORE_URL,
      siteName: 'Guatapo',
      title,
      description,
      images: [{ url: image, alt: 'Guatapo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
