// Format helpers partagés pour les pages du portail artisan
// Centralise les formatages monétaires pour éviter la duplication entre
// dashboard-page, commission-page, etc.

/**
 * Formate un montant en euros au format français (ex: "1 234 €").
 * Pas d'arrondi, pas de décimales.
 */
export function formatEur(n: number): string {
  return n.toLocaleString('fr-FR') + ' €'
}
