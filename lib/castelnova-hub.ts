import { APP_NAME, APP_VERSION, BUILD_DATE } from '@/lib/version'

export type HubStatus = 'active' | 'suspended' | 'maintenance' | 'expired'

export type HubNotification = {
  id: string
  title: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'danger'
  href?: string | null
  read?: boolean
  archived?: boolean
  created_at?: string
}

export type HubConfig = {
  status: HubStatus
  plan: string
  enabled_modules: string[]
  modules_enabled: Record<string, boolean>
  current_version: string
  latest_version: string
  maintenance_message: string | null
  notifications: HubNotification[]
  connected: boolean
  last_seen_at: string
  grace_until: string | null
}

type CastelNovaHubResponse = {
  status?: string
  plan?: string | { name?: string | null } | null
  modules?: Record<string, boolean> | string[] | null
  enabled_modules?: string[]
  current_version?: string
  currentVersion?: string
  latest_version?: string
  latestVersion?: string
  maintenance_message?: string | null
  maintenanceMessage?: string | null
  notifications?: HubNotification[]
  error?: string
  message?: string
}

export const HUB_MODULES = {
  dashboard: 'dashboard',
  pos: 'pos',
  inventory: 'inventory',
  purchases: 'purchases',
  sales: 'sales',
  customers: 'customers',
  quotes: 'quotes',
  cash_registers: 'cash_registers',
  cooperatives: 'cooperatives',
  accounts_receivable: 'accounts_receivable',
  reports: 'reports',
  online_store: 'online_store',
  settings: 'settings',
  audit: 'audit',
  employees: 'employees',
} as const

export type HubModuleKey = (typeof HUB_MODULES)[keyof typeof HUB_MODULES]

const LOCAL_ONLY_MODULES = new Set<string>([
  HUB_MODULES.settings,
  HUB_MODULES.audit,
  HUB_MODULES.employees,
])

export const ALL_HUB_MODULE_KEYS = Object.values(HUB_MODULES)

export function modulesMapFromEnabledList(enabledModules: string[]) {
  const enabledSet = new Set(enabledModules)
  return Object.fromEntries(
    ALL_HUB_MODULE_KEYS.map((moduleKey) => [moduleKey, enabledSet.has(moduleKey)])
  ) as Record<string, boolean>
}

export const DEFAULT_HUB_CONFIG: HubConfig = {
  status: 'active',
  plan: 'Interno',
  enabled_modules: Object.values(HUB_MODULES),
  modules_enabled: modulesMapFromEnabledList(Object.values(HUB_MODULES)),
  current_version: APP_VERSION,
  latest_version: APP_VERSION,
  maintenance_message: null,
  notifications: [],
  connected: false,
  last_seen_at: new Date(0).toISOString(),
  grace_until: null,
}

export function normalizeHubConfig(value: Partial<HubConfig> | null | undefined): HubConfig {
  const status = ['active', 'suspended', 'maintenance', 'expired'].includes(String(value?.status))
    ? (value?.status as HubStatus)
    : 'active'

  const rawModulesMap =
    value?.modules_enabled && typeof value.modules_enabled === 'object'
      ? value.modules_enabled
      : null

  const enabledModules = rawModulesMap
    ? ALL_HUB_MODULE_KEYS.filter((moduleKey) => rawModulesMap[moduleKey] === true)
    : Array.isArray(value?.enabled_modules)
      ? value.enabled_modules.filter((module) => typeof module === 'string')
      : DEFAULT_HUB_CONFIG.enabled_modules

  const modulesEnabled = rawModulesMap
    ? Object.fromEntries(
        ALL_HUB_MODULE_KEYS.map((moduleKey) => [
          moduleKey,
          rawModulesMap[moduleKey] === true ||
            (LOCAL_ONLY_MODULES.has(moduleKey) && !(moduleKey in rawModulesMap)),
        ])
      )
    : modulesMapFromEnabledList(enabledModules)

  return {
    ...DEFAULT_HUB_CONFIG,
    ...value,
    status,
    enabled_modules: enabledModules,
    modules_enabled: modulesEnabled,
    current_version: value?.current_version || APP_VERSION,
    latest_version: value?.latest_version || value?.current_version || APP_VERSION,
    notifications: Array.isArray(value?.notifications) ? value.notifications : [],
    last_seen_at: value?.last_seen_at || new Date().toISOString(),
  }
}

function normalizeServerHubResponse(value: CastelNovaHubResponse): HubConfig {
  const modulesEnabled = normalizeHubModules(value)
  const enabledModules = ALL_HUB_MODULE_KEYS.filter((moduleKey) => modulesEnabled[moduleKey] === true)

  return normalizeHubConfig({
    status: value.status as HubStatus,
    plan: typeof value.plan === 'string' ? value.plan : value.plan?.name || DEFAULT_HUB_CONFIG.plan,
    enabled_modules: enabledModules,
    modules_enabled: modulesEnabled,
    current_version: value.current_version || value.currentVersion || APP_VERSION,
    latest_version: value.latest_version || value.latestVersion || value.current_version || value.currentVersion || APP_VERSION,
    maintenance_message: value.maintenance_message || value.maintenanceMessage || null,
    notifications: value.notifications || [],
  })
}

