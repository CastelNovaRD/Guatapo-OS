
export type StoreContext = {
  id: string
  name: string
  system_name: string
}

const STORE_CACHE_KEY = 'castelnova_current_store_id'

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cacheStoreId(storeId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORE_CACHE_KEY, storeId)
}

function getCachedStoreId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORE_CACHE_KEY)
}

type SessionStoreContext = {
  storeId: string
  storeName: string
  systemName: string
}

async function loadSessionStoreContext(): Promise<SessionStoreContext | null> {
  try {
    const response = await fetch('/api/session/context', {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn(
        '[Store Context] No se pudo recuperar el contexto:',
        `HTTP ${response.status}`
      )
      return null
    }

    const data = (await response.json()) as SessionStoreContext

    if (!data.storeId) return null

    cacheStoreId(data.storeId)
    return data
  } catch (error) {
    console.warn('[Store Context] Error recuperando el contexto:', error)
    return null
  }
}

export async function getCurrentStore(): Promise<StoreContext | null> {
  const context = await loadSessionStoreContext()

  if (!context) return null

  return {
    id: context.storeId,
    name: context.storeName || 'Tienda',
    system_name: context.systemName || 'ShopDesk OS',
  }
}

export async function getCurrentStoreId() {
  const context = await loadSessionStoreContext()

  if (context?.storeId) {
    return context.storeId
  }

  return getCachedStoreId()
}
