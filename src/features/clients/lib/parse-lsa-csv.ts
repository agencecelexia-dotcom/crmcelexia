/**
 * Parser CSV LSA (Local Services Ads — Inbox export Google).
 *
 * Le CSV exporté par LSA Google a TOUJOURS le même format colonnes :
 *   Client, Type de mission, Intention de recherche, Lieu, Type de lead,
 *   État de facturation, Création du lead, Dernière activité
 *
 * Cette fonction est PURE (no side effect). Elle :
 *  - tolère un BOM UTF-8 en début de fichier
 *  - détecte le délimiteur (`,` ou `;` ou `\t`) sur la 1ère ligne
 *  - parse les dates FR ("24 mai 2026") en ISO
 *  - normalise les numéros de téléphone (espaces enlevés)
 *  - skippe les lignes sans téléphone (les leads "Message" sans tel ne sont
 *    pas exploitables pour un artisan)
 *
 * Les erreurs ne lèvent pas — elles sont accumulées dans `errors` pour
 * permettre à l'UI d'afficher un récap.
 */

export interface LsaRow {
  /** Téléphone normalisé sans espaces (ex "0759013691") */
  phone: string
  /** Type de mission LSA (ex "maçonnerie en béton") — "" si vide dans CSV */
  work_type: string
  /** Ville (ex "Cessy") */
  city: string
  /** Type de lead ("Message" | "Appel téléphonique" | "") */
  lead_type: string
  /** État de facturation ("Facturée" | "Non facturée" | "En cours d'examen") */
  billing_status: string
  /** Date création lead LSA en ISO "YYYY-MM-DD" (ou "" si non parsable) */
  created_at_lsa: string
}

export interface ParseLsaCsvResult {
  rows: LsaRow[]
  /** Lignes ignorées (numéro de tel manquant) avec leur raison */
  skipped: Array<{ line: number; reason: string }>
  /** Erreurs de parsing non bloquantes */
  errors: string[]
  /** Délimiteur détecté */
  delimiter: string
}

const MONTHS_FR: Record<string, string> = {
  janv: '01', janvier: '01',
  fev: '02', févr: '02', fevrier: '02', février: '02', 'févr.': '02',
  mars: '03',
  avr: '04', avril: '04', 'avr.': '04',
  mai: '05',
  juin: '06',
  juil: '07', juillet: '07', 'juil.': '07',
  aout: '08', août: '08',
  sept: '09', septembre: '09', 'sept.': '09',
  oct: '10', octobre: '10', 'oct.': '10',
  nov: '11', novembre: '11', 'nov.': '11',
  dec: '12', déc: '12', decembre: '12', décembre: '12', 'déc.': '12',
}

/** Parse "24 mai 2026" → "2026-05-24" (ou "" si invalide). */
export function parseFrDate(s: string): string {
  const trimmed = s.trim().toLowerCase()
  if (!trimmed) return ''
  const m = trimmed.match(/^(\d{1,2})\s+([a-zéû.]+)\s+(\d{4})$/)
  if (!m) return ''
  const day = m[1].padStart(2, '0')
  const monthKey = m[2].replace(/\.$/, '')
  const month = MONTHS_FR[monthKey] || MONTHS_FR[`${monthKey}.`] || ''
  if (!month) return ''
  return `${m[3]}-${month}-${day}`
}

/** "07 59 01 36 91" → "0759013691" (ne garde que les chiffres). */
export function normalizePhone(s: string): string {
  return s.replace(/\D/g, '')
}

/** Split d'une ligne CSV en respectant les guillemets. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += c
    }
  }
  result.push(current)
  return result.map(s => s.trim())
}

/** Détecte le délimiteur le plus probable à partir de la 1ère ligne. */
function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = 0
  for (const d of candidates) {
    const count = headerLine.split(d).length
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

export function parseLsaCsv(text: string): ParseLsaCsvResult {
  const errors: string[] = []
  const skipped: Array<{ line: number; reason: string }> = []
  const rows: LsaRow[] = []

  // Enlève BOM UTF-8
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.length > 0)
  if (lines.length < 2) {
    return { rows, skipped, errors: ['Fichier vide ou sans données.'], delimiter: ',' }
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter).map(h => h.toLowerCase())

  // Détection des index colonnes par pattern (tolérant aux variations).
  // Si pas de match, on retombe sur l'ordre canonique LSA.
  function findCol(patterns: RegExp[], fallback: number): number {
    for (let i = 0; i < headers.length; i++) {
      if (patterns.some(p => p.test(headers[i]))) return i
    }
    return fallback
  }
  const idxPhone = findCol([/client/, /tel|phone/], 0)
  const idxMission = findCol([/mission/, /service/, /m[ée]tier/], 1)
  const idxCity = findCol([/lieu/, /ville/, /city/], 3)
  const idxLeadType = findCol([/type.*lead/], 4)
  const idxBilling = findCol([/factur/], 5)
  const idxCreated = findCol([/cr[ée]ation/], 6)

  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    const cells = splitCsvLine(lines[lineNum], delimiter)
    const rawPhone = cells[idxPhone] ?? ''
    const phone = normalizePhone(rawPhone)

    if (!phone) {
      skipped.push({ line: lineNum + 1, reason: 'Numéro de téléphone manquant' })
      continue
    }
    if (phone.length < 9) {
      skipped.push({ line: lineNum + 1, reason: `Numéro invalide : "${rawPhone}"` })
      continue
    }

    rows.push({
      phone,
      work_type: (cells[idxMission] ?? '').trim(),
      city: (cells[idxCity] ?? '').trim(),
      lead_type: (cells[idxLeadType] ?? '').trim(),
      billing_status: (cells[idxBilling] ?? '').trim(),
      created_at_lsa: parseFrDate(cells[idxCreated] ?? ''),
    })
  }

  return { rows, skipped, errors, delimiter }
}

/**
 * Construit le payload `portal_leads` à insérer en DB depuis une LsaRow.
 *
 * - `name` est obligatoire en DB. LSA ne fournit pas de nom → on utilise
 *   le téléphone formaté ("Lead LSA — 07 59 01 36 91") pour que ça soit
 *   lisible dans l'UI artisan.
 * - `work_type` est obligatoire. Si LSA n'a pas précisé → fallback
 *   "Catégorie non précisée".
 * - `notes` reçoit toute la méta LSA (type lead, état facturation, date
 *   LSA d'origine) pour que rien ne soit perdu.
 */
export function buildPortalLeadFromLsaRow(
  row: LsaRow,
  clientId: string,
): {
  client_id: string
  name: string
  phone: string
  work_type: string
  city: string | null
  source: 'lsa'
  notes: string
} {
  const formattedPhone = row.phone.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  const noteLines: string[] = []
  if (row.lead_type) noteLines.push(`Type : ${row.lead_type}`)
  if (row.billing_status) noteLines.push(`Facturation LSA : ${row.billing_status}`)
  if (row.created_at_lsa) noteLines.push(`Date LSA : ${row.created_at_lsa}`)

  return {
    client_id: clientId,
    name: `Lead LSA — ${formattedPhone}`,
    phone: row.phone,
    work_type: row.work_type || 'Catégorie non précisée',
    city: row.city || null,
    source: 'lsa',
    notes: noteLines.join('\n') || '',
  }
}
