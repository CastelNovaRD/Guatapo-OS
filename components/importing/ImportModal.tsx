
'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, FileSpreadsheet, Upload, X } from 'lucide-react'
import type { ImportMode, ImportPreview, ImportPreviewRow } from '@/lib/importing/excel-import'
import { downloadImportResult } from '@/lib/importing/excel-import'

type Props<T> = {
  open: boolean
  title: string
  templateName: string
  preview: ImportPreview<T> | null
  loading: boolean
  committing: boolean
  mode: ImportMode
  allowBlankClear: boolean
  onModeChange: (mode: ImportMode) => void
  onAllowBlankClearChange: (value: boolean) => void
  onFile: (file: File) => void
  onConfirm: () => void
  onClose: () => void
  onDownloadTemplate: () => void
  extraOptions?: ReactNode
  description?: string
  helpText?: string
  result?: { created: number; updated: number; omitted: number; errors: number } | null
}

const labels: Record<string, string> = { new: 'Nuevo', update: 'Actualizar', duplicate: 'Duplicado', skip: 'Omitido', warning: 'Advertencia', error: 'Error' }
const colors: Record<string, string> = { new: 'bg-emerald-50 text-emerald-700', update: 'bg-blue-50 text-blue-700', duplicate: 'bg-amber-50 text-amber-700', skip: 'bg-zinc-100 text-zinc-600', warning: 'bg-amber-50 text-amber-700', error: 'bg-red-50 text-red-700' }

export default function ImportModal<T>({ open, title, templateName, preview, loading, committing, mode, allowBlankClear, onModeChange, onAllowBlankClearChange, onFile, onConfirm, onClose, onDownloadTemplate, extraOptions, description, helpText, result }: Props<T>) {
  const [fileKey, setFileKey] = useState(0)
  const summary = useMemo(() => {
    const rows = preview?.rows || []
    return {
      total: rows.length,
      news: rows.filter((row) => row.action === 'new').length,
      updates: rows.filter((row) => row.action === 'update').length,
      duplicates: rows.filter((row) => row.action === 'duplicate').length,
      warnings: rows.filter((row) => row.warnings.length).length,
      errors: rows.filter((row) => row.action === 'error').length,
      skipped: rows.filter((row) => row.action === 'skip').length,
    }
  }, [preview])
  if (!open) return null
  const canConfirm = Boolean(preview && !preview.criticalError && summary.total > 0 && summary.news + summary.updates > 0 && !committing)
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
    <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h2 className="text-3xl font-black">{title}</h2><p className="text-zinc-500">{description || 'Importa datos usando una plantilla compatible del sistema.'}</p>{helpText && <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{helpText}</p>}</div>
        <button onClick={onClose} className="rounded-full border p-2"><X /></button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="space-y-4 rounded-2xl border p-4">
          <label className="block text-sm font-black">Modo de importación</label>
          <select value={mode} onChange={(e) => onModeChange(e.target.value as ImportMode)} className="w-full rounded-xl border px-4 py-3">
            <option value="create">Crear solamente nuevos</option>
            <option value="upsert">Actualizar existentes y crear nuevos</option>
            <option value="update">Solo actualizar existentes</option>
          </select>
          <label className="flex items-start gap-2 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={allowBlankClear} onChange={(e) => onAllowBlankClearChange(e.target.checked)} /> Permitir borrar valores con celdas vacías</label>
          {extraOptions}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-6 text-center font-black text-emerald-700">
            <Upload /> Seleccionar archivo .xlsx
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); setFileKey((v) => v + 1) }} />
          </label>
          <button onClick={onDownloadTemplate} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 font-black"><FileSpreadsheet size={18} /> Descargar plantilla</button>
          <button disabled={!canConfirm} onClick={onConfirm} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-50">{committing ? 'Procesando...' : 'Confirmar importación'}</button>
          {preview && <button onClick={() => void downloadImportResult(`resultado-${templateName}.xlsx`, preview.rows as ImportPreviewRow[])} className="w-full rounded-xl border px-4 py-3 font-black">Descargar resultado</button>}
        </section>
        <section className="min-h-[420px] rounded-2xl border p-4">
          {loading ? <p className="font-bold text-zinc-500">Leyendo archivo...</p> : preview?.criticalError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700"><AlertTriangle className="mb-2" />{preview.criticalError}</div> : preview ? <>
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">{[
              ['Filas', summary.total], ['Nuevos', summary.news], ['Actualizar', summary.updates], ['Duplicados', summary.duplicates], ['Advertencias', summary.warnings], ['Errores', summary.errors], ['Omitidos', summary.skipped],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-zinc-50 p-3"><p className="text-xs font-bold text-zinc-500">{label}</p><p className="text-2xl font-black">{value}</p></div>)}</div>
            {result && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800">Resultado: {result.created} creados, {result.updated} actualizados, {result.omitted} omitidos, {result.errors} errores.</div>}
            <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-zinc-950 text-white"><tr><th className="p-3">Fila</th><th className="p-3">Clave</th><th className="p-3">Acción</th><th className="p-3">Validación</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber} className="border-t"><td className="p-3 font-bold">{row.rowNumber}</td><td className="p-3">{row.key}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${colors[row.action] || 'bg-zinc-100'}`}>{labels[row.action] || row.action}</span></td><td className="p-3 text-zinc-600">{[...row.errors, ...row.warnings, row.message].filter(Boolean).join(' | ')}</td></tr>)}</tbody></table></div>
          </> : <div className="flex h-full min-h-[360px] items-center justify-center text-center text-zinc-500"><div><FileSpreadsheet className="mx-auto mb-3" size={42}/><p className="font-bold">Selecciona un Excel para ver la vista previa antes de guardar.</p></div></div>}
        </section>
      </div>
    </div>
  </div>
}
