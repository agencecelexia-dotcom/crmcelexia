import type { PortalLead, PortalLeadInvoice, Quote } from '@/types'

/**
 * Calcule la liste des 8 étapes timeline d'un projet à partir des données brutes.
 *
 * Pure function — pas de side effect, testable sans mock DB ni React Query.
 * L'ordre des étapes est canonique : lead_arrived → qualified → quote_sent →
 * quote_signed → commission_invoiced → commission_paid → project_completed →
 * closed. Chaque étape a un statut `done` | `current` | `upcoming`.
 *
 * Règle d'état :
 *   - done = la date de l'étape est renseignée
 *   - current = précédente étape done, étape suivante pas encore done
 *   - upcoming = précédente étape pas encore done
 *
 * Si le lead est `perdu` à n'importe quel moment, on tronque la timeline :
 * toutes les étapes au-delà du dernier `done` deviennent `upcoming` grisé.
 *
 * Note : on prend `portal_leads` comme source de vérité (pas `quotes`) pour
 * éviter les divergences. Le trigger 00090 sync `quotes.status='signed'` vers
 * `portal_leads.signed_at` donc on est cohérent.
 */

export type TimelineStepKey =
  | 'lead_arrived'
  | 'qualified'
  | 'quote_sent'
  | 'quote_signed'
  | 'commission_invoiced'
  | 'commission_paid'
  | 'project_completed'
  | 'closed'

export type TimelineStepStatus = 'done' | 'current' | 'upcoming' | 'blocked'

export interface TimelineStep {
  key: TimelineStepKey
  label: string
  status: TimelineStepStatus
  /** Date affichée (ISO). null = étape pas encore atteinte. */
  date: string | null
  /** Données contextuelles pour le sous-titre (montant, n° devis, etc.). */
  meta: Record<string, string | number | null | undefined>
  /** Qui est responsable de cette étape : artisan ou celexia. */
  responsible: 'artisan' | 'celexia'
  /** Action principale qu'on peut prendre depuis cette étape (label + key d'action). */
  actionKey?: TimelineActionKey
  actionLabel?: string
}

export type TimelineActionKey =
  | 'mark_qualified'
  | 'upload_signed_pdf'
  | 'mark_commission_invoiced'
  | 'declare_commission_paid'
  | 'upload_client_invoice'
  | 'mark_project_completed'
  | 'close_project'

const STEP_LABELS: Record<TimelineStepKey, string> = {
  lead_arrived: 'Lead arrivé',
  qualified: 'Qualifié',
  quote_sent: 'Devis envoyé',
  quote_signed: 'Devis signé',
  commission_invoiced: 'Facture Celexia émise',
  commission_paid: 'Commission payée à Celexia',
  project_completed: 'Projet livré',
  closed: 'Clôturé',
}

const STEP_RESPONSIBLE: Record<TimelineStepKey, 'artisan' | 'celexia'> = {
  lead_arrived: 'celexia',
  qualified: 'artisan',
  quote_sent: 'artisan',
  quote_signed: 'artisan',
  commission_invoiced: 'celexia',
  commission_paid: 'artisan',
  project_completed: 'artisan',
  closed: 'celexia',
}

/**
 * Trouve le dernier devis envoyé (= quote.sent_at non null OU is_external=true).
 * Si plusieurs devis pour ce lead, retourne le plus récent.
 */
function findLatestSentQuote(quotes: Quote[]): Quote | null {
  const sent = quotes.filter(q => !q.deleted_at && (q.sent_at || q.is_external))
  if (sent.length === 0) return null
  return sent.sort((a, b) => {
    const aDate = a.sent_at || a.created_at
    const bDate = b.sent_at || b.created_at
    return bDate.localeCompare(aDate)
  })[0]
}

/**
 * Trouve le devis signé (= quote.status='signed' ou portal_leads.signed_pdf_path
 * renseigné). On prend le plus récent si plusieurs.
 */
function findSignedQuote(quotes: Quote[]): Quote | null {
  const signed = quotes.filter(q => !q.deleted_at && q.status === 'signed')
  if (signed.length === 0) return null
  return signed.sort((a, b) => {
    const aDate = a.signed_at || a.updated_at
    const bDate = b.signed_at || b.updated_at
    return bDate.localeCompare(aDate)
  })[0]
}

