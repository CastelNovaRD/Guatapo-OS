'use client'

import { useEffect, useState, type ReactNode } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'
import { DEFAULT_WEB_SETTINGS, WebBenefit, WebPromotion, WebScheduleGroup, WebSettings, formatScheduleRange, getScheduleRows, normalizeWebSettings, readLocalWebSettings, saveLocalWebSettings } from '@/lib/web-settings'
import { WEB_CATEGORY_ICON_OPTIONS, renderWebCategoryIcon } from '@/components/web/WebStoreLayout'
import { BadgePercent, CheckCircle, Code2, Eye, Globe, GripVertical, ImageIcon, LayoutTemplate, LinkIcon, Megaphone, Monitor, Package, Palette, Plus, Save, Search, Settings, Share2, ShieldCheck, ShoppingBag, Smartphone, Sparkles, Tablet, Tags, Trash2, Upload } from 'lucide-react'

type StoreRow = { id: string; name: string; slug: string | null; phone: string | null; whatsapp: string | null }
type StoreCategory = { id: string; name: string }
type ProductStats = { total: number; visibleNormal: number; visibleCoop: number; featured: number; discounted: number }
type TabId = 'general' | 'appearance' | 'hero' | 'promotions' | 'products' | 'categories' | 'benefits' | 'social' | 'colors' | 'seo' | 'advanced'
type PreviewMode = 'desktop' | 'tablet' | 'mobile'


function orderCategoryList(categories: StoreCategory[], order: string[] = []) {
  const clean = Array.from(new Map(categories.map((category) => [category.name, category])).values())
  const ordered = order.map((name) => clean.find((category) => category.name === name)).filter(Boolean) as StoreCategory[]
  const rest = clean.filter((category) => !ordered.some((item) => item.name === category.name))
  return [...ordered, ...rest]
}
const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'general', label: 'General', icon: <Settings size={18} /> },
  { id: 'appearance', label: 'Apariencia', icon: <LayoutTemplate size={18} /> },
  { id: 'hero', label: 'Banner Principal', icon: <ImageIcon size={18} /> },
  { id: 'promotions', label: 'Promociones', icon: <Megaphone size={18} /> },
  { id: 'products', label: 'Productos', icon: <Package size={18} /> },
  { id: 'categories', label: 'Categorias', icon: <Tags size={18} /> },
  { id: 'benefits', label: 'Beneficios', icon: <ShieldCheck size={18} /> },
  { id: 'social', label: 'Redes Sociales', icon: <Share2 size={18} /> },
  { id: 'colors', label: 'Colores', icon: <Palette size={18} /> },
  { id: 'seo', label: 'SEO', icon: <Search size={18} /> },
  { id: 'advanced', label: 'Avanzado', icon: <Code2 size={18} /> },
]

