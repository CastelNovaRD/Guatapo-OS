import type { TenantContext } from '@/lib/auth/tenant-context'
import { findDgiiContributorByDocument, type DgiiContributorRecord } from '@/lib/repositories/dgii-contributors-repository'

const digitsOnly = (value: string) => value.replace(/\D/g, '')

export async function lookupDgiiContributor(
  tenant: TenantContext,
  document: string,
): Promise<DgiiContributorRecord | null> {
  const normalizedDocument = digitsOnly(document)
  if (!normalizedDocument) return null
  return findDgiiContributorByDocument(tenant, normalizedDocument)
}

