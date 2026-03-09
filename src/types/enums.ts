export const PROSPECT_STATUS = {
  NOUVEAU: 'nouveau',
  APPELE_SANS_REPONSE: 'appele_sans_reponse',
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
  appele_sans_reponse: 'Messagerie', // legacy: mapped to Messagerie
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
  appele_sans_reponse: 'bg-orange-100 text-orange-800', // legacy: same as messagerie
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

// Light row background colors for prospect list
export const PROSPECT_STATUS_ROW_COLORS: Record<ProspectStatus, string> = {
  nouveau: 'bg-gray-50/60',
  appele_sans_reponse: 'bg-orange-50/60',
  messagerie: 'bg-orange-50/60',
  site_en_attente: 'bg-cyan-50/60',
  site_envoye: 'bg-blue-50/60',
  negatif: 'bg-red-50/60',
  a_rappeler: 'bg-purple-50/60',
  rdv_pris: 'bg-green-50/60',
  perdu: 'bg-red-100/40',
  converti_client: 'bg-emerald-50/60',
  faux_numero: 'bg-amber-50/60',
}

// Valid status transitions
export const PROSPECT_STATUS_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  nouveau: ['messagerie', 'site_en_attente', 'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'faux_numero'],
  appele_sans_reponse: ['messagerie', 'site_en_attente', 'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'faux_numero'], // legacy: treated as messagerie
  messagerie: ['messagerie', 'site_en_attente', 'negatif', 'a_rappeler', 'rdv_pris', 'perdu', 'faux_numero'],
  site_en_attente: ['site_envoye', 'a_rappeler', 'rdv_pris', 'negatif', 'perdu'],
  site_envoye: ['a_rappeler', 'rdv_pris', 'negatif', 'perdu'],
  a_rappeler: ['messagerie', 'site_en_attente', 'negatif', 'rdv_pris', 'perdu', 'faux_numero'],
  rdv_pris: ['rdv_pris', 'converti_client', 'perdu', 'a_rappeler'],
  negatif: ['a_rappeler', 'rdv_pris'],
  perdu: ['a_rappeler', 'rdv_pris'],
  converti_client: [],
  faux_numero: [],
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
} as const

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  fondateur: 'Fondateur',
  co_fondateur: 'Co-fondateur',
  commercial: 'Commercial',
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

