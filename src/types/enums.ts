export const PROSPECT_STATUS = {
  NOUVEAU: 'nouveau',
  APPELE_SANS_REPONSE: 'appele_sans_reponse',
  MESSAGERIE: 'messagerie',
  INTERESSE: 'interesse',
  NEGATIF: 'negatif',
  A_RAPPELER: 'a_rappeler',
  RDV_PRIS: 'rdv_pris',
  PERDU: 'perdu',
  CONVERTI_CLIENT: 'converti_client',
} as const

export type ProspectStatus = (typeof PROSPECT_STATUS)[keyof typeof PROSPECT_STATUS]

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  nouveau: 'Nouveau',
  appele_sans_reponse: 'Appelé – sans réponse',
  messagerie: 'Messagerie',
  interesse: 'Intéressé',
  negatif: 'Négatif',
  a_rappeler: 'À rappeler',
  rdv_pris: 'RDV pris',
  perdu: 'Perdu',
  converti_client: 'Converti client',
}

export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  nouveau: 'bg-gray-100 text-gray-800',
  appele_sans_reponse: 'bg-yellow-100 text-yellow-800',
  messagerie: 'bg-orange-100 text-orange-800',
  interesse: 'bg-blue-100 text-blue-800',
  negatif: 'bg-red-100 text-red-800',
  a_rappeler: 'bg-purple-100 text-purple-800',
  rdv_pris: 'bg-green-100 text-green-800',
  perdu: 'bg-red-200 text-red-900',
  converti_client: 'bg-emerald-100 text-emerald-800',
}

// Valid status transitions
export const PROSPECT_STATUS_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  nouveau: ['appele_sans_reponse', 'messagerie', 'interesse', 'negatif', 'perdu'],
  appele_sans_reponse: ['appele_sans_reponse', 'messagerie', 'interesse', 'negatif', 'a_rappeler', 'perdu'],
  messagerie: ['appele_sans_reponse', 'messagerie', 'interesse', 'negatif', 'a_rappeler', 'perdu'],
  interesse: ['a_rappeler', 'rdv_pris', 'negatif', 'perdu'],
  a_rappeler: ['appele_sans_reponse', 'messagerie', 'interesse', 'negatif', 'rdv_pris', 'perdu'],
  rdv_pris: ['rdv_pris', 'converti_client', 'perdu', 'a_rappeler'],
  negatif: [],
  perdu: ['a_rappeler'],
  converti_client: [],
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

// Map call result to suggested new prospect status
export const CALL_RESULT_TO_STATUS: Record<CallResult, ProspectStatus> = {
  no_answer: 'appele_sans_reponse',
  voicemail: 'messagerie',
  reached_interested: 'interesse',
  reached_not_interested: 'negatif',
  reached_callback: 'a_rappeler',
  reached_rdv: 'rdv_pris',
  wrong_number: 'negatif',
  other: 'appele_sans_reponse',
}

// Call results that require a mandatory note
export const CALL_RESULTS_REQUIRING_NOTE: CallResult[] = [
  'reached_not_interested',
  'wrong_number',
  'other',
]

export const RDV_STATUS = {
  PREVU: 'prevu',
  FAIT: 'fait',
  ANNULE: 'annule',
  NO_SHOW: 'no_show',
} as const

export type RdvStatus = (typeof RDV_STATUS)[keyof typeof RDV_STATUS]

export const RDV_STATUS_LABELS: Record<RdvStatus, string> = {
  prevu: 'Prévu',
  fait: 'Fait',
  annule: 'Annulé',
  no_show: 'No-show',
}

export const RDV_STATUS_COLORS: Record<RdvStatus, string> = {
  prevu: 'bg-blue-100 text-blue-800',
  fait: 'bg-green-100 text-green-800',
  annule: 'bg-gray-100 text-gray-800',
  no_show: 'bg-red-100 text-red-800',
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
} as const

export type ProspectSource = (typeof PROSPECT_SOURCE)[keyof typeof PROSPECT_SOURCE]

export const CLIENT_STATUS = {
  ACTIF: 'actif',
  INACTIF: 'inactif',
  RESILIE: 'resilie',
} as const

export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS]
