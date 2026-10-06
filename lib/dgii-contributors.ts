import { supabase } from '@/lib/supabase'

export type DgiiContributor = { document: string; registeredName: string }
export type DgiiLookupResult = { status: 'found'; contributor: DgiiContributor } | { status: 'not_found' } | { status: 'unavailable' }
const digits = (value: string) => value.replace(/\D/g, '')

/** Queries Guatapo's own local DGII catalogue. */
export async function lookupDgiiContributor(document: string): Promise<DgiiLookupResult> {
  const cleanDocument = digits(document)
  if (!cleanDocument) return { status: 'not_found' }

  const { data, error } = await supabase
    .from('dgii_contributors')
    .select('document, registered_name')
    .eq('document', cleanDocument)
    .maybeSingle()

  if (error) return { status: 'unavailable' }
  if (!data) return { status: 'not_found' }

  return {
    status: 'found',
    contributor: {
      document: data.document,
      registeredName: data.registered_name,
    },
  }
}
