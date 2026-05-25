import type { PortalLead } from '@/types'

/**
 * Métadonnées d'affichage pour la source d'un lead portail.
 *
 * Centralisé ici pour éviter la duplication entre kanban / dashboard /
 * lead-detail / timeline. Si on ajoute une nouvelle source (ex 'facebook',
 * 'instagram'), il suffit de l'ajouter à ce switch.
 */
export interface LeadSourceMeta {
  /** Label court pour les badges (ex "Celexia", "Bouche-à-oreille", "Site web") */
  label: string
  /** Variable CSS de fond pour le badge */
  bg: string
  /** Variable CSS de couleur de texte */
  color: string
}

export function getLeadSourceMeta(source: PortalLead['source']): LeadSourceMeta {
  switch (source) {
    case 'lsa':
      return { label: 'Celexia', bg: 'var(--blue-100)', color: 'var(--blue-600)' }
    case 'site_web':
      return { label: 'Site web', bg: 'var(--violet-100)', color: 'var(--violet-700)' }
    case 'bao':
    default:
      return { label: 'Bouche-à-oreille', bg: 'var(--gray-100)', color: 'var(--gray-600)' }
  }
}
