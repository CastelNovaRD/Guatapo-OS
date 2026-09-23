import { requireTenantContext } from '@/lib/auth/tenant-context'
import {
  getStoreSettings,
  updateWebSettings,
} from '@/lib/repositories/store-settings-repository'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const settings = await getStoreSettings(
      await requireTenantContext(request)
    )

    if (!settings) {
      return Response.json(
        { error: 'Store not found.' },
        { status: 404 }
      )
    }

    return Response.json(settings.web_settings || {})
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Web settings are unavailable.',
      },
      { status: 503 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Invalid web settings.' },
        { status: 400 }
      )
    }

    const updated = await updateWebSettings(
      await requireTenantContext(request),
      body as Record<string, unknown>
    )

    return updated
      ? Response.json(updated.web_settings)
      : Response.json(
          { error: 'Store not found.' },
          { status: 404 }
        )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Web settings could not be saved.',
      },
      { status: 503 }
    )
  }
}