type AuditPayload = {
  storeId?: string | null
  module: string
  action: string
  entityType?: string | null
  entityId?: string | null
  summary?: string | null
  beforeData?: unknown
  afterData?: unknown
  metadata?: Record<string, unknown> | null
}

export async function logAudit(payload: AuditPayload) {
  try {
    const metadata: Record<string, unknown> = {
      ...(payload.metadata || {}),
    }

    if (payload.entityType) {
      metadata.entityType = payload.entityType
    }

    if (payload.entityId) {
      metadata.entityId = payload.entityId
    }

    if (payload.beforeData !== undefined) {
      metadata.beforeData = payload.beforeData
    }

    if (payload.afterData !== undefined) {
      metadata.afterData = payload.afterData
    }

    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        module: payload.module,
        action: payload.action,
        detail: payload.summary || null,
        metadata,
      }),
    })

    if (!response.ok) {
      console.warn(
        'No se pudo registrar auditoría:',
        `HTTP ${response.status}`
      )
    }
  } catch (error) {
    console.warn('No se pudo registrar auditoría:', error)
  }
}