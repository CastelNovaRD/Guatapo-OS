import { supabase } from '@/lib/supabase'

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

let auditDisabled = false

export async function logAudit(payload: AuditPayload) {
  if (auditDisabled || !payload.storeId) return

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    const { data: profile } = user?.id
      ? await supabase
          .from('app_profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
      : { data: null as { full_name?: string } | null }

    const { error } = await supabase.from('audit_logs').insert({
      store_id: payload.storeId,
      user_id: user?.id || null,
      user_name: profile?.full_name || user?.email || null,
      user_email: user?.email || null,
      module: payload.module,
      action: payload.action,
      entity_type: payload.entityType || null,
      entity_id: payload.entityId || null,
      summary: payload.summary || null,
      before_data: payload.beforeData ?? null,
      after_data: payload.afterData ?? null,
      metadata: payload.metadata || null,
    })

    if (error) {
      auditDisabled = error.code === '42P01' || error.code === '42703'
      if (!auditDisabled) console.warn('No se pudo registrar auditoría:', error.message)
    }
  } catch (error) {
    console.warn('No se pudo registrar auditoría:', error)
  }
}
