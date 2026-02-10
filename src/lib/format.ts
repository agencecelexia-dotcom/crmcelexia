import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

export function formatDate(dateStr: string): string {
  const date = parseISO(dateStr)
  if (isToday(date)) return `Aujourd'hui à ${format(date, 'HH:mm', { locale: fr })}`
  if (isYesterday(date)) return `Hier à ${format(date, 'HH:mm', { locale: fr })}`
  return format(date, 'dd MMM yyyy à HH:mm', { locale: fr })
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: fr })
}

export function formatDateTime(dateStr: string): string {
  return format(parseISO(dateStr), 'dd/MM/yyyy HH:mm', { locale: fr })
}

export function formatRelative(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: fr })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)} %`
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\s/g, '')
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
  }
  return phone
}
