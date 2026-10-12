export type WebBanner = {
  id: string
  store_id: string
  image_url: string
  mobile_image_url: string | null
  title: string | null
  subtitle: string | null
  link_url: string | null
  button_text: string | null
  display_order: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type WebBannerDraft = Omit<WebBanner, 'id' | 'store_id' | 'created_at' | 'updated_at'> & { id?: string }

export function emptyWebBanner(): WebBannerDraft {
  return {
    image_url: '',
    mobile_image_url: null,
    title: '',
    subtitle: '',
    link_url: '',
    button_text: '',
    display_order: 0,
    is_active: true,
  }
}
