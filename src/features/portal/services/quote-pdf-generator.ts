/**
 * Génère le PDF d'un devis artisan à partir de quote + items + settings.
 * Utilise pdf-lib, polices Helvetica standard (pas d'embed externe).
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib'
import type { Quote, QuoteItem, QuoteSettings } from '@/types'
import { supabase } from '@/lib/supabase/client'

const PAGE_W = 595
const PAGE_H = 842
const MARGIN_L = 40
const MARGIN_R = 40
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

const VIOLET = rgb(0.42, 0.18, 0.74)
const BLACK = rgb(0.1, 0.1, 0.1)
const GRAY_500 = rgb(0.42, 0.45, 0.5)
const GRAY_700 = rgb(0.22, 0.25, 0.3)
const GRAY_300 = rgb(0.78, 0.78, 0.8)
const HEADER_BG = rgb(0.27, 0.27, 0.3)
const ROW_ALT = rgb(0.97, 0.97, 0.98)
const RECIPIENT_BG = rgb(0.96, 0.96, 0.98)

interface State {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  fontBold: PDFFont
  y: number
}

/**
 * Helvetica intégrée à pdf-lib utilise l'encoding WinAnsi qui ne couvre
 * pas U+202F (NARROW NO-BREAK SPACE) ni U+2009 (THIN SPACE). Or
 * `(1000).toLocaleString('fr-FR')` produit "1 000" avec un NNBSP entre
 * milliers — d'où des crashes "WinAnsi cannot encode 0x202f" sur tout
 * devis ≥ 1 000 €. On normalise vers NBSP (U+00A0) qui est en WinAnsi.
 */
function safeWinAnsi(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

/**
 * Monkey-patche la méthode drawText d'une page pour systématiquement
 * sanitiser le texte avant de le tracer. Appliqué à chaque nouvelle
 * page (cf. newPage).
 */
function patchPageDrawText(page: PDFPage): void {
  const orig = page.drawText.bind(page)
  type Args = Parameters<typeof page.drawText>
  page.drawText = ((text: Args[0], opts?: Args[1]) =>
    orig(typeof text === 'string' ? safeWinAnsi(text) : text, opts)) as typeof page.drawText
}

function newPage(state: State): void {
  state.page = state.doc.addPage([PAGE_W, PAGE_H])
  patchPageDrawText(state.page)
  state.y = PAGE_H - 40
}

function ensureSpace(state: State, needed: number): void {
  if (state.y - needed < 50) newPage(state)
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return ['']
  const words = safeWinAnsi(String(text)).split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function formatDateFR(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
    return safeWinAnsi(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d))
  } catch {
    return iso
  }
}