export function buildTimelineSteps(
  lead: PortalLead,
  quotes: Quote[],
  invoices: PortalLeadInvoice[],
): TimelineStep[] {
  const sentQuote = findLatestSentQuote(quotes)
  const signedQuote = findSignedQuote(quotes)

  // ── Détermine les dates effectives par étape ────────────────────────────
  const leadArrivedDate = lead.created_at
  // Qualifié : si status >= qualifie. On utilise updated_at (proxy) car pas
  // de timestamp dédié. À long terme, ajouter qualified_at.
  const qualifiedDate =
    lead.status === 'nouveau' ? null : lead.updated_at
  const quoteSentDate = sentQuote
    ? (sentQuote.sent_at || sentQuote.created_at)
    : (['devis', 'signe', 'clos'].includes(lead.status) ? lead.updated_at : null)
  const quoteSignedDate = lead.signed_at
    || (signedQuote ? (signedQuote.signed_at || signedQuote.updated_at) : null)
  const commissionInvoicedDate = lead.commission_invoiced_at
  const commissionPaidDate = lead.commission_paid_at
  const projectCompletedDate = lead.project_completed_at
  const closedDate = lead.closed_at

  // Si le lead est perdu, on s'arrête à la dernière étape done
  const isPerdu = lead.status === 'perdu'

  // ── Calcule status par étape ─────────────────────────────────────────────
  // Une étape est `done` si sa date est set. Sinon, on regarde si la précédente
  // est done : si oui, l'étape devient `current`, sinon `upcoming`.
  const dates: Array<{ key: TimelineStepKey; date: string | null }> = [
    { key: 'lead_arrived', date: leadArrivedDate },
    { key: 'qualified', date: qualifiedDate },
    { key: 'quote_sent', date: quoteSentDate },
    { key: 'quote_signed', date: quoteSignedDate },
    { key: 'commission_invoiced', date: commissionInvoicedDate },
    { key: 'commission_paid', date: commissionPaidDate },
    { key: 'project_completed', date: projectCompletedDate },
    { key: 'closed', date: closedDate },
  ]

  // Trouve l'index de la première étape sans date (= étape current ou upcoming)
  const firstUndoneIdx = dates.findIndex(d => !d.date)

  return dates.map((d, idx) => {
    let status: TimelineStepStatus
    if (d.date) {
      status = 'done'
    } else if (isPerdu) {
      status = 'upcoming' // toutes les étapes au-delà du perdu restent à venir grisées
    } else if (idx === firstUndoneIdx) {
      status = 'current'
    } else {
      status = 'upcoming'
    }

    // Action contextuelle pour l'étape courante
    let actionKey: TimelineActionKey | undefined
    let actionLabel: string | undefined

    if (status === 'current') {
      switch (d.key) {
        case 'qualified':
          actionKey = 'mark_qualified'
          actionLabel = 'Marquer qualifié'
          break
        case 'quote_signed':
          actionKey = 'upload_signed_pdf'
          actionLabel = 'Uploader PDF signé'
          break
        case 'commission_invoiced':
          // C'est Celexia qui facture, l'artisan ne fait rien
          actionKey = 'mark_commission_invoiced'
          actionLabel = 'Marquer facturé (admin)'
          break
        case 'commission_paid':
          actionKey = 'declare_commission_paid'
          actionLabel = "Déclarer commission payée"
          break
        case 'project_completed':
          actionKey = 'mark_project_completed'
          actionLabel = 'Marquer projet livré'
          break
        case 'closed':
          actionKey = 'close_project'
          actionLabel = 'Clôturer le dossier'
          break
      }
    }

    // Méta-données contextuelles (affichées sous le label)
    const meta: TimelineStep['meta'] = {}
    if (d.key === 'lead_arrived') {
      meta.source = lead.source === 'lsa' ? 'Celexia' : 'Bouche-à-oreille'
    }
    if (d.key === 'quote_sent' && sentQuote) {
      meta.quote_number = sentQuote.quote_number
      meta.amount_ttc = sentQuote.total_ttc
      meta.is_external = sentQuote.is_external ? 1 : 0
    }
    if (d.key === 'quote_signed' && (signedQuote || lead.signed_amount)) {
      meta.amount = lead.signed_amount ?? signedQuote?.total_ttc ?? null
      meta.has_pdf = (lead.signed_pdf_path || signedQuote?.signed_pdf_path) ? 1 : 0
    }
    if (d.key === 'commission_invoiced') {
      meta.amount = lead.commission_amount
      meta.rate = lead.commission_rate
    }
    if (d.key === 'commission_paid') {
      meta.amount = lead.commission_amount
      meta.commission_status = lead.commission_status
    }
    if (d.key === 'project_completed') {
      meta.invoices_count = invoices.filter(i => !i.deleted_at).length
    }

    return {
      key: d.key,
      label: STEP_LABELS[d.key],
      status,
      date: d.date,
      meta,
      responsible: STEP_RESPONSIBLE[d.key],
      actionKey,
      actionLabel,
    }
  })
}
