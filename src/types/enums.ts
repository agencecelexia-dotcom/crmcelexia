export const PROSPECT_STATUS = {
  NOUVEAU: 'nouveau',
  MESSAGERIE: 'messagerie',
  SITE_EN_ATTENTE: 'site_en_attente',
  SITE_ENVOYE: 'site_envoye',
  NEGATIF: 'negatif',
  A_RAPPELER: 'a_rappeler',
  RDV_PRIS: 'rdv_pris',
  PERDU: 'perdu',
  CONVERTI_CLIENT: 'converti_client',
  FAUX_NUMERO: 'faux_numero',
} as const

export type ProspectStatus = (typeof PROSPECT_STATUS)[keyof typeof PROSPECT_STATUS]

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  nouveau: 'Nouveau',
  messagerie: 'Messagerie',
  site_en_attente: 'Site en attente',
  site_envoye: 'Site envoyé',
  negatif: 'Négatif',
  a_rappeler: 'À rappeler',
  rdv_pris: 'RDV pris',
  perdu: 'Perdu',
  converti_client: 'Converti client',
  faux_numero: 'Faux numéro',
}

export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  nouveau: 'bg-gray-100 text-gray-800',
  messagerie: 'bg-orange-100 text-orange-800',
  site_en_attente: 'bg-cyan-100 text-cyan-800',
  site_envoye: 'bg-blue-100 text-blue-800',
  negatif: 'bg-red-100 text-red-800',
  a_rappeler: 'bg-purple-100 text-purple-800',
  rdv_pris: 'bg-green-100 text-green-800',
  perdu: 'bg-red-200 text-red-900',
  converti_client: 'bg-emerald-100 text-emerald-800',
  faux_numero: 'bg-amber-100 text-amber-800',
}

// Catégories métier canoniques pour les filtres (Pisciniste → "Constructeur de piscine", etc.)
// Le mapping `patterns` est une liste de patterns SQL ilike (avec %) qui matchent les valeurs raw
// stockées dans `prospects.profession`. Permet de regrouper les variations orthographiques.
export const PROFESSION_CATEGORIES = {
  paysagiste:  { label: 'Paysagiste',              patterns: ['%paysag%', '%jardin%'] },
  pisciniste:  { label: 'Constructeur de piscine', patterns: ['%piscin%'] },
  couvreur:    { label: 'Couvreur',                patterns: ['%couvr%', '%toitur%', '%zingu%'] },
  plombier:    { label: 'Plombier',                patterns: ['%plomb%', '%chauffag%'] },
  electricien: { label: 'Électricien',             patterns: ['%lectric%'] },
  macon:       { label: 'Maçon',                   patterns: ['%maçon%', '%macon%'] },
  menuisier:   { label: 'Menuisier',               patterns: ['%menuis%', '%charpent%'] },
  demenageur:  { label: 'Déménageur',              patterns: ['%démén%', '%demen%'] },
} as const

export type ProfessionCategory = keyof typeof PROFESSION_CATEGORIES

// Row background colors for prospect list (renforcés + bordure gauche colorée)
export const PROSPECT_STATUS_ROW_COLORS: Record<ProspectStatus, string> = {
  nouveau: 'bg-gray-100/80 border-l-4 border-l-gray-400',
  messagerie: 'bg-orange-100/80 border-l-4 border-l-orange-500',
  site_en_attente: 'bg-cyan-100/80 border-l-4 border-l-cyan-500',
  site_envoye: 'bg-blue-100/80 border-l-4 border-l-blue-500',
  negatif: 'bg-red-100/80 border-l-4 border-l-red-500',
  a_rappeler: 'bg-purple-100/80 border-l-4 border-l-purple-500',
  rdv_pris: 'bg-green-100/80 border-l-4 border-l-green-500',
  perdu: 'bg-red-200/70 border-l-4 border-l-red-700',
  converti_client: 'bg-emerald-100/80 border-l-4 border-l-emerald-600',
  faux_numero: 'bg-amber-100/80 border-l-4 border-l-amber-500',
}