function formatEurFR(n: number): string {
  // safeWinAnsi pour neutraliser le NNBSP des séparateurs de milliers fr-FR.
  return safeWinAnsi(n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €'
}

function drawText(state: State, text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
  const size = opts.size ?? 9
  state.page.drawText(text, {
    x, y, size,
    font: opts.bold ? state.fontBold : state.font,
    color: opts.color ?? BLACK,
  })
}

// ──────────────────────────────────────────────────────────
// Logo loader
// ──────────────────────────────────────────────────────────

async function fetchLogoImage(doc: PDFDocument, logoPath: string | null | undefined): Promise<PDFImage | null> {
  if (!logoPath) return null
  try {
    const { data, error } = await supabase.storage.from('portal-quotes').createSignedUrl(logoPath, 3600)
    if (error || !data?.signedUrl) return null
    const res = await fetch(data.signedUrl)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    // Sniff format: PNG starts with 89 50 4E 47
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
    try {
      return isPng ? await doc.embedPng(buf) : await doc.embedJpg(buf)
    } catch {
      // Try the other format as fallback
      try { return await doc.embedJpg(buf) } catch { return null }
    }
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────
// Sections
// ──────────────────────────────────────────────────────────

function drawHeader(state: State, settings: QuoteSettings, logo: PDFImage | null): void {
  const topY = PAGE_H - 50
  // Left: logo or company name
  if (logo) {
    const maxW = 80
    const ratio = logo.height / logo.width
    const h = maxW * ratio
    const drawH = Math.min(h, 60)
    const drawW = drawH / ratio
    state.page.drawImage(logo, { x: MARGIN_L, y: topY - drawH, width: drawW, height: drawH })
  } else if (settings.company_legal_name) {
    drawText(state, settings.company_legal_name, MARGIN_L, topY - 12, { size: 14, bold: true })
  }

  // Right: company text block — right-aligned
  const rightX = PAGE_W - MARGIN_R
  let ry = topY
  const rightSize = 8
  function drawRight(line: string, bold = false): void {
    if (!line) return
    const safe = safeWinAnsi(line)
    const f = bold ? state.fontBold : state.font
    const w = f.widthOfTextAtSize(safe, rightSize)
    state.page.drawText(safe, { x: rightX - w, y: ry, size: rightSize, font: f, color: GRAY_700 })
    ry -= 10
  }
  if (settings.company_legal_name) drawRight(settings.company_legal_name, true)
  if (settings.company_form) drawRight(settings.company_form)
  if (settings.company_address) drawRight(settings.company_address)
  const cp = [settings.company_postal_code, settings.company_city].filter(Boolean).join(' ')
  if (cp) drawRight(cp)
  if (settings.company_phone) drawRight(`Tél : ${settings.company_phone}`)
  if (settings.company_email) drawRight(settings.company_email)
  if (settings.siret) drawRight(`SIRET ${settings.siret}`)

  state.y = topY - 90
}

function drawTitle(state: State, quote: Quote): void {
  ensureSpace(state, 40)
  state.page.drawText('DEVIS', { x: MARGIN_L, y: state.y, size: 24, font: state.fontBold, color: VIOLET })
  state.y -= 22
  drawText(state, `N° ${quote.quote_number}`, MARGIN_L, state.y, { size: 11, color: GRAY_500 })
  state.y -= 22
}

function drawMeta(state: State, quote: Quote): void {
  ensureSpace(state, 50)
  const boxY = state.y
  const boxH = 38
  state.page.drawRectangle({
    x: MARGIN_L, y: boxY - boxH, width: CONTENT_W, height: boxH,
    borderColor: GRAY_300, borderWidth: 0.5,
  })
  drawText(state, 'Émis le', MARGIN_L + 12, boxY - 14, { size: 8, color: GRAY_500 })
  drawText(state, formatDateFR(quote.issued_at), MARGIN_L + 12, boxY - 26, { size: 10, bold: true })

  drawText(state, 'Valide jusqu\'au', MARGIN_L + CONTENT_W / 2, boxY - 14, { size: 8, color: GRAY_500 })
  drawText(state, formatDateFR(quote.valid_until), MARGIN_L + CONTENT_W / 2, boxY - 26, { size: 10, bold: true })

  state.y = boxY - boxH - 16
}

function drawRecipient(state: State, quote: Quote): void {
  const lines: string[] = []
  if (quote.recipient_address) lines.push(quote.recipient_address)
  const cp = [quote.recipient_postal_code, quote.recipient_city].filter(Boolean).join(' ')
  if (cp) lines.push(cp)
  if (quote.recipient_phone) lines.push(`Tél : ${quote.recipient_phone}`)
  if (quote.recipient_email) lines.push(quote.recipient_email)

  const boxH = 18 + 16 + 14 * lines.length + 8
  ensureSpace(state, boxH)
  const boxY = state.y
  state.page.drawRectangle({
    x: MARGIN_L, y: boxY - boxH, width: CONTENT_W, height: boxH,
    color: RECIPIENT_BG,
  })
  drawText(state, 'Destinataire', MARGIN_L + 12, boxY - 14, { size: 8, color: GRAY_500 })
  drawText(state, quote.recipient_name, MARGIN_L + 12, boxY - 30, { size: 11, bold: true })
  let ly = boxY - 44
  for (const l of lines) {
    drawText(state, l, MARGIN_L + 12, ly, { size: 9, color: GRAY_700 })
    ly -= 12
  }
  state.y = boxY - boxH - 16
}

// Column layout for items table
const COL_DESC_X = MARGIN_L
const COL_DESC_W = 240
const COL_QTY_X = COL_DESC_X + COL_DESC_W
const COL_QTY_W = 40
const COL_UNIT_X = COL_QTY_X + COL_QTY_W
const COL_UNIT_W = 50
const COL_PU_X = COL_UNIT_X + COL_UNIT_W
const COL_PU_W = 75
const COL_TOTAL_X = COL_PU_X + COL_PU_W
const COL_TOTAL_W = CONTENT_W - (COL_TOTAL_X - MARGIN_L)

function drawItemsHeader(state: State): void {
  const headerH = 22
  state.page.drawRectangle({
    x: MARGIN_L, y: state.y - headerH, width: CONTENT_W, height: headerH,
    color: HEADER_BG,
  })
  const ty = state.y - 15
  state.page.drawText('Description', { x: COL_DESC_X + 8, y: ty, size: 9, font: state.fontBold, color: rgb(1, 1, 1) })
  // right-aligned headers for numeric columns
  const drawRightH = (label: string, x: number, w: number) => {
    const tw = state.fontBold.widthOfTextAtSize(label, 9)
    state.page.drawText(label, { x: x + w - tw - 6, y: ty, size: 9, font: state.fontBold, color: rgb(1, 1, 1) })
  }
  drawRightH('Qté', COL_QTY_X, COL_QTY_W)
  state.page.drawText('Unité', { x: COL_UNIT_X + 4, y: ty, size: 9, font: state.fontBold, color: rgb(1, 1, 1) })
  drawRightH('PU HT', COL_PU_X, COL_PU_W)
  drawRightH('Total HT', COL_TOTAL_X, COL_TOTAL_W)
  state.y -= headerH
}

function drawItems(state: State, items: QuoteItem[]): void {
  ensureSpace(state, 60)
  drawItemsHeader(state)

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    // wrap description to 2 lines max
    const lines = wrapText(it.description, state.font, 9, COL_DESC_W - 16).slice(0, 2)
    const rowH = Math.max(22, 6 + lines.length * 12 + 4)
    ensureSpace(state, rowH + 4)

    if (idx % 2 === 1) {
      state.page.drawRectangle({
        x: MARGIN_L, y: state.y - rowH, width: CONTENT_W, height: rowH, color: ROW_ALT,
      })
    }

    // description lines
    let ly = state.y - 14
    for (const l of lines) {
      state.page.drawText(l, { x: COL_DESC_X + 8, y: ly, size: 9, font: state.font, color: BLACK })
      ly -= 12
    }

    // numeric columns - vertically centered-ish on first line
    const numY = state.y - 14
    const qtyStr = safeWinAnsi(it.quantity.toLocaleString('fr-FR'))
    const qtyW = state.font.widthOfTextAtSize(qtyStr, 9)
    state.page.drawText(qtyStr, { x: COL_QTY_X + COL_QTY_W - qtyW - 6, y: numY, size: 9, font: state.font, color: BLACK })

    state.page.drawText(it.unit, { x: COL_UNIT_X + 4, y: numY, size: 9, font: state.font, color: BLACK })

    const puStr = formatEurFR(it.unit_price_ht)
    const puW = state.font.widthOfTextAtSize(puStr, 9)
    state.page.drawText(puStr, { x: COL_PU_X + COL_PU_W - puW - 6, y: numY, size: 9, font: state.font, color: BLACK })

    const tStr = formatEurFR(it.total_ht)
    const tW = state.fontBold.widthOfTextAtSize(tStr, 9)
    state.page.drawText(tStr, { x: COL_TOTAL_X + COL_TOTAL_W - tW - 6, y: numY, size: 9, font: state.fontBold, color: BLACK })

    state.y -= rowH
  }

  // bottom border
  state.page.drawLine({
    start: { x: MARGIN_L, y: state.y },
    end: { x: PAGE_W - MARGIN_R, y: state.y },
    color: GRAY_300, thickness: 0.5,
  })
  state.y -= 12
}

function drawTotals(state: State, quote: Quote, items: QuoteItem[]): void {
  // Group TVA by rate
  const tvaByRate = new Map<number, number>()
  for (const it of items) {
    tvaByRate.set(it.vat_rate, (tvaByRate.get(it.vat_rate) ?? 0) + it.total_tva)
  }
  const tvaRows = [...tvaByRate.entries()].sort((a, b) => b[0] - a[0])

  const boxW = 230
  const boxX = PAGE_W - MARGIN_R - boxW
  let cy = state.y

  ensureSpace(state, 30 + 16 * tvaRows.length + 30)
  cy = state.y

  // Total HT
  const labelHT = 'Total HT'
  const valHT = formatEurFR(quote.total_ht)
  drawText(state, labelHT, boxX, cy - 12, { size: 10, color: GRAY_700 })
  const wHT = state.fontBold.widthOfTextAtSize(valHT, 10)
  state.page.drawText(valHT, { x: boxX + boxW - wHT, y: cy - 12, size: 10, font: state.fontBold, color: BLACK })
  cy -= 18

  for (const [rate, amount] of tvaRows) {
    const label = `TVA ${rate.toString().replace('.', ',')}%`
    const val = formatEurFR(amount)
    drawText(state, label, boxX, cy - 12, { size: 9, color: GRAY_500 })
    const w = state.font.widthOfTextAtSize(val, 9)
    state.page.drawText(val, { x: boxX + boxW - w, y: cy - 12, size: 9, font: state.font, color: GRAY_700 })
    cy -= 14
  }

  cy -= 4
  // separator
  state.page.drawLine({
    start: { x: boxX, y: cy }, end: { x: boxX + boxW, y: cy },
    color: GRAY_300, thickness: 0.5,
  })
  cy -= 16
  // Total TTC
  const valTTC = formatEurFR(quote.total_ttc)
  state.page.drawText('Total TTC', { x: boxX, y: cy - 4, size: 12, font: state.fontBold, color: VIOLET })
  const wTTC = state.fontBold.widthOfTextAtSize(valTTC, 14)
  state.page.drawText(valTTC, { x: boxX + boxW - wTTC, y: cy - 6, size: 14, font: state.fontBold, color: VIOLET })
  cy -= 22

  state.y = cy - 6
}

function drawTextBlock(state: State, title: string, body: string | null | undefined, size = 9): void {
  if (!body) return
  const lines = body.split('\n').flatMap(l => wrapText(l, state.font, size, CONTENT_W))
  const needed = 16 + lines.length * (size + 3) + 6
  ensureSpace(state, needed)
  drawText(state, title, MARGIN_L, state.y, { size: 9, bold: true, color: GRAY_700 })
  state.y -= 12
  for (const l of lines) {
    drawText(state, l, MARGIN_L, state.y, { size, color: GRAY_700 })
    state.y -= size + 3
  }
  state.y -= 6
}

function drawLegalMentions(state: State, settings: QuoteSettings): void {
  const lines: string[] = []
  const idLine: string[] = []
  if (settings.siret) idLine.push(`SIRET ${settings.siret}`)
  if (settings.siren && settings.siren !== settings.siret) idLine.push(`SIREN ${settings.siren}`)
  if (settings.rcs_city) idLine.push(`RCS ${settings.rcs_city}`)
  if (idLine.length) lines.push(idLine.join(' · '))
  if (settings.vat_number) lines.push(`N° TVA intracom : ${settings.vat_number}`)
  if (settings.ape_code) lines.push(`Code APE : ${settings.ape_code}`)
  if (settings.decennale_provider || settings.decennale_policy) {
    const dec = `Assurance décennale : ${settings.decennale_provider ?? ''}${settings.decennale_policy ? ` — Police n°${settings.decennale_policy}` : ''}`.trim()
    lines.push(dec)
  }
  if (!lines.length) return

  ensureSpace(state, 8 + lines.length * 11 + 6)
  for (const l of lines) {
    const wrapped = wrapText(l, state.font, 8, CONTENT_W)
    for (const w of wrapped) {
      drawText(state, w, MARGIN_L, state.y, { size: 8, color: GRAY_500 })
      state.y -= 10
    }
  }
  state.y -= 6
}

function drawSignatureZone(state: State): void {
  const blockH = 130
  ensureSpace(state, blockH)
  const topY = state.y
  // Title
  drawText(state, 'Bon pour accord', MARGIN_L, topY, { size: 10, bold: true })
  state.y -= 14
  const mention = `Date et signature du client précédées de la mention manuscrite « Devis reçu avant l'exécution des travaux »`
  const wrapped = wrapText(mention, state.font, 8, CONTENT_W)
  for (const w of wrapped) {
    drawText(state, w, MARGIN_L, state.y, { size: 8, color: GRAY_500 })
    state.y -= 10
  }
  state.y -= 4
  // Frame
  const frameH = 90
  state.page.drawRectangle({
    x: MARGIN_L, y: state.y - frameH, width: CONTENT_W, height: frameH,
    borderColor: GRAY_300, borderWidth: 0.5,
  })
  state.y -= frameH + 8
}

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────

export async function generateQuotePDF(
  quote: Quote,
  items: QuoteItem[],
  settings: QuoteSettings,
): Promise<Blob> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const logo = await fetchLogoImage(doc, settings.logo_path)

  const page = doc.addPage([PAGE_W, PAGE_H])
  patchPageDrawText(page)
  const state: State = { doc, page, font, fontBold, y: PAGE_H - 40 }

  drawHeader(state, settings, logo)
  drawTitle(state, quote)
  drawMeta(state, quote)
  drawRecipient(state, quote)
  drawItems(state, items)
  drawTotals(state, quote, items)

  if (quote.client_message) drawTextBlock(state, 'Message au client', quote.client_message)

  const paymentTerms = quote.payment_terms || settings.default_payment_terms
  drawTextBlock(state, 'Conditions de paiement', paymentTerms)

  const footer = quote.footer_notes || settings.default_quote_footer
  drawTextBlock(state, 'Notes', footer)

  drawSignatureZone(state)
  drawLegalMentions(state, settings)

  const bytes = await doc.save()
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}
