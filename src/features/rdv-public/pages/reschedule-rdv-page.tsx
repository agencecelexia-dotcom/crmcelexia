import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RdvActionCard } from '../components/rdv-action-card'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reschedule-rdv-presence`

type Status = 'loading' | 'ok' | 'invalid' | 'expired' | 'cancelled'

export function RescheduleRdvPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { method: 'GET' })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { status: Status; reschedule_url?: string }
        if (body.status === 'ok' && body.reschedule_url) {
          window.location.href = body.reschedule_url
          return
        }
        // Cas erreur : rediriger quand même vers le fallback Cal.com (moins frustrant)
        if (body.reschedule_url) {
          window.location.href = body.reschedule_url
          return
        }
        setStatus(body.status ?? 'invalid')
      })
      .catch(() => setStatus('invalid'))
  }, [token])

  if (status === 'loading') {
    return <RdvActionCard variant="loading" title="Préparation du replanification…" subtitle="Vous allez être redirigé vers Cal.com." />
  }

  if (status === 'expired') {
    return (
      <RdvActionCard
        variant="expired"
        title="Lien expiré"
        subtitle="Ce lien de replanification a expiré."
        hint="Réservez un nouveau créneau sur https://cal.com/celexia/30min."
      />
    )
  }

  if (status === 'cancelled') {
    return (
      <RdvActionCard
        variant="invalid"
        title="Rendez-vous déjà annulé"
        subtitle="Ce rendez-vous a été annulé. Vous pouvez en réserver un nouveau."
        hint="Réservez un nouveau créneau sur https://cal.com/celexia/30min."
      />
    )
  }

  return (
    <RdvActionCard
      variant="invalid"
      title="Lien invalide"
      subtitle="Ce lien de replanification n'est pas valide."
      hint="Vérifiez le lien dans votre email ou contactez-nous."
    />
  )
}
