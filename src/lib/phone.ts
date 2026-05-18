// Helpers téléphone — doivent rester en sync avec public.normalize_phone()
// (migration 00095). Utilisés pour la recherche sur phone_normalized.

export function normalizePhone(input: string | null | undefined): string {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')
  if (/^33\d{9}$/.test(digits)) return '0' + digits.slice(2)
  return digits
}

export function looksLikePhone(input: string): boolean {
  return normalizePhone(input).length >= 4
}
