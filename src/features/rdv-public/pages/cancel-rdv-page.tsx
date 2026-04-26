import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RdvActionCard } from '../components/rdv-action-card'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-rdv-presence`

type Status = 'loading' | 'ready_to_cancel' | 'cancelled' | 'already_cancelled' | 'expired' | 'invalid' | 'submitting'

interface ApiResp {
  status: Exclude<Status, 'loading' | 'submitting'>
  rdv_date?: string
  rdv_time?: string
}

export function CancelRdvPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [resp, setResp] = useState<ApiResp & { uiStatus: Status }>({ status: 'invalid', uiStatus: 'loading' })
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!token) {
      setResp({ status: 'invalid', uiStatus: 'invalid' })
      return
    }
    fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, { method: 'GET' })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as ApiResp
        setResp({ ...body, uiStatus: body.status })
      })
      .catch(() => setResp({ status: 'invalid', uiStatus: 'invalid' }))
  }, [token])

  const submitCancel = async () => {
    setResp((s) => ({ ...s, uiStatus: 'submitting' }))
    try {
      const r = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason: reason.trim() || null }),
      })
      const body = (await r.json().catch(() => ({}))) as ApiResp
      setResp({ ...body, uiStatus: body.status })
    } catch {
      setResp((s) => ({ ...s, uiStatus: 'invalid' }))
    }
  }

  if (resp.uiStatus === 'loading') {
    return <RdvActionCard variant="loading" title="Chargement…" />
  }

  if (resp.uiStatus === 'submitting') {
    return <RdvActionCard variant="loading" title="Annulation en cours…" />
  }

  if (resp.uiStatus === 'cancelled') {
    return (
      <RdvActionCard
        variant="cancelled"
        title="Rendez-vous annulé"
        subtitle={resp.rdv_date && resp.rdv_time ? `Le RDV du ${resp.rdv_date} à ${resp.rdv_time} a bien été annulé.` : 'Votre rendez-vous a été annulé.'}
        hint="Notre équipe a été notifiée. Vous pouvez fermer cette fenêtre."
      />
    )
  }

  if (resp.uiStatus === 'already_cancelled') {
    return (
      <RdvActionCard
        variant="cancelled"
        title="Déjà annulé"
        subtitle={resp.rdv_date && resp.rdv_time ? `Le RDV du ${resp.rdv_date} à ${resp.rdv_time} était déjà annulé.` : 'Ce rendez-vous était déjà annulé.'}
        hint="Aucune action supplémentaire requise."
      />
    )
  }

  if (resp.uiStatus === 'expired') {
    return (
      <RdvActionCard
        variant="expired"
        title="Lien expiré"
        subtitle="Ce lien d'annulation a expiré."
        hint="Contactez-nous à agence.celexia@gmail.com."
      />
    )
  }

  if (resp.uiStatus === 'ready_to_cancel') {
    return (
      <RdvActionCard
        variant="confirm-cancel"
        title="Confirmer l'annulation"
        subtitle={resp.rdv_date && resp.rdv_time ? `Vous êtes sur le point d'annuler le rendez-vous du ${resp.rdv_date} à ${resp.rdv_time}.` : 'Vous êtes sur le point d\'annuler ce rendez-vous.'}
      >
        <div className="text-left mt-4">
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-[#64748B] mb-2">
            Raison (optionnel)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Empêchement, indisponibilité, autre…"
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[14px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F172A]"
          />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={submitCancel}
            className="w-full bg-[#EF4444] text-white font-semibold text-[15px] py-3 rounded-xl hover:bg-[#DC2626] transition"
          >
            Confirmer l'annulation
          </button>
          <a
            href="/"
            className="w-full text-center text-[14px] text-[#64748B] hover:text-[#0F172A] py-2"
          >
            Finalement, je garde le rendez-vous
          </a>
        </div>
      </RdvActionCard>
    )
  }

  return (
    <RdvActionCard
      variant="invalid"
      title="Lien invalide"
      subtitle="Ce lien d'annulation n'est pas valide."
      hint="Vérifiez le lien dans votre email ou contactez-nous."
    />
  )
}