// Valid status transitions
export const PROSPECT_STATUS_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  nouveau: ['messagerie', 'site_en_attente', 'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'faux_numero'],
  messagerie: ['messagerie', 'site_en_attente', 'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'faux_numero'],
  site_en_attente: ['site_envoye', 'a_rappeler', 'rdv_pris', 'negatif', 'perdu'],
  site_envoye: ['a_rappeler', 'rdv_pris', 'negatif', 'perdu'],
  a_rappeler: ['messagerie', 'a_rappeler', 'site_en_attente', 'negatif', 'rdv_pris', 'perdu', 'faux_numero'],
  rdv_pris: ['rdv_pris', 'converti_client', 'perdu', 'a_rappeler'],
  negatif: ['a_rappeler', 'rdv_pris'],
  perdu: ['a_rappeler', 'rdv_pris'],
  converti_client: [],
  faux_numero: [],
}

// ISSUE-004 : Phases métier dérivées du status
// La colonne `phase` en DB est calculée automatiquement (cf migration 00052).
// Le mapping ici doit rester synchro avec le CASE WHEN de la migration.
export const PROSPECT_PHASE = {
  PROSPECTION: 'prospection',
  PIPELINE: 'pipeline',
  TERMINAL: 'terminal',
} as const

export type ProspectPhase = (typeof PROSPECT_PHASE)[keyof typeof PROSPECT_PHASE]

export const PROSPECT_PHASE_LABELS: Record<ProspectPhase, string> = {
  prospection: 'Prospection',
  pipeline: 'Pipeline site',
  terminal: 'Terminé',
}

export const PROSPECT_STATUS_TO_PHASE: Record<ProspectStatus, ProspectPhase> = {
  nouveau: 'prospection',
  messagerie: 'prospection',
  a_rappeler: 'prospection',
  rdv_pris: 'prospection',
  site_en_attente: 'pipeline',
  site_envoye: 'pipeline',
  perdu: 'terminal',
  converti_client: 'terminal',
  negatif: 'terminal',
  faux_numero: 'terminal',
}

// Inverse pour requêtes : phase → statuts inclus
export const PROSPECT_PHASE_TO_STATUSES: Record<ProspectPhase, ProspectStatus[]> = {
  prospection: ['nouveau', 'messagerie', 'a_rappeler', 'rdv_pris'],
  pipeline: ['site_en_attente', 'site_envoye'],
  terminal: ['perdu', 'converti_client', 'negatif', 'faux_numero'],
}

export const CALL_RESULT = {
  NO_ANSWER: 'no_answer',
  VOICEMAIL: 'voicemail',
  REACHED_INTERESTED: 'reached_interested',
  REACHED_NOT_INTERESTED: 'reached_not_interested',
  REACHED_CALLBACK: 'reached_callback',
  REACHED_RDV: 'reached_rdv',
  WRONG_NUMBER: 'wrong_number',
  OTHER: 'other',
} as const

export type CallResult = (typeof CALL_RESULT)[keyof typeof CALL_RESULT]

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  no_answer: 'Pas de réponse',
  voicemail: 'Messagerie',
  reached_interested: 'Joint – Intéressé',
  reached_not_interested: 'Joint – Pas intéressé',
  reached_callback: 'Joint – À rappeler',
  reached_rdv: 'Joint – RDV pris',
  wrong_number: 'Mauvais numéro',
  other: 'Autre',
}

// Call results that should be hidden from the UI (still exist for historical data)
export const HIDDEN_CALL_RESULTS: CallResult[] = ['no_answer', 'reached_interested']

// Map call result to suggested new prospect status
export const CALL_RESULT_TO_STATUS: Record<CallResult, ProspectStatus> = {
  no_answer: 'messagerie',
  voicemail: 'messagerie',
  reached_interested: 'a_rappeler',
  reached_not_interested: 'negatif',
  reached_callback: 'a_rappeler',
  reached_rdv: 'rdv_pris',
  wrong_number: 'faux_numero',
  other: 'messagerie',
}

