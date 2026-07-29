import { permanentRedirect } from 'next/navigation'

type LegacyRaffleTermsPageProps = {
  params: Promise<{ id: string }>
}

export default async function LegacyRaffleTermsPage({ params }: LegacyRaffleTermsPageProps) {
  const { id } = await params
  permanentRedirect(`/${id}/normas`)
}
