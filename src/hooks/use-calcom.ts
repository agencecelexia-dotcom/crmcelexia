import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export type ServiceType = 'site_web' | 'pub'

export function useCalcomLinks() {
  return useQuery({
    queryKey: ['company-settings', 'calcom_links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('calcom_link, calcom_link_pub')
        .limit(1)
        .single()
      if (error) return { site_web: '', pub: '' }
      return {
        site_web: (data?.calcom_link as string) || '',
        pub: (data?.calcom_link_pub as string) || '',
      }
    },
    staleTime: 5 * 60_000,
  })
}

/** @deprecated Use useCalcomLinks() instead */
export function useCalcomLink() {
  return useQuery({
    queryKey: ['company-settings', 'calcom_link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('calcom_link')
        .limit(1)
        .single()
      if (error) return ''
      return (data?.calcom_link as string) || ''
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Build a cal.com booking URL pre-filled with prospect info.
 * Cal.com supports query params: name, email, guests, notes, metadata
 */
export function buildCalcomUrl(
  calcomLink: string,
  prospect: {
    id: string
    company_name: string
    contact_firstname?: string | null
    contact_name?: string | null
    contact_email?: string | null
    phone?: string | null
  },
  serviceType?: ServiceType,
): string {
  if (!calcomLink) return ''

  try {
    // Clean and normalise the link
    let base = calcomLink.trim()
    // Strip markdown-style angle brackets and duplicated protocol prefixes
    base = base.replace(/^<+|>+$/g, '')
    base = base.replace(/^https?:\/\/\s*<?https?:\/\//, 'https://')
    if (!base.startsWith('http')) base = `https://${base}`

    const url = new URL(base)

    // Pre-fill name
    const name = [prospect.contact_firstname, prospect.contact_name].filter(Boolean).join(' ')
    if (name) url.searchParams.set('name', name)

    // Pre-fill email
    if (prospect.contact_email) {
      url.searchParams.set('email', prospect.contact_email)
    }

    // Pass prospect info as metadata so the webhook can match
    url.searchParams.set('metadata[prospect_id]', prospect.id)
    url.searchParams.set('metadata[company]', prospect.company_name)
    if (prospect.phone) url.searchParams.set('metadata[phone]', prospect.phone)
    if (serviceType) url.searchParams.set('metadata[service_type]', serviceType)

    return url.toString()
  } catch {
    return ''
  }
}
