// Canonical categories exposed by the public storefront.
export const OFFICIAL_WEB_CATEGORIES = [
  'Celulares',
  'Tablets',
  'Laptops',
  'Monitores',
  'Periféricos',
  'Cargadores',
  'Cables',
  'Adaptadores',
  'Audífonos',
  'Bocinas',
  'Micrófonos',
  'Memorias y Discos',
  'Relojes',
  'Herramientas',
  'Accesorios',
  'Liquidación',
] as const

export type OfficialWebCategory = (typeof OFFICIAL_WEB_CATEGORIES)[number]

const CATEGORY_ALIASES: Record<string, OfficialWebCategory> = {
  celulares: 'Celulares',
  tablet: 'Tablets',
  tablets: 'Tablets',
  laptop: 'Laptops',
  laptops: 'Laptops',
  monitores: 'Monitores',
  perifericos: 'Periféricos',
  cargadores: 'Cargadores',
  cables: 'Cables',
  rj45: 'Cables',
  adaptador: 'Adaptadores',
  adaptadores: 'Adaptadores',
  audifonos: 'Audífonos',
  bocinas: 'Bocinas',
  microfono: 'Micrófonos',
  microfonos: 'Micrófonos',
  'memorias y discos': 'Memorias y Discos',
  reloj: 'Relojes',
  relojes: 'Relojes',
  herramientas: 'Herramientas',
  accesorios: 'Accesorios',
  liquidacion: 'Liquidación',
}

const CATEGORY_DATABASE_VALUES: Record<OfficialWebCategory, string[]> = {
  Celulares: ['Celulares'],
  Tablets: ['Tablet', 'Tablets'],
  Laptops: ['Laptop', 'Laptops'],
  Monitores: ['Monitores'],
  Periféricos: ['Perifericos', 'Periféricos'],
  Cargadores: ['Cargadores'],
  Cables: ['Cables', 'RJ45'],
  Adaptadores: ['ADAPTADOR', 'Adaptador', 'Adaptadores'],
  Audífonos: ['Audifonos', 'Audífonos'],
  Bocinas: ['Bocinas'],
  Micrófonos: ['microfono', 'Microfono', 'Micrófono', 'Micrófonos'],
  'Memorias y Discos': ['Memorias y Discos'],
  Relojes: ['Reloj', 'Relojes'],
  Herramientas: ['Herramientas'],
  Accesorios: ['Accesorios'],
  Liquidación: ['Liquidacion', 'Liquidación'],
}

export function normalizeCategoryKey(value: string | null | undefined) {
  return (value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
}

export function normalizeWebCategory(value: string | null | undefined): OfficialWebCategory | null {
  return CATEGORY_ALIASES[normalizeCategoryKey(value)] || null
}

export function getWebCategoryDatabaseValues(category: string) {
  const canonicalCategory = normalizeWebCategory(category)
  return canonicalCategory ? CATEGORY_DATABASE_VALUES[canonicalCategory] : [category]
}

export function orderCategoryNames(names: string[], order: string[] = []) {
  const cleanNames = Array.from(new Set(names.filter(Boolean)))
  const ordered = order.filter((name) => cleanNames.includes(name))
  const rest = cleanNames.filter((name) => !ordered.includes(name))
  return [...ordered, ...rest]
}

export function normalizeCategoryParam(value: string | null | undefined) {
  const category = (value || '').trim()
  if (!category || category.toLowerCase() === 'general') return ''
  return normalizeWebCategory(category) || category
}

export function buildCategoryUrl(categoryName?: string, basePath = '/web') {
  const category = normalizeCategoryParam(categoryName)
  const suffix = category ? `?category=${encodeURIComponent(category)}#productos` : '#productos'
  return `${basePath}${suffix}`
}

export function readCategoryFromSearchParams(search: string) {
  return normalizeCategoryParam(new URLSearchParams(search).get('category'))
}
