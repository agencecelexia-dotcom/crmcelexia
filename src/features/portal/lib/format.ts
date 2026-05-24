// Format helpers partagés pour les pages du portail artisan
// Centralise les formatages monétaires pour éviter la duplication entre
// dashboard-page, commission-page, etc.

/**
 * Formate un montant en euros au format français (ex: "1 234 €").
 * Pas d'arrondi, pas de décimales.
 * Utilise un NBSP ( ) avant € pour éviter que le symbole saute à
 * la ligne tout seul sur mobile étroit (bug audit Cowork Mn2).
 */
export function formatEur(n: number): string {
  return n.toLocaleString('fr-FR') + ' €'
}

export interface CommissionTerms {
  /** Taux en %, ex 10 pour 10% */
  rate: number
  /** Base de calcul : HT ou TTC (selon contrat signé) */
  base: 'HT' | 'TTC'
}

/** Lit les conditions de commission depuis un client (synchronisées depuis
 *  contract_data via le trigger 00086). Fallback 10% HT si non renseigné. */
export function getCommissionTerms(
  client: { commission_rate?: number | string | null; commission_base?: string | null } | null | undefined,
): CommissionTerms {
  const rawRate = client?.commission_rate
  const rate = typeof rawRate === 'string' ? parseFloat(rawRate) : (rawRate ?? NaN)
  const base = client?.commission_base === 'TTC' ? 'TTC' : 'HT'
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 10,
    base,
  }
}

/** Renvoie le label "10% TTC" ou "9,5% HT" depuis les termes. */
export function formatCommissionTerms(terms: CommissionTerms): string {
  const rateStr = terms.rate % 1 === 0 ? String(terms.rate) : terms.rate.toFixed(1).replace('.', ',')
  return `${rateStr}% ${terms.base}`
}

/** Calcule le montant de commission depuis un montant signé et les termes. */
export function calcCommission(signedAmount: number, terms: CommissionTerms): number {
  return Math.round(signedAmount * (terms.rate / 100))
}
