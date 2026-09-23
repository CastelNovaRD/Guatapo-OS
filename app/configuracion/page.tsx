'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { DEFAULT_HUB_CONFIG, normalizeHubConfig, type HubConfig } from '@/lib/hub-config'
import { APP_NAME, APP_VERSION, BUILD_DATE } from '@/lib/version'
import {
  CheckCircle,
  Bell,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Headphones,
  ImageIcon,
  KeyRound,
  Loader2,
  MessageCircle,
  Package,
  Plus,
  Save,
  Settings,
  Shield,
  Store,
  Tags,
  Trash2,
  Users,
  ReceiptText,
  Server,
} from 'lucide-react'

const SUPPORT_WHATSAPP_NUMBER = '18494572425'
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
  quote_products_limit?: number | null
}

function isStoreSettings(value: unknown): value is StoreSettings {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoreSettings>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.slug === 'string' &&
    typeof candidate.system_name === 'string' &&
    typeof candidate.active === 'boolean'
  )
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
  quote_products_limit: string
}

type ProductCategory = {
  id: string
  name: string
  active: boolean
}

type SettingsSection = 'general' | 'security' | 'web' | 'system' | 'users' | 'notifications' | 'billing' | 'integrations'


const emptyForm: SettingsForm = {
  name: '',
  slug: '',
  system_name: '',
  phone: '',
  whatsapp: '',
  rnc: '',
  active: true,
  pos_featured_products_limit: '10',
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
  const [newCategory, setNewCategory] = useState('')
  const [clientLogo, setClientLogo] = useState('')
  const [hubConfig, setHubConfig] = useState<HubConfig>(DEFAULT_HUB_CONFIG)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

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
    {
      label: 'Catálogo digital',
      href: form.slug
        ? `${baseUrl}/catalogo?store=${encodeURIComponent(form.slug)}`
        : `${baseUrl}/catalogo`,
    },
  ]

