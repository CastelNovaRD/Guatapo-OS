'use client'

import { type ReactNode } from 'react'
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react'
import type { ExportFormat } from '@/lib/export/export-types'

type ExportModalProps = {
  open: boolean
  title: string
  format: ExportFormat
  onFormatChange: (format: ExportFormat) => void
  onClose: () => void
  onExport: () => void | Promise<void>
  children: ReactNode
}

export default function ExportModal({ open, title, format, onFormatChange, onClose, onExport, children }: ExportModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5">
          <div>
            <h2 className="text-2xl font-black text-zinc-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-500">Selecciona el formato y los filtros de esta exportación.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-500">Formato</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onFormatChange('excel')}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left font-black transition ${format === 'excel' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'}`}
              >
                <FileSpreadsheet size={20} /> Excel
              </button>
              <button
                type="button"
                onClick={() => onFormatChange('pdf')}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left font-black transition ${format === 'pdf' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'}`}
              >
                <FileText size={20} /> PDF
              </button>
            </div>
          </div>

          {children}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 bg-zinc-50 p-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-black text-zinc-700 hover:bg-zinc-100">Cancelar</button>
          <button type="button" onClick={onExport} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-700">
            <Download size={18} /> Exportar
          </button>
        </div>
      </div>
    </div>
  )
}
