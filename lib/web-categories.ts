export function orderCategoryNames(names: string[], order: string[] = []) {
  const cleanNames = Array.from(new Set(names.filter(Boolean)))
  const ordered = order.filter((name) => cleanNames.includes(name))
  const rest = cleanNames.filter((name) => !ordered.includes(name))
  return [...ordered, ...rest]
}

export function normalizeCategoryParam(value: string | null | undefined) {
  const category = (value || '').trim()
  if (!category || category.toLowerCase() === 'general') return ''
  return category
}

export function buildCategoryUrl(categoryName?: string, basePath = '/web') {
  const category = normalizeCategoryParam(categoryName)
  const suffix = category ? `?category=${encodeURIComponent(category)}#productos` : '#productos'
  return `${basePath}${suffix}`
}

export function readCategoryFromSearchParams(search: string) {
  return normalizeCategoryParam(new URLSearchParams(search).get('category'))
}
