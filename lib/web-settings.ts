export type WebPromotion = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  button: string
  category: string
  imageUrl: string
  color: string
}

export type WebBenefit = {
  id: string
  title: string
  description: string
  icon: string
}

export type WebScheduleGroup = {
  enabled: boolean
  open: string
  close: string
}

export type WebSchedule = {
  weekdays: WebScheduleGroup
  saturday: WebScheduleGroup
  sunday: WebScheduleGroup
}

export type WebSettings = {
  storeOnline: boolean
  showHero: boolean
  showPromoCards: boolean
  showBenefits: boolean
  showCategorySection: boolean
  showFeaturedFirst: boolean
  logoUrl: string
  contactEmail: string
  contactPhone: string
  contactAddress: string
  businessDays: string
  openingTime: string
  closingTime: string
  schedule: WebSchedule
  footerDescription: string
  whatsapp: string
  instagram: string
  facebook: string
  tiktok: string
  youtube: string
  googleMapsUrl: string
  heroBadge: string
  heroTitle: string
  heroSubtitle: string
  heroButtonText: string
  heroScrollTarget: number
  heroImageUrl: string
  promoOneTitle: string
  promoOneSubtitle: string
  promoOneButton: string
  promoOneCategory: string
  promoTwoTitle: string
  promoTwoSubtitle: string
  promoTwoButton: string
  promoTwoCategory: string
  promotions: WebPromotion[]
  benefitOne: string
  benefitTwo: string
  benefitThree: string
  benefits: WebBenefit[]
  categoryIcons: Record<string, string>
  categoryOrder: string[]
  emptyMessage: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  headerColor: string
  textColor: string
  buttonColor: string
  priceColor: string
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  googleAnalyticsId: string
  metaPixelId: string
  customHeadCode: string
  customFooterCode: string
  draftUpdatedAt: string
  publishedAt: string
}

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  storeOnline: true,
  showHero: true,
  showPromoCards: true,
  showBenefits: true,
  showCategorySection: true,
  showFeaturedFirst: true,
  logoUrl: '/logo-guatapo-transparent.png',
  contactEmail: 'Info@guatapo.com',
  contactPhone: '809-636-1020',
  contactAddress: 'Av. Duarte Vieja, Plaza Pony local 101. Santo Domingo.',
  businessDays: 'Lunes a sabado',
  openingTime: '9:00 AM',
  closingTime: '7:00 PM',
  schedule: {
    weekdays: { enabled: true, open: '8:00 AM', close: '6:00 PM' },
    saturday: { enabled: true, open: '9:00 AM', close: '3:00 PM' },
    sunday: { enabled: false, open: '9:00 AM', close: '3:00 PM' },
  },
  footerDescription: 'Catalogo online de tecnologia, accesorios y equipos disponibles en Guatapo.',
  whatsapp: '18096361020',
  instagram: '@guatapord',
  facebook: '',
  tiktok: '',
  youtube: '',
  googleMapsUrl: '',
  heroBadge: 'Mejores precios',
  heroTitle: 'Super precios en tus articulos favoritos',
  heroSubtitle: 'Gana mas por tu dinero',
  heroButtonText: 'Comprar ahora',
  heroScrollTarget: 1180,
  heroImageUrl: '',
  promoOneTitle: 'Hasta 30% menos',
  promoOneSubtitle: 'En Smartphones seleccionados',
  promoOneButton: 'Tienda',
  promoOneCategory: 'Celulares',
  promoTwoTitle: 'Lleva tu sonido dondequieras',
  promoTwoSubtitle: 'Mejores marcas de audifonos',
  promoTwoButton: 'Comprar',
  promoTwoCategory: 'Audio',
  promotions: [
    {
      id: 'promo-1',
      eyebrow: 'Ofertas de temporada',
      title: 'Hasta 30% menos',
      subtitle: 'En Smartphones seleccionados',
      button: 'Tienda',
      category: 'Celulares',
      imageUrl: '',
      color: '#009a44',
    },
    {
      id: 'promo-2',
      eyebrow: 'Recien llegados',
      title: 'Lleva tu sonido dondequieras',
      subtitle: 'Mejores marcas de audifonos',
      button: 'Comprar',
      category: 'Audio',
      imageUrl: '',
      color: '#111827',
    },
  ],
  benefitOne: 'Tienda Fisica',
  benefitTwo: 'Envios a Todo el Pais',
  benefitThree: 'Precios bajos garantizados',
  benefits: [
    { id: 'benefit-1', title: 'Tienda Fisica', description: 'Compra con atencion cercana.', icon: 'store' },
    { id: 'benefit-2', title: 'Envios a Todo el Pais', description: 'Recibe tus productos donde estes.', icon: 'truck' },
    { id: 'benefit-3', title: 'Precios bajos garantizados', description: 'Ofertas reales en tecnologia.', icon: 'badge' },
  ],
  categoryIcons: {},
  categoryOrder: [],
  emptyMessage: 'Prueba con otra busqueda o categoria.',
  primaryColor: '#009a44',
  secondaryColor: '#009a44',
  accentColor: '#dc2626',
  backgroundColor: '#f4f4f5',
  headerColor: '#ffffff',
  textColor: '#09090b',
  buttonColor: '#009a44',
  priceColor: '#007f5f',
  seoTitle: 'Guatapo | Lo mejor en tecnologia',
  seoDescription: 'Catalogo online de tecnologia, celulares, accesorios y ofertas de Guatapo.',
  seoKeywords: 'tecnologia, celulares, accesorios, guatapo, tienda online',
  googleAnalyticsId: '',
  metaPixelId: '',
  customHeadCode: '',
  customFooterCode: '',
  draftUpdatedAt: '',
  publishedAt: '',
}