// Call results that require a mandatory note
export const CALL_RESULTS_REQUIRING_NOTE: CallResult[] = [
  'other',
]

export const RDV_STATUS = {
  PREVU: 'prevu',
  CONFIRME: 'confirme',
  SHOW: 'show',
  NO_SHOW: 'no_show',
  FAIT: 'fait',
  CLOSE: 'close',
  ANNULE: 'annule',
  PERDU: 'perdu',
} as const

export type RdvStatus = (typeof RDV_STATUS)[keyof typeof RDV_STATUS]

export const RDV_STATUS_LABELS: Record<RdvStatus, string> = {
  prevu: 'À venir',
  confirme: 'Confirmé',
  show: 'Show',
  no_show: 'No-show',
  fait: 'Fait',
  close: 'Closé',
  annule: 'Annulé',
  perdu: 'Perdu',
}

export const RDV_STATUS_COLORS: Record<RdvStatus, string> = {
  prevu: 'bg-blue-100 text-blue-800',
  confirme: 'bg-cyan-100 text-cyan-800',
  show: 'bg-green-100 text-green-800',
  no_show: 'bg-red-100 text-red-800',
  fait: 'bg-emerald-100 text-emerald-800',
  close: 'bg-purple-100 text-purple-800',
  annule: 'bg-gray-100 text-gray-800',
  perdu: 'bg-red-200 text-red-900',
}

export const RDV_TYPE = {
  TELEPHONE: 'telephone',
  VISIO: 'visio',
  PRESENTIEL: 'presentiel',
} as const

export type RdvType = (typeof RDV_TYPE)[keyof typeof RDV_TYPE]

export const RDV_TYPE_LABELS: Record<RdvType, string> = {
  telephone: 'Téléphone',
  visio: 'Visio',
  presentiel: 'Présentiel',
}

export const DEVIS_STATUS = {
  BROUILLON: 'brouillon',
  ENVOYE: 'envoye',
  SIGNE: 'signe',
  REFUSE: 'refuse',
  EXPIRE: 'expire',
} as const

export type DevisStatus = (typeof DEVIS_STATUS)[keyof typeof DEVIS_STATUS]

export const DEVIS_STATUS_LABELS: Record<DevisStatus, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  signe: 'Signé',
  refuse: 'Refusé',
  expire: 'Expiré',
}

export const PROJECT_STATUS = {
  ONBOARDING: 'onboarding',
  EN_COURS: 'en_cours',
  EN_ATTENTE: 'en_attente',
  TERMINE: 'termine',
  RESILIE: 'resilie',
} as const

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  onboarding: 'Onboarding',
  en_cours: 'En cours',
  en_attente: 'En attente',
  termine: 'Terminé',
  resilie: 'Résilié',
}

export const USER_ROLE = {
  FONDATEUR: 'fondateur',
  CO_FONDATEUR: 'co_fondateur',
  COMMERCIAL: 'commercial',
  ARTISAN: 'artisan',
} as const

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  fondateur: 'Fondateur',
  co_fondateur: 'Co-fondateur',
  commercial: 'Commercial',
  artisan: 'Artisan',
}

export const PROSPECT_SOURCE = {
  CSV_IMPORT: 'csv_import',
  MANUAL: 'manual',
  REFERRAL: 'referral',
  API_GENERATION: 'api_generation',
} as const

export type ProspectSource = (typeof PROSPECT_SOURCE)[keyof typeof PROSPECT_SOURCE]

export const CLIENT_STATUS = {
  ACTIF: 'actif',
  INACTIF: 'inactif',
  RESILIE: 'resilie',
} as const

export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS]

