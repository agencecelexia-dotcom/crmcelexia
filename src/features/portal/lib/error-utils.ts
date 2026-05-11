/** Extrait un message lisible d'une erreur, qu'elle soit une `Error` JS
 *  ou un objet d'erreur Supabase (`{ message, details, hint, code }`).
 *  Évite les "[object Object]" inutiles dans les toasts. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.error === 'string' && obj.error) return obj.error
    if (typeof obj.details === 'string' && obj.details) return obj.details
    try { return JSON.stringify(err) } catch { return String(err) }
  }
  return String(err)
}
