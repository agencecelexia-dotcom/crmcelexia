// Presets sectoriels pour la bibliothèque devis : suggestions par métier BTP.
// Les prix sont indicatifs, l'artisan ajuste ensuite.

export interface SectorPresetItem {
  label: string
  description?: string
  unit: string
  price: number
  vat: number
}

export interface SectorPreset {
  /** Taux de TVA par défaut (10% pour BTP rénovation, 20% sinon) */
  defaultVat: number
  /** Unités les plus fréquentes pour ce métier */
  commonUnits: string[]
  /** Suggestions à proposer dans la bibliothèque */
  suggestedItems: SectorPresetItem[]
}

const DEFAULT_PRESET: SectorPreset = {
  defaultVat: 20,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [],
}

// ── Définitions par métier ──

const PLOMBIER: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['unité', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Pose chauffe-eau', description: 'Fourniture et pose chauffe-eau électrique', unit: 'unité', price: 250, vat: 10 },
    { label: 'Remplacement WC', description: 'Dépose ancien WC + pose neuf', unit: 'unité', price: 180, vat: 10 },
    { label: 'Débouchage canalisation', unit: 'forfait', price: 80, vat: 10 },
    { label: 'Heure de main d\'œuvre', unit: 'h', price: 60, vat: 10 },
  ],
}

const ELECTRICIEN: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['unité', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Mise aux normes tableau électrique', unit: 'forfait', price: 1500, vat: 10 },
    { label: 'Pose prise électrique', unit: 'unité', price: 45, vat: 10 },
    { label: 'Diagnostic installation', unit: 'forfait', price: 90, vat: 10 },
    { label: 'Heure de main d\'œuvre', unit: 'h', price: 65, vat: 10 },
  ],
}

const CHAUFFAGISTE: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['unité', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Entretien annuel chaudière', unit: 'forfait', price: 150, vat: 10 },
    { label: 'Pose radiateur', description: 'Fourniture + pose radiateur', unit: 'unité', price: 280, vat: 10 },
    { label: 'Heure de main d\'œuvre', unit: 'h', price: 70, vat: 10 },
  ],
}

const PEINTRE: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Préparation mur', description: 'Rebouchage, ponçage, lissage', unit: 'm²', price: 8, vat: 10 },
    { label: 'Peinture mur 2 couches', unit: 'm²', price: 22, vat: 10 },
    { label: 'Peinture plafond 2 couches', unit: 'm²', price: 25, vat: 10 },
  ],
}

const MENUISIER: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['unité', 'h', 'm²'],
  suggestedItems: [
    { label: 'Pose porte intérieure', description: 'Fourniture + pose porte intérieure standard', unit: 'unité', price: 220, vat: 10 },
    { label: 'Pose fenêtre', description: 'Fourniture + pose fenêtre PVC', unit: 'unité', price: 380, vat: 10 },
    { label: 'Heure atelier (sur-mesure)', unit: 'h', price: 55, vat: 20 },
  ],
}

const CARRELEUR: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Pose carrelage sol', description: 'Fourniture non incluse', unit: 'm²', price: 50, vat: 10 },
    { label: 'Pose faïence mur', unit: 'm²', price: 65, vat: 10 },
    { label: 'Préparation chape / ragréage', unit: 'm²', price: 20, vat: 10 },
  ],
}

const PAYSAGISTE: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'unité'],
  suggestedItems: [
    { label: 'Création terrasse', description: 'Terrasse bois ou composite', unit: 'm²', price: 120, vat: 10 },
    { label: 'Plantation arbre', description: 'Fourniture + plantation', unit: 'unité', price: 80, vat: 10 },
    { label: 'Entretien jardin', unit: 'h', price: 50, vat: 10 },
  ],
}

const MACON: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Chape ciment', unit: 'm²', price: 25, vat: 10 },
    { label: 'Mur parpaing', description: 'Montage mur parpaing 20', unit: 'm²', price: 75, vat: 10 },
    { label: 'Heure de main d\'œuvre', unit: 'h', price: 55, vat: 10 },
  ],
}

const COUVREUR: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Démoussage toiture', unit: 'm²', price: 18, vat: 10 },
    { label: 'Remplacement tuiles', unit: 'm²', price: 60, vat: 10 },
    { label: 'Heure de main d\'œuvre', unit: 'h', price: 60, vat: 10 },
  ],
}

const PISCINISTE: SectorPreset = {
  defaultVat: 10,
  commonUnits: ['m²', 'h', 'forfait'],
  suggestedItems: [
    { label: 'Création terrasse autour piscine', unit: 'm²', price: 120, vat: 10 },
    { label: 'Entretien piscine', unit: 'h', price: 50, vat: 10 },
    { label: 'Mise en service annuelle', unit: 'forfait', price: 250, vat: 10 },
  ],
}

// ── Matching ──

interface ProfessionMatcher {
  patterns: string[]
  preset: SectorPreset
}

const PROFESSION_MATCHERS: ProfessionMatcher[] = [
  { patterns: ['plomb'], preset: PLOMBIER },
  { patterns: ['électric', 'electric', 'lectric'], preset: ELECTRICIEN },
  { patterns: ['chauffag'], preset: CHAUFFAGISTE },
  { patterns: ['peintre', 'peint'], preset: PEINTRE },
  { patterns: ['menuis', 'charpent'], preset: MENUISIER },
  { patterns: ['carrel', 'faïenc', 'faienc'], preset: CARRELEUR },
  { patterns: ['paysag', 'jardin'], preset: PAYSAGISTE },
  { patterns: ['maçon', 'macon'], preset: MACON },
  { patterns: ['couvr', 'toitur', 'zingu'], preset: COUVREUR },
  { patterns: ['piscin'], preset: PISCINISTE },
]

export function getSectorPresets(profession: string | null | undefined): SectorPreset {
  const p = (profession ?? '').toLowerCase().trim()
  if (!p) return DEFAULT_PRESET
  for (const matcher of PROFESSION_MATCHERS) {
    if (matcher.patterns.some(pat => p.includes(pat))) {
      return matcher.preset
    }
  }
  return DEFAULT_PRESET
}
