export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  POS_USE: 'pos.use',
  CASH_MANAGE: 'cash.manage',
  QUOTES_MANAGE: 'quotes.manage',
  SALES_VIEW: 'sales.view',
  SALES_CHANGE: 'sales.change',
  SALES_CREDIT_NOTE: 'sales.credit_note',
  NCF_MANAGE: 'ncf.manage',
  REPORTS_VIEW: 'reports.view',
  RECEIVABLES_VIEW: 'receivables.view',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  EMPLOYEES_MANAGE: 'employees.manage',
  PURCHASES_MANAGE: 'purchases.manage',
  COOPERATIVES_MANAGE: 'cooperatives.manage',
  WEB_MANAGE: 'web.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
export type PermissionMap = Partial<Record<PermissionKey, boolean>>

export const PERMISSION_GROUPS: { title: string; items: { key: PermissionKey; label: string }[] }[] = [
  {
    title: 'Operación',
    items: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: 'Ver dashboard' },
      { key: PERMISSIONS.POS_USE, label: 'Usar POS de venta' },
      { key: PERMISSIONS.CASH_MANAGE, label: 'Abrir y cerrar caja' },
      { key: PERMISSIONS.QUOTES_MANAGE, label: 'Gestionar cotizaciones' },
      { key: PERMISSIONS.SALES_VIEW, label: 'Ver ventas' },
      { key: PERMISSIONS.SALES_CHANGE, label: 'Procesar cambios' },
      { key: PERMISSIONS.SALES_CREDIT_NOTE, label: 'Notas de crédito' },
      { key: PERMISSIONS.NCF_MANAGE, label: 'Gestionar comprobantes NCF' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { key: PERMISSIONS.REPORTS_VIEW, label: 'Ver reportes' },
      { key: PERMISSIONS.RECEIVABLES_VIEW, label: 'Cuentas por cobrar' },
      { key: PERMISSIONS.INVENTORY_VIEW, label: 'Ver inventario' },
      { key: PERMISSIONS.INVENTORY_MANAGE, label: 'Gestionar inventario' },
      { key: PERMISSIONS.CUSTOMERS_VIEW, label: 'Ver clientes' },
      { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'Gestionar clientes' },
      { key: PERMISSIONS.EMPLOYEES_MANAGE, label: 'Administrar empleados' },
      { key: PERMISSIONS.PURCHASES_MANAGE, label: 'Gestionar compras' },
      { key: PERMISSIONS.COOPERATIVES_MANAGE, label: 'Gestionar cooperativas' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { key: PERMISSIONS.WEB_MANAGE, label: 'Configurar tienda web' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Configuración general' },
      { key: PERMISSIONS.AUDIT_VIEW, label: 'Ver auditoría' },
    ],
  },
]

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key))

const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  administrador: ALL_PERMISSIONS,
  manager: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.CASH_MANAGE,
    PERMISSIONS.QUOTES_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CHANGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.RECEIVABLES_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.EMPLOYEES_MANAGE,
    PERMISSIONS.PURCHASES_MANAGE,
    PERMISSIONS.COOPERATIVES_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ],
  cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.CASH_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  cajero: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.CASH_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  seller: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.QUOTES_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  vendedor: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.QUOTES_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
  ],
  inventory: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.PURCHASES_MANAGE,
  ],
  inventario: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.PURCHASES_MANAGE,
  ],
  viewer: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
  ],
}

export function normalizeRole(role?: string | null) {
  return String(role || 'viewer').trim().toLowerCase()
}

export function getDefaultPermissionsForRole(role?: string | null): PermissionMap {
  const allowed = new Set(ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.viewer)
  return Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, allowed.has(permission)])) as PermissionMap
}

export function mergePermissions(role?: string | null, overrides?: PermissionMap | null, isPlatformAdmin = false) {
  const defaults = getDefaultPermissionsForRole(role)
  const merged = { ...defaults, ...(overrides || {}) }
  return merged
}

export function hasPermission(
  role: string | null | undefined,
  permission: PermissionKey,
  overrides?: PermissionMap | null,
  isPlatformAdmin = false
) {
  return Boolean(mergePermissions(role, overrides, isPlatformAdmin)[permission])
}

export function getRoleLabel(role?: string | null) {
  const normalized = normalizeRole(role)
  const labels: Record<string, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    administrador: 'Administrador',
    manager: 'Supervisor',
    cashier: 'Cajero',
    cajero: 'Cajero',
    seller: 'Vendedor',
    vendedor: 'Vendedor',
    inventory: 'Inventario',
    inventario: 'Inventario',
    viewer: 'Solo lectura',
  }
  return labels[normalized] || role || 'Usuario'
}

export function allPermissionKeys() {
  return [...ALL_PERMISSIONS]
}




