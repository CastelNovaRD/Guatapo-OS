'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart3,
  Building2,
  FileText,
  Globe,
  Home,
  LogOut,
  Package,
  RefreshCw,
  Settings,
  Shield,
  Bell,
  ChevronDown,
  ExternalLink,
  Menu,
  ShoppingCart,
  Store,
  Users,
  CalendarDays,
  WalletCards,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mergePermissions, PERMISSIONS, type PermissionMap, type PermissionKey } from '@/lib/permissions'
import {
  DEFAULT_HUB_CONFIG,
  HUB_MODULES,
  getHubModuleForPath,
  isHubModuleEnabled,
  normalizeHubConfig,
  type HubConfig,
  type HubNotification,
} from '@/lib/castelnova-hub'
import { APP_NAME, APP_VERSION } from '@/lib/version'

const CLIENT_LOGO_STORAGE_PREFIX = 'castelnova_store_logo_'
const HUB_CONFIG_CACHE_KEY = 'castelnova_hub_config_cache'

type CashStatus = 'loading' | 'open' | 'closed' | 'error'
type StoreContext = {
  platformName: string
  storeName: string
  systemName: string
  userName: string
  userRole: string
  permissions: PermissionMap
}

export default function AppShell({
  children,
  defaultSidebarOpen = true,
  showSidebarToggle = false,
}: {
  children: React.ReactNode
  defaultSidebarOpen?: boolean
  showSidebarToggle?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [cashStatus, setCashStatus] = useState<CashStatus>('loading')
  const [cashError, setCashError] = useState('')
  const [currentStoreId, setCurrentStoreId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen)
  const [logoFailed, setLogoFailed] = useState(false)
  const [clientLogoUrl, setClientLogoUrl] = useState('')
  const [hubConfig, setHubConfig] = useState<HubConfig>(DEFAULT_HUB_CONFIG)
  const [hubNotice, setHubNotice] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [context, setContext] = useState<StoreContext>({
    platformName: 'CastelNova ERP',
    storeName: 'Guatapo SRL',
    systemName: 'Guatapo OS',
    userName: 'Usuario',
    userRole: 'Administrador',
    permissions: mergePermissions('admin'),
  })

  useEffect(() => {
    let active = true

    async function initializeAuth() {
      await loadSessionContext({ redirectIfMissing: true })
    }

    void initializeAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.info('[Auth] Evento:', event)

      if (!active) return

      if (event === 'SIGNED_OUT') {
        setAuthenticated(false)
        setCurrentStoreId(null)
        setCashStatus('loading')
        setAuthLoading(false)
        router.replace('/login')
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        console.info('[Auth] Token renovado correctamente')
      }

      if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        void loadSessionContext({ redirectIfMissing: false })
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!currentStoreId) return

    loadClientLogo(currentStoreId)

    const refreshLogo = () => loadClientLogo(currentStoreId)
    window.addEventListener('guatapo:store-logo-updated', refreshLogo)
    window.addEventListener('storage', refreshLogo)

    return () => {
      window.removeEventListener('guatapo:store-logo-updated', refreshLogo)
      window.removeEventListener('storage', refreshLogo)
    }
  }, [currentStoreId])

  useEffect(() => {
    if (authLoading) return

    loadHubConfig()
    loadCashStatus()

    const refresh = () => loadCashStatus()
    const refreshHub = () => loadHubConfig()
    const hubInterval = window.setInterval(loadHubConfig, 60000)
    const interval = window.setInterval(refresh, 15000)

    window.addEventListener('focus', refresh)
    window.addEventListener('focus', refreshHub)
    window.addEventListener('guatapo:cash-updated', refresh)

    return () => {
      window.clearInterval(hubInterval)
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('focus', refreshHub)
      window.removeEventListener('guatapo:cash-updated', refresh)
    }
  }, [authLoading, currentStoreId])

  async function loadHubConfig() {
    if (typeof window === 'undefined') return

    const cached = window.localStorage.getItem(HUB_CONFIG_CACHE_KEY)
    if (cached) {
      try {
        setHubConfig(normalizeHubConfig(JSON.parse(cached)))
      } catch {
        window.localStorage.removeItem(HUB_CONFIG_CACHE_KEY)
      }
    }

    try {
      const response = await fetch('/api/hub/config', { cache: 'no-store' })
      const data = normalizeHubConfig(await response.json())
      console.info('[CastelNova Hub] URL consultada:', '/api/hub/config')
      console.info('[CastelNova Hub] Codigo HTTP:', response.status)
      console.info('[CastelNova Hub] Cuerpo JSON recibido:', data)
      console.info('[CastelNova Hub] Modulos normalizados:', data.modules_enabled)

      if (data.connected) {
        window.localStorage.setItem(HUB_CONFIG_CACHE_KEY, JSON.stringify(data))
        setHubNotice('')
        setHubConfig(data)
        return
      }

      if (cached) {
        const cachedData = normalizeHubConfig(JSON.parse(cached))
        setHubConfig({ ...cachedData, connected: false })
        setHubNotice(data.maintenance_message || 'Usando la ultima configuracion valida de CastelNova Hub.')
        return
      }

      setHubConfig(data)
      setHubNotice(data.maintenance_message || '')
    } catch {
      if (!cached) return
      setHubConfig({ ...normalizeHubConfig(JSON.parse(cached)), connected: false })
      setHubNotice('No se pudo conectar con CastelNova Hub. Se mantiene la ultima configuracion valida.')
    }
  }

  async function loadSessionContext({ redirectIfMissing = true }: { redirectIfMissing?: boolean } = {}) {
    setAuthLoading(true)

    try {
      let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] | null
      let lastAuthError = ''

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionData.session?.user) {
          user = sessionData.session.user
          break
        }

        if (sessionError) lastAuthError = sessionError.message

        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (userData.user) {
          user = userData.user
          console.info('[Auth] Sesion recuperada desde getUser()')
          break
        }

        if (userError && userError.name !== 'AuthSessionMissingError') {
          lastAuthError = userError.message
        }

        await new Promise((resolve) => window.setTimeout(resolve, 200))
      }

      if (!user) {
        console.warn('[Auth] Sesion no disponible', lastAuthError)
        setAuthenticated(false)
        if (redirectIfMissing) router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('app_profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle()

      const membershipResult = await supabase
        .from('store_users')
        .select('role, store_id, permissions')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle()

      let membership = membershipResult.data as { role?: string | null; store_id?: string | null; permissions?: PermissionMap | null } | null

      if (membershipResult.error && membershipResult.error.code === '42703') {
        const fallbackMembership = await supabase
          .from('store_users')
          .select('role, store_id')
          .eq('user_id', user.id)
          .eq('active', true)
          .limit(1)
          .maybeSingle()
        membership = fallbackMembership.data as { role?: string | null; store_id?: string | null; permissions?: PermissionMap | null } | null
      }

      if (membershipResult.error && membershipResult.error.code !== '42703') {
        console.warn('[Auth] No se pudo cargar la tienda del usuario:', membershipResult.error.message)
      }

      let store: { name: string | null; system_name: string | null } | null = null

      if (membership?.store_id) {
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('name, system_name')
          .eq('id', membership.store_id)
          .maybeSingle()

        if (storeError) console.warn('[Auth] Error cargando tienda:', storeError.message)
        store = storeData
      }

      const storeName = store?.name || 'Guatapo SRL'
      const baseRole = membership?.role || profile?.role || 'Administrador'

      setAuthenticated(true)
      setCurrentStoreId(membership?.store_id || null)
      setContext({
        platformName: 'CastelNova ERP',
        storeName,
        systemName: store?.system_name || 'Guatapo OS',
        userName: storeName,
        userRole: baseRole,
        permissions: mergePermissions(baseRole, membership?.permissions || null),
      })
      console.info('[Auth] Sesion y contexto recuperados')
    } catch (error) {
      console.error('Error cargando contexto del sistema', error)
    } finally {
      setAuthLoading(false)
    }
  }

  async function loadCashStatus() {
    if (!currentStoreId) {
      setCashStatus('loading')
      return
    }

    setCashStatus('loading')

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select('id')
        .eq('store_id', currentStoreId)
        .eq('status', 'open')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.warn('[Caja] Error consultando caja abierta:', error.message)
        setCashError('No se pudo verificar la caja. Reintentando...')
        setCashStatus('error')
        return
      }

      setCashError('')
      setCashStatus(data ? 'open' : 'closed')
      if (data) console.info('[Caja] Caja abierta recuperada:', data.id)
    } catch (error) {
      console.warn('[Caja] Error de red verificando caja:', error)
      setCashError('No se pudo verificar la caja. Reintentando...')
      setCashStatus('error')
    }
  }

  function loadClientLogo(storeId: string) {
    if (typeof window === 'undefined') return
    setClientLogoUrl(window.localStorage.getItem(`${CLIENT_LOGO_STORAGE_PREFIX}${storeId}`) || '')
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <p className="text-zinc-500">Cargando sistema...</p>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <p className="text-zinc-500">Redirigiendo al login...</p>
      </main>
    )
  }

  const canOpen = (permission: PermissionKey, moduleName?: string) =>
    Boolean(context.permissions[permission]) && isHubModuleEnabled(hubConfig, moduleName || null)

  const unreadNotifications = hubConfig.notifications.filter(
    (notification) => !notification.read && !notification.archived
  )
  const visibleNotifications = hubConfig.notifications.filter((notification) => !notification.archived)
  const currentHubModule = getHubModuleForPath(pathname)
  const moduleBlocked = !isHubModuleEnabled(hubConfig, currentHubModule)
  const systemBlocked =
    ['suspended', 'expired'].includes(hubConfig.status) && !pathname.startsWith('/configuracion')
  const maintenanceActive = hubConfig.status === 'maintenance'
  const sidebarItems = [
    {
      href: '/',
      icon: <Home size={18} />,
      text: 'Dashboard',
      permission: PERMISSIONS.DASHBOARD_VIEW,
      moduleKey: HUB_MODULES.dashboard,
    },
    {
      href: '/pos',
      icon: <ShoppingCart size={18} />,
      text: 'POS de Venta',
      permission: PERMISSIONS.POS_USE,
      moduleKey: HUB_MODULES.pos,
    },
    {
      href: '/cooperativas',
      icon: <Building2 size={18} />,
      text: 'POS Cooperativa',
      permission: PERMISSIONS.COOPERATIVES_MANAGE,
      moduleKey: HUB_MODULES.cooperatives,
    },
    {
      href: '/cuadres',
      icon: <CalendarDays size={18} />,
      text: 'Cuadres',
      permission: PERMISSIONS.CASH_MANAGE,
      moduleKey: HUB_MODULES.cash_registers,
    },
    {
      href: '/ventas',
      icon: <BarChart3 size={18} />,
      text: 'Ventas',
      permission: PERMISSIONS.SALES_VIEW,
      moduleKey: HUB_MODULES.sales,
    },
    {
      href: '/cotizaciones',
      icon: <FileText size={18} />,
      text: 'Cotizaciones',
      permission: PERMISSIONS.QUOTES_MANAGE,
      moduleKey: HUB_MODULES.quotes,
    },
    {
      href: '/inventario',
      icon: <Package size={18} />,
      text: 'Inventario',
      permission: PERMISSIONS.INVENTORY_VIEW,
      moduleKey: HUB_MODULES.inventory,
    },
    {
      href: '/cuentas-por-cobrar',
      icon: <WalletCards size={18} />,
      text: 'Cuentas por cobrar',
      permission: PERMISSIONS.RECEIVABLES_VIEW,
      moduleKey: HUB_MODULES.accounts_receivable,
    },
    {
      href: '/reportes',
      icon: <BarChart3 size={18} />,
      text: 'Reportes',
      permission: PERMISSIONS.REPORTS_VIEW,
      moduleKey: HUB_MODULES.reports,
    },
    {
      href: '/compras',
      icon: <Store size={18} />,
      text: 'Compras',
      permission: PERMISSIONS.PURCHASES_MANAGE,
      moduleKey: HUB_MODULES.purchases,
    },
    {
      href: '/clientes',
      icon: <Users size={18} />,
      text: 'Clientes',
      permission: PERMISSIONS.CUSTOMERS_VIEW,
      moduleKey: HUB_MODULES.customers,
    },
    {
      href: '/auditoria',
      icon: <Shield size={18} />,
      text: 'Auditoría',
      permission: PERMISSIONS.AUDIT_VIEW,
      moduleKey: HUB_MODULES.audit,
    },
    {
      href: '/empleados',
      icon: <Users size={18} />,
      text: 'Empleados',
      permission: PERMISSIONS.EMPLOYEES_MANAGE,
      moduleKey: HUB_MODULES.employees,
    },
    {
      href: '/configuracion/web',
      icon: <Globe size={18} />,
      text: 'Tienda Web',
      permission: PERMISSIONS.WEB_MANAGE,
      moduleKey: HUB_MODULES.online_store,
    },
    {
      href: '/configuracion',
      icon: <Settings size={18} />,
      text: 'Configuración',
      permission: PERMISSIONS.SETTINGS_MANAGE,
      moduleKey: HUB_MODULES.settings,
    },
  ].filter((item) => canOpen(item.permission, item.moduleKey))

  function updateNotification(id: string, patch: Partial<HubNotification>) {
    setHubConfig((current) => {
      const next = {
        ...current,
        notifications: current.notifications.map((notification) =>
          notification.id === id ? { ...notification, ...patch } : notification
        ),
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(HUB_CONFIG_CACHE_KEY, JSON.stringify(next))
      }
      return next
    })
  }

  const userInitials = context.userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AC'

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-20 items-center justify-between border-b border-zinc-200 bg-white px-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          {showSidebarToggle && (
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          )}

          {logoFailed ? (
            <h1 className="text-2xl font-black text-zinc-950">{context.platformName}</h1>
          ) : (
            <img
              src="/logo/logo-castelnova-os.png"
              alt={context.platformName}
              className="h-16 w-72 object-contain object-left"
              onError={() => setLogoFailed(true)}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/web"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 lg:inline-flex"
          >
            <ExternalLink size={17} />
            <span>Ver Mi Tienda</span>
          </a>

          <button
            type="button"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 md:inline-flex"
          >
            <Store size={18} />
            <span>CastelNova Store</span>
            <ChevronDown size={16} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700"
              aria-label="Notificaciones"
            >
              <Bell size={20} />
              {unreadNotifications.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-black text-white ring-2 ring-white">
                  {unreadNotifications.length}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <p className="font-black text-zinc-950">Notificaciones</p>
                  <p className="text-xs text-zinc-500">CastelNova Hub</p>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {visibleNotifications.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-zinc-500">No hay notificaciones.</p>
                  ) : (
                    visibleNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`border-b border-zinc-100 px-4 py-3 last:border-b-0 ${
                          notification.read ? 'bg-white' : 'bg-emerald-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-zinc-950">{notification.title}</p>
                            <p className="mt-1 text-sm text-zinc-600">{notification.message}</p>
                            {notification.created_at && (
                              <p className="mt-2 text-xs text-zinc-400">
                                {new Date(notification.created_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-bold uppercase text-zinc-500">
                            {notification.type || 'info'}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {notification.href && (
                            <a
                              href={notification.href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => updateNotification(notification.id, { read: true })}
                              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-800"
                            >
                              Abrir
                            </a>
                          )}
                          {!notification.read && (
                            <button
                              type="button"
                              onClick={() => updateNotification(notification.id, { read: true })}
                              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                            >
                              Marcar leida
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => updateNotification(notification.id, { archived: true, read: true })}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-zinc-50"
                          >
                            Archivar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-bold text-zinc-950">{context.userName}</p>
            <p className="text-xs capitalize text-zinc-500">{context.userRole}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-sm font-black text-white ring-1 ring-zinc-200">
            {clientLogoUrl ? (
              <img
                src={clientLogoUrl}
                alt={context.userName}
                className="h-full w-full object-cover"
                onError={() => setClientLogoUrl('')}
              />
            ) : (
              userInitials
            )}
          </div>
        </div>
      </header>

      <aside
        className={`fixed left-0 top-20 z-40 h-[calc(100vh-5rem)] w-72 overflow-y-auto border-r border-zinc-200 bg-white p-5 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-lg font-black text-emerald-700">{context.storeName}</p>
          <p className="mt-1 text-sm font-medium text-zinc-600">{context.systemName}</p>
        </div>

        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            cashStatus === 'open'
              ? 'bg-emerald-50 text-emerald-700'
              : cashStatus === 'loading'
                ? 'bg-zinc-100 text-zinc-500'
                : cashStatus === 'error'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-600'
          }`}
        >
          {cashStatus === 'open'
            ? 'Caja abierta'
            : cashStatus === 'loading'
              ? 'Verificando caja...'
              : cashStatus === 'error'
                ? cashError || 'No se pudo verificar la caja. Reintentando...'
                : 'Caja cerrada'}
        </div>

        <nav className="mt-6 space-y-1 pb-8">
          {sidebarItems.map((item) => (
            <MenuItem key={item.href} href={item.href} icon={item.icon} text={item.text} />
          ))}

          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-zinc-600 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            <span>Cerrar sesion</span>
          </button>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-sm font-black text-zinc-950">{APP_NAME}</p>
            <p className="mt-1 text-xs font-bold text-zinc-500">Version {APP_VERSION}</p>
            <p className="mt-1 text-xs font-bold text-emerald-700">Plan {hubConfig.plan}</p>
            <button
              type="button"
              onClick={loadHubConfig}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <RefreshCw size={14} />
              Actualizar configuracion del Hub
            </button>
          </div>
        </nav>
      </aside>

      <section
        className={`p-8 pt-28 transition-[margin] duration-200 ${
          sidebarOpen ? 'ml-72' : 'ml-0'
        }`}
      >
        {hubNotice && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {hubNotice}
          </div>
        )}

        {maintenanceActive && !systemBlocked && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {hubConfig.maintenance_message || 'Sistema en mantenimiento. Algunas funciones pueden estar limitadas.'}
          </div>
        )}

        {systemBlocked ? (
          <HubBlockedScreen
            title={hubConfig.status === 'expired' ? 'Licencia vencida' : 'Sistema suspendido'}
            message={
              hubConfig.maintenance_message ||
              'Esta instalacion fue bloqueada desde CastelNova Hub. Tus datos se conservan intactos.'
            }
          />
        ) : moduleBlocked ? (
          <HubBlockedScreen
            title="Modulo no habilitado"
            message="Este modulo esta deshabilitado desde CastelNova Hub. Los datos se conservan y volveran a aparecer al habilitarlo."
          />
        ) : (
          children
        )}
      </section>
    </main>
  )
}

function HubBlockedScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <Shield size={28} />
      </div>
      <h1 className="mt-4 text-2xl font-black text-zinc-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-zinc-600">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/configuracion"
          className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700"
        >
          Ir a configuracion
        </Link>
        <a
          href="https://wa.me/18096361020"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-zinc-300 bg-white px-5 py-3 font-bold text-zinc-700 hover:bg-zinc-50"
        >
          Soporte tecnico
        </a>
      </div>
    </div>
  )
}

function MenuItem({
  href,
  icon,
  text,
}: {
  href: string
  icon: React.ReactNode
  text: string
}) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
        active
          ? 'bg-emerald-50 text-emerald-700'
          : 'text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700'
      }`}
    >
      {icon}
      <span>{text}</span>
    </Link>
  )
}




