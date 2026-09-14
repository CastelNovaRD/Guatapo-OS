export type SearchableProduct = {
  name?: string | null
  sku?: string | null
  barcode?: string | null
  category?: string | null
  product_type?: string | null
}

export function normalizeProductSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function productMatchesSearch(product: SearchableProduct, value: string) {
  const query = normalizeProductSearch(value)
  if (!query) return true
  const haystack = normalizeProductSearch([product.name, product.sku, product.barcode, product.category, product.product_type].filter(Boolean).join(' '))
  const queryDigits = value.replace(/\D/g, '')
  const identifiers = [product.sku, product.barcode].filter(Boolean).join(' ').replace(/\D/g, '')
  return query.split(' ').every((term) => haystack.includes(term)) || (queryDigits.length > 0 && identifiers.includes(queryDigits))
}
