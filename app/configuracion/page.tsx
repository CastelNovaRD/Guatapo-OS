'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { getCurrentStoreId } from '@/lib/store-context'
import { DEFAULT_HUB_CONFIG, normalizeHubConfig, type HubConfig } from '@/lib/castelnova-hub'
import { APP_NAME, APP_VERSION, BUILD_DATE } from '@/lib/version'
import {
  CheckCircle,
  Copy,
  ExternalLink,
  Globe,
  Headphones,
  ImageIcon,
  KeyRound,
  Loader2,
  MessageCircle,
  Package,
  Percent,
  Plus,
  Save,
  Settings,
  Store,
  Tags,
  Trash2,
} from 'lucide-react'

const SUPPORT_WHATSAPP_NUMBER = '18096361020'
const CLIENT_LOGO_STORAGE_PREFIX = 'castelnova_store_logo_'

type StoreSettings = {
  id: string
  name: string
  slug: string
  system_name: string
  active: boolean
  phone: string | null
  whatsapp: string | null
  rnc: string | null
  pos_featured_products_limit?: number | null
  cooperative_pos_products_limit?: number | null
  quote_products_limit?: number | null
}

type SettingsForm = {
  name: string
  slug: string
  system_name: string
  phone: string
  whatsapp: string
  rnc: string
  active: boolean
  pos_featured_products_limit: string
  cooperative_pos_products_limit: string
  quote_products_limit: string
}

type ProductCategory = {
  id: string
  name: string
  active: boolean
}

type ProductTypeSetting = {
  id: string
  value: string
  label: string
  active: boolean
}

type CooperativeCommission = {
  id: string
  cooperative_name: string
  commission_percent: number
  active: boolean
}