async function loadSettings() {
  setLoading(true)

  try {
    const response = await fetch('/api/store-settings', {
      method: 'GET',
      cache: 'no-store',
    })

    const data = (await response.json().catch(() => null)) as StoreSettings | {
  error?: string
} | null

    if (!response.ok) {
      throw new Error(
        data && 'error' in data && data.error
          ? data.error
          : 'No se pudo cargar la configuracion.'
      )
    }

    if (!isStoreSettings(data)) {
      throw new Error('No se encontro la tienda asignada.')
    }

    setStore(data)

    setClientLogo(
      typeof window === 'undefined'
        ? ''
        : window.localStorage.getItem(
            `${CLIENT_LOGO_STORAGE_PREFIX}${data.id}`
          ) || ''
    )

    setForm({
      name: data.name || '',
      slug: data.slug || '',
      system_name: data.system_name || '',
      phone: data.phone || '',
      whatsapp: data.whatsapp || '',
      rnc: data.rnc || '',
      active: data.active !== false,
      pos_featured_products_limit: String(
        [5, 10, 20, 50].includes(
          Number(data.pos_featured_products_limit)
        )
          ? data.pos_featured_products_limit
          : 10
      ),
      quote_products_limit: String(
        [5, 10, 20, 50].includes(
          Number(data.quote_products_limit)
        )
          ? data.quote_products_limit
          : 10
      ),
    })

    await loadCatalogSettings()
  } catch (error) {
    alert(
      'Error cargando configuracion: ' +
        (error instanceof Error ? error.message : 'Error desconocido.')
    )
  } finally {
    setLoading(false)
  }
}

  async function loadCatalogSettings() {
    const categoriesData = await fetch('/api/categories').then(async (response) => response.ok ? response.json() : [])

    setCategories(categoriesData || [])
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
  if (!form.name.trim()) {
    return alert('Escribe el nombre de la tienda.')
  }

  if (!form.system_name.trim()) {
    return alert('Escribe el nombre del sistema.')
  }

  const slug = normalizeSlug(form.slug || form.name)

  if (!slug) {
    return alert('El slug no es valido.')
  }

  const posFeaturedLimit = Number(
    form.pos_featured_products_limit || 10
  )

  const quoteProductsLimit = Number(
    form.quote_products_limit || 10
  )

  if (![5, 10, 20, 50].includes(posFeaturedLimit)) {
    return alert(
      'Selecciona una cantidad valida para productos destacados del POS.'
    )
  }

  if (![5, 10, 20, 50].includes(quoteProductsLimit)) {
    return alert(
      'Selecciona una cantidad valida para productos de cotizaciones.'
    )
  }

  setSaving(true)
  setSaved(false)

  try {
    const response = await fetch('/api/store-settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: form.name.trim(),
        slug,
        system_name: form.system_name.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        rnc: form.rnc.trim() || null,
        active: form.active,
        pos_featured_products_limit: posFeaturedLimit,
        quote_products_limit: quoteProductsLimit,
      }),
    })

    const data = (await response.json().catch(() => null)) as
      | StoreSettings
      | { error?: string }
      | null

    if (!response.ok) {
      const message =
        data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
          ? data.error
          : 'No se pudo guardar la configuracion.'

      throw new Error(message)
    }

    if (
      !data ||
      typeof data !== 'object' ||
      !('id' in data)
    ) {
      throw new Error(
        'La API no devolvio la configuracion actualizada.'
      )
    }

    const updatedStore = data as StoreSettings

    setStore(updatedStore)

    setForm({
      name: updatedStore.name || '',
      slug: updatedStore.slug || '',
      system_name: updatedStore.system_name || '',
      phone: updatedStore.phone || '',
      whatsapp: updatedStore.whatsapp || '',
      rnc: updatedStore.rnc || '',
      active: updatedStore.active !== false,
      pos_featured_products_limit: String(
        [5, 10, 20, 50].includes(
          Number(updatedStore.pos_featured_products_limit)
        )
          ? updatedStore.pos_featured_products_limit
          : 10
      ),
      quote_products_limit: String(
        [5, 10, 20, 50].includes(
          Number(updatedStore.quote_products_limit)
        )
          ? updatedStore.quote_products_limit
          : 10
      ),
    })

    setSaved(true)

    window.dispatchEvent(
      new Event('shopdesk:settings-updated')
    )
  } catch (error) {
    alert(
      'Error guardando configuracion: ' +
        (error instanceof Error
          ? error.message
          : 'Error desconocido.')
    )
  } finally {
    setSaving(false)
  }
}

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link)
    setCopyMessage('Enlace copiado')
    window.setTimeout(() => setCopyMessage(''), 1600)
  }

 async function changePassword(e?: React.FormEvent | React.MouseEvent) {
  e?.preventDefault()
  setPasswordSaved(false)

  if (newPassword.length < 10) {
    return alert('La contraseña debe tener al menos 10 caracteres.')
  }

  if (
    !/[a-z]/.test(newPassword) ||
    !/[A-Z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    return alert(
      'La contraseña debe incluir mayúscula, minúscula y un número.'
    )
  }

  if (newPassword !== confirmPassword) {
    return alert('Las contraseñas no coinciden.')
  }

  setChangingPassword(true)

  try {
    const response = await fetch('/api/auth/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newPassword,
      }),
    })

    const data = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null

    if (!response.ok) {
      throw new Error(
        data?.error || 'No se pudo cambiar la contraseña.'
      )
    }

    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaved(true)

    alert(
      'Contraseña actualizada correctamente. Inicia sesión nuevamente.'
    )

    window.location.href = '/login'
  } catch (error) {
    alert(
      'Error cambiando contraseña: ' +
        (error instanceof Error
          ? error.message
          : 'Error desconocido.')
    )
  } finally {
    setChangingPassword(false)
  }
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
      window.dispatchEvent(new Event('shopdesk:store-logo-updated'))
    }
    reader.readAsDataURL(file)
  }

  function removeClientLogo() {
    if (!store) return
    window.localStorage.removeItem(`${CLIENT_LOGO_STORAGE_PREFIX}${store.id}`)
    setClientLogo('')
    window.dispatchEvent(new Event('shopdesk:store-logo-updated'))
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!store) return
    const name = newCategory.trim()
    if (!name) return alert('Escribe el nombre de la categoria.')

    const response = await fetch('/api/categories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!response.ok) return alert('Error guardando categoria: ' + ((await response.json() as { error?: string }).error || 'Error desconocido'))

    setNewCategory('')
    await loadCatalogSettings()
  }

  async function toggleCategory(category: ProductCategory) {
    if (!store) return

    const response = await fetch(`/api/categories/${category.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !category.active }) })
    if (!response.ok) return alert('Error actualizando categoria: ' + ((await response.json() as { error?: string }).error || 'Error desconocido'))
    await loadCatalogSettings()
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

  const settingsSections: Array<{
    id: SettingsSection
    label: string
    description: string
    icon: React.ReactNode
  }> = [
    { id: 'general', label: 'General', description: 'Información básica y tienda', icon: <Settings size={20} /> },
    { id: 'security', label: 'Seguridad', description: 'Contraseña, sesiones y accesos', icon: <Shield size={20} /> },
    { id: 'web', label: 'Web', description: 'Tienda online y configuración web', icon: <Globe size={20} /> },
    { id: 'system', label: 'Sistema', description: 'Configuración propia de ShopDesk OS', icon: <Server size={20} /> },
    { id: 'users', label: 'Usuarios', description: 'Gestión relacionada con accesos', icon: <Users size={20} /> },
    { id: 'notifications', label: 'Notificaciones', description: 'Avisos y comunicaciones', icon: <Bell size={20} /> },
    { id: 'billing', label: 'Facturación', description: 'Impuestos y comprobantes', icon: <ReceiptText size={20} /> },
    { id: 'integrations', label: 'Integraciones', description: 'CastelNova Hub y conexiones', icon: <Package size={20} /> },
  ]

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-zinc-950">
            <Settings className="text-castelnova-600" size={30} />
            Configuracion
          </h1>
          <p className="mt-1 text-zinc-600">Administra las opciones del sistema, seguridad, web y más.</p>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="h-fit rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm xl:sticky xl:top-28">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${activeSection === section.id ? 'bg-castelnova-50 text-castelnova-700' : 'text-zinc-700 hover:bg-zinc-50'}`}
            >
              <span className={activeSection === section.id ? 'text-castelnova-600' : 'text-zinc-500'}>{section.icon}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold">{section.label}</span><span className="block text-xs text-zinc-500">{section.description}</span></span>
              <ChevronRight size={18} className="shrink-0" />
            </button>
          ))}
        </nav>

        <div className="min-w-0">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={saveSettings} className={`${activeSection === 'general' || activeSection === 'security' || activeSection === 'system' ? 'block' : 'hidden'} rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm`}>
          <div className="mb-5 flex items-center gap-2">
            <Store className="text-castelnova-600" size={22} />
            <h2 className="text-xl font-bold">
              {activeSection === 'security'
                ? 'Seguridad'
                : activeSection === 'system'
                  ? 'Sistema'
                  : 'Datos de la tienda'}
            </h2>
          </div>

          <div className={activeSection === 'general' ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'hidden'}>
            <Input
              label="Nombre de la empresa"
              value={form.name}
              onChange={(value) => updateForm('name', value)}
              placeholder="Mi Empresa SRL"
            />

            <Input
              label="Nombre del sistema"
              value={form.system_name}
              onChange={(value) => updateForm('system_name', value)}
              placeholder="ShopDesk OS"
            />

            <Input
              label="Slug publico"
              value={form.slug}
              onChange={(value) => updateForm('slug', value)}
              onBlur={() => updateForm('slug', normalizeSlug(form.slug || form.name))}
              placeholder="mi-tienda"
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
              name="shopdesk-business-whatsapp"
              type="tel"
              autoComplete="tel"
              value={form.whatsapp}
              onChange={(value) => updateForm('whatsapp', value)}
              placeholder="809-000-0000"
            />

            <div className="md:col-span-2">
              <label className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => updateForm('active', e.target.checked)}
                  className="h-5 w-5 accent-castelnova-600"
                />
                <span>
                  <span className="block font-bold text-zinc-950">Tienda activa</span>
                  <span className="text-sm text-zinc-600">
                    Si esta apagada, el sistema queda marcado como inactivo.
                  </span>
                </span>
              </label>
            </div>

          </div>

            <div className={activeSection === 'system' ? 'rounded-2xl border border-zinc-200 bg-zinc-50 p-5' : 'hidden'}>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-zinc-950">Configuracion de productos visibles</h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  Estas cantidades determinan cuantos productos se muestran automaticamente al abrir cada pantalla. Las busquedas pueden mostrar otros productos.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <LimitSelect
                  label="POS de venta"
                  value={form.pos_featured_products_limit}
                  onChange={(value) => updateForm('pos_featured_products_limit', value)}
                />
                <LimitSelect
                  label="Cotizaciones"
                  value={form.quote_products_limit}
                  onChange={(value) => updateForm('quote_products_limit', value)}
                />
              </div>
            </div>

            <div className={activeSection === 'general' ? 'mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5' : 'hidden'}>
              <div className="mb-4 flex items-center gap-2">
                <ImageIcon className="text-castelnova-600" size={22} />
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
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-castelnova-600 px-4 py-3 text-sm font-bold text-white hover:bg-castelnova-700">
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

            <div className={activeSection === 'security' ? 'mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5' : 'hidden'}>
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="text-castelnova-600" size={22} />
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
          <div className={`mt-6 flex flex-wrap items-center gap-3 ${activeSection === 'general' || activeSection === 'system' ? '' : 'hidden'}`}>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-castelnova-600 px-5 py-3 font-bold text-white hover:bg-castelnova-700 disabled:opacity-60"
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

        <section className={activeSection === 'system' ? 'grid grid-cols-1 gap-6' : 'hidden'}>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Tags className="text-castelnova-600" size={22} />
              <h2 className="text-xl font-bold">Categorias</h2>
            </div>

            <form onSubmit={addCategory} className="flex gap-2">
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ej: Celulares"
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-castelnova-600"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-castelnova-600 px-4 text-white hover:bg-castelnova-700"
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

        </section>

        <aside className="space-y-6">
          <section className={activeSection === 'integrations' ? 'rounded-2xl border border-castelnova-200 bg-castelnova-50 p-6 shadow-sm' : 'hidden'}>
            <div className="mb-4 flex items-center gap-2">
              <Headphones className="text-castelnova-700" size={22} />
              <h2 className="text-xl font-bold text-zinc-950">Soporte tecnico</h2>
            </div>

            <p className="text-sm leading-relaxed text-zinc-700">
              Contacta a CastelNova para ayuda con usuarios, facturacion, inventario,
              tienda web o configuracion del sistema.
            </p>

            <button
              type="button"
              onClick={openSupport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-castelnova-600 px-4 py-3 font-bold text-white hover:bg-castelnova-700"
            >
              <MessageCircle size={18} />
              Soporte por WhatsApp
            </button>
          </section>

          <section className={activeSection === 'web' ? 'rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm' : 'hidden'}>
            <div className="mb-4 flex items-center gap-2">
              <Globe className="text-castelnova-600" size={22} />
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

          <CatalogBrandingPanel visible={activeSection === 'web'} />

          <section className={activeSection === 'system' || activeSection === 'integrations' ? 'rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm' : 'hidden'}>
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
        {(activeSection === 'users' || activeSection === 'notifications' || activeSection === 'billing') && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm xl:col-span-2">
            <h2 className="text-xl font-bold text-zinc-950">
              {activeSection === 'users' ? 'Usuarios' : activeSection === 'notifications' ? 'Notificaciones' : 'Facturación'}
            </h2>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Esta configuración estará disponible cuando el módulo correspondiente esté habilitado. No hay opciones adicionales configurables en esta instalación todavía.
            </p>
          </section>
        )}
        </div>
      </div>
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
  name,
  type = 'text',
  autoComplete = 'off',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  name?: string
  type?: React.HTMLInputTypeAttribute
  autoComplete?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-600">
        {label}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-castelnova-600"
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
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-castelnova-600"
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
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 font-semibold outline-none focus:border-castelnova-600"
      >
        {[5, 10, 20, 50].map((limit) => (
          <option key={limit} value={String(limit)}>{limit} productos</option>
        ))}
      </select>
    </label>
  )
}

