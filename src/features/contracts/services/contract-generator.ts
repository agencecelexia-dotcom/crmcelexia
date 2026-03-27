/**
 * Generate a partnership contract (PDF) from prospect + company data.
 * Uses pdf-lib for clean PDF output with fillable signature fields.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'
import type { CompanySearchResult } from './company-search-service'

export interface ContractData {
  client_civilite: string
  client_prenom: string
  client_nom: string
  client_forme_juridique: string
  client_enseigne: string
  client_rcs_ville: string
  client_siren: string
  client_siret: string
  client_adresse: string
  client_code_postal: string
  client_ville: string
  client_activite: string
  client_titre: string
}

function formatSiren(siren: string): string {
  const s = siren.replace(/\s/g, '')
  if (s.length === 9) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`
  return s
}

function formatSiret(siret: string): string {
  const s = siret.replace(/\s/g, '')
  if (s.length === 14) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
  return s
}

function today(): string {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function prefillFromSearch(result: CompanySearchResult): Partial<ContractData> {
  const isEI = result.nature_juridique === '1000'
  return {
    client_forme_juridique: result.nature_juridique_label,
    client_enseigne: result.nom_commercial || result.nom_complet,
    client_rcs_ville: result.ville,
    client_siren: formatSiren(result.siren),
    client_siret: formatSiret(result.siret),
    client_adresse: result.adresse,
    client_code_postal: result.code_postal,
    client_ville: result.ville,
    client_prenom: result.dirigeant_prenom || '',
    client_nom: result.dirigeant_nom || '',
    client_titre: isEI ? 'Gérant' : 'Président',
  }
}

// ── PDF HELPERS ──

const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const LINE_HEIGHT = 14
const PARA_SPACING = 8

interface DrawState {
  doc: PDFDocument
  page: PDFPage
  y: number
  font: PDFFont
  fontBold: PDFFont
  fontItalic: PDFFont
}

function newPage(state: DrawState): PDFPage {
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  state.y = PAGE_HEIGHT - 50
  return state.page
}

function checkSpace(state: DrawState, needed: number) {
  if (state.y - needed < 50) {
    newPage(state)
  }
}

/** Word-wrap text to fit within maxWidth, returns array of lines */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(testLine, size)
    if (width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

function drawTitle(state: DrawState, text: string, size: number) {
  checkSpace(state, size + 20)
  state.y -= 10
  const width = state.fontBold.widthOfTextAtSize(text, size)
  const x = (PAGE_WIDTH - width) / 2
  state.page.drawText(text, { x, y: state.y, size, font: state.fontBold, color: rgb(0, 0, 0) })
  state.y -= size + 6
}

function drawSubtitle(state: DrawState, text: string, size: number) {
  checkSpace(state, size + 10)
  const width = state.font.widthOfTextAtSize(text, size)
  const x = (PAGE_WIDTH - width) / 2
  state.page.drawText(text, { x, y: state.y, size, font: state.font, color: rgb(0.3, 0.3, 0.3) })
  state.y -= size + 4
}

function drawHeading(state: DrawState, text: string) {
  checkSpace(state, 30)
  state.y -= 12
  state.page.drawText(text, { x: MARGIN_LEFT, y: state.y, size: 11, font: state.fontBold, color: rgb(0, 0, 0) })
  state.y -= LINE_HEIGHT + 4
}

function drawSubHeading(state: DrawState, text: string) {
  checkSpace(state, 20)
  state.y -= 4
  state.page.drawText(text, { x: MARGIN_LEFT, y: state.y, size: 10, font: state.fontBold, color: rgb(0, 0, 0) })
  state.y -= LINE_HEIGHT + 2
}

function drawParagraph(state: DrawState, text: string, indent = 0) {
  const lines = wrapText(text, state.font, 9.5, CONTENT_WIDTH - indent)
  for (const line of lines) {
    checkSpace(state, LINE_HEIGHT)
    state.page.drawText(line, { x: MARGIN_LEFT + indent, y: state.y, size: 9.5, font: state.font, color: rgb(0, 0, 0) })
    state.y -= LINE_HEIGHT
  }
  state.y -= PARA_SPACING
}

function drawBullet(state: DrawState, text: string) {
  drawParagraph(state, `– ${text}`, 10)
}

function drawItalic(state: DrawState, text: string, centered = false) {
  const lines = wrapText(text, state.fontItalic, 9.5, CONTENT_WIDTH)
  for (const line of lines) {
    checkSpace(state, LINE_HEIGHT)
    const x = centered ? (PAGE_WIDTH - state.fontItalic.widthOfTextAtSize(line, 9.5)) / 2 : MARGIN_LEFT
    state.page.drawText(line, { x, y: state.y, size: 9.5, font: state.fontItalic, color: rgb(0, 0, 0) })
    state.y -= LINE_HEIGHT
  }
  state.y -= PARA_SPACING
}

// ── MAIN GENERATOR ──

export async function generateContract(data: ContractData): Promise<Blob> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique)

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const state: DrawState = { doc, page, y: PAGE_HEIGHT - 60, font, fontBold, fontItalic }

  const dateStr = today()
  const clientFullName = `${data.client_civilite} ${data.client_prenom} ${data.client_nom}`

  // ── PAGE DE GARDE ──
  state.y -= 40
  drawTitle(state, 'AGENCE CELEXIA', 20)
  drawSubtitle(state, `Contrat de Partenariat — ${data.client_enseigne}`, 13)
  state.y -= 30
  drawTitle(state, 'CONTRAT DE PARTENARIAT ET D\'APPORTEUR D\'AFFAIRES', 12)
  drawSubtitle(state, 'Gestion et Optimisation de la Présence Digitale', 10)
  drawSubtitle(state, 'Modèle à la performance — sans frais fixes, sans engagement', 9)
  state.y -= 10
  drawSubtitle(state, `Conclu entre Agence Celexia et ${data.client_enseigne}`, 10)
  state.y -= 20

  // 1. PARTIES
  drawHeading(state, '1. PARTIES AU CONTRAT')
  drawParagraph(state, `D'une part, la société Celexia, SASU au capital de 1 000 €, immatriculée au Registre du Commerce et des Sociétés de Créteil sous le numéro SIREN 939 306 429, dont le siège social est établi 27 bis, rue François Rolland à Nogent-sur-Marne (94130), représentée par Monsieur Thomas Aubigeon, en sa qualité de Président, ci-après désignée « le Prestataire » ou « Agence Celexia » ;`)
  drawParagraph(state, `D'autre part, ${clientFullName}, ${data.client_forme_juridique} exerçant sous l'enseigne commerciale ${data.client_enseigne}, immatriculé au RCS de ${data.client_rcs_ville} sous le numéro SIREN ${data.client_siren} (SIRET ${data.client_siret}), dont l'adresse professionnelle est le ${data.client_adresse}, ${data.client_code_postal} ${data.client_ville}, exerçant une activité de ${data.client_activite}, ci-après désigné « le Client » ;`)
  drawItalic(state, 'Ci-après désignés ensemble « les Parties » et individuellement « la Partie ».')

  // 2. OBJET
  drawHeading(state, '2. OBJET DU CONTRAT')
  drawParagraph(state, `Le présent contrat a pour objet de définir les conditions dans lesquelles Agence Celexia assure, pour le compte du Client, la mise en place, la gestion et l'optimisation commerciale de ses dispositifs de présence digitale et de génération de contacts qualifiés en ligne, incluant principalement la gestion de sa fiche Google Business Profile et de tout autre levier digital convenu entre les Parties.`)
  drawParagraph(state, `Dans le cadre du présent contrat, Agence Celexia s'engage à piloter l'intégralité du dispositif pour le compte du Client, sans aucun frais fixe mensuel ni frais de mise en place. La rémunération du Prestataire est exclusivement fondée sur les résultats générés (commissions d'apporteur d'affaires).`)

  // 3. PRESTATIONS
  drawHeading(state, '3. PRESTATIONS INCLUSES ET EXCLUES')
  drawParagraph(state, `Dans le cadre du présent accord, Agence Celexia s'engage à réaliser les prestations suivantes :`)
  drawBullet(state, `Création, paramétrage et gestion du dispositif de visibilité en ligne du Client`)
  drawBullet(state, `Sélection des catégories de services, zones géographiques et paramètres de ciblage`)
  drawBullet(state, `Pilotage continu des leviers digitaux : optimisation des contenus, créneaux et couverture géographique`)
  drawBullet(state, `Suivi des contacts entrants (appels, formulaires) générés par les dispositifs gérés`)
  drawBullet(state, `Optimisation de la fiche Google Business Profile : photos, horaires, catégories, gestion des avis`)
  drawBullet(state, `Reporting mensuel transmis au Client récapitulant les Leads générés et les performances du dispositif`)
  drawParagraph(state, `Le client règle ses factures de communication publicitaire digitale qui ne sont pas prises en charge par Agence Celexia.`)

  // 4. MODALITÉS FINANCIÈRES
  drawHeading(state, '4. MODALITÉS FINANCIÈRES')
  drawSubHeading(state, '4.1 — Principe de rémunération à la commission')
  drawParagraph(state, `En contrepartie des prestations réalisées, le Client s'engage à verser à Agence Celexia une commission équivalente à 10 % hors taxes (HT) du montant total des contrats signés par ses clients finaux, dès lors que ces contrats ont été conclus au moyen des dispositifs digitaux créés et gérés par Agence Celexia (dits « Leads »).`)
  drawParagraph(state, `Cette commission est calculée et exigible sur le montant HT des contrats conclus, indépendamment des délais de règlement effectifs entre le Client et ses propres clients.`)
  drawParagraph(state, `Aucune mensualité fixe ni frais de mise en place ne sont dus par le Client qui bénéficie pour les services rendus d'une rémunération uniquement au résultat.`)

  drawSubHeading(state, '4.2 — Suivi et attribution des Leads')
  drawParagraph(state, `Agence Celexia, au moyen du système digital qu'elle met en œuvre (visibilité), génère de nouveaux contacts pour le Client ; ces nouveaux contacts sont appelés « Leads ».`)
  drawParagraph(state, `Le suivi des Leads repose sur un système de traçabilité des contacts entrants mis en place par Agence Celexia, que le Client s'engage à confirmer chaque fin de mois en adressant à Agence Celexia un mail avec 1/ la liste des Leads et 2/ la liste des Leads convertis (ceux avec lesquels un contrat a été signé) et le montant HT de chaque contrat signé.`)
  drawParagraph(state, `Il s'agit pour le Client d'un engagement loyal et de bonne foi indispensable à l'économie générale du contrat puisqu'Agence Celexia n'offre ses services qu'en considération des résultats à venir que seul son Client peut lui transmettre.`)
  drawParagraph(state, `Les Parties conviennent que leur relation est fondée sur la confiance mutuelle, dans un intérêt commun de transparence et de croissance partagée.`)
  drawParagraph(state, `En tout état de cause, le Client s'engage à informer Agence Celexia, dans un délai de 5 jours ouvrés suivant la signature de tout contrat issu d'un Lead converti, des éléments suivants :`)
  drawBullet(state, `Montant HT du devis ou de la facture concerné(e)`)
  drawBullet(state, `Nature des travaux et localisation approximative du chantier`)
  drawBullet(state, `Date de signature ou d'acceptation du devis`)
  drawParagraph(state, `Cette transmission s'effectue par tout moyen écrit (email ou SMS). En cas d'omission ou de retard répété 48 heures après une relance infructueuse, Agence Celexia est en droit de suspendre les prestations.`)

  drawSubHeading(state, '4.3 — Facturation et paiement')
  drawParagraph(state, `Agence Celexia établit une facture mensuelle récapitulative de l'ensemble des commissions dues au titre du mois écoulé. Le paiement est exigible dans un délai de 15 jours à compter de la réception de la facture, par virement bancaire ou tout autre moyen convenu entre les Parties.`)
  drawParagraph(state, `Tout retard de paiement entraîne de plein droit l'application de pénalités de retard au taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €, conformément à l'article L.441-10 du Code de commerce.`)

  // 5. DURÉE ET RÉSILIATION
  drawHeading(state, '5. DURÉE ET RÉSILIATION')
  drawParagraph(state, `Le présent contrat est conclu pour une durée indéterminée, sans période d'engagement minimale.`)
  drawParagraph(state, `Chacune des Parties peut y mettre fin à tout moment, sans pénalité ni justification, sous réserve d'en informer l'autre Partie par écrit (email ou lettre recommandée avec accusé de réception). La résiliation prend effet immédiatement à compter de la réception de la notification écrite.`)
  drawParagraph(state, `Les commissions dues au titre des Leads convertis avant la date de résiliation restent intégralement exigibles et doivent être réglées dans les conditions prévues à l'article 4.`)
  drawParagraph(state, `À l'expiration du présent contrat, pour quelque cause que ce soit, chaque Partie restituera immédiatement à son cocontractant l'ensemble des documents, matériels et informations communiquées lors de l'exécution de celui-ci et qui seraient sa propriété ou qui participerait explicitement à la continuité d'exploitation. À défaut, la partie défaillante pourrait y être contrainte, par décision de justice désignant tout mandataire ad hoc pour procéder à une telle restitution.`)
  drawParagraph(state, `En tout état de cause, quel que soit le sort du contrat, la rémunération d'apporteur d'affaires est due sur toute la période d'existence des contrats conclus par le Client avec les Leads convertis, grâce à la première intervention du prestataire.`)

  // 6. OBLIGATIONS
  drawHeading(state, '6. OBLIGATIONS DES PARTIES')
  drawSubHeading(state, '6.1 — Obligations d\'Agence Celexia')
  drawBullet(state, `Mettre en œuvre toutes les actions nécessaires à l'optimisation des performances des dispositifs gérés`)
  drawBullet(state, `Transmettre un reporting mensuel clair et lisible au Client`)
  drawBullet(state, `Informer le Client de tout changement significatif dans la gestion des dispositifs`)
  drawBullet(state, `Maintenir la confidentialité des informations transmises par le Client`)
  drawBullet(state, `Respecter les bonnes pratiques et les conditions d'utilisation des plateformes tierces utilisées`)

  drawSubHeading(state, '6.2 — Obligations du Client')
  drawBullet(state, `Déclarer loyalement et sans délai l'ensemble des contrats signés issus des Leads convertis`)
  drawBullet(state, `Maintenir un niveau de réactivité satisfaisant pour répondre aux contacts entrants`)
  drawBullet(state, `Informer Agence Celexia de tout changement dans son activité (zone, services, disponibilités)`)
  drawBullet(state, `Régler les factures dans les délais convenus à l'article 4.3`)

  // 7. RESPONSABILITÉ
  drawHeading(state, '7. RESPONSABILITÉ ET GARANTIES')
  drawParagraph(state, `Agence Celexia met en œuvre les meilleurs efforts (obligation de moyens) pour optimiser les performances des dispositifs digitaux du Client. Le Prestataire ne saurait être tenu responsable des variations de résultats liées aux fluctuations de la demande locale, aux évolutions des algorithmes des plateformes tierces, à un taux de réponse aux contacts trop faible de la part du Client, ou à tout événement indépendant de sa volonté.`)
  drawParagraph(state, `La qualité des travaux réalisés par le Client et la relation commerciale avec ses clients finaux relèvent de l'entière responsabilité du Client. Agence Celexia n'intervient pas dans cette relation.`)

  // 8. DONNÉES PERSONNELLES
  drawHeading(state, '8. DONNÉES PERSONNELLES ET CONFIDENTIALITÉ')
  drawParagraph(state, `Les informations échangées dans le cadre du présent contrat sont traitées dans le respect du Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679).`)
  drawParagraph(state, `Chaque Partie s'engage à ne pas divulguer à des tiers les informations confidentielles de l'autre Partie obtenues dans le cadre du présent accord, et ce pour toute la durée du contrat et pour une période de 3 ans après son expiration.`)
  drawParagraph(state, `Les données relatives aux Leads (coordonnées, localisation) sont traitées conformément aux conditions d'utilisation des plateformes concernées et aux obligations légales françaises en vigueur.`)

  // 9. DISPOSITIONS GÉNÉRALES
  drawHeading(state, '9. DISPOSITIONS GÉNÉRALES')
  drawParagraph(state, `Aucune exclusivité n'est conférée de part et d'autre entre les Parties, celles-ci demeurent libres de confier à d'autres ou de réaliser des prestations équivalentes à celles prévues par le Contrat.`)
  drawParagraph(state, `Le prestataire garde l'entière liberté, pendant toute la durée du Contrat, d'accepter d'autres missions de présentation de clientèle, groupements, entités ou personnes physiques, exploitant des activités similaires ou concurrentes de celles de la Société. Il n'est pas interdit au prestataire d'exercer tout autre activité ou mission de son choix pour le compte de tout autre client de son choix.`)
  drawParagraph(state, `Les frais de déplacements engagés pour la bonne fin des présentes, préalablement validés par le Client, sont facturés mensuellement.`)
  drawParagraph(state, `Les Parties déclarent expressément qu'elles sont et demeureront, pendant toute la durée du présent contrat, des partenaires et professionnels indépendants.`)
  drawParagraph(state, `Chaque partie reconnaît qu'elle ne bénéficie, aux termes du présent contrat, d'aucun droit de propriété ou d'usage sur la marque et l'enseigne de son co-contractant, sauf le droit exclusif de se présenter comme son partenaire aux fins de bonne exécution des présentes.`)
  drawParagraph(state, `Chaque co-contractant s'engage à toujours se comporter vis-à-vis de l'autre co-contractant, comme un partenaire loyal et de bonne foi et, notamment, à porter sans délai à la connaissance de l'autre partie, tout différend ou toute difficulté qu'il pourrait rencontrer dans le cadre de l'exécution du présent contrat.`)
  drawParagraph(state, `Le présent contrat est soumis au droit français. En cas de litige, les Parties s'engagent à rechercher une solution amiable avant tout recours judiciaire. À défaut d'accord dans un délai de 30 jours suivant la notification du différend, le litige sera porté devant le tribunal compétent du ressort du siège social d'Agence Celexia (Créteil).`)
  drawParagraph(state, `Toute modification du présent contrat devra faire l'objet d'un avenant écrit et signé par les deux Parties. La nullité éventuelle d'une clause n'affecte pas la validité des autres stipulations. Le présent contrat annule et remplace tout accord antérieur portant sur le même objet.`)

  // ── PAGE SIGNATURE (toujours sur une nouvelle page) ──
  newPage(state)
  state.y = PAGE_HEIGHT - 80

  drawTitle(state, 'SIGNATURES ÉLECTRONIQUES DES PARTIES', 12)
  state.y -= 10
  drawItalic(state, 'Les signatures apposées ci-dessous valent consentement plein et entier des Parties aux termes du présent accord, conformément à l\'article 1367 du Code civil.', true)
  state.y -= 30

  // Signature table — 4 rows, 2 columns
  const tableTop = state.y
  const tableLeft = MARGIN_LEFT
  const tableRight = PAGE_WIDTH - MARGIN_RIGHT
  const colMid = PAGE_WIDTH / 2
  const rowH = 40
  const tableHeight = rowH * 4
  const borderColor = rgb(0, 0, 0)

  // Outer border
  state.page.drawRectangle({ x: tableLeft, y: tableTop - tableHeight, width: tableRight - tableLeft, height: tableHeight, borderColor, borderWidth: 1 })
  // Vertical middle line
  state.page.drawLine({ start: { x: colMid, y: tableTop }, end: { x: colMid, y: tableTop - tableHeight }, color: borderColor, thickness: 1 })
  // 3 horizontal lines (between 4 rows)
  for (let i = 1; i < 4; i++) {
    const lineY = tableTop - rowH * i
    state.page.drawLine({ start: { x: tableLeft, y: lineY }, end: { x: tableRight, y: lineY }, color: borderColor, thickness: 1 })
  }

  const cellPad = 15
  const black = rgb(0, 0, 0)

  // Row 1: Company names (centered vertically)
  const r1y = tableTop - rowH / 2 - 4
  state.page.drawText('Agence Celexia', { x: tableLeft + cellPad, y: r1y, size: 10, font: fontBold, color: black })
  state.page.drawText(data.client_enseigne, { x: colMid + cellPad, y: r1y, size: 10, font: fontBold, color: black })

  // Row 2: Names + titles
  const r2y = tableTop - rowH - rowH / 2 - 4
  state.page.drawText('Thomas Aubigeon — Président', { x: tableLeft + cellPad, y: r2y, size: 9, font, color: black })
  state.page.drawText(`${data.client_prenom} ${data.client_nom} — ${data.client_titre}`, { x: colMid + cellPad, y: r2y, size: 9, font, color: black })

  // Row 3: Signatures
  const r3top = tableTop - rowH * 2
  state.page.drawText(`Signé le ${dateStr}`, { x: tableLeft + cellPad, y: r3top - 14, size: 8, font: fontItalic, color: black })
  state.page.drawText('Thomas Aubigeon', { x: tableLeft + cellPad, y: r3top - 28, size: 9, font: fontBold, color: black })

  // Client signature fillable field — fits inside the right cell of row 3
  const form = doc.getForm()
  const sigField = form.createTextField('client_signature')
  sigField.setText('')
  sigField.addToPage(state.page, {
    x: colMid + 2,
    y: r3top - rowH + 2,
    width: (tableRight - colMid) - 4,
    height: rowH - 4,
    borderWidth: 0,
  })

  // Row 4: Dates
  const r4top = tableTop - rowH * 3
  state.page.drawText(`Date : ${dateStr}`, { x: tableLeft + cellPad, y: r4top - rowH / 2 - 4, size: 9, font, color: black })
  state.page.drawText('Date :', { x: colMid + cellPad, y: r4top - rowH / 2 - 4, size: 9, font, color: black })

  // Client date fillable field
  const dateField = form.createTextField('client_date')
  dateField.setText('')
  dateField.addToPage(state.page, {
    x: colMid + 55,
    y: r4top - rowH + 6,
    width: 140,
    height: rowH - 12,
    borderWidth: 0,
  })

  // Footer
  state.y = tableTop - tableHeight - 30
  drawItalic(state, 'Le Client peut signer ce document en remplissant les champs ci-dessus, puis en sauvegardant le PDF.', true)

  // Serialize
  const pdfBytes = await doc.save()
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}