export default function WebSettingsPage() {
  const [store, setStore] = useState<StoreRow | null>(null)
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([])
  const [settings, setSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS)
  const [stats, setStats] = useState<ProductStats>({ total: 0, visibleNormal: 0, visibleCoop: 0, featured: 0, discounted: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveMode, setSaveMode] = useState<'local' | 'supabase'>('local')
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [baseUrl, setBaseUrl] = useState('')
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)

  useEffect(() => { setBaseUrl(window.location.origin); void Promise.resolve().then(loadSettings) }, [])

  const publicUrl = `${baseUrl}/web`
  const coopUrl = `${baseUrl}/web/cooperativa`
  const orderedStoreCategories = orderCategoryList(storeCategories, settings.categoryOrder || [])

  async function loadSettings() {
    setLoading(true)
    const storeId = await getCurrentStoreId()
    if (!storeId) { setLoading(false); return alert('Este usuario no tiene una tienda asignada.') }
    const { data: storeData } = await supabase.from('stores').select('id, name, slug, phone, whatsapp').eq('id', storeId).maybeSingle()
    const { data: categoriesData } = await supabase.from('categories').select('id, name').eq('store_id', storeId).eq('active', true).order('name')
    if (storeData) setStore(storeData)
    setStoreCategories(categoriesData || [])
    let nextSettings = readLocalWebSettings(storeId)
    const storeWithWebSettings = await supabase.from('stores').select('web_settings').eq('id', storeId).maybeSingle()
    if (!storeWithWebSettings.error && storeWithWebSettings.data?.web_settings) {
      nextSettings = normalizeWebSettings(storeWithWebSettings.data.web_settings as Partial<WebSettings>)
      setSaveMode('supabase')
      saveLocalWebSettings(storeId, nextSettings)
    }
    if (storeData) nextSettings = normalizeWebSettings({ ...nextSettings, contactPhone: nextSettings.contactPhone || storeData.phone || DEFAULT_WEB_SETTINGS.contactPhone, whatsapp: nextSettings.whatsapp || storeData.whatsapp || DEFAULT_WEB_SETTINGS.whatsapp })
    setSettings(nextSettings)
    await loadProductStats(storeId)
    setLoading(false)
  }

  async function loadProductStats(storeId: string) {
    const { data } = await supabase.from('products').select('show_on_website, web_visibility, featured, specs').eq('store_id', storeId).eq('active', true)
    const rows = data || []
    setStats({
      total: rows.length,
      visibleNormal: rows.filter((product: any) => product.show_on_website !== false && ['normal', 'both'].includes(product.web_visibility)).length,
      visibleCoop: rows.filter((product: any) => ['coop', 'both'].includes(product.web_visibility)).length,
      featured: rows.filter((product: any) => product.featured).length,
      discounted: rows.filter((product: any) => Number(product.specs?.web_discount_percent || 0) > 0).length,
    })
  }

  function update<K extends keyof WebSettings>(field: K, value: WebSettings[K]) { setSettings((current) => normalizeWebSettings({ ...current, [field]: value })); setSaved(false) }
  function updatePromotion(id: string, patch: Partial<WebPromotion>) { update('promotions', settings.promotions.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  function addPromotion() { update('promotions', [...settings.promotions, { id: `promo-${Date.now()}`, eyebrow: 'Nueva promocion', title: 'Titulo de promocion', subtitle: 'Descripcion corta para la oferta.', button: 'Comprar', category: '', imageUrl: '', color: settings.primaryColor }]) }
  function removePromotion(id: string) { update('promotions', settings.promotions.filter((item) => item.id !== id)) }
  function updateBenefit(id: string, patch: Partial<WebBenefit>) { update('benefits', settings.benefits.map((item) => item.id === id ? { ...item, ...patch } : item)) }
  function addBenefit() { update('benefits', [...settings.benefits, { id: `benefit-${Date.now()}`, title: 'Nuevo beneficio', description: 'Describe el beneficio para tus clientes.', icon: 'sparkles' }]) }
  function removeBenefit(id: string) { update('benefits', settings.benefits.filter((item) => item.id !== id)) }
  function updateCategoryIcon(categoryName: string, icon: string) { update('categoryIcons', { ...(settings.categoryIcons || {}), [categoryName]: icon }) }
  function updateScheduleGroup(group: keyof WebSettings['schedule'], patch: Partial<WebScheduleGroup>) { update('schedule', { ...settings.schedule, [group]: { ...settings.schedule[group], ...patch } }) }
  function updateCategoryOrder(nextOrder: string[]) { update('categoryOrder', nextOrder) }
  function reorderCatalogCategory(fromName: string, toName: string) {
    if (!fromName || fromName === toName) return setDraggedCategory(null)
    const current = orderedStoreCategories.map((category) => category.name)
    const fromIndex = current.indexOf(fromName)
    const toIndex = current.indexOf(toName)
    if (fromIndex < 0 || toIndex < 0) return setDraggedCategory(null)
    const next = [...current]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    updateCategoryOrder(next)
    setDraggedCategory(null)
  }

  async function saveSettings(mode: 'draft' | 'publish') {
    const storeId = store?.id || (await getCurrentStoreId())
    if (!storeId) return alert('Este usuario no tiene una tienda asignada.')
    const now = new Date().toISOString()
    const nextSettings = normalizeWebSettings({ ...settings, draftUpdatedAt: now, publishedAt: mode === 'publish' ? now : settings.publishedAt })
    setSaving(true)
    setSettings(nextSettings)
    saveLocalWebSettings(storeId, nextSettings)
    const { error } = await supabase.from('stores').update({ web_settings: nextSettings } as any).eq('id', storeId)
    setSaveMode(error ? 'local' : 'supabase')
    setSaving(false)
    setSaved(true)
  }

  function resetSettings() { if (confirm('Quieres restaurar la configuracion visual por defecto de la tienda web?')) { setSettings(DEFAULT_WEB_SETTINGS); setSaved(false) } }
  function openPreview() { window.open(publicUrl || '/web', '_blank', 'noopener,noreferrer') }

  if (loading) return <AppShell><p className="text-zinc-500">Cargando constructor web...</p></AppShell>

  return (
    <AppShell>
      <div className="min-h-screen bg-zinc-50 pb-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">Constructor visual</p>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black text-zinc-950"><Globe className="text-emerald-500" />Configuracion de la Tienda Online</h1>
            <p className="mt-2 max-w-3xl text-zinc-600">Organiza la tienda publica de {store?.name || 'tu negocio'} con una experiencia moderna tipo Shopify, Elementor y Wix.</p>
            <p className="mt-2 text-sm font-semibold text-zinc-500">Guardado: {saveMode === 'supabase' ? 'Supabase + respaldo local' : 'respaldo local del navegador'}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button onClick={() => saveSettings('draft')} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-black text-zinc-900 shadow-sm hover:bg-zinc-100 disabled:opacity-60"><Save size={18} /> Guardar borrador</button>
            <button onClick={openPreview} className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 py-3 font-black text-zinc-900 shadow-sm hover:bg-zinc-100"><Eye size={18} /> Vista previa</button>
            <button onClick={() => saveSettings('publish')} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"><CheckCircle size={18} /> {saving ? 'Publicando...' : 'Publicar cambios'}</button>
          </div>
        </div>
        {saved && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-700"><CheckCircle size={18} /> Cambios guardados correctamente.</div>}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5"><Stat title="Productos activos" value={stats.total} icon={<Package />} /><Stat title="Web normal" value={stats.visibleNormal} icon={<Globe />} /><Stat title="Cooperativa" value={stats.visibleCoop} icon={<ShoppingBag />} /><Stat title="Destacados" value={stats.featured} icon={<Eye />} /><Stat title="Con descuento" value={stats.discounted} icon={<BadgePercent />} /></div>
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm"><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">{tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left font-black transition ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-700 hover:bg-zinc-100'}`}>{tab.icon}{tab.label}</button>)}</div></aside>
          <main className="space-y-6">{renderTab()}</main>
          <aside className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm xl:col-span-2"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-zinc-950"><Eye className="text-emerald-600" /> Vista previa</h2><p className="text-sm font-semibold text-zinc-500">Los cambios se reflejan en tiempo real.</p></div><div className="flex rounded-2xl border border-zinc-200 bg-zinc-50 p-1"><PreviewButton active={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')} icon={<Monitor size={17} />} label="Desktop" /><PreviewButton active={previewMode === 'tablet'} onClick={() => setPreviewMode('tablet')} icon={<Tablet size={17} />} label="Tablet" /><PreviewButton active={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')} icon={<Smartphone size={17} />} label="Movil" /></div></div><WebsitePreview settings={settings} mode={previewMode} categories={orderedStoreCategories.map((category) => category.name)} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><a href={publicUrl || '/web'} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center font-black text-zinc-900 hover:bg-zinc-100">Abrir web normal</a><a href={coopUrl || '/web/cooperativa'} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center font-black text-zinc-900 hover:bg-zinc-100">Abrir cooperativa</a></div></aside>
        </div>
      </div>
    </AppShell>
  )

  function renderTab() {
    switch (activeTab) {
      case 'general':
        return <TabPanel title="General" description="Define el estado de la tienda, contacto, horario y textos publicos." icon={<Settings />}><div className="grid gap-4 md:grid-cols-2"><Toggle label="Tienda online activa" checked={settings.storeOnline} onChange={(value) => update('storeOnline', value)} /><Toggle label="Destacados primero" checked={settings.showFeaturedFirst} onChange={(value) => update('showFeaturedFirst', value)} /><Input label="Correo publico" value={settings.contactEmail} onChange={(value) => update('contactEmail', value)} placeholder="info@guatapo.com" /><Input label="Telefono publico" value={settings.contactPhone} onChange={(value) => update('contactPhone', value)} placeholder="809-636-1020" /><Input label="WhatsApp pedidos" value={settings.whatsapp} onChange={(value) => update('whatsapp', value)} placeholder="18096361020" /><Input label="Direccion" value={settings.contactAddress} onChange={(value) => update('contactAddress', value)} placeholder="Direccion de la tienda" /><Input label="Mensaje sin productos" value={settings.emptyMessage} onChange={(value) => update('emptyMessage', value)} /><Textarea label="Descripcion del footer" value={settings.footerDescription} onChange={(value) => update('footerDescription', value)} className="md:col-span-2" /></div><section className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5"><div className="mb-4"><p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-600">Horario de atencion</p><h3 className="mt-1 text-xl font-black text-zinc-950">Configura cada grupo de dias</h3></div><div className="grid gap-4 xl:grid-cols-3"><ScheduleGroupEditor title="Lunes a Viernes" value={settings.schedule.weekdays} onChange={(patch) => updateScheduleGroup('weekdays', patch)} /><ScheduleGroupEditor title="Sabado" value={settings.schedule.saturday} onChange={(patch) => updateScheduleGroup('saturday', patch)} /><ScheduleGroupEditor title="Domingo" value={settings.schedule.sunday} onChange={(patch) => updateScheduleGroup('sunday', patch)} /></div></section></TabPanel>
      case 'appearance':
        return <TabPanel title="Apariencia" description="Controla las secciones visibles y la identidad visual base." icon={<LayoutTemplate />}><div className="grid gap-4 md:grid-cols-2"><ImageUploader label="Logo de la tienda" value={settings.logoUrl} onChange={(value) => update('logoUrl', value)} /><ImageUploader label="Imagen principal del banner" value={settings.heroImageUrl} onChange={(value) => update('heroImageUrl', value)} /><Toggle label="Mostrar banner principal" checked={settings.showHero} onChange={(value) => update('showHero', value)} /><Toggle label="Mostrar promociones" checked={settings.showPromoCards} onChange={(value) => update('showPromoCards', value)} /><Toggle label="Mostrar beneficios" checked={settings.showBenefits} onChange={(value) => update('showBenefits', value)} /><Toggle label="Mostrar categorias abajo" checked={settings.showCategorySection} onChange={(value) => update('showCategorySection', value)} /></div></TabPanel>
      case 'hero':
        return <TabPanel title="Banner Principal" description="Edita el primer bloque que ve el cliente al entrar a la tienda." icon={<ImageIcon />}><div className="grid gap-4 md:grid-cols-2"><Input label="Etiqueta" value={settings.heroBadge} onChange={(value) => update('heroBadge', value)} /><Input label="Texto del boton" value={settings.heroButtonText} onChange={(value) => update('heroButtonText', value)} /><Input label="Titulo principal" value={settings.heroTitle} onChange={(value) => update('heroTitle', value)} className="md:col-span-2" /><Textarea label="Subtitulo" value={settings.heroSubtitle} onChange={(value) => update('heroSubtitle', value)} className="md:col-span-2" /><Input label="Posicion de scroll del boton" value={String(settings.heroScrollTarget)} onChange={(value) => update('heroScrollTarget', Number(value) || 0)} /><ImageUploader label="Imagen del banner" value={settings.heroImageUrl} onChange={(value) => update('heroImageUrl', value)} /></div></TabPanel>
      case 'promotions':
        return <TabPanel title="Promociones" description="Crea varias promociones y ofertas visuales para la portada." icon={<Megaphone />} action={<button onClick={addPromotion} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-black text-white"><Plus size={18} /> Agregar</button>}><div className="space-y-4">{settings.promotions.map((promotion, index) => <div key={promotion.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black text-zinc-950">Promocion {index + 1}</h3><button onClick={() => removePromotion(promotion.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"><Trash2 size={18} /></button></div><div className="grid gap-4 md:grid-cols-2"><Input label="Etiqueta" value={promotion.eyebrow} onChange={(value) => updatePromotion(promotion.id, { eyebrow: value })} /><Input label="Categoria destino" value={promotion.category} onChange={(value) => updatePromotion(promotion.id, { category: value })} /><Input label="Titulo" value={promotion.title} onChange={(value) => updatePromotion(promotion.id, { title: value })} /><Input label="Boton" value={promotion.button} onChange={(value) => updatePromotion(promotion.id, { button: value })} /><Textarea label="Descripcion" value={promotion.subtitle} onChange={(value) => updatePromotion(promotion.id, { subtitle: value })} /><ColorInput label="Color" value={promotion.color} onChange={(value) => updatePromotion(promotion.id, { color: value })} /><ImageUploader label="Imagen de promocion" value={promotion.imageUrl} onChange={(value) => updatePromotion(promotion.id, { imageUrl: value })} className="md:col-span-2" /></div></div>)}</div></TabPanel>
      case 'products':
        return <TabPanel title="Productos" description="Resumen de visibilidad. Los descuentos e imagenes reales se editan en inventario." icon={<Package />}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><InfoCard title="Productos activos" value={stats.total} icon={<Package />} /><InfoCard title="Visibles web normal" value={stats.visibleNormal} icon={<Globe />} /><InfoCard title="Visibles cooperativa" value={stats.visibleCoop} icon={<ShoppingBag />} /><InfoCard title="Con descuentos" value={stats.discounted} icon={<BadgePercent />} /></div><div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Los productos, imagenes, disponibilidad y descuentos siguen conectados al inventario de Supabase.</div></TabPanel>
      case 'categories':
        return <TabPanel title="Categorias" description="Controla el orden e iconos del catalogo publico." icon={<Tags />}><div className="grid gap-4 md:grid-cols-2"><Toggle label="Mostrar menu lateral de categorias" checked={settings.showCategorySection} onChange={(value) => update('showCategorySection', value)} /><Toggle label="Mostrar destacados primero" checked={settings.showFeaturedFirst} onChange={(value) => update('showFeaturedFirst', value)} /></div><section className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-black text-zinc-950">Orden del catalogo</h3><p className="text-sm font-semibold text-zinc-500">Arrastra las categorias para definir como aparecen en la tienda publica.</p></div><button type="button" onClick={() => updateCategoryOrder(orderedStoreCategories.map((category) => category.name))} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-800 hover:bg-zinc-100">Guardar orden actual</button></div>{orderedStoreCategories.length === 0 ? <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-semibold text-zinc-700">Aun no hay categorias activas. Agregalas en Configuracion o Inventario y apareceran aqui automaticamente.</div> : <div className="space-y-2">{orderedStoreCategories.map((category) => <div key={`order-${category.id}`} draggable onDragStart={() => setDraggedCategory(category.name)} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedCategory && reorderCatalogCategory(draggedCategory, category.name)} onDragEnd={() => setDraggedCategory(null)} className={`flex cursor-grab items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm transition ${draggedCategory === category.name ? 'border-emerald-300 opacity-70' : 'border-zinc-200 hover:border-emerald-300'}`}><GripVertical size={18} className="text-zinc-400" /><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{renderWebCategoryIcon(category.name, settings.categoryIcons?.[category.name], 18)}</span><span className="font-black text-zinc-950">{category.name}</span></div>)}</div>}</section><div className="mt-5 space-y-3">{orderedStoreCategories.map((category) => { const iconValue = settings.categoryIcons?.[category.name] || 'auto'; const isPreset = WEB_CATEGORY_ICON_OPTIONS.some((option) => option.key === iconValue); return <div key={category.id} className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[minmax(0,1fr)_220px]"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">{renderWebCategoryIcon(category.name, iconValue, 20)}</span><div><p className="font-black text-zinc-950">{category.name}</p><p className="text-xs font-semibold text-zinc-500">Categoria conectada al catalogo publico.</p></div></div><div className="space-y-2"><select value={isPreset ? iconValue : 'custom'} onChange={(event) => updateCategoryIcon(category.name, event.target.value === 'custom' ? 'PC' : event.target.value)} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-bold text-zinc-950 outline-none focus:border-emerald-500">{WEB_CATEGORY_ICON_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}<option value="custom">Personalizado</option></select>{!isPreset && <Input label="Icono personalizado" value={iconValue} onChange={(value) => updateCategoryIcon(category.name, value)} placeholder="Ej: PC, Cel, TV" />}</div></div> })}</div><div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">El catalogo de la pagina web se alimenta de estas categorias activas. Si no eliges icono, el sistema usa uno automatico segun el nombre.</div></TabPanel>
      case 'benefits':
        return <TabPanel title="Beneficios" description="Agrega, edita o elimina ventajas que aparecen en la tienda." icon={<ShieldCheck />} action={<button onClick={addBenefit} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-black text-white"><Plus size={18} /> Agregar</button>}><div className="space-y-4">{settings.benefits.map((benefit, index) => <div key={benefit.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black text-zinc-950">Beneficio {index + 1}</h3><button onClick={() => removeBenefit(benefit.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"><Trash2 size={18} /></button></div><div className="grid gap-4 md:grid-cols-3"><Input label="Titulo" value={benefit.title} onChange={(value) => updateBenefit(benefit.id, { title: value })} /><Input label="Icono" value={benefit.icon} onChange={(value) => updateBenefit(benefit.id, { icon: value })} /><Input label="Descripcion" value={benefit.description} onChange={(value) => updateBenefit(benefit.id, { description: value })} /></div></div>)}</div></TabPanel>
      case 'social':
        return <TabPanel title="Redes Sociales" description="Conecta los enlaces publicos y canales de contacto." icon={<Share2 />}><div className="grid gap-4 md:grid-cols-2"><Input label="Facebook" value={settings.facebook} onChange={(value) => update('facebook', value)} placeholder="https://facebook.com/..." icon={<Share2 size={18} />} /><Input label="Instagram" value={settings.instagram} onChange={(value) => update('instagram', value)} placeholder="@guatapord" icon={<Share2 size={18} />} /><Input label="TikTok" value={settings.tiktok} onChange={(value) => update('tiktok', value)} placeholder="https://tiktok.com/@..." /><Input label="YouTube" value={settings.youtube} onChange={(value) => update('youtube', value)} placeholder="https://youtube.com/..." icon={<Share2 size={18} />} /><Input label="WhatsApp" value={settings.whatsapp} onChange={(value) => update('whatsapp', value)} placeholder="18096361020" /><Input label="Correo" value={settings.contactEmail} onChange={(value) => update('contactEmail', value)} placeholder="info@guatapo.com" /><Input label="Ubicacion en Google Maps" value={settings.googleMapsUrl} onChange={(value) => update('googleMapsUrl', value)} placeholder="https://maps.google.com/..." className="md:col-span-2" icon={<LinkIcon size={18} />} /></div></TabPanel>
      case 'colors':
        return <TabPanel title="Colores" description="Ajusta la paleta completa de la tienda con selectores visuales." icon={<Palette />}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><ColorInput label="Color principal" value={settings.primaryColor} onChange={(value) => update('primaryColor', value)} /><ColorInput label="Color secundario" value={settings.secondaryColor} onChange={(value) => update('secondaryColor', value)} /><ColorInput label="Color ofertas" value={settings.accentColor} onChange={(value) => update('accentColor', value)} /><ColorInput label="Fondo" value={settings.backgroundColor} onChange={(value) => update('backgroundColor', value)} /><ColorInput label="Header" value={settings.headerColor} onChange={(value) => update('headerColor', value)} /><ColorInput label="Texto" value={settings.textColor} onChange={(value) => update('textColor', value)} /><ColorInput label="Botones" value={settings.buttonColor} onChange={(value) => update('buttonColor', value)} /><ColorInput label="Precios" value={settings.priceColor} onChange={(value) => update('priceColor', value)} /></div></TabPanel>
      case 'seo':
        return <TabPanel title="SEO" description="Prepara la tienda para buscadores, analytics y pixeles." icon={<Search />}><div className="grid gap-4 md:grid-cols-2"><Input label="Titulo SEO" value={settings.seoTitle} onChange={(value) => update('seoTitle', value)} className="md:col-span-2" /><Textarea label="Descripcion SEO" value={settings.seoDescription} onChange={(value) => update('seoDescription', value)} className="md:col-span-2" /><Input label="Keywords" value={settings.seoKeywords} onChange={(value) => update('seoKeywords', value)} className="md:col-span-2" /><Input label="Google Analytics" value={settings.googleAnalyticsId} onChange={(value) => update('googleAnalyticsId', value)} placeholder="G-XXXXXXXXXX" /><Input label="Meta Pixel" value={settings.metaPixelId} onChange={(value) => update('metaPixelId', value)} placeholder="Pixel ID" /></div></TabPanel>
      case 'advanced':
        return <TabPanel title="Avanzado" description="Opciones tecnicas para futuras integraciones." icon={<Code2 />}><div className="grid gap-4"><Textarea label="Codigo personalizado en head" value={settings.customHeadCode} onChange={(value) => update('customHeadCode', value)} rows={6} /><Textarea label="Codigo personalizado antes de cerrar body" value={settings.customFooterCode} onChange={(value) => update('customFooterCode', value)} rows={6} /><div className="flex flex-wrap gap-3"><button onClick={resetSettings} className="rounded-2xl border border-red-200 bg-white px-5 py-3 font-black text-red-600 hover:bg-red-50">Restaurar por defecto</button></div></div></TabPanel>
      default:
        return null
    }
  }
}

function ScheduleGroupEditor({ title, value, onChange }: { title: string; value: WebScheduleGroup; onChange: (patch: Partial<WebScheduleGroup>) => void }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h4 className="font-black text-zinc-950">{title}</h4><p className={`text-sm font-bold ${value.enabled ? 'text-emerald-600' : 'text-red-600'}`}>{value.enabled ? 'Abierto' : 'Cerrado'}</p></div><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} className="h-5 w-5 accent-emerald-600" /></div><div className={`grid gap-3 ${value.enabled ? '' : 'opacity-50'}`}><Input label="Hora de apertura" value={value.open} onChange={(open) => onChange({ open })} placeholder="8:00 AM" /><Input label="Hora de cierre" value={value.close} onChange={(close) => onChange({ close })} placeholder="6:00 PM" /></div>{!value.enabled && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">Se mostrara como Cerrado en la tienda.</p>}</div> }
function TabPanel({ title, description, icon, action, children }: { title: string; description: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) { return <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</span><div><h2 className="text-2xl font-black text-zinc-950">{title}</h2><p className="mt-1 text-sm font-semibold text-zinc-500">{description}</p></div></div>{action}</div>{children}</section> }
function Stat({ title, value, icon }: { title: string; value: number; icon: ReactNode }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">{icon}</span><p className="mt-3 text-sm font-bold text-zinc-500">{title}</p><p className="mt-1 text-2xl font-black text-zinc-950">{value}</p></div> }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"><span className="font-black text-zinc-800">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-emerald-600" /></label> }
function Input({ label, value, onChange, placeholder = '', className = '', icon }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string; icon?: ReactNode }) { return <label className={className}><span className="mb-2 block text-sm font-bold text-zinc-600">{label}</span><div className="flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus-within:border-emerald-500">{icon && <span className="text-zinc-400">{icon}</span>}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent font-semibold text-zinc-950 outline-none" /></div></label> }
function Textarea({ label, value, onChange, rows = 3, className = '' }: { label: string; value: string; onChange: (value: string) => void; rows?: number; className?: string }) { return <label className={className}><span className="mb-2 block text-sm font-bold text-zinc-600">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-950 outline-none focus:border-emerald-500" /></label> }
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span className="mb-2 block text-sm font-bold text-zinc-600">{label}</span><div className="flex items-center gap-3 rounded-2xl border border-zinc-300 bg-white px-3 py-2 focus-within:border-emerald-500"><input type="color" value={value || '#009a44'} onChange={(event) => onChange(event.target.value)} className="h-11 w-14 cursor-pointer rounded-xl bg-transparent" /><input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-black text-zinc-950 outline-none" /></div></label> }
function ImageUploader({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) { function handleFile(file?: File) { if (!file) return; const reader = new FileReader(); reader.onload = () => onChange(String(reader.result || '')); reader.readAsDataURL(file) } return <div className={className}><span className="mb-2 block text-sm font-bold text-zinc-600">{label}</span><div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4"><div className="flex flex-wrap items-center gap-4"><div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white">{value ? <img src={value} alt={label} className="h-full w-full object-contain" /> : <ImageIcon className="text-zinc-300" size={34} />}</div><div className="min-w-0 flex-1"><label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700"><Upload size={18} /> Subir imagen<input type="file" accept="image/*" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} /></label><p className="mt-2 break-all text-xs font-semibold text-zinc-500">{value || 'Sin imagen seleccionada'}</p></div></div></div></div> }
function InfoCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</span><p className="mt-4 text-sm font-bold text-zinc-500">{title}</p><p className="mt-1 text-3xl font-black text-zinc-950">{value}</p></div> }
function PreviewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) { return <button onClick={onClick} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black ${active ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:bg-white'}`}>{icon}<span className="hidden sm:inline">{label}</span></button> }
function WebsitePreview({ settings, mode, categories: configuredCategories }: { settings: WebSettings; mode: PreviewMode; categories: string[] }) {
  const width = mode === 'desktop' ? '100%' : mode === 'tablet' ? '520px' : '330px'
  const compact = mode !== 'desktop'
  const products = [1, 2, 3, 4]
  const categories = configuredCategories.length ? configuredCategories.slice(0, 6) : ['Computadoras', 'Celulares', 'Adaptadores', 'Audio', 'Tabletas', 'Oferta']
  const promo = settings.promotions[0]

  return (
    <div className="overflow-auto rounded-3xl bg-zinc-100 p-3">
      <div className="mx-auto overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all" style={{ width, color: settings.textColor, backgroundColor: settings.backgroundColor }}>
        <header className="border-b border-zinc-200 shadow-sm" style={{ backgroundColor: settings.headerColor }}>
          <div className="flex items-center gap-4 px-6 py-4">
            <img src={settings.logoUrl || DEFAULT_WEB_SETTINGS.logoUrl} alt="Logo" className="h-20 w-64 object-contain object-left" />
            {!compact && <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-black">Buscar productos</div>}
            <div className="ml-auto flex items-center gap-2 text-sm font-black">
              {!compact && <span>Favoritos</span>}
              <span className="rounded-full bg-zinc-950 px-4 py-2 text-white">Carrito</span>
            </div>
          </div>
          <div className="bg-zinc-950 px-6 py-3 text-right text-xs font-black text-white">
            {settings.contactEmail} &nbsp;&nbsp; TEL: {settings.contactPhone} &nbsp;&nbsp; Contactanos
          </div>
        </header>

        <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-[190px_minmax(0,1fr)]'}`}>
          {!compact && (
            <aside className="border-r border-zinc-200 bg-white p-4">
              <h3 className="mb-3 text-lg font-black uppercase">CATALOGO</h3>
              <div className="space-y-2">
                <div className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-black uppercase text-white">GENERAL</div>
                {categories.slice(0, 5).map((category) => <div key={category} className="rounded-2xl px-4 py-3 text-sm font-black text-zinc-800">{category}</div>)}
              </div>
            </aside>
          )}

          <div className="min-w-0 bg-white">
            {settings.showHero && (
              <section className="relative min-h-[390px] overflow-hidden bg-zinc-950 text-white">
                {settings.heroImageUrl && <img src={settings.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-950/25" />
                <div className={`relative z-10 grid min-h-[390px] items-center gap-6 px-8 py-10 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <span className="inline-flex rounded-full px-4 py-2 text-xs font-black uppercase text-white" style={{ backgroundColor: settings.accentColor }}>{settings.heroBadge}</span>
                    <h2 className="mt-5 text-4xl font-black leading-tight">{settings.heroTitle}</h2>
                    <p className="mt-4 text-base font-semibold text-zinc-200">{settings.heroSubtitle}</p>
                    <button className="mt-6 rounded-full px-7 py-3 font-black text-white" style={{ backgroundColor: settings.buttonColor }}>{settings.heroButtonText}</button>
                  </div>
                  {!compact && (
                    <div className="flex aspect-square items-center justify-center rounded-full bg-white/10 p-8">
                      {settings.heroImageUrl ? <img src={settings.heroImageUrl} alt="" className="max-h-full w-full object-contain" /> : <Sparkles size={92} />}
                    </div>
                  )}
                </div>
              </section>
            )}

            {settings.showCategorySection && (
              <section className="px-6 py-8">
                <p className="font-black uppercase tracking-wide text-emerald-700">Explora rapido</p>
                <h3 className="mt-1 text-2xl font-black">Comprar por categoria</h3>
                <div className={`mt-5 grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-6'}`}>
                  {categories.map((category) => <div key={category} className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm"><span className="mx-auto flex h-9 w-9 items-center justify-center text-emerald-700">{renderWebCategoryIcon(category, settings.categoryIcons?.[category], 24)}</span><p className="mt-3 text-xs font-black">{category}</p></div>)}
                </div>
              </section>
            )}

            {settings.showPromoCards && promo && (
              <section className="px-6 pb-8">
                <div className="rounded-3xl p-6 text-white" style={{ backgroundColor: promo.color || settings.primaryColor }}>
                  <p className="text-xs font-black uppercase">{promo.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-black">{promo.title}</h3>
                  <p className="mt-2 text-sm font-semibold">{promo.subtitle}</p>
                </div>
              </section>
            )}

            <section className="px-6 py-8">
              <div className="mb-5 flex items-end justify-between"><div><p className="font-black uppercase tracking-wide text-emerald-700">Catalogo</p><h3 className="text-2xl font-black">Mas vendidos</h3></div><p className="text-xs font-bold text-zinc-500">4 productos</p></div>
              <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-4'}`}>
                {products.map((item) => <article key={item} className="overflow-hidden border border-zinc-200 bg-white shadow-sm"><div className="flex h-36 items-center justify-center bg-zinc-50"><Package className="text-zinc-300" size={44} /></div><div className="p-4"><span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">Nuevo</span><h4 className="mt-3 min-h-10 text-sm font-bold">Producto ejemplo</h4><p className="mt-2 text-xl font-black" style={{ color: settings.priceColor }}>RD$1,000.00</p><button className="mt-4 w-full rounded-full px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: settings.buttonColor }}>Comprar</button></div></article>)}
              </div>
            </section>

            {settings.showBenefits && (
              <section className={`grid gap-3 border-y border-zinc-200 px-6 py-6 ${compact ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {settings.benefits.slice(0, 3).map((benefit) => <div key={benefit.id} className="rounded-2xl bg-zinc-50 p-4"><p className="font-black">{benefit.title}</p><p className="mt-1 text-xs font-semibold text-zinc-600">{benefit.description}</p></div>)}
              </section>
            )}
          </div>
        </div>

        <footer className="bg-zinc-950 px-6 py-8 text-white">
          <img src={settings.logoUrl || DEFAULT_WEB_SETTINGS.logoUrl} alt="Logo" className="h-16 w-56 object-contain object-left brightness-0 invert" />
          <div className="mt-4 grid gap-4 text-sm font-semibold text-zinc-300 sm:grid-cols-3">
            <p>{settings.contactPhone}<br />{settings.contactEmail}<br />{settings.contactAddress}</p>
            <div>{getScheduleRows(settings.schedule).map((row) => <p key={row.key} className="mb-2"><span className="block font-black text-white">{row.label}</span>{formatScheduleRange(row.group)}</p>)}</div>
            <p>Redes sociales<br />WhatsApp / Instagram / Facebook</p>
          </div>
        </footer>
      </div>
    </div>
  )
}










