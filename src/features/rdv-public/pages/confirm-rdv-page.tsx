import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RdvActionCard } from '../components/rdv-action-card'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-rdv-presence`

type Status = 'loading' | 'success' | 'already' | 'expired' | 'invalid'

interface ApiResp {
  status: Status
  rdv_date?: string
  rdv_time?: string
}

export function ConfirmRdvPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [resp, setResp] = useState<ApiResp>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setResp({ status: 'invalid' })
      return
    }
    fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { method: 'GET' })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as ApiResp
        setResp({ status: body.status ?? 'invalid', rdv_date: body.rdv_date, rdv_time: body.rdv_time })
      })
      .catch(() => setResp({ status: 'invalid' }))
  }, [token])

  if (resp.status === 'loading') {
    return <RdvActionCard variant="loading" title="Confirmation en cours…" />
  }

  if (resp.status === 'success') {
    return (
      <RdvActionCard
        variant="success"
        title="Présence confirmée"
        subtitle={resp.rdv_date && resp.rdv_time ? `À très bientôt ! Rendez-vous le ${resp.rdv_date} à ${resp.rdv_time}.` : 'Merci, votre présence est notée. À très bientôt.'}
        hint="Vous pouvez fermer cette fenêtre."
      />
    )
  }

  if (resp.status === 'already') {
    return (
      <RdvActionCard
        variant="already"
        title="Déjà confirmé"
        subtitle={resp.rdv_date && resp.rdv_time ? `Votre présence est déjà enregistrée pour le ${resp.rdv_date} à ${resp.rdv_time}.` : 'Votre présence est déjà enregistrée.'}
        hint="Aucune action supplémentaire requise."
      />
    )
  }

  if (resp.status === 'expired') {
    return (
      <RdvActionCard
        variant="expired"
        title="Lien expiré"
        subtitle="Ce lien de confirmation a expiré."
        hint="Contactez-nous à agence.celexia@gmail.com pour reprogrammer."
      />
    )
  }

  return (
    <RdvActionCard
      variant="invalid"
      title="Lien invalide"
      subtitle="Ce lien de confirmation n'est pas valide."
      hint="Vérifiez le lien dans votre email ou contactez-nous."
    />
  )
}
