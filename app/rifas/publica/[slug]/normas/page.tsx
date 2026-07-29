import { permanentRedirect } from 'next/navigation'

type LegacyPublicRaffleTermsPageProps = {
  params: Promise<{ slug: string }>
}

export default async function LegacyPublicRaffleTermsPage({ params }: LegacyPublicRaffleTermsPageProps) {
  const { slug } = await params
  permanentRedirect(`/${slug}/normas`)
}
