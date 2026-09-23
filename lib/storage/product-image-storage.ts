import 'server-only'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import type { TenantContext } from '@/lib/auth/tenant-context'

export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const extensionsByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const DEFAULT_MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024

export type ProductImageUpload = {
  productId: string
  filename: string
  mimeType: string
  bytes: Uint8Array
}

export type StoredProductImage = {
  storagePath: string
  publicPath: string
}

export type StoredProductImageFile = {
  bytes: Uint8Array
  mimeType: string
}

export interface ProductImageStorageProvider {
  upload(context: TenantContext, input: ProductImageUpload): Promise<StoredProductImage>
  remove(context: TenantContext, productId: string, storagePath: string): Promise<void>
}

export function getMaxProductImageBytes() {
  const configured = Number(process.env.CASTELNOVA_PRODUCT_IMAGE_MAX_BYTES)
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_PRODUCT_IMAGE_BYTES
}

function storageRoot() {
  const root = process.env.CASTELNOVA_STORAGE_ROOT
  if (!root) throw new Error('CASTELNOVA_STORAGE_ROOT is not configured.')
  return resolve(root)
}

function safeSegment(value: string, label: string) {
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`)
  }
  return value
}

function ensureWithin(root: string, target: string) {
  const relation = relative(root, target)
  if (relation === '' || relation.startsWith(`..${sep}`) || relation === '..') {
    throw new Error('Storage path escapes the configured root.')
  }
}

function resolvePublicProductImagePath(publicPath: string) {
  const segments = publicPath.split('/').filter(Boolean)
  const [namespace, organizationId, installationId, storeId, productId, filename] = segments
  if (
    segments.length !== 6 ||
    namespace !== 'product-images' ||
    !organizationId ||
    !installationId ||
    !storeId ||
    !productId ||
    !filename ||
    !/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(filename)
  ) {
    throw new Error('Unsupported product image path.')
  }

  const root = storageRoot()
  const path = resolve(
    root,
    namespace,
    safeSegment(organizationId, 'organizationId'),
    safeSegment(installationId, 'installationId'),
    safeSegment(storeId, 'storeId'),
    safeSegment(productId, 'productId'),
    filename
  )
  ensureWithin(root, path)
  return path
}

export async function readStoredProductImage(publicPath: string): Promise<StoredProductImageFile> {
  const filePath = resolvePublicProductImagePath(publicPath)
  const bytes = await readFile(filePath)
  const extension = filePath.split('.').pop()?.toLowerCase()
  const mimeType = extension === 'png'
    ? 'image/png'
    : extension === 'webp'
      ? 'image/webp'
      : 'image/jpeg'

  return { bytes, mimeType }
}

/**
 * Server-only local filesystem provider. It stores no database metadata and
 * intentionally leaves HTTP exposure of files to a future delivery layer.
 */
export class LocalFilesystemProductImageStorage implements ProductImageStorageProvider {
  async upload(context: TenantContext, input: ProductImageUpload): Promise<StoredProductImage> {
    if (!ALLOWED_PRODUCT_IMAGE_MIME_TYPES.has(input.mimeType)) {
      throw new Error('Unsupported product image MIME type.')
    }

    if (!input.bytes.byteLength || input.bytes.byteLength > getMaxProductImageBytes()) {
      throw new Error('Product image size is invalid.')
    }

    // The original filename is received for future observability only; a server-generated
    // filename prevents traversal and accidental overwrites.
    void input.filename

    const segments = [
      'product-images',
      safeSegment(context.organizationId, 'organizationId'),
      safeSegment(context.installationId, 'installationId'),
      safeSegment(context.storeId, 'storeId'),
      safeSegment(input.productId, 'productId'),
    ]
    const root = storageRoot()
    const directory = resolve(root, ...segments)
    ensureWithin(root, directory)

    const extension = extensionsByMimeType[input.mimeType]
    const generatedName = `${randomUUID()}.${extension}`
    const filePath = resolve(directory, generatedName)
    ensureWithin(root, filePath)

    await mkdir(directory, { recursive: true })
    await writeFile(filePath, input.bytes, { flag: 'wx' })

    return {
      storagePath: filePath,
      publicPath: `/${join(...segments, generatedName).replaceAll('\\', '/')}`,
    }
  }

  async remove(context: TenantContext, productId: string, storagePath: string): Promise<void> {
    const root = storageRoot()
    const expectedDirectory = resolve(
      root,
      'product-images',
      safeSegment(context.organizationId, 'organizationId'),
      safeSegment(context.installationId, 'installationId'),
      safeSegment(context.storeId, 'storeId'),
      safeSegment(productId, 'productId')
    )
    const target = resolve(storagePath)

    ensureWithin(root, target)
    ensureWithin(expectedDirectory, target)
    await unlink(target)
  }
}