function CatalogBrandingPanel({ visible }: { visible: boolean }) {
  const [branding, setBranding] = useState({
    publicName: '', primaryColor: '#0f766e', accentColor: '#d6af82',
    heroTitle: 'Descubre tu esencia',
    heroSubtitle: 'Encuentra la fragancia perfecta para ti.',
    logoUrl: '', heroBannerUrl: '', whatsapp: '',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState<'logo' | 'banner' | null>(null)
  const [preview, setPreview] = useState<{ logo: string; banner: string }>({ logo: '', banner: '' })

  useEffect(() => {
    if (!visible || loaded) return
    void fetch('/api/store-settings/catalog-branding', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : {})
      .then((value) => setBranding((current) => ({ ...current, ...value })))
      .finally(() => setLoaded(true))
  }, [loaded, visible])

  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/store-settings/catalog-branding', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(branding),
      })
      if (!response.ok) throw new Error()
      alert('Branding del catálogo guardado.')
    } catch {
      alert('No se pudo guardar el branding del catálogo.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadAsset(kind: 'logo' | 'banner', file: File | null) {
    if (!file) return
    const localPreview = URL.createObjectURL(file)
    setPreview((current) => ({ ...current, [kind]: localPreview }))
    setUploadingAsset(kind)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`/api/store-settings/catalog-branding/assets/${kind}`, { method: 'POST', body: formData })
      const body = await response.json().catch(() => null) as { url?: string; error?: string } | null
      if (!response.ok || !body?.url) throw new Error(body?.error || 'No se pudo subir la imagen.')
      setBranding((current) => ({ ...current, [kind === 'logo' ? 'logoUrl' : 'heroBannerUrl']: body.url! }))
      setPreview((current) => ({ ...current, [kind]: body.url! }))
    } catch (error) {
      setPreview((current) => ({ ...current, [kind]: '' }))
      alert(error instanceof Error ? error.message : 'No se pudo subir la imagen.')
    } finally {
      setUploadingAsset(null)
      URL.revokeObjectURL(localPreview)
    }
  }

  async function removeAsset(kind: 'logo' | 'banner') {
    if (!confirm(`¿Eliminar ${kind === 'logo' ? 'el logo' : 'el banner'} del catálogo?`)) return
    setUploadingAsset(kind)
    try {
      const response = await fetch(`/api/store-settings/catalog-branding/assets/${kind}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()
      setBranding((current) => ({ ...current, [kind === 'logo' ? 'logoUrl' : 'heroBannerUrl']: '' }))
      setPreview((current) => ({ ...current, [kind]: '' }))
    } catch {
      alert('No se pudo eliminar la imagen.')
    } finally {
      setUploadingAsset(null)
    }
  }

  return <section className={visible ? 'rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm' : 'hidden'}>
    <div className="mb-5"><h2 className="text-xl font-bold">Branding del catálogo digital</h2><p className="mt-1 text-sm text-zinc-600">Personaliza la identidad pública de tu catálogo sin modificar código.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <Input label="Nombre público" value={branding.publicName} onChange={(value) => setBranding((current) => ({ ...current, publicName: value }))} placeholder="Nombre de tu negocio" />
      <Input label="WhatsApp del catálogo" value={branding.whatsapp} onChange={(value) => setBranding((current) => ({ ...current, whatsapp: value }))} placeholder="8095551234" />
      <CatalogBrandingAssetInput label="Logo del catálogo" kind="logo" value={preview.logo || branding.logoUrl} uploading={uploadingAsset === 'logo'} onFile={(file) => void uploadAsset('logo', file)} onRemove={() => void removeAsset('logo')} />
      <Input label="Título principal" value={branding.heroTitle} onChange={(value) => setBranding((current) => ({ ...current, heroTitle: value }))} placeholder="Descubre tu esencia" />
      <Input label="Texto secundario" value={branding.heroSubtitle} onChange={(value) => setBranding((current) => ({ ...current, heroSubtitle: value }))} placeholder="Descripción breve" />
      <CatalogBrandingAssetInput label="Banner principal" kind="banner" value={preview.banner || branding.heroBannerUrl} uploading={uploadingAsset === 'banner'} onFile={(file) => void uploadAsset('banner', file)} onRemove={() => void removeAsset('banner')} />
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-zinc-700">Color principal<input type="color" value={branding.primaryColor} onChange={(event) => setBranding((current) => ({ ...current, primaryColor: event.target.value }))} className="mt-2 h-11 w-full rounded-lg border border-zinc-200 bg-white p-1" /></label><label className="text-sm font-semibold text-zinc-700">Color acento<input type="color" value={branding.accentColor} onChange={(event) => setBranding((current) => ({ ...current, accentColor: event.target.value }))} className="mt-2 h-11 w-full rounded-lg border border-zinc-200 bg-white p-1" /></label></div>
    </div>
    <button type="button" onClick={save} disabled={saving} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-castelnova-600 px-4 font-bold text-white hover:bg-castelnova-700 disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar branding'}</button>
  </section>
}

function CatalogBrandingAssetInput({ label, kind, value, uploading, onFile, onRemove }: { label: string; kind: 'logo' | 'banner'; value: string; uploading: boolean; onFile: (file: File | null) => void; onRemove: () => void }) {
  return <div className="rounded-xl border border-zinc-200 p-3"><div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-zinc-700">{label}<span className="mt-1 block text-xs font-normal text-zinc-500">PNG, JPG o WEBP · máximo 5 MB</span></label>{value && <button type="button" disabled={uploading} onClick={onRemove} className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"><Trash2 size={14} />Eliminar</button>}</div><div className={`mt-3 overflow-hidden rounded-lg border border-dashed border-zinc-200 bg-zinc-50 ${kind === 'banner' ? 'aspect-[16/6]' : 'aspect-square max-w-40'}`}>{value ? <img src={value} alt={`Vista previa de ${label.toLowerCase()}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-zinc-500">Sin imagen configurada</div>}</div><label className="mt-3 inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"><ImageIcon size={16} className="mr-2" />{uploading ? 'Subiendo…' : value ? 'Reemplazar imagen' : 'Seleccionar archivo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(event) => onFile(event.target.files?.[0] || null)} /></label></div>
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
