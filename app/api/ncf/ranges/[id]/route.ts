import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  deleteNcfRange,
  getNcfRangeById,
  setNcfRangeActive,
  updateNcfRange,
  type NcfRangeInput,
} from '@/lib/repositories/ncf-repository'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

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
  console.error('[NCF RANGE]', error)

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

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params

    const range = await getNcfRangeById(context, id)

    return range
      ? Response.json(range)
      : Response.json(
          { error: 'Rango de comprobantes no encontrado.' },
          { status: 404 }
        )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params

    let body: unknown

    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'El cuerpo de la solicitud no contiene JSON válido.' },
        { status: 400 }
      )
    }

    // Cambio rápido únicamente de activo/inactivo.
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      const raw = body as Record<string, unknown>
      const fields = Object.keys(raw)

      if (
        fields.length === 1 &&
        typeof raw.active === 'boolean'
      ) {
        const range = await setNcfRangeActive(
          context,
          id,
          raw.active
        )

        return range
          ? Response.json(range)
          : Response.json(
              { error: 'Rango de comprobantes no encontrado.' },
              { status: 404 }
            )
      }
    }

    const input = parseInput(body)

    if (!input) {
      return Response.json(
        { error: 'Los datos del rango de comprobantes no son válidos.' },
        { status: 400 }
      )
    }

    const range = await updateNcfRange(context, id, input)

    return range
      ? Response.json(range)
      : Response.json(
          { error: 'Rango de comprobantes no encontrado.' },
          { status: 404 }
        )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext
) {
  try {
    const context = await requireTenantContext(request)
    const { id } = await params

    const existing = await getNcfRangeById(context, id)

    if (!existing) {
      return Response.json(
        { error: 'Rango de comprobantes no encontrado.' },
        { status: 404 }
      )
    }

    /*
     * Un rango que ya consumió numeración no debe borrarse.
     * Se conserva para mantener trazabilidad fiscal.
     */
    if (Number(existing.next_number) > Number(existing.range_start)) {
      return Response.json(
        {
          error:
            'Este rango ya utilizó comprobantes y no puede eliminarse. Desactívalo para conservar el historial.',
        },
        { status: 409 }
      )
    }

    const deleted = await deleteNcfRange(context, id)

    return deleted
      ? Response.json({ ok: true, id: deleted.id })
      : Response.json(
          { error: 'Rango de comprobantes no encontrado.' },
          { status: 404 }
        )
  } catch (error) {
    return errorResponse(error)
  }
}