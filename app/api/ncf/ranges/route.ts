import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  createNcfRange,
  listNcfRanges,
  type NcfRangeInput,
} from '@/lib/repositories/ncf-repository'

export const runtime = 'nodejs'

const RECEIPT_TYPES = new Set([
  'B01',
  'B02',
  'B14',
  'B15',
  'E31',
  'E32',
  'E44',
  'E45',
])

function errorResponse(error: unknown) {
  console.error('[NCF RANGES]', error)

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el rango de comprobantes.',
    },
    { status: 503 }
  )
}

function parseInput(value: unknown): NcfRangeInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const body = value as Record<string, unknown>

  const receiptType =
    typeof body.receipt_type === 'string'
      ? body.receipt_type.trim().toUpperCase()
      : ''

  const prefix =
    typeof body.prefix === 'string'
      ? body.prefix.trim().toUpperCase()
      : ''

  const rangeStart = Number(body.range_start)
  const rangeEnd = Number(body.range_end)

  const nextNumber =
    body.next_number === undefined || body.next_number === null
      ? rangeStart
      : Number(body.next_number)

  const expiresAt =
    typeof body.expires_at === 'string' && body.expires_at.trim()
      ? body.expires_at.trim()
      : null

  const active =
    body.active === undefined ? true : body.active

  if (!RECEIPT_TYPES.has(receiptType)) return null
  if (!prefix) return null

  if (
    !Number.isSafeInteger(rangeStart) ||
    !Number.isSafeInteger(rangeEnd) ||
    !Number.isSafeInteger(nextNumber)
  ) {
    return null
  }

  if (
    rangeStart < 0 ||
    rangeEnd < rangeStart ||
    nextNumber < rangeStart ||
    nextNumber > rangeEnd + 1
  ) {
    return null
  }

  if (typeof active !== 'boolean') return null

  if (
    expiresAt !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)
  ) {
    return null
  }

  return {
    receipt_type: receiptType,
    prefix,
    range_start: rangeStart,
    range_end: rangeEnd,
    next_number: nextNumber,
    expires_at: expiresAt,
    active,
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)
    const ranges = await listNcfRanges(context)

    return Response.json(ranges)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireTenantContext(request)

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'El cuerpo de la solicitud no contiene JSON válido.' },
        { status: 400 }
      )
    }

    const input = parseInput(body)

    if (!input) {
      return Response.json(
        { error: 'Los datos del rango de comprobantes no son válidos.' },
        { status: 400 }
      )
    }

    const range = await createNcfRange(context, input)

    return Response.json(range, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}