// ── Loss Reasons ──
export const LOSS_REASON = {
  PRIX_TROP_ELEVE: 'prix_trop_eleve',
  PAS_DE_BUDGET: 'pas_de_budget',
  CONCURRENT_CHOISI: 'concurrent_choisi',
  PAS_DE_BESOIN: 'pas_de_besoin',
  TIMING_MAUVAIS: 'timing_mauvais',
  PAS_DE_REPONSE: 'pas_de_reponse',
  MAUVAISE_EXPERIENCE: 'mauvaise_experience',
  PROJET_REPORTE: 'projet_reporte',
  DECISION_INTERNE: 'decision_interne',
  AUTRE: 'autre',
} as const

export type LossReason = (typeof LOSS_REASON)[keyof typeof LOSS_REASON]

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  prix_trop_eleve: 'Prix trop élevé',
  pas_de_budget: 'Pas de budget',
  concurrent_choisi: 'Concurrent choisi',
  pas_de_besoin: 'Pas de besoin',
  timing_mauvais: 'Timing mauvais',
  pas_de_reponse: 'Pas de réponse',
  mauvaise_experience: 'Mauvaise expérience',
  projet_reporte: 'Projet reporté',
  decision_interne: 'Décision interne',
  autre: 'Autre',
}

export const LOSS_REASON_COLORS: Record<LossReason, string> = {
  prix_trop_eleve: 'bg-red-100 text-red-800',
  pas_de_budget: 'bg-orange-100 text-orange-800',
  concurrent_choisi: 'bg-yellow-100 text-yellow-800',
  pas_de_besoin: 'bg-gray-100 text-gray-800',
  timing_mauvais: 'bg-blue-100 text-blue-800',
  pas_de_reponse: 'bg-purple-100 text-purple-800',
  mauvaise_experience: 'bg-red-200 text-red-900',
  projet_reporte: 'bg-amber-100 text-amber-800',
  decision_interne: 'bg-slate-100 text-slate-800',
  autre: 'bg-gray-100 text-gray-700',
}

// ── Death Reasons ──
export const DEATH_REASON = {
  NE_VEUT_PLUS: 'ne_veut_plus',
  RAPPELER_PLUS_TARD: 'rappeler_plus_tard',
} as const

export type DeathReason = (typeof DEATH_REASON)[keyof typeof DEATH_REASON]

export const DEATH_REASON_LABELS: Record<DeathReason, string> = {
  ne_veut_plus: 'Ne veut plus bosser avec nous',
  rappeler_plus_tard: 'Veut le site mais plus tard — rappeler',
}

// ── Payment Status ──
export const PAYMENT_STATUS = {
  PAYE: 'paye',
  EN_ATTENTE: 'en_attente',
  EN_RETARD: 'en_retard',
  IMPAYE: 'impaye',
} as const

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paye: 'Payé',
  en_attente: 'En attente',
  en_retard: 'En retard',
  impaye: 'Impayé',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  paye: 'bg-green-100 text-green-800',
  en_attente: 'bg-yellow-100 text-yellow-800',
  en_retard: 'bg-orange-100 text-orange-800',
  impaye: 'bg-red-100 text-red-800',
}

// ── Action Types ──
export const ACTION_TYPE = {
  APPEL: 'appel',
  EMAIL: 'email',
  RDV: 'rdv',
  RELANCE: 'relance',
  DEVIS: 'devis',
  PRESENTATION: 'presentation',
  SUIVI: 'suivi',
  AUTRE: 'autre',
} as const

export type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE]

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  appel: 'Appel',
  email: 'Email',
  rdv: 'Rendez-vous',
  relance: 'Relance',
  devis: 'Devis',
  presentation: 'Présentation',
  suivi: 'Suivi',
  autre: 'Autre',
}

// ── Opportunity Type ──
export const OPPORTUNITY_TYPE = {
  SITE_WEB: 'site_web',
  PUB: 'pub',
} as const

export type OpportunityType = (typeof OPPORTUNITY_TYPE)[keyof typeof OPPORTUNITY_TYPE]

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  site_web: 'Site Web',
  pub: 'Pub (LSA)',
}

