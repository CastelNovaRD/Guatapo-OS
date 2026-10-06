import { supabase } from '@/lib/supabase'

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

async function getAuthenticatedUserId() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user.id) return sessionData.session.user.id

  const { data: userData } = await supabase.auth.getUser()
  return userData.user?.id || null
}

export async function getCurrentStore(): Promise<StoreContext | null> {
  const storeId = await getCurrentStoreId()

  if (!storeId) return null

  const { data: store } = await supabase
    .from('stores')
    .select('id, name, system_name')
    .eq('id', storeId)
    .eq('active', true)
    .maybeSingle()

  return store || null
}

export async function getCurrentStoreId() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const userId = await getAuthenticatedUserId()

    if (userId) {
      const { data: rpcStoreIds } = await supabase.rpc('current_store_ids')

      const rpcStoreId = Array.isArray(rpcStoreIds) ? rpcStoreIds[0] : null
      if (rpcStoreId) {
        cacheStoreId(String(rpcStoreId))
        return String(rpcStoreId)
      }

      const { data: membership } = await supabase
        .from('store_users')
        .select('store_id')
        .eq('user_id', userId)
        .eq('active', true)
        .limit(1)
        .maybeSingle()

      if (membership?.store_id) {
        cacheStoreId(membership.store_id)
        return membership.store_id
      }
    }

    if (attempt < 5) await wait(150)
  }

  return getCachedStoreId()
}

export async function getPublicStoreBySlug(slug = 'guatapo') {
  const { data } = await supabase
    .from('stores')
    .select('id, name, system_name')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (data) return data

  const currentStoreId = await getCurrentStoreId()

  if (currentStoreId) {
    const { data: currentStore } = await supabase
      .from('stores')
      .select('id, name, system_name')
      .eq('id', currentStoreId)
      .eq('active', true)
      .maybeSingle()

    if (currentStore) return currentStore
  }

  const { data: firstStore } = await supabase
    .from('stores')
    .select('id, name, system_name')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstStore) return firstStore

  const { data: firstPublicProduct } = await supabase
    .from('products')
    .select('store_id')
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  if (firstPublicProduct?.store_id) {
    return {
      id: firstPublicProduct.store_id,
      name: 'Guatapo',
      system_name: 'Guatapo OS',
    }
  }

  return null
}
