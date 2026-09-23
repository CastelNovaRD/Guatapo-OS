import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import type { TenantContext } from '@/lib/auth/tenant-context'

export const CATALOG_BRANDING_ASSET_KINDS = ['logo', 'banner'] as const
export type CatalogBrandingAssetKind = (typeof CATALOG_BRANDING_ASSET_KINDS)[number]

const extensionsByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const defaultMaxBytes = 5 * 1024 * 1024

type BrandingScope = Pick<TenantContext, 'organizationId' | 'installationId' | 'storeId'>

function root() {
  const value = process.env.CASTELNOVA_STORAGE_ROOT
  if (!value) throw new Error('CASTELNOVA_STORAGE_ROOT is not configured.')
  return resolve(value)
}

function safeSegment(value: string, label: string) {
  if (!/^[A-Za-z0-9-]+$/.test(value)) throw new Error(`${label} is invalid.`)
  return value
}

function ensureWithin(base: string, target: string) {
  const relation = relative(base, target)
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`)) {
    throw new Error('Storage path escapes the configured root.')
  }
}

function isKind(value: string): value is CatalogBrandingAssetKind {
  return (CATALOG_BRANDING_ASSET_KINDS as readonly string[]).includes(value)
}

function detectMimeType(bytes: Uint8Array) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return null
}

export function getMaxCatalogBrandingAssetBytes() {
  const configured = Number(process.env.CASTELNOVA_CATALOG_BRANDING_MAX_BYTES)
  return Number.isInteger(configured) && configured > 0 ? configured : defaultMaxBytes
}

export function validateCatalogBrandingImage(bytes: Uint8Array, mimeType: string) {
  if (!bytes.byteLength || bytes.byteLength > getMaxCatalogBrandingAssetBytes()) return null
  const detected = detectMimeType(bytes)
  return detected && detected === mimeType ? detected : null
}

function assetDirectory(context: BrandingScope, kind: CatalogBrandingAssetKind) {
  const storageRoot = root()
  const directory = resolve(
    storageRoot,
    'catalog-branding',
    safeSegment(context.organizationId, 'organizationId'),
    safeSegment(context.installationId, 'installationId'),
    safeSegment(context.storeId, 'storeId'),
    kind
  )
  ensureWithin(storageRoot, directory)
  return { storageRoot, directory }
}

function safeFilename(value: string) {
  if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(value)) throw new Error('Branding asset is invalid.')
  return value
}

export async function uploadCatalogBrandingAsset(
  context: BrandingScope,
  kind: CatalogBrandingAssetKind,
  input: { mimeType: string; bytes: Uint8Array }
) {
  if (!isKind(kind)) throw new Error('Unsupported branding asset.')
  const mimeType = validateCatalogBrandingImage(input.bytes, input.mimeType)
  if (!mimeType) throw new Error('Invalid catalog branding image.')

  const { storageRoot, directory } = assetDirectory(context, kind)
  const filename = `${randomUUID()}.${extensionsByMimeType[mimeType]}`
  const filePath = resolve(directory, filename)
  ensureWithin(storageRoot, filePath)
  await mkdir(directory, { recursive: true })
  await writeFile(filePath, input.bytes, { flag: 'wx' })
  return { filename, mimeType }
}

export async function readCatalogBrandingAsset(
  context: BrandingScope,
  kind: CatalogBrandingAssetKind,
  filename: string
) {
  if (!isKind(kind)) throw new Error('Unsupported branding asset.')
  const { storageRoot, directory } = assetDirectory(context, kind)
  const safeName = safeFilename(filename)
  const filePath = resolve(directory, safeName)
  ensureWithin(storageRoot, filePath)
  const bytes = await readFile(filePath)
  const mimeType = detectMimeType(bytes)
  if (!mimeType) throw new Error('Stored branding asset is invalid.')
  return { bytes, mimeType }
}

export async function removeCatalogBrandingAsset(
  context: BrandingScope,
  kind: CatalogBrandingAssetKind,
  filename: string
) {
  const { storageRoot, directory } = assetDirectory(context, kind)
  const filePath = resolve(directory, safeFilename(filename))
  ensureWithin(storageRoot, filePath)
  await unlink(filePath)
}

export function catalogBrandingPublicUrl(storeSlug: string, kind: CatalogBrandingAssetKind, filename: string) {
  return `/api/public/catalog-branding/${encodeURIComponent(storeSlug)}/${kind}/${encodeURIComponent(filename)}`
}

export function parseCatalogBrandingPublicUrl(value: string | undefined, storeSlug: string, kind: CatalogBrandingAssetKind) {
  if (!value) return null
  const match = value.match(/^\/api\/public\/catalog-branding\/([^/]+)\/(logo|banner)\/([0-9a-f-]+\.(?:jpg|png|webp))$/i)
  if (!match || decodeURIComponent(match[1]) !== storeSlug || match[2] !== kind) return null
  return match[3]
}
