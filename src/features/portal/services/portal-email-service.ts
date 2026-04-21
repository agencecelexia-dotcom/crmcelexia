import {
  N8N_PORTAL_VALIDATED_WEBHOOK,
  N8N_PORTAL_REMINDER_WEBHOOK,
  N8N_PORTAL_ADMIN_ALERT_WEBHOOK,
} from '@/lib/constants'

async function callWebhook(url: string, body: Record<string, unknown>) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[portal-email] webhook failed:', err)
  }
}

/** Send "onboarding validated" email to artisan */
export function sendOnboardingValidatedEmail(params: {
  email: string
  artisan_firstname: string
  company_name: string
}) {
  callWebhook(N8N_PORTAL_VALIDATED_WEBHOOK, {
    ...params,
    portal_url: `${window.location.origin}/portal/auth`,
  })
}

/** Send onboarding reminder to stuck artisan */
export function sendOnboardingReminderEmail(params: {
  email: string
  artisan_firstname: string
  company_name: string
  stuck_step: string
  reminder_number: 1 | 2 | 3
}) {
  callWebhook(N8N_PORTAL_REMINDER_WEBHOOK, {
    ...params,
    portal_url: `${window.location.origin}/portal/auth`,
  })
}

/** Alert admin when artisan abandoned onboarding */
export function sendAdminAlertEmail(params: {
  artisan_name: string
  company_name: string
  stuck_step: string
  days_inactive: number
}) {
  callWebhook(N8N_PORTAL_ADMIN_ALERT_WEBHOOK, {
    ...params,
    admin_url: `${window.location.origin}/onboardings`,
  })
}