export const OPPORTUNITY_TYPE_COLORS: Record<OpportunityType, string> = {
  site_web: 'bg-blue-100 text-blue-800',
  pub: 'bg-amber-100 text-amber-800',
}

// Commission rate for pub opportunities (10%)
export const PUB_COMMISSION_RATE = 0.10

// ── Opportunity Status ──
export const OPPORTUNITY_STATUS = {
  SITE_A_ENVOYER: 'site_a_envoyer',
  SITE_ENVOYE: 'site_envoye',
  RDV: 'rdv',
  EN_ATTENTE_RETOUR: 'en_attente_retour',
  CLOSE: 'close',
  PERDU: 'perdu',
} as const

export type OpportunityStatus = (typeof OPPORTUNITY_STATUS)[keyof typeof OPPORTUNITY_STATUS]

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  site_a_envoyer: 'Site à envoyer',
  site_envoye: 'Site envoyé',
  rdv: 'RDV',
  en_attente_retour: 'En attente de retour',
  close: 'Close',
  perdu: 'Perdu',
}

export const OPPORTUNITY_PUB_LABELS: Record<OpportunityStatus, string> = {
  site_a_envoyer: 'RDV',
  site_envoye: 'RDV',
  rdv: 'RDV',
  en_attente_retour: 'En attente (R2)',
  close: 'Close',
  perdu: 'Perdu',
}

// Pipeline stages for Pub (LSA) — simplified: RDV → En attente R2 → Close
export const OPPORTUNITY_PUB_STAGES: OpportunityStatus[] = [
  'rdv',
  'en_attente_retour',
  'close',
]

export function getOpportunityLabel(status: OpportunityStatus, type?: OpportunityType): string {
  if (type === 'pub') return OPPORTUNITY_PUB_LABELS[status]
  return OPPORTUNITY_STATUS_LABELS[status]
}

export const OPPORTUNITY_STATUS_COLORS: Record<OpportunityStatus, string> = {
  site_a_envoyer: 'bg-blue-100 text-blue-800',
  site_envoye: 'bg-cyan-100 text-cyan-800',
  rdv: 'bg-yellow-100 text-yellow-800',
  en_attente_retour: 'bg-orange-100 text-orange-800',
  close: 'bg-green-100 text-green-800',
  perdu: 'bg-red-100 text-red-800',
}

// Colonnes actives du Kanban (dans l'ordre)
export const OPPORTUNITY_PIPELINE_STAGES: OpportunityStatus[] = [
  'site_a_envoyer',
  'site_envoye',
  'rdv',
  'en_attente_retour',
  'close',
]

// Hex colors pour le Kanban + chart
export const OPPORTUNITY_STAGE_HEX: Record<OpportunityStatus, string> = {
  site_a_envoyer: '#3B82F6',
  site_envoye: '#06B6D4',
  rdv: '#F59E0B',
  en_attente_retour: '#F97316',
  close: '#10B981',
  perdu: '#EF4444',
}

// ── Alert Types ──
export const ALERT_TYPE = {
  PROSPECT_CHAUD_NON_RELANCE: 'prospect_chaud_non_relance',
  DEVIS_SANS_REPONSE: 'devis_sans_reponse',
  CLIENT_RENOUVELLEMENT: 'client_renouvellement',
  RAPPEL_EN_RETARD: 'rappel_en_retard',
  OBJECTIF_NON_ATTEINT: 'objectif_non_atteint',
  PROSPECT_SANS_ACTION: 'prospect_sans_action',
} as const

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE]

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  prospect_chaud_non_relance: 'Prospect chaud non relancé',
  devis_sans_reponse: 'Devis sans réponse > 3 jours',
  client_renouvellement: 'Client proche renouvellement',
  rappel_en_retard: 'Rappel en retard',
  objectif_non_atteint: 'Objectif non atteint',
  prospect_sans_action: 'Prospect sans action planifiée',
}

