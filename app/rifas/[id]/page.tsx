import { permanentRedirect } from 'next/navigation'

type LegacyRafflePageProps = {
  params: Promise<{ id: string }>
}

export default async function LegacyRafflePage({ params }: LegacyRafflePageProps) {
  const { id } = await params
  permanentRedirect(`/${id}`)
}