function normalizeScheduleGroup(value: Partial<WebScheduleGroup> | null | undefined, fallback: WebScheduleGroup): WebScheduleGroup {
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
    open: value?.open || fallback.open,
    close: value?.close || fallback.close,
  }
}

function normalizeSchedule(value: Partial<WebSchedule> | null | undefined, merged: WebSettings): WebSchedule {
  const fallback = DEFAULT_WEB_SETTINGS.schedule
  if (!value) {
    return {
      weekdays: normalizeScheduleGroup({ enabled: true, open: merged.openingTime, close: merged.closingTime }, fallback.weekdays),
      saturday: normalizeScheduleGroup(fallback.saturday, fallback.saturday),
      sunday: normalizeScheduleGroup(fallback.sunday, fallback.sunday),
    }
  }
  return {
    weekdays: normalizeScheduleGroup(value.weekdays, fallback.weekdays),
    saturday: normalizeScheduleGroup(value.saturday, fallback.saturday),
    sunday: normalizeScheduleGroup(value.sunday, fallback.sunday),
  }
}

function parseTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const period = match[3]?.toUpperCase()
  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function getDominicanNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value || ''
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0)
  return { weekday, minutes: hour * 60 + minute }
}

export function getScheduleRows(schedule: WebSchedule | null | undefined) {
  if (!schedule) return []
  return [
    { key: 'weekdays', label: 'Lunes - Viernes', group: schedule.weekdays },
    { key: 'saturday', label: 'Sabado', group: schedule.saturday },
    { key: 'sunday', label: 'Domingo', group: schedule.sunday },
  ]
}

export function formatScheduleRange(group: WebScheduleGroup | null | undefined) {
  if (!group) return 'Horario no configurado'
  if (!group.enabled) return 'Cerrado'
  if (!group.open || !group.close) return 'Horario no configurado'
  return `${group.open} - ${group.close}`
}

export function getStoreOpenStatus(schedule: WebSchedule | null | undefined, date = new Date()) {
  if (!schedule) return { isOpen: false, label: 'Horario no configurado' }
  const now = getDominicanNowParts(date)
  const group = now.weekday === 'Sat' ? schedule.saturday : now.weekday === 'Sun' ? schedule.sunday : schedule.weekdays
  if (!group?.enabled) return { isOpen: false, label: 'Cerrado ahora' }
  const open = parseTimeToMinutes(group.open)
  const close = parseTimeToMinutes(group.close)
  if (open === null || close === null) return { isOpen: false, label: 'Horario no configurado' }
  const isOpen = open <= close ? now.minutes >= open && now.minutes <= close : now.minutes >= open || now.minutes <= close
  return { isOpen, label: isOpen ? 'Abierto ahora' : 'Cerrado ahora' }
}
const WEB_SETTINGS_PREFIX = 'guatapo_web_settings_'

