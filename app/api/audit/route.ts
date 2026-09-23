import { requireTenantContext } from '@/lib/auth/tenant-context'
import { query } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const context = await requireTenantContext(request)

    const result = await query(
      `select
        id,
        created_at,
        module,
        action,
        detail,
        metadata
      from audit_logs
      where organization_id = $1
        and installation_id = $2
        and store_id = $3
      order by created_at desc
      limit 250`,
      [
        context.organizationId,
        context.installationId,
        context.storeId,
      ]
    )

    const logs = result.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      user_name: null,
      user_email: null,
      module: row.module,
      action: row.action,
      entity_type: null,
      entity_id: null,
      summary: row.detail,
      metadata: row.metadata,
    }))

    return Response.json(logs)
  } catch (error) {
    console.error('[Audit] Error cargando auditoría:', error)

    return Response.json(
      { error: 'Audit logs could not be loaded.' },
      { status: 503 }
    )
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
        { error: 'Invalid JSON body.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      )
    }

    const input = body as Record<string, unknown>

    const module =
      typeof input.module === 'string' ? input.module.trim() : ''

    const action =
      typeof input.action === 'string' ? input.action.trim() : ''

    const detail =
      typeof input.detail === 'string' && input.detail.trim()
        ? input.detail.trim()
        : null

    const metadata =
      input.metadata &&
      typeof input.metadata === 'object' &&
      !Array.isArray(input.metadata)
        ? input.metadata
        : {}

    if (!module || !action) {
      return Response.json(
        { error: 'module and action are required.' },
        { status: 400 }
      )
    }

    await query(
      `insert into audit_logs (
        organization_id,
        installation_id,
        store_id,
        user_id,
        module,
        action,
        detail,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        context.organizationId,
        context.installationId,
        context.storeId,
        context.userId,
        module,
        action,
        detail,
        JSON.stringify(metadata),
      ]
    )

    return Response.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('[Audit] Error registrando auditoría:', error)

    return Response.json(
      { error: 'Audit log could not be created.' },
      { status: 503 }
    )
  }
}