export const APP_NAME = 'Celexia'
export const DEFAULT_PAGE_SIZE = 50
export const STALE_TIME_DASHBOARD = 30 * 1000 // 30 seconds
export const STALE_TIME_LIST = 60 * 1000 // 60 seconds
export const DEBOUNCE_MS = 300

// n8n webhook for automatic site deployment
export const N8N_SITE_DEPLOY_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/crm-site-deploy'

// n8n webhook for automatic site destruction (when perdu)
export const N8N_SITE_DESTROY_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/crm-site-destroy'

// n8n webhook for sale notification email to commercial
export const N8N_SALE_NOTIFICATION_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/crm-sale-notification'

// n8n webhook for creating Gmail draft (conversion client)
export const N8N_EMAIL_DRAFT_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/crm-email-draft'

// n8n webhooks for portal
export const N8N_PORTAL_VALIDATED_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/portal-onboarding-validated'
export const N8N_PORTAL_REMINDER_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/portal-onboarding-reminder'
export const N8N_PORTAL_ADMIN_ALERT_WEBHOOK = 'https://n8n.srv1241880.hstgr.cloud/webhook/portal-admin-alert'
