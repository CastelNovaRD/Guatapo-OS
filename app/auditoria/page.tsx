'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { getCurrentStoreId } from '@/lib/store-context'
import { RefreshCw, Search, ShieldCheck } from 'lucide-react'

type AuditLog = {
  id: string
  created_at: string
  user_name: string | null
  user_email: string | null
  module: string
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')

    const storeId = await getCurrentStoreId()
    if (!storeId) {
      setLogs([])
      setLoading(false)
      setError('Este usuario no tiene una tienda asignada.')
      return
    }

    const { data, error: loadError } = await supabase
      .from('audit_logs')
      .select('id, created_at, user_name, user_email, module, action, entity_type, entity_id, summary, metadata')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(250)

    if (loadError) {
      setLogs([])
      setError(
        loadError.code === '42P01'
          ? 'La tabla de auditoría todavía no existe. Ejecuta outputs/supabase-auditoria-permisos.sql en Supabase.'
          : loadError.message
      )
      setLoading(false)
      return
    }

    setLogs((data || []) as AuditLog[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const modules = useMemo(() => Array.from(new Set(logs.map((log) => log.module))).sort(), [logs])
  const visibleLogs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesModule = moduleFilter ? log.module === moduleFilter : true
      const text = `${log.user_name || ''} ${log.user_email || ''} ${log.module} ${log.action} ${log.summary || ''} ${log.entity_id || ''}`.toLowerCase()
      return matchesModule && (!q || text.includes(q))
    })
  }, [logs, moduleFilter, search])

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <ShieldCheck className="text-emerald-500" />
            Auditoría
          </h1>
          <p className="text-zinc-500">Historial de acciones importantes dentro de la tienda.</p>
        </div>

        <button
          onClick={loadLogs}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-3 font-semibold hover:bg-zinc-100"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
          <label className="flex items-center gap-3 rounded-xl border border-zinc-300 px-4 py-3">
            <Search size={20} className="text-emerald-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar usuario, acción, módulo o referencia..."
              className="w-full bg-transparent outline-none"
            />
          </label>

          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-3 font-semibold outline-none focus:border-emerald-500"
          >
            <option value="">Todos los módulos</option>
            {modules.map((module) => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-800">
            {error}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="p-4">Fecha</th>
                <th className="p-4">Usuario</th>
                <th className="p-4">Módulo</th>
                <th className="p-4">Acción</th>
                <th className="p-4">Detalle</th>
                <th className="p-4">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-5 text-zinc-500" colSpan={6}>Cargando auditoría...</td></tr>
              ) : visibleLogs.length === 0 ? (
                <tr><td className="p-5 text-zinc-500" colSpan={6}>No hay registros para mostrar.</td></tr>
              ) : (
                visibleLogs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-100 align-top">
                    <td className="p-4 whitespace-nowrap text-sm font-semibold">{formatDateTime(log.created_at)}</td>
                    <td className="p-4">
                      <p className="font-bold">{log.user_name || 'Usuario'}</p>
                      <p className="text-xs text-zinc-500">{log.user_email || '-'}</p>
                    </td>
                    <td className="p-4 capitalize">{log.module}</td>
                    <td className="p-4 font-bold text-emerald-700">{log.action}</td>
                    <td className="p-4 text-sm text-zinc-700">{log.summary || '-'}</td>
                    <td className="p-4 text-xs text-zinc-500">
                      <p>{log.entity_type || '-'}</p>
                      <p>{log.entity_id || '-'}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}
