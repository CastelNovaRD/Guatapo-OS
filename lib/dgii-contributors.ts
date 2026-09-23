export type DgiiContributor = { document: string; registeredName: string; taxpayerType: string | null }
export type DgiiLookupResult = { status: 'found'; contributor: DgiiContributor } | { status: 'not_found' } | { status: 'unavailable' }
const digits = (value: string) => value.replace(/\D/g, '')

/** Browser adapter for ShopDesk's API. It never accesses a database directly. */
export async function lookupDgiiContributor(document: string): Promise<DgiiLookupResult> {
  const cleanDocument = digits(document)
  if (!cleanDocument) return { status: 'not_found' }

  try {
    const response = await fetch(`/api/dgii/${encodeURIComponent(cleanDocument)}`)
    const payload = await response.json() as {
      status?: string
      contributor?: DgiiContributor
    }

    if (response.ok && payload.status === 'found' && payload.contributor) {
      return { status: 'found', contributor: payload.contributor }
    }
    return payload.status === 'not_found' ? { status: 'not_found' } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}
