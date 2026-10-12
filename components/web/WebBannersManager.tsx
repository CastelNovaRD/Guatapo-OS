'use client'

import { useEffect, useState } from 'react'
import { Eye, ImageIcon, Plus, Save, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { uploadProductImageOrFallback } from '@/lib/image-upload'
import { emptyWebBanner, type WebBanner, type WebBannerDraft } from '@/lib/web-banners'

export default function WebBannersManager({ storeId }: { storeId: string }) {
  const [banners, setBanners] = useState<WebBanner[]>([])
  const [draft, setDraft] = useState<WebBannerDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadBanners() {
    setLoading(true)
    const { data, error } = await supabase
      .from('web_banners')
      .select('id, store_id, image_url, mobile_image_url, title, subtitle, link_url, button_text, display_order, is_active, created_at, updated_at')
      .eq('store_id', storeId)
      .order('display_order')
      .order('created_at')

    if (error) setMessage('No se pudieron cargar los banners. Ejecuta primero el SQL de web_banners.')
    else setBanners((data || []) as WebBanner[])
    setLoading(false)
  }

  useEffect(() => { void loadBanners() }, [storeId])

  function updateDraft(patch: Partial<WebBannerDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setMessage('')
  }

  async function uploadImage(file: File | undefined, field: 'image_url' | 'mobile_image_url') {
    if (!file) return
    setSaving(true)
    setMessage('Subiendo imagen...')
    try {
      const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg'
      const imageUrl = await uploadProductImageOrFallback(file, `web-banners/${storeId}/${crypto.randomUUID()}.${extension}`)
      updateDraft({ [field]: imageUrl })
      setMessage('Imagen lista para guardar el banner.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    } finally {
      setSaving(false)
    }
  }

  async function saveBanner() {
    if (!draft) return
    if (!draft.image_url?.trim()) {
      setMessage('Agrega una imagen desktop antes de guardar.')
      return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      image_url: draft.image_url.trim(),
      mobile_image_url: draft.mobile_image_url?.trim() || null,
      title: draft.title?.trim() || null,
      subtitle: draft.subtitle?.trim() || null,
      link_url: draft.link_url?.trim() || null,
      button_text: draft.button_text?.trim() || null,
      display_order: Math.max(0, Number(draft.display_order || 0)),
      is_active: Boolean(draft.is_active),
      updated_at: new Date().toISOString(),
    }

    const result = draft.id
      ? await supabase.from('web_banners').update(payload).eq('store_id', storeId).eq('id', draft.id)
      : await supabase.from('web_banners').insert({ ...payload, store_id: storeId })

    if (result.error) {
      setMessage(result.error.message)
      setSaving(false)
      return
    }

    setDraft(null)
    setMessage('Banner guardado correctamente.')
    setSaving(false)
    await loadBanners()
  }

  async function deactivateBanner(banner: WebBanner) {
    const { error } = await supabase
      .from('web_banners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('id', banner.id)

    if (error) setMessage(error.message)
    else {
      setMessage('Banner desactivado. Se conserva el registro para evitar pérdidas accidentales.')
      await loadBanners()
    }
  }

  if (loading) return <p className="rounded-2xl border border-zinc-200 bg-white p-5 font-semibold text-zinc-500">Cargando banners...</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div><h3 className="text-xl font-black text-zinc-950">Banners</h3><p className="mt-1 max-w-2xl text-sm font-semibold text-zinc-600">Se muestran en la parte superior de la tienda pública. Puedes desactivarlos sin borrar su historial.</p></div>
        <button type="button" onClick={() => { setDraft({ ...emptyWebBanner(), display_order: banners.length ? Math.max(...banners.map((banner) => banner.display_order)) + 1 : 0 }); setMessage('') }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700"><Plus size={18} /> Crear banner</button>
      </div>

      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</p>}

      {draft && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h4 className="text-lg font-black">{draft.id ? 'Editar banner' : 'Nuevo banner'}</h4><p className="text-sm font-semibold text-zinc-600">La imagen desktop es obligatoria; la móvil es opcional.</p></div><button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold">Cancelar</button></div>
          <div className="grid gap-4 md:grid-cols-2">
            <BannerImageField label="Imagen desktop *" value={draft.image_url || ''} onFile={(file) => void uploadImage(file, 'image_url')} />
            <BannerImageField label="Imagen móvil (opcional)" value={draft.mobile_image_url || ''} onFile={(file) => void uploadImage(file, 'mobile_image_url')} />
            <Field label="Título opcional" value={draft.title || ''} onChange={(value) => updateDraft({ title: value })} />
            <Field label="Texto del botón opcional" value={draft.button_text || ''} onChange={(value) => updateDraft({ button_text: value })} />
            <Field label="Enlace opcional" value={draft.link_url || ''} placeholder="/web?category=Celulares o https://..." onChange={(value) => updateDraft({ link_url: value })} />
            <Field label="Orden / prioridad" value={String(draft.display_order ?? 0)} type="number" onChange={(value) => updateDraft({ display_order: Number(value) || 0 })} />
            <label className="md:col-span-2"><span className="mb-2 block text-sm font-bold text-zinc-700">Texto / subtítulo opcional</span><textarea value={draft.subtitle || ''} onChange={(event) => updateDraft({ subtitle: event.target.value })} rows={3} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" /></label>
            <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={Boolean(draft.is_active)} onChange={(event) => updateDraft({ is_active: event.target.checked })} className="h-4 w-4 accent-emerald-600" /> Activo en la tienda</label>
          </div>
          <button type="button" disabled={saving} onClick={() => void saveBanner()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-50"><Save size={18} /> {saving ? 'Guardando...' : 'Guardar banner'}</button>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {banners.map((banner) => <article key={banner.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"><div className="relative aspect-[16/7] bg-zinc-100">{banner.image_url ? <img src={banner.image_url} alt={banner.title || 'Banner'} className="h-full w-full object-cover" /> : <ImageIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-300" size={42} />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-zinc-950">{banner.title || 'Banner sin título'}</p><p className="mt-1 text-sm font-semibold text-zinc-500">Orden: {banner.display_order} · {banner.is_active ? 'Activo' : 'Inactivo'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${banner.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>{banner.is_active ? 'Activo' : 'Inactivo'}</span></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setDraft({ ...banner }); setMessage('') }} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-bold hover:bg-zinc-50"><Eye size={16} /> Editar</button>{banner.is_active && <button type="button" onClick={() => void deactivateBanner(banner)} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100">Desactivar</button>}</div></div></article>)}
      </div>
      {!banners.length && !draft && <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center font-semibold text-zinc-500">Aún no hay banners creados.</p>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: 'text' | 'number' }) {
  return <label><span className="mb-2 block text-sm font-bold text-zinc-700">{label}</span><input type={type} min={type === 'number' ? 0 : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-emerald-500" /></label>
}

function BannerImageField({ label, value, onFile }: { label: string; value: string; onFile: (file?: File) => void }) {
  return <div><span className="mb-2 block text-sm font-bold text-zinc-700">{label}</span><div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3"><div className="flex gap-3"><div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100">{value ? <img src={value} alt={label} className="h-full w-full object-cover" /> : <ImageIcon className="text-zinc-300" size={30} />}</div><label className="inline-flex cursor-pointer items-center gap-2 self-center rounded-xl bg-zinc-950 px-3 py-2 text-sm font-bold text-white"><Upload size={16} /> Subir<input type="file" accept="image/*" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} /></label></div></div></div>
}