export function normalizeHubModules(value: CastelNovaHubResponse | Partial<HubConfig> | null | undefined) {
  if (!value) return modulesMapFromEnabledList(DEFAULT_HUB_CONFIG.enabled_modules)

  if ('modules_enabled' in value && value.modules_enabled && typeof value.modules_enabled === 'object') {
    return Object.fromEntries(
      ALL_HUB_MODULE_KEYS.map((moduleKey) => [moduleKey, value.modules_enabled?.[moduleKey] === true])
    ) as Record<string, boolean>
  }

  if ('modules' in value && value.modules && !Array.isArray(value.modules)) {
    const modules = value.modules as Record<string, boolean>
    console.info('[CastelNova Hub] Propiedad de modulos recibida: modules')
    console.info('[CastelNova Hub] module_key y valores:', modules)
    return Object.fromEntries(
      ALL_HUB_MODULE_KEYS.map((moduleKey) => [
        moduleKey,
        modules[moduleKey] === true ||
          (LOCAL_ONLY_MODULES.has(moduleKey) && !(moduleKey in modules)),
      ])
    ) as Record<string, boolean>
  }

  const enabledList =
    'enabled_modules' in value && Array.isArray(value.enabled_modules)
      ? value.enabled_modules
      : 'modules' in value && Array.isArray(value.modules)
        ? value.modules
        : DEFAULT_HUB_CONFIG.enabled_modules

  console.info(
    '[CastelNova Hub] Propiedad de modulos recibida:',
    'enabled_modules' in value && Array.isArray(value.enabled_modules) ? 'enabled_modules' : 'modules'
  )
  console.info('[CastelNova Hub] module_key habilitados:', enabledList)

  const normalizedList = enabledList.filter((module) => typeof module === 'string')
  const normalizedSet = new Set(normalizedList)

  return Object.fromEntries(
    ALL_HUB_MODULE_KEYS.map((moduleKey) => [
      moduleKey,
      normalizedSet.has(moduleKey) || LOCAL_ONLY_MODULES.has(moduleKey),
    ])
  ) as Record<string, boolean>
}

function parseHubJson(text: string): CastelNovaHubResponse | null {
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as CastelNovaHubResponse
  } catch {
    return { error: text }
  }
}

function getHubErrorMessage(status: number, body: CastelNovaHubResponse | null) {
  const bodyMessage = body?.error || body?.message

  if (status === 401) return bodyMessage || 'Instalacion no autorizada.'
  if (status === 403) return bodyMessage || 'Instalacion invalida.'
  if (status === 404) return bodyMessage || 'Endpoint de CastelNova Hub inexistente.'
  if (status >= 500) return bodyMessage || 'Error del servidor de CastelNova Hub.'

  return bodyMessage || `CastelNova Hub respondio ${status}.`
}

export async function fetchHubConfigFromServer(): Promise<HubConfig> {
  const hubUrl = process.env.CASTELNOVA_HUB_URL
  const installationId = process.env.CASTELNOVA_INSTALLATION_ID
  const installationKey = process.env.CASTELNOVA_INSTALLATION_KEY

  if (!hubUrl || !installationId || !installationKey) {
    return normalizeHubConfig({
      connected: false,
      maintenance_message: 'CastelNova Hub no esta configurado. Guatapo OS esta usando la licencia interna local.',
      last_seen_at: new Date().toISOString(),
    })
  }

  const targetUrl = `${hubUrl.replace(/\/$/, '')}/api/installations/config`
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-installation-id': installationId,
      'x-installation-key': installationKey,
      'x-app-name': APP_NAME,
      'x-app-version': APP_VERSION,
      'x-build-date': BUILD_DATE,
    },
    cache: 'no-store',
  })

  const responseText = await response.text()
  const data = parseHubJson(responseText)

  console.info('[CastelNova Hub] URL consultada:', targetUrl)
  console.info('[CastelNova Hub] Codigo HTTP:', response.status)
  console.info('[CastelNova Hub] Cuerpo JSON recibido:', data)

  if (!response.ok || !data) {
    throw new Error(getHubErrorMessage(response.status, data))
  }

  return normalizeHubConfig({
    ...normalizeServerHubResponse(data),
    connected: true,
    last_seen_at: new Date().toISOString(),
  })
}

export function getHubModuleForPath(pathname: string) {
  if (pathname === '/') return HUB_MODULES.dashboard
  if (pathname.startsWith('/pos')) return HUB_MODULES.pos
  if (pathname.startsWith('/inventario')) return HUB_MODULES.inventory
  if (pathname.startsWith('/compras')) return HUB_MODULES.purchases
  if (pathname.startsWith('/ventas')) return HUB_MODULES.sales
  if (pathname.startsWith('/clientes')) return HUB_MODULES.customers
  if (pathname.startsWith('/cotizaciones')) return HUB_MODULES.quotes
  if (pathname.startsWith('/cuadres') || pathname.startsWith('/caja')) return HUB_MODULES.cash_registers
  if (pathname.startsWith('/cooperativas')) return HUB_MODULES.cooperatives
  if (pathname.startsWith('/cuentas-por-cobrar')) return HUB_MODULES.accounts_receivable
  if (pathname.startsWith('/reportes')) return HUB_MODULES.reports
  if (pathname.startsWith('/web') || pathname.startsWith('/configuracion/web')) return HUB_MODULES.online_store
  if (pathname.startsWith('/configuracion')) return HUB_MODULES.settings
  if (pathname.startsWith('/auditoria')) return HUB_MODULES.audit
  if (pathname.startsWith('/empleados')) return HUB_MODULES.employees
  return null
}

export function isHubModuleEnabled(config: HubConfig | null | undefined, moduleName: string | null) {
  if (!moduleName) return true
  const normalized = normalizeHubConfig(config)

  if (!normalized.connected && LOCAL_ONLY_MODULES.has(moduleName)) return true
  if (!normalized.connected) return normalized.modules_enabled[moduleName] !== false

  return normalized.modules_enabled[moduleName] === true
}
