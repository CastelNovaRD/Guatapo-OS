import { permanentRedirect } from 'next/navigation'

type LegacyPublicRafflePageProps = {
  params: Promise<{ slug: string }>
}

export default async function LegacyPublicRafflePage({ params }: LegacyPublicRafflePageProps) {
  const { slug } = await params
  permanentRedirect(`/${slug}`)
}