export const ALERT_TYPE_COLORS: Record<AlertType, string> = {
  prospect_chaud_non_relance: 'bg-red-100 text-red-800',
  devis_sans_reponse: 'bg-orange-100 text-orange-800',
  client_renouvellement: 'bg-blue-100 text-blue-800',
  rappel_en_retard: 'bg-yellow-100 text-yellow-800',
  objectif_non_atteint: 'bg-purple-100 text-purple-800',
  prospect_sans_action: 'bg-gray-100 text-gray-800',
}

// ── Contract Status ──
export const CONTRACT_STATUS = {
  ACTIF: 'actif',
  EXPIRE: 'expire',
  RESILIE: 'resilie',
  EN_ATTENTE: 'en_attente',
} as const

export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS]

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  actif: 'Actif',
  expire: 'Expiré',
  resilie: 'Résilié',
  en_attente: 'En attente',
}

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  actif: 'bg-green-100 text-green-800',
  expire: 'bg-gray-100 text-gray-800',
  resilie: 'bg-red-100 text-red-800',
  en_attente: 'bg-yellow-100 text-yellow-800',
}

// ── Follow-up Period ──
export const FOLLOWUP_PERIOD = {
  SIX_MOIS: '6_mois',
  UN_AN: '1_an',
  DEUX_ANS: '2_ans',
} as const

export type FollowupPeriod = (typeof FOLLOWUP_PERIOD)[keyof typeof FOLLOWUP_PERIOD]

export const FOLLOWUP_PERIOD_LABELS: Record<FollowupPeriod, string> = {
  '6_mois': '6 mois',
  '1_an': '1 an',
  '2_ans': '2 ans',
}

// Devis status colors
export const DEVIS_STATUS_COLORS: Record<DevisStatus, string> = {
  brouillon: 'bg-gray-100 text-gray-800',
  envoye: 'bg-blue-100 text-blue-800',
  signe: 'bg-green-100 text-green-800',
  refuse: 'bg-red-100 text-red-800',
  expire: 'bg-orange-100 text-orange-800',
}

// Project status colors
export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  onboarding: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-green-100 text-green-800',
  en_attente: 'bg-yellow-100 text-yellow-800',
  termine: 'bg-gray-100 text-gray-800',
  resilie: 'bg-red-100 text-red-800',
}

// ── Commission Status ──
export const COMMISSION_STATUS = {
  A_RECEVOIR: 'a_recevoir',
  RECU: 'recu',
  EN_RETARD: 'en_retard',
} as const

export type CommissionStatus = (typeof COMMISSION_STATUS)[keyof typeof COMMISSION_STATUS]

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  a_recevoir: 'A recevoir',
  recu: 'Recu',
  en_retard: 'En retard',
}

export const COMMISSION_STATUS_COLORS: Record<CommissionStatus, string> = {
  a_recevoir: 'bg-yellow-100 text-yellow-800',
  recu: 'bg-green-100 text-green-800',
  en_retard: 'bg-red-100 text-red-800',
}

// ── Invoice Type ──
export const INVOICE_TYPE = {
  COMMISSION: 'commission',
  BUDGET_PUB: 'budget_pub',
} as const

export type InvoiceType = (typeof INVOICE_TYPE)[keyof typeof INVOICE_TYPE]

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  commission: 'Commission',
  budget_pub: 'Budget pub',
}

// ============================================================
// Reminder context — differenciates types of callbacks
// ============================================================
export const REMINDER_CONTEXT = {
  COLD_CALL: 'cold_call',
  POST_SITE: 'post_site',
  POST_RDV: 'post_rdv',
  POST_PERTE: 'post_perte',
  MANUEL: 'manuel',
} as const

export type ReminderContext = (typeof REMINDER_CONTEXT)[keyof typeof REMINDER_CONTEXT]