const emptyForm: SettingsForm = {
  name: '',
  slug: '',
  system_name: '',
  phone: '',
  whatsapp: '',
  rnc: '',
  active: true,
  pos_featured_products_limit: '10',
  cooperative_pos_products_limit: '10',
  quote_products_limit: '10',
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ConfiguracionPage() {
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [form, setForm] = useState<SettingsForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [productTypes, setProductTypes] = useState<ProductTypeSetting[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [cooperativeCommissions, setCooperativeCommissions] = useState<CooperativeCommission[]>([])
  const [newCooperativeName, setNewCooperativeName] = useState('')
  const [newCooperativePercent, setNewCooperativePercent] = useState('')
  const [clientLogo, setClientLogo] = useState('')
  const [hubConfig, setHubConfig] = useState<HubConfig>(DEFAULT_HUB_CONFIG)

  useEffect(() => {
    void Promise.resolve().then(async () => {
      await Promise.all([loadSettings(), loadHubConfig()])
    })
  }, [])

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  }, [])

  const publicLinks = [
    { label: 'Tienda normal', href: `${baseUrl}/web` },
    { label: 'Tienda cooperativa', href: `${baseUrl}/web/cooperativa` },
  ]

  async function loadSettings() {
    setLoading(true)
    const storeId = await getCurrentStoreId()

    if (!storeId) {
      setLoading(false)
      return alert('Este usuario no tiene una tienda asignada.')
    }

    const { data, error } = await supabase
      .from('stores')
      .select('id, name, slug, system_name, active, phone, whatsapp, rnc, pos_featured_products_limit, cooperative_pos_products_limit, quote_products_limit')
      .eq('id', storeId)
      .maybeSingle()

    if (error) {
      setLoading(false)
      return alert('Error cargando configuracion: ' + error.message)
    }

    if (!data) {
      setLoading(false)
      return alert('No se encontro la tienda asignada.')
    }

    setStore(data)
    setClientLogo(
      typeof window === 'undefined'
        ? ''
        : window.localStorage.getItem(`${CLIENT_LOGO_STORAGE_PREFIX}${data.id}`) || ''
    )
    setForm({
      name: data.name || '',
      slug: data.slug || '',
      system_name: data.system_name || '',
      phone: data.phone || '',
      whatsapp: data.whatsapp || '',
      rnc: data.rnc || '',
      active: data.active !== false,
      pos_featured_products_limit: String([5, 10, 20, 50].includes(Number(data.pos_featured_products_limit)) ? data.pos_featured_products_limit : 10),
      cooperative_pos_products_limit: String([5, 10, 20, 50].includes(Number(data.cooperative_pos_products_limit)) ? data.cooperative_pos_products_limit : 10),
      quote_products_limit: String([5, 10, 20, 50].includes(Number(data.quote_products_limit)) ? data.quote_products_limit : 10),
    })
    await loadCatalogSettings(data.id)
    setLoading(false)
  }

  async function loadCatalogSettings(storeId: string) {
    const [
      { data: categoriesData },
      { data: productTypesData },
      { data: cooperativeCommissionsData },
    ] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, active')
        .eq('store_id', storeId)
        .order('name'),
      supabase
        .from('product_types')
        .select('id, value, label, active')
        .eq('store_id', storeId)
        .order('label'),
      supabase
        .from('cooperative_commissions')
        .select('id, cooperative_name, commission_percent, active')
        .eq('store_id', storeId)
        .order('cooperative_name'),
    ])

    setCategories(categoriesData || [])
    setProductTypes(productTypesData || [])
    setCooperativeCommissions(cooperativeCommissionsData || [])
  }

  async function loadHubConfig() {
    try {
      const response = await fetch('/api/hub/config', { cache: 'no-store' })
      setHubConfig(normalizeHubConfig(await response.json()))
    } catch {
      setHubConfig(DEFAULT_HUB_CONFIG)
    }
  }

  function updateForm(field: keyof SettingsForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
    setSaved(false)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!store) return
    if (!form.name.trim()) return alert('Escribe el nombre de la tienda.')
    if (!form.system_name.trim()) return alert('Escribe el nombre del sistema.')

    const slug = normalizeSlug(form.slug || form.name)
    if (!slug) return alert('El slug no es valido.')
    const posFeaturedLimit = Number(form.pos_featured_products_limit || 10)
    const cooperativePosLimit = Number(form.cooperative_pos_products_limit || 10)
    const quoteProductsLimit = Number(form.quote_products_limit || 10)
    if (![5, 10, 20, 50].includes(posFeaturedLimit)) return alert('Selecciona una cantidad valida para productos destacados del POS.')
    if (![5, 10, 20, 50].includes(cooperativePosLimit)) return alert('Selecciona una cantidad valida para productos del POS cooperativa.')
    if (![5, 10, 20, 50].includes(quoteProductsLimit)) return alert('Selecciona una cantidad valida para productos de cotizaciones.')

    setSaving(true)
    setSaved(false)

    const { error } = await supabase
      .from('stores')
      .update({
        name: form.name.trim(),
        slug,
        system_name: form.system_name.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        rnc: form.rnc.trim() || null,
        active: form.active,
        pos_featured_products_limit: posFeaturedLimit,
        cooperative_pos_products_limit: cooperativePosLimit,
        quote_products_limit: quoteProductsLimit,
      })
      .eq('id', store.id)

    if (error) {
      setSaving(false)
      return alert('Error guardando configuracion: ' + error.message)
    }

    setForm((current) => ({ ...current, slug }))
    setStore((current) =>
      current
        ? {
            ...current,
            name: form.name.trim(),
            slug,
            system_name: form.system_name.trim(),
            phone: form.phone.trim() || null,
            whatsapp: form.whatsapp.trim() || null,
            rnc: form.rnc.trim() || null,
            active: form.active,
            pos_featured_products_limit: posFeaturedLimit,
            cooperative_pos_products_limit: cooperativePosLimit,
            quote_products_limit: quoteProductsLimit,
          }
        : current
    )
    setSaving(false)
    setSaved(true)
    window.dispatchEvent(new Event('guatapo:settings-updated'))
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link)
    setCopyMessage('Enlace copiado')
    window.setTimeout(() => setCopyMessage(''), 1600)
  }

  async function changePassword(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()
    setPasswordSaved(false)

    if (newPassword.length < 6) {
      return alert('La contrasena debe tener al menos 6 caracteres.')
    }

    if (newPassword !== confirmPassword) {
      return alert('Las contrasenas no coinciden.')
    }

    setChangingPassword(true)

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setChangingPassword(false)
      return alert('Error cambiando contrasena: ' + error.message)
    }

    setNewPassword('')
    setConfirmPassword('')
    setChangingPassword(false)
    setPasswordSaved(true)
  }

  function openSupport() {
    const message = [
      'Hola CastelNova, necesito soporte tecnico.',
      '',
      `Sistema: ${form.system_name || 'No especificado'}`,
      `Empresa: ${form.name || 'No especificada'}`,
    ].join('\n')

    window.open(
      `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
      '_blank'
    )
  }

  function updateClientLogo(file: File | null) {
    if (!store || !file) return

    if (!file.type.startsWith('image/')) {
      return alert('Selecciona una imagen valida para el logo.')
    }

    if (file.size > 900000) {
      return alert('El logo es muy pesado. Usa una imagen menor a 900 KB.')
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      window.localStorage.setItem(`${CLIENT_LOGO_STORAGE_PREFIX}${store.id}`, result)
      setClientLogo(result)
      window.dispatchEvent(new Event('guatapo:store-logo-updated'))
    }
    reader.readAsDataURL(file)
  }

  function removeClientLogo() {
    if (!store) return
    window.localStorage.removeItem(`${CLIENT_LOGO_STORAGE_PREFIX}${store.id}`)
    setClientLogo('')
    window.dispatchEvent(new Event('guatapo:store-logo-updated'))
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!store) return
    const name = newCategory.trim()
    if (!name) return alert('Escribe el nombre de la categoria.')

    const { error } = await supabase.from('categories').upsert(
      {
        store_id: store.id,
        name,
        active: true,
      },
      { onConflict: 'store_id,name' }
    )

    if (error) return alert('Error guardando categoria: ' + error.message)

    setNewCategory('')
    await loadCatalogSettings(store.id)
  }

  async function toggleCategory(category: ProductCategory) {
    if (!store) return

    const { error } = await supabase
      .from('categories')
      .update({ active: !category.active })
      .eq('id', category.id)
      .eq('store_id', store.id)

    if (error) return alert('Error actualizando categoria: ' + error.message)
    await loadCatalogSettings(store.id)
  }

  async function addProductType(e: React.FormEvent) {
    e.preventDefault()
    if (!store) return
    const label = newTypeLabel.trim()
    if (!label) return alert('Escribe el nombre del tipo.')

    const value = normalizeSlug(label).replace(/-/g, '_')
    if (!value) return alert('Ese tipo no es valido.')

    const { error } = await supabase.from('product_types').upsert(
      {
        store_id: store.id,
        value,
        label,
        active: true,
      },
      { onConflict: 'store_id,value' }
    )

    if (error) return alert('Error guardando tipo: ' + error.message)

    setNewTypeLabel('')
    await loadCatalogSettings(store.id)
  }

  async function toggleProductType(type: ProductTypeSetting) {
    if (!store) return

    const { error } = await supabase
      .from('product_types')
      .update({ active: !type.active })
      .eq('id', type.id)
      .eq('store_id', store.id)

    if (error) return alert('Error actualizando tipo: ' + error.message)
    await loadCatalogSettings(store.id)
  }

  async function addCooperativeCommission(e: React.FormEvent) {
    e.preventDefault()
    if (!store) return

    const cooperativeName = newCooperativeName.trim().toUpperCase()
    const commissionPercent = Number(newCooperativePercent || 0)

    if (!cooperativeName) return alert('Escribe el nombre de la cooperativa.')
    if (Number.isNaN(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return alert('El porcentaje debe estar entre 0 y 100.')
    }

    const { error } = await supabase.from('cooperative_commissions').upsert(
      {
        store_id: store.id,
        cooperative_name: cooperativeName,
        commission_percent: commissionPercent,
        active: true,
      },
      { onConflict: 'store_id,cooperative_name' }
    )

    if (error) return alert('Error guardando comision: ' + error.message)

    setNewCooperativeName('')
    setNewCooperativePercent('')
    await loadCatalogSettings(store.id)
  }

  async function updateCooperativeCommission(
    commission: CooperativeCommission,
    commissionPercent: number
  ) {
    if (!store) return

    if (Number.isNaN(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      return alert('El porcentaje debe estar entre 0 y 100.')
    }

    const { error } = await supabase
      .from('cooperative_commissions')
      .update({ commission_percent: commissionPercent })
      .eq('id', commission.id)
      .eq('store_id', store.id)

    if (error) return alert('Error actualizando comision: ' + error.message)
    await loadCatalogSettings(store.id)
  }

  async function toggleCooperativeCommission(commission: CooperativeCommission) {
    if (!store) return

    const { error } = await supabase
      .from('cooperative_commissions')
      .update({ active: !commission.active })
      .eq('id', commission.id)
      .eq('store_id', store.id)

    if (error) return alert('Error actualizando cooperativa: ' + error.message)
    await loadCatalogSettings(store.id)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="animate-spin" size={18} />
          Cargando configuracion...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-zinc-950">
            <Settings className="text-emerald-600" size={30} />
            Configuracion
          </h1>
          <p className="mt-1 text-zinc-600">
            Ajustes generales del sistema y enlaces publicos de la tienda.
          </p>
        </div>

        <div
          className={`rounded-2xl px-5 py-3 text-sm font-bold ${
            form.active
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {form.active ? 'Sistema activo' : 'Sistema inactivo'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Store className="text-emerald-600" size={22} />
            <h2 className="text-xl font-bold">Datos de la tienda</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nombre de la empresa"
              value={form.name}
              onChange={(value) => updateForm('name', value)}
              placeholder="Guatapo SRL"
            />

            <Input
              label="Nombre del sistema"
              value={form.system_name}
              onChange={(value) => updateForm('system_name', value)}
              placeholder="Guatapo OS"
            />

            <Input
              label="Slug publico"
              value={form.slug}
              onChange={(value) => updateForm('slug', value)}
              onBlur={() => updateForm('slug', normalizeSlug(form.slug || form.name))}
              placeholder="guatapo"
            />

            <Input
              label="RNC"
              value={form.rnc}
              onChange={(value) => updateForm('rnc', value)}
              placeholder="000000000"
            />

            <Input
              label="Telefono"
              value={form.phone}
              onChange={(value) => updateForm('phone', value)}
              placeholder="809-000-0000"
            />

            <Input
              label="WhatsApp"
              value={form.whatsapp}
              onChange={(value) => updateForm('whatsapp', value)}
              placeholder="18096361020"
            />

            <div className="md:col-span-2">
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => updateForm('active', e.target.checked)}
                  className="h-5 w-5 accent-emerald-600"
                />
                <span>
                  <span className="block font-bold text-zinc-950">Tienda activa</span>
                  <span className="text-sm text-zinc-600">
                    Si esta apagada, el sistema queda marcado como inactivo.
                  </span>
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:col-span-2">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-zinc-950">Configuracion de productos visibles</h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  Estas cantidades determinan cuantos productos se muestran automaticamente al abrir cada pantalla. Las busquedas pueden mostrar otros productos.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <LimitSelect
                  label="POS de venta"
                  value={form.pos_featured_products_limit}
                  onChange={(value) => updateForm('pos_featured_products_limit', value)}
                />
                <LimitSelect
                  label="POS Cooperativa"
                  value={form.cooperative_pos_products_limit}
                  onChange={(value) => updateForm('cooperative_pos_products_limit', value)}
                />
                <LimitSelect
                  label="Cotizaciones"
                  value={form.quote_products_limit}
                  onChange={(value) => updateForm('quote_products_limit', value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <ImageIcon className="text-emerald-600" size={22} />
                <h3 className="text-lg font-bold">Logo del cliente</h3>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white text-sm font-black text-zinc-400">
                  {clientLogo ? (
                    <img
                      src={clientLogo}
                      alt="Logo del cliente"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    'Logo'
                  )}
                </div>

                <div className="min-w-[220px] flex-1">
                  <p className="text-sm text-zinc-600">
                    Este logo aparece en la esquina superior derecha del sistema.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
                      <ImageIcon size={16} />
                      Subir logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => updateClientLogo(event.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>

                    {clientLogo && (
                      <button
                        type="button"
                        onClick={removeClientLogo}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                        Quitar logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="text-emerald-600" size={22} />
                <h3 className="text-lg font-bold">Seguridad</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <PasswordInput
                  label="Nueva contrasena"
                  value={newPassword}
                  onChange={setNewPassword}
                />

                <PasswordInput
                  label="Confirmar contrasena"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />
              </div>

              <button
                type="button"
                onClick={changePassword}
                disabled={changingPassword}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 font-bold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {changingPassword ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <KeyRound size={18} />
                )}
                {changingPassword ? 'Cambiando...' : 'Cambiar contrasena'}
              </button>

              {passwordSaved && (
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  Contrasena actualizada correctamente.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>

            {saved && (
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                <CheckCircle size={18} />
                Cambios guardados
              </span>
            )}
          </div>
        </form>

        <section className="grid grid-cols-1 gap-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Tags className="text-emerald-600" size={22} />
              <h2 className="text-xl font-bold">Categorias</h2>
            </div>

            <form onSubmit={addCategory} className="flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ej: Celulares"
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                aria-label="Agregar categoria"
              >
                <Plus size={20} />
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {categories.length === 0 ? (
                <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">
                  No hay categorias registradas.
                </p>
              ) : (
                categories.map((category) => (
                  <CatalogRow
                    key={category.id}
                    label={category.name}
                    active={category.active}
                    onToggle={() => toggleCategory(category)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Package className="text-emerald-600" size={22} />
              <h2 className="text-xl font-bold">Tipos de producto</h2>
            </div>

            <form onSubmit={addProductType} className="flex gap-2">
              <input
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                placeholder="Ej: Adaptador"
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                aria-label="Agregar tipo"
              >
                <Plus size={20} />
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {productTypes.length === 0 ? (
                <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500">
                  No hay tipos registrados.
                </p>
              ) : (
                productTypes.map((type) => (
                  <CatalogRow
                    key={type.id}
                    label={type.label}
                    active={type.active}
                    onToggle={() => toggleProductType(type)}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Percent className="text-emerald-600" size={22} />
            <h2 className="text-xl font-bold">Comisiones cooperativas</h2>
          </div>

          <p className="mb-4 text-sm text-zinc-600">
            Define el porcentaje que cada cooperativa descuenta de la venta. El POS cooperativo lo resta para calcular la ganancia neta.
          </p>

          <form onSubmit={addCooperativeCommission} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <input
              value={newCooperativeName}
              onChange={(e) => setNewCooperativeName(e.target.value)}
              placeholder="Ej: COOPSEMA"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
            />
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={newCooperativePercent}
              onChange={(e) => setNewCooperativePercent(e.target.value)}
              placeholder="% comision"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700"
            >
              <Plus size={18} />
              Agregar
            </button>
          </form>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {cooperativeCommissions.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-500 lg:col-span-2">
                No hay comisiones registradas.
              </p>
            ) : (
              cooperativeCommissions.map((commission) => (
                <CooperativeCommissionRow
                  key={commission.id}
                  commission={commission}
                  onSave={(value) => updateCooperativeCommission(commission, value)}
                  onToggle={() => toggleCooperativeCommission(commission)}
                />
              ))
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Headphones className="text-emerald-700" size={22} />
              <h2 className="text-xl font-bold text-zinc-950">Soporte tecnico</h2>
            </div>

            <p className="text-sm leading-relaxed text-zinc-700">
              Contacta a CastelNova para ayuda con usuarios, facturacion, inventario,
              tienda web o configuracion del sistema.
            </p>

            <button
              type="button"
              onClick={openSupport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700"
            >
              <MessageCircle size={18} />
              Soporte por WhatsApp
            </button>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Globe className="text-emerald-600" size={22} />
              <h2 className="text-xl font-bold">Paginas web</h2>
            </div>

            <div className="space-y-3">
              {publicLinks.map((link) => (
                <div key={link.href} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="font-bold text-zinc-950">{link.label}</p>
                  <p className="mt-1 break-all text-sm text-zinc-600">{link.href}</p>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => copyLink(link.href)}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100"
                    >
                      <Copy size={15} />
                      Copiar
                    </button>

                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-800"
                    >
                      <ExternalLink size={15} />
                      Abrir
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {copyMessage && (
              <p className="mt-3 text-sm font-bold text-emerald-700">{copyMessage}</p>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Acerca del sistema</h2>
            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Producto" value={APP_NAME} />
              <SummaryRow label="Version" value={APP_VERSION} />
              <SummaryRow label="Build" value={BUILD_DATE} />
              <SummaryRow label="Plan" value={hubConfig.plan || 'Interno'} />
              <SummaryRow label="Estado" value={getHubStatusLabel(hubConfig.status)} />
              <SummaryRow
                label="Ultima conexion"
                value={
                  hubConfig.connected
                    ? new Date(hubConfig.last_seen_at).toLocaleString()
                    : 'Usando cache/local'
                }
              />
              <SummaryRow label="Empresa" value={form.name || '-'} />
              <SummaryRow label="Sistema" value={form.system_name || '-'} />
              <SummaryRow label="Slug" value={form.slug || '-'} />
              <SummaryRow label="WhatsApp" value={form.whatsapp || '-'} />
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  )
}

function Input({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
      />
    </div>
  )
}

function CatalogRow({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="min-w-0">
        <p className={`truncate font-bold ${active ? 'text-zinc-950' : 'text-zinc-400'}`}>
          {label}
        </p>
        <p className={`text-xs ${active ? 'text-emerald-600' : 'text-zinc-400'}`}>
          {active ? 'Activo' : 'Inactivo'}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`rounded-lg border px-3 py-2 text-sm font-bold ${
          active
            ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
        }`}
      >
        {active ? <Trash2 size={16} /> : 'Activar'}
      </button>
    </div>
  )
}

function LimitSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-bold text-zinc-950">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 font-semibold outline-none focus:border-emerald-500"
      >
        {[5, 10, 20, 50].map((limit) => (
          <option key={limit} value={String(limit)}>{limit} productos</option>
        ))}
      </select>
    </label>
  )
}
function CooperativeCommissionRow({
  commission,
  onSave,
  onToggle,
}: {
  commission: CooperativeCommission
  onSave: (value: number) => void
  onToggle: () => void
}) {
  const [value, setValue] = useState(String(Number(commission.commission_percent || 0)))

  useEffect(() => {
    setValue(String(Number(commission.commission_percent || 0)))
  }, [commission.commission_percent])

  const nameClass = commission.active ? 'text-zinc-950' : 'text-zinc-400'
  const statusClass = commission.active ? 'text-emerald-600' : 'text-zinc-400'
  const buttonClass = commission.active
    ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
    : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate font-bold ${nameClass}`}>{commission.cooperative_name}</p>
          <p className={`text-xs ${statusClass}`}>
            {commission.active ? 'Activa' : 'Inactiva'}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className={`rounded-lg border px-3 py-2 text-sm font-bold ${buttonClass}`}
        >
          {commission.active ? <Trash2 size={16} /> : 'Activar'}
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={() => onSave(Number(value || 0))}
          className="rounded-xl bg-zinc-950 px-4 py-3 font-bold text-white hover:bg-zinc-800"
        >
          Guardar %
        </button>
      </div>
    </div>
  )
}

function getHubStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Activo',
    maintenance: 'Mantenimiento',
    suspended: 'Suspendido',
    expired: 'Vencido',
  }
  return labels[status] || status
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 pb-2 last:border-b-0">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-bold text-zinc-950">{value}</span>
    </div>
  )
}
