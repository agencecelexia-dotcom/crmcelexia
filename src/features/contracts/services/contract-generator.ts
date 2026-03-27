/**
 * Generate a partnership contract (DOCX) from prospect + company data.
 * Uses docx library to create a Word document.
 */

import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx'
import type { CompanySearchResult } from './company-search-service'

export interface ContractData {
  // Client info (from company search + manual input)
  client_civilite: string // Monsieur / Madame
  client_prenom: string
  client_nom: string
  client_forme_juridique: string // entrepreneur individuel, SASU, SARL...
  client_enseigne: string // nom commercial
  client_rcs_ville: string
  client_siren: string
  client_siret: string
  client_adresse: string
  client_code_postal: string
  client_ville: string
  client_activite: string
  client_titre: string // Gérant, Président, Dirigeant...
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

function bold(text: string): TextRun {
  return new TextRun({ text, bold: true })
}

function normal(text: string): TextRun {
  return new TextRun({ text })
}

function italic(text: string): TextRun {
  return new TextRun({ text, italics: true })
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

export async function generateContract(data: ContractData): Promise<Blob> {
  const dateStr = today()
  const clientFullName = `${data.client_civilite} ${data.client_prenom} ${data.client_nom}`

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
      children: [
        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'AGENCE CELEXIA', bold: true, size: 32, font: 'Calibri' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: `Contrat de Partenariat — ${data.client_enseigne}`, size: 26, color: '555555' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [bold('CONTRAT DE PARTENARIAT ET D\'APPORTEUR D\'AFFAIRES')],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [italic('Gestion et Optimisation de la Présence Digitale')],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [italic('Modèle à la performance — sans frais fixes, sans engagement')],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [normal(`Conclu entre Agence Celexia et ${data.client_enseigne}`)],
        }),

        // 1. PARTIES
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('1. PARTIES AU CONTRAT')] }),
        new Paragraph({
          children: [
            normal('D\'une part, la société '), bold('Celexia'), normal(', SASU au capital de 1 000 €, immatriculée au Registre du Commerce et des Sociétés de Créteil sous le numéro SIREN 939 306 429, dont le siège social est établi 27 bis, rue François Rolland à Nogent-sur-Marne (94130), représentée par Monsieur Thomas Aubigeon, en sa qualité de Président, ci-après désignée « le Prestataire » ou « Agence Celexia » ;'),
          ],
        }),
        new Paragraph({
          children: [
            normal(`D'autre part, ${clientFullName}, ${data.client_forme_juridique} exerçant sous l'enseigne commerciale `),
            bold(data.client_enseigne),
            normal(`, immatriculé au RCS de ${data.client_rcs_ville} sous le numéro SIREN ${data.client_siren} (SIRET ${data.client_siret}), dont l'adresse professionnelle est le ${data.client_adresse}, ${data.client_code_postal} ${data.client_ville}, exerçant une activité de ${data.client_activite}, ci-après désigné « le Client » ;`),
          ],
        }),
        new Paragraph({ children: [italic('Ci-après désignés ensemble « les Parties » et individuellement « la Partie ».')] }),

        // 2. OBJET
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('2. OBJET DU CONTRAT')] }),
        new Paragraph({ children: [normal('Le présent contrat a pour objet de définir les conditions dans lesquelles Agence Celexia assure, pour le compte du Client, la mise en place, la gestion et l\'optimisation commerciale de ses dispositifs de présence digitale et de génération de contacts qualifiés en ligne, incluant principalement la gestion de sa fiche Google Business Profile et de tout autre levier digital convenu entre les Parties.')] }),
        new Paragraph({ children: [normal('Dans le cadre du présent contrat, Agence Celexia s\'engage à piloter l\'intégralité du dispositif pour le compte du Client, sans aucun frais fixe mensuel ni frais de mise en place. La rémunération du Prestataire est exclusivement fondée sur les résultats générés (commissions d\'apporteur d\'affaires).')] }),

        // 3. PRESTATIONS
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('3. PRESTATIONS INCLUSES ET EXCLUES')] }),
        new Paragraph({ children: [normal('Dans le cadre du présent accord, Agence Celexia s\'engage à réaliser les prestations suivantes :')] }),
        new Paragraph({ children: [normal('– Création, paramétrage et gestion du dispositif de visibilité en ligne du Client')] }),
        new Paragraph({ children: [normal('– Sélection des catégories de services, zones géographiques et paramètres de ciblage')] }),
        new Paragraph({ children: [normal('– Pilotage continu des leviers digitaux : optimisation des contenus, créneaux et couverture géographique')] }),
        new Paragraph({ children: [normal('– Suivi des contacts entrants (appels, formulaires) générés par les dispositifs gérés')] }),
        new Paragraph({ children: [normal('– Optimisation de la fiche Google Business Profile : photos, horaires, catégories, gestion des avis')] }),
        new Paragraph({ children: [normal('– Reporting mensuel transmis au Client récapitulant les Leads générés et les performances du dispositif')] }),
        new Paragraph({ children: [normal('Le client règle ses factures de communication publicitaire digitale qui ne sont pas prises en charge par Agence Celexia.')] }),

        // 4. MODALITÉS FINANCIÈRES
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('4. MODALITÉS FINANCIÈRES')] }),
        new Paragraph({ children: [bold('4.1 — Principe de rémunération à la commission')] }),
        new Paragraph({ children: [normal('En contrepartie des prestations réalisées, le Client s\'engage à verser à Agence Celexia une commission équivalente à 10 % hors taxes (HT) du montant total des contrats signés par ses clients finaux, dès lors que ces contrats ont été conclus au moyen des dispositifs digitaux créés et gérés par Agence Celexia (dits « Leads »).')] }),
        new Paragraph({ children: [normal('Cette commission est calculée et exigible sur le montant HT des contrats conclus, indépendamment des délais de règlement effectifs entre le Client et ses propres clients.')] }),
        new Paragraph({ children: [normal('Aucune mensualité fixe ni frais de mise en place ne sont dus par le Client qui bénéficie pour les services rendus d\'une rémunération uniquement au résultat.')] }),

        new Paragraph({ children: [bold('4.2 — Suivi et attribution des Leads')] }),
        new Paragraph({ children: [normal('Agence Celexia, au moyen du système digital qu\'elle met en œuvre (visibilité), génère de nouveaux contacts pour le Client ; ces nouveaux contacts sont appelés « Leads ».')] }),
        new Paragraph({ children: [normal('Le suivi des Leads repose sur un système de traçabilité des contacts entrants mis en place par Agence Celexia, que le Client s\'engage à confirmer chaque fin de mois en adressant à Agence Celexia un mail avec 1/ la liste des Leads et 2/ la liste des Leads convertis (ceux avec lesquels un contrat a été signé) et le montant HT de chaque contrat signé.')] }),
        new Paragraph({ children: [normal('Il s\'agit pour le Client d\'un engagement loyal et de bonne foi indispensable à l\'économie générale du contrat puisqu\'Agence Celexia n\'offre ses services qu\'en considération des résultats à venir que seul son Client peut lui transmettre.')] }),
        new Paragraph({ children: [normal('Les Parties conviennent que leur relation est fondée sur la confiance mutuelle, dans un intérêt commun de transparence et de croissance partagée.')] }),
        new Paragraph({ children: [normal('En tout état de cause, le Client s\'engage à informer Agence Celexia, dans un délai de 5 jours ouvrés suivant la signature de tout contrat issu d\'un Lead converti, des éléments suivants :')] }),
        new Paragraph({ children: [normal('– Montant HT du devis ou de la facture concerné(e)')] }),
        new Paragraph({ children: [normal('– Nature des travaux et localisation approximative du chantier')] }),
        new Paragraph({ children: [normal('– Date de signature ou d\'acceptation du devis')] }),
        new Paragraph({ children: [normal('Cette transmission s\'effectue par tout moyen écrit (email ou SMS). En cas d\'omission ou de retard répété 48 heures après une relance infructueuse, Agence Celexia est en droit de suspendre les prestations.')] }),

        new Paragraph({ children: [bold('4.3 — Facturation et paiement')] }),
        new Paragraph({ children: [normal('Agence Celexia établit une facture mensuelle récapitulative de l\'ensemble des commissions dues au titre du mois écoulé. Le paiement est exigible dans un délai de 15 jours à compter de la réception de la facture, par virement bancaire ou tout autre moyen convenu entre les Parties.')] }),
        new Paragraph({ children: [normal('Tout retard de paiement entraîne de plein droit l\'application de pénalités de retard au taux d\'intérêt légal en vigueur, ainsi qu\'une indemnité forfaitaire pour frais de recouvrement de 40 €, conformément à l\'article L.441-10 du Code de commerce.')] }),

        // 5. DURÉE ET RÉSILIATION
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('5. DURÉE ET RÉSILIATION')] }),
        new Paragraph({ children: [normal('Le présent contrat est conclu pour une durée indéterminée, sans période d\'engagement minimale.')] }),
        new Paragraph({ children: [normal('Chacune des Parties peut y mettre fin à tout moment, sans pénalité ni justification, sous réserve d\'en informer l\'autre Partie par écrit (email ou lettre recommandée avec accusé de réception). La résiliation prend effet immédiatement à compter de la réception de la notification écrite.')] }),
        new Paragraph({ children: [normal('Les commissions dues au titre des Leads convertis avant la date de résiliation restent intégralement exigibles et doivent être réglées dans les conditions prévues à l\'article 4.')] }),
        new Paragraph({ children: [normal('À l\'expiration du présent contrat, pour quelque cause que ce soit, chaque Partie restituera immédiatement à son cocontractant l\'ensemble des documents, matériels et informations communiquées lors de l\'exécution de celui-ci et qui seraient sa propriété ou qui participerait explicitement à la continuité d\'exploitation.')] }),
        new Paragraph({ children: [normal('En tout état de cause, quel que soit le sort du contrat, la rémunération d\'apporteur d\'affaires est due sur toute la période d\'existence des contrats conclus par le Client avec les Leads convertis, grâce à la première intervention du prestataire.')] }),

        // 6. OBLIGATIONS
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('6. OBLIGATIONS DES PARTIES')] }),
        new Paragraph({ children: [bold('6.1 — Obligations d\'Agence Celexia')] }),
        new Paragraph({ children: [normal('– Mettre en œuvre toutes les actions nécessaires à l\'optimisation des performances des dispositifs gérés')] }),
        new Paragraph({ children: [normal('– Transmettre un reporting mensuel clair et lisible au Client')] }),
        new Paragraph({ children: [normal('– Informer le Client de tout changement significatif dans la gestion des dispositifs')] }),
        new Paragraph({ children: [normal('– Maintenir la confidentialité des informations transmises par le Client')] }),
        new Paragraph({ children: [normal('– Respecter les bonnes pratiques et les conditions d\'utilisation des plateformes tierces utilisées')] }),

        new Paragraph({ children: [bold('6.2 — Obligations du Client')] }),
        new Paragraph({ children: [normal('– Déclarer loyalement et sans délai l\'ensemble des contrats signés issus des Leads convertis')] }),
        new Paragraph({ children: [normal('– Maintenir un niveau de réactivité satisfaisant pour répondre aux contacts entrants')] }),
        new Paragraph({ children: [normal('– Informer Agence Celexia de tout changement dans son activité (zone, services, disponibilités)')] }),
        new Paragraph({ children: [normal('– Régler les factures dans les délais convenus à l\'article 4.3')] }),

        // 7. RESPONSABILITÉ
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('7. RESPONSABILITÉ ET GARANTIES')] }),
        new Paragraph({ children: [normal('Agence Celexia met en œuvre les meilleurs efforts (obligation de moyens) pour optimiser les performances des dispositifs digitaux du Client. Le Prestataire ne saurait être tenu responsable des variations de résultats liées aux fluctuations de la demande locale, aux évolutions des algorithmes des plateformes tierces, à un taux de réponse aux contacts trop faible de la part du Client, ou à tout événement indépendant de sa volonté.')] }),
        new Paragraph({ children: [normal('La qualité des travaux réalisés par le Client et la relation commerciale avec ses clients finaux relèvent de l\'entière responsabilité du Client. Agence Celexia n\'intervient pas dans cette relation.')] }),

        // 8. DONNÉES PERSONNELLES
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('8. DONNÉES PERSONNELLES ET CONFIDENTIALITÉ')] }),
        new Paragraph({ children: [normal('Les informations échangées dans le cadre du présent contrat sont traitées dans le respect du Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679).')] }),
        new Paragraph({ children: [normal('Chaque Partie s\'engage à ne pas divulguer à des tiers les informations confidentielles de l\'autre Partie obtenues dans le cadre du présent accord, et ce pour toute la durée du contrat et pour une période de 3 ans après son expiration.')] }),

        // 9. DISPOSITIONS GÉNÉRALES
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [bold('9. DISPOSITIONS GÉNÉRALES')] }),
        new Paragraph({ children: [normal('Aucune exclusivité n\'est conférée de part et d\'autre entre les Parties, celles-ci demeurent libres de confier à d\'autres ou de réaliser des prestations équivalentes à celles prévues par le Contrat.')] }),
        new Paragraph({ children: [normal('Les Parties déclarent expressément qu\'elles sont et demeureront, pendant toute la durée du présent contrat, des partenaires et professionnels indépendants.')] }),
        new Paragraph({ children: [normal('Le présent contrat est soumis au droit français. En cas de litige, les Parties s\'engagent à rechercher une solution amiable avant tout recours judiciaire. À défaut d\'accord dans un délai de 30 jours suivant la notification du différend, le litige sera porté devant le tribunal compétent du ressort du siège social d\'Agence Celexia (Créteil).')] }),
        new Paragraph({ children: [normal('Toute modification du présent contrat devra faire l\'objet d\'un avenant écrit et signé par les deux Parties. La nullité éventuelle d\'une clause n\'affecte pas la validité des autres stipulations. Le présent contrat annule et remplace tout accord antérieur portant sur le même objet.')] }),

        // SIGNATURES
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400 }, children: [bold('SIGNATURES ÉLECTRONIQUES DES PARTIES')] }),
        new Paragraph({ children: [italic('Les signatures apposées ci-dessous valent consentement plein et entier des Parties aux termes du présent accord, conformément à l\'article 1367 du Code civil.')] }),
        new Paragraph({ spacing: { before: 300 }, children: [] }),

        // Signature table (2 columns simulated)
        new Paragraph({
          children: [
            bold('Agence Celexia'),
            normal('                                                    '),
            bold(data.client_enseigne),
          ],
        }),
        new Paragraph({
          children: [
            normal('Thomas Aubigeon — Président'),
            normal('                              '),
            normal(`${data.client_prenom} ${data.client_nom} — ${data.client_titre}`),
          ],
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [
            italic(`Signé électroniquement le ${dateStr}`),
            normal('            '),
            italic(`Signé électroniquement le ${dateStr}`),
          ],
        }),
      ],
    }],
  })

  return await Packer.toBlob(doc)
}