export const REMINDER_CONTEXT_LABELS: Record<ReminderContext, string> = {
  cold_call: 'Cold call',
  post_site: 'Suivi site',
  post_rdv: 'Suivi RDV',
  post_perte: 'Relance perdu',
  manuel: 'Manuel',
}

// Badge colors (bg + text)
export const REMINDER_CONTEXT_COLORS: Record<ReminderContext, string> = {
  cold_call: 'bg-slate-100 text-slate-700 border-slate-200',
  post_site: 'bg-blue-100 text-blue-700 border-blue-200',
  post_rdv: 'bg-purple-100 text-purple-700 border-purple-200',
  post_perte: 'bg-amber-100 text-amber-700 border-amber-200',
  manuel: 'bg-gray-100 text-gray-600 border-gray-200',
}

// Left border accent for reminder cards
export const REMINDER_CONTEXT_BORDER: Record<ReminderContext, string> = {
  cold_call: 'border-l-slate-400',
  post_site: 'border-l-blue-400',
  post_rdv: 'border-l-purple-400',
  post_perte: 'border-l-amber-400',
  manuel: 'border-l-gray-300',
}

// Helper: derive context from opportunity status
export function contextFromOppStatus(oppStatus: string): ReminderContext {
  if (['site_envoye', 'site_en_attente'].includes(oppStatus)) return 'post_site'
  if (['rdv', 'en_attente_retour'].includes(oppStatus)) return 'post_rdv'
  return 'cold_call'
}

// ── Portal Lead Status ──
export const PORTAL_LEAD_STATUS = {
  NOUVEAU: 'nouveau',
  QUALIFIE: 'qualifie',
  DEVIS: 'devis',
  SIGNE: 'signe',
  PERDU: 'perdu',
  CLOS: 'clos',
} as const

export type PortalLeadStatus = (typeof PORTAL_LEAD_STATUS)[keyof typeof PORTAL_LEAD_STATUS]

export const PORTAL_LEAD_STATUS_LABELS: Record<PortalLeadStatus, string> = {
  nouveau: 'Nouveau',
  qualifie: 'Qualifié',
  devis: 'Devis envoyé',
  signe: 'Signé',
  perdu: 'Perdu',
  clos: 'Clôturé',
}

export const PORTAL_LEAD_STATUS_COLORS: Record<PortalLeadStatus, string> = {
  nouveau: 'bg-blue-100 text-blue-700',
  qualifie: 'bg-violet-100 text-violet-700',
  devis: 'bg-amber-100 text-amber-700',
  signe: 'bg-emerald-100 text-emerald-700',
  perdu: 'bg-gray-100 text-gray-600',
  clos: 'bg-slate-200 text-slate-700',
}

// Couleurs CSS vars pour les badges/pastilles du portail (kanban + détail lead).
// Distinct de PORTAL_LEAD_STATUS_COLORS qui contient des classes Tailwind :
// le portail artisan utilise un design system custom basé sur CSS vars.
export const PORTAL_LEAD_STATUS_VAR_COLORS: Record<PortalLeadStatus, { color: string; bg: string }> = {
  nouveau: { color: 'var(--blue-600)', bg: 'var(--blue-100)' },
  qualifie: { color: 'var(--violet-700)', bg: 'var(--violet-100)' },
  devis: { color: 'var(--amber-600)', bg: 'var(--amber-100)' },
  signe: { color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
  perdu: { color: 'var(--gray-500)', bg: 'var(--gray-100)' },
  clos: { color: 'var(--slate-700)', bg: 'var(--slate-200)' },
}

// Pipeline actif (sans perdu) — utilisé pour les conversions, stats, etc.
export const PORTAL_LEAD_PIPELINE: PortalLeadStatus[] = ['nouveau', 'qualifie', 'devis', 'signe']

// Ordre complet pour le Kanban (inclut la colonne "perdu" en fin).
export const PORTAL_LEAD_STATUS_ORDER: PortalLeadStatus[] = ['nouveau', 'qualifie', 'devis', 'signe', 'perdu']

// ── Portal Onboarding Status ──
export const PORTAL_ONBOARDING_STATUS = {
  IN_PROGRESS: 'in_progress',
  PENDING_VALIDATION: 'pending_validation',
  VALIDATED: 'validated',
  REJECTED: 'rejected',
  ABANDONED: 'abandoned',
} as const

export type PortalOnboardingStatus = (typeof PORTAL_ONBOARDING_STATUS)[keyof typeof PORTAL_ONBOARDING_STATUS]

// ── Portal Lead Source ──
export const PORTAL_LEAD_SOURCE = {
  LSA: 'lsa',
  BAO: 'bao',
} as const

export type PortalLeadSource = (typeof PORTAL_LEAD_SOURCE)[keyof typeof PORTAL_LEAD_SOURCE]

export const PORTAL_LEAD_SOURCE_LABELS: Record<PortalLeadSource, string> = {
  lsa: 'Celexia',
  bao: 'Bouche-à-oreille',
}

// ── Quote (devis artisan portail) ──
export const QUOTE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  SIGNED: 'signed',
  REFUSED: 'refused',
  EXPIRED: 'expired',
} as const