export function webSettingsKey(storeId = 'default') {
  return `${WEB_SETTINGS_PREFIX}${storeId}`
}

export function normalizeWebSettings(value: Partial<WebSettings> | null | undefined): WebSettings {
  const merged = {
    ...DEFAULT_WEB_SETTINGS,
    ...(value || {}),
  }

  const promotions = Array.isArray((value as WebSettings | undefined)?.promotions) && (value as WebSettings).promotions.length
    ? (value as WebSettings).promotions
    : [
        {
          id: 'promo-1',
          eyebrow: 'Ofertas de temporada',
          title: merged.promoOneTitle || DEFAULT_WEB_SETTINGS.promoOneTitle,
          subtitle: merged.promoOneSubtitle || DEFAULT_WEB_SETTINGS.promoOneSubtitle,
          button: merged.promoOneButton || DEFAULT_WEB_SETTINGS.promoOneButton,
          category: merged.promoOneCategory || DEFAULT_WEB_SETTINGS.promoOneCategory,
          imageUrl: '',
          color: merged.accentColor || DEFAULT_WEB_SETTINGS.accentColor,
        },
        {
          id: 'promo-2',
          eyebrow: 'Recien llegados',
          title: merged.promoTwoTitle || DEFAULT_WEB_SETTINGS.promoTwoTitle,
          subtitle: merged.promoTwoSubtitle || DEFAULT_WEB_SETTINGS.promoTwoSubtitle,
          button: merged.promoTwoButton || DEFAULT_WEB_SETTINGS.promoTwoButton,
          category: merged.promoTwoCategory || DEFAULT_WEB_SETTINGS.promoTwoCategory,
          imageUrl: '',
          color: merged.secondaryColor || DEFAULT_WEB_SETTINGS.secondaryColor,
        },
      ]

  const benefits = Array.isArray((value as WebSettings | undefined)?.benefits) && (value as WebSettings).benefits.length
    ? (value as WebSettings).benefits
    : [
        { id: 'benefit-1', title: merged.benefitOne || DEFAULT_WEB_SETTINGS.benefitOne, description: 'Compra con atencion cercana.', icon: 'store' },
        { id: 'benefit-2', title: merged.benefitTwo || DEFAULT_WEB_SETTINGS.benefitTwo, description: 'Recibe tus productos donde estes.', icon: 'truck' },
        { id: 'benefit-3', title: merged.benefitThree || DEFAULT_WEB_SETTINGS.benefitThree, description: 'Ofertas reales en tecnologia.', icon: 'badge' },
      ]

  return {
    ...merged,
    promotions,
    benefits,
    categoryIcons: merged.categoryIcons || {},
    schedule: normalizeSchedule((value as WebSettings | undefined)?.schedule, merged as WebSettings),
    categoryOrder: Array.isArray(merged.categoryOrder) ? merged.categoryOrder : [],
    promoOneTitle: promotions[0]?.title || merged.promoOneTitle,
    promoOneSubtitle: promotions[0]?.subtitle || merged.promoOneSubtitle,
    promoOneButton: promotions[0]?.button || merged.promoOneButton,
    promoOneCategory: promotions[0]?.category || merged.promoOneCategory,
    promoTwoTitle: promotions[1]?.title || merged.promoTwoTitle,
    promoTwoSubtitle: promotions[1]?.subtitle || merged.promoTwoSubtitle,
    promoTwoButton: promotions[1]?.button || merged.promoTwoButton,
    promoTwoCategory: promotions[1]?.category || merged.promoTwoCategory,
    benefitOne: benefits[0]?.title || merged.benefitOne,
    benefitTwo: benefits[1]?.title || merged.benefitTwo,
    benefitThree: benefits[2]?.title || merged.benefitThree,
  }
}

export function readLocalWebSettings(storeId = 'default') {
  if (typeof window === 'undefined') return DEFAULT_WEB_SETTINGS

  try {
    const raw = window.localStorage.getItem(webSettingsKey(storeId))
    if (!raw) return DEFAULT_WEB_SETTINGS
    return normalizeWebSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_WEB_SETTINGS
  }
}

export function saveLocalWebSettings(storeId: string, settings: WebSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(webSettingsKey(storeId || 'default'), JSON.stringify(normalizeWebSettings(settings)))
  window.dispatchEvent(new CustomEvent('guatapo:web-settings-updated', { detail: settings }))
}