export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS]

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  signed: 'Signé',
  refused: 'Refusé',
  expired: 'Expiré',
}

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, { color: string; bg: string }> = {
  draft: { color: 'var(--gray-600)', bg: 'var(--gray-100)' },
  sent: { color: 'var(--blue-600)', bg: 'var(--blue-100)' },
  signed: { color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
  refused: { color: 'var(--gray-500)', bg: 'var(--gray-100)' },
  expired: { color: 'var(--amber-600)', bg: 'var(--amber-100)' },
}

export const QUOTE_UNITS = ['unité', 'm²', 'm³', 'ml', 'h', 'jour', 'forfait', 'pièce', 'kg', 'L'] as const

export const VAT_RATES = [20, 10, 5.5, 0] as const

export const COMPANY_FORMS = ['EI', 'EURL', 'SARL', 'SAS', 'SASU', 'Auto-entrepreneur', 'Micro-entreprise', 'SA'] as const

// ── Accompagnement Step (5-step post-signature flow) ──
export type AccompagnementStep =
  | 'contract_signed'
  | 'insurance_received'
  | 'gmb_access_shared'
  | 'payment_received'
  | 'lsa_live'

export const ACCOMPAGNEMENT_STEP_LABELS: Record<AccompagnementStep, string> = {
  contract_signed: 'Contrat signé',
  insurance_received: 'Assurance reçue',
  gmb_access_shared: 'Accès GMB partagé',
  payment_received: 'Virement reçu',
  lsa_live: 'Campagne en ligne',
}

export const ACCOMPAGNEMENT_STEP_DESCRIPTIONS: Record<AccompagnementStep, string> = {
  contract_signed: 'Contrat de prestation signé par le client',
  insurance_received: 'RC Pro ou décennale reçue',
  gmb_access_shared: 'Accès Google My Business partagé avec Celexia',
  payment_received: 'Premier virement reçu',
  lsa_live: 'Campagne d\'acquisition en ligne',
}

export const ACCOMPAGNEMENT_STEPS_ORDER: AccompagnementStep[] = [
  'contract_signed',
  'insurance_received',
  'gmb_access_shared',
  'payment_received',
  'lsa_live',
]

export type AccompagnementStatus = 'blocked' | 'on_track' | 'launched'

export const ACCOMPAGNEMENT_STATUS_LABELS: Record<AccompagnementStatus, string> = {
  blocked: 'Bloqué',
  on_track: 'En cours',
  launched: 'Lancé',
}

export const ACCOMPAGNEMENT_STATUS_COLORS: Record<AccompagnementStatus, string> = {
  blocked: 'bg-red-100 text-red-700',
  on_track: 'bg-amber-100 text-amber-700',
  launched: 'bg-emerald-100 text-emerald-700',
}

