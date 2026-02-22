/**
 * Test data seeder — generates realistic CRM data using existing profiles.
 * Only meant for development/demo environments.
 */
import { supabase } from '@/lib/supabase/client'

// ---------- realistic French data pools ----------

const COMPANY_NAMES = [
  'Boulangerie du Marché', 'Pizzeria La Bella', 'Salon Coiff\'Style', 'Garage Dupont',
  'Cabinet Dentaire Martin', 'Restaurant Le Provençal', 'Fleuriste Rose & Lys',
  'Plomberie Express', 'Pharmacie Centrale', 'Optique Vision Plus',
  'Boucherie Traditionnelle', 'Pâtisserie Gourmande', 'Auto-école Réussite',
  'Agence Immobilière du Centre', 'Cabinet d\'Avocats Moreau', 'Clinique Vétérinaire',
  'Librairie Les Mots Bleus', 'Fromagerie du Terroir', 'Salon de Beauté Éclat',
  'Centre Fitness Energy', 'Crêperie Bretonne', 'Pizzeria Napoli', 'Bar Le Comptoir',
  'Restaurant L\'Olivier', 'Brasserie Saint-Michel', 'Hôtel Le Relais',
  'Pressing Net & Propre', 'Cordonnerie Rapide', 'Bijouterie Dorée',
  'Cabinet Comptable Fidus', 'Assurance Protect+', 'Studio Photo Flash',
  'Imprimerie Moderne', 'Carrosserie Brillance', 'Menuiserie Bois & Co',
  'Électricité Martin', 'Peinture Décor Pro', 'Serrurerie 24h', 'Tapissier d\'Art',
  'Cave à Vins Le Cru', 'Boulangerie Au Pain Doré', 'Sushi Bar Osaka',
  'Kebab Le Sultan', 'Traiteur Saveurs du Monde', 'Institut de Beauté Zen',
  'Coiffeur Tête d\'Affiche', 'Laverie Automatique Express', 'Fleuriste Pétales',
  'Chocolatier Maître Cacao', 'Épicerie Fine Terroir',
]

const CONTACT_FIRSTNAMES = [
  'Jean', 'Pierre', 'Marie', 'Sophie', 'Thomas', 'Nicolas', 'Isabelle', 'Laurent',
  'Philippe', 'Catherine', 'Stéphane', 'Nathalie', 'Christophe', 'Valérie', 'Éric',
  'Sandrine', 'Olivier', 'Céline', 'François', 'Julie', 'David', 'Émilie',
  'Patrick', 'Aurélie', 'Sébastien', 'Caroline', 'Julien', 'Mélanie', 'Antoine',
  'Camille',
]

const CONTACT_LASTNAMES = [
  'Martin', 'Durand', 'Bernard', 'Petit', 'Robert', 'Moreau', 'Simon', 'Laurent',
  'Michel', 'Lefebvre', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent',
  'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert',
  'Bonnet', 'François', 'Martinez', 'Leroy', 'Mathieu', 'Guérin', 'Muller', 'Henry',
]

const PROFESSIONS = [
  'Restauration', 'Coiffure', 'Santé', 'Commerce', 'Automobile',
  'Immobilier', 'Juridique', 'Artisanat', 'Beauté / Bien-être', 'Sport & Loisirs',
  'Alimentation', 'Hôtellerie', 'Services', 'BTP', 'Éducation',
]

const CITIES = [
  'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux', 'Nantes',
  'Strasbourg', 'Lille', 'Nice', 'Montpellier', 'Rennes', 'Grenoble',
  'Aix-en-Provence', 'Dijon', 'Angers', 'Toulon', 'Reims', 'Clermont-Ferrand',
]

const ZONES = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre', 'Île-de-France']

const NOTES_POOL = [
  'Très intéressé par notre offre de création de site web.',
  'A déjà un site mais veut le refaire. Budget limité.',
  'Demande un rappel la semaine prochaine après son congé.',
  'N\'a pas de présence en ligne, conscient du besoin.',
  'Déjà en contact avec un concurrent, à convaincre.',
  'Souhaite un devis pour un site + réseaux sociaux.',
  'Pas le bon moment, relancer dans 1 mois.',
  'Le gérant était absent, rappeler le matin.',
  'Très réceptif, RDV pris pour une démo.',
  'Budget serré, proposer la formule starter.',
  null,
  null,
]

const CALL_NOTES = [
  'Pas de réponse après 5 sonneries.',
  'Boîte vocale pleine.',
  'Numéro temporairement indisponible.',
  'Intéressé, veut en savoir plus.',
  'Pas intéressé pour le moment.',
  'A demandé un rappel jeudi matin.',
  'RDV convenu pour la semaine prochaine.',
  'Mauvais numéro, vérifier la fiche.',
  null,
]

// ---------- helpers ----------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomPhone(): string {
  const prefixes = ['06', '07']
  const prefix = pick(prefixes)
  const rest = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')
  return `${prefix}${rest}`
}

function randomDate(daysAgo: number, daysAgoEnd = 0): Date {
  const now = Date.now()
  const start = now - daysAgo * 86400000
  const end = now - daysAgoEnd * 86400000
  return new Date(start + Math.random() * (end - start))
}

function futureDate(daysAhead: number, daysAheadStart = 0): Date {
  const now = Date.now()
  const start = now + daysAheadStart * 86400000
  const end = now + daysAhead * 86400000
  return new Date(start + Math.random() * (end - start))
}

function todayAt(hour: number, minute: number): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------- main seeder ----------

export interface SeedProgress {
  step: string
  current: number
  total: number
}

export async function seedTestData(
  onProgress?: (p: SeedProgress) => void,
): Promise<{ success: boolean; message: string }> {
  const report = (step: string, current: number, total: number) =>
    onProgress?.({ step, current, total })

  try {
    // 1. Get existing profiles
    report('Chargement des profils...', 0, 7)
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('is_active', true)

    if (pErr) throw pErr
    if (!profiles || profiles.length === 0) {
      return { success: false, message: 'Aucun profil trouvé. Créez d\'abord des utilisateurs.' }
    }

    const commercials = profiles.filter(
      (p) => p.role === 'commercial' || p.role === 'co_fondateur' || p.role === 'fondateur',
    )
    if (commercials.length === 0) {
      return { success: false, message: 'Aucun commercial trouvé.' }
    }

    // 2. Create prospects (50 in various statuses)
    report('Création des prospects...', 1, 7)
    const statuses: Array<{
      status: string
      weight: number
    }> = [
      { status: 'nouveau', weight: 8 },
      { status: 'messagerie', weight: 12 },
      { status: 'interesse', weight: 6 },
      { status: 'a_rappeler', weight: 6 },
      { status: 'rdv_pris', weight: 5 },
      { status: 'converti_client', weight: 5 },
      { status: 'negatif', weight: 4 },
      { status: 'perdu', weight: 4 },
    ]

    const weightedStatuses = statuses.flatMap((s) => Array(s.weight).fill(s.status) as string[])

    const prospectRows = COMPANY_NAMES.map((companyName, i) => {
      const firstName = pick(CONTACT_FIRSTNAMES)
      const lastName = pick(CONTACT_LASTNAMES)
      const status = weightedStatuses[i % weightedStatuses.length]
      const commercial = commercials[i % commercials.length]
      const callCount =
        status === 'nouveau'
          ? 0
          : Math.floor(Math.random() * 6) + 1

      return {
        company_name: companyName,
        contact_name: lastName,
        contact_firstname: firstName,
        contact_email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        phone: randomPhone(),
        phone_secondary: Math.random() > 0.7 ? randomPhone() : null,
        profession: pick(PROFESSIONS),
        city: pick(CITIES),
        zone: pick(ZONES),
        address: `${Math.floor(Math.random() * 200) + 1} rue ${pick(['de la Paix', 'Victor Hugo', 'du Commerce', 'Pasteur', 'des Lilas', 'Jean Jaurès', 'de la République', 'Gambetta'])}`,
        status,
        commercial_id: commercial.id,
        source: pick(['manual', 'csv_import', 'referral'] as const),
        call_count: callCount,
        last_called_at: callCount > 0 ? randomDate(30).toISOString() : null,
        next_reminder_at:
          status === 'a_rappeler'
            ? (Math.random() > 0.5 ? futureDate(7) : randomDate(3)).toISOString()
            : null,
        converted_at: status === 'converti_client' ? randomDate(60, 5).toISOString() : null,
        notes: pick(NOTES_POOL),
        created_at: randomDate(90, 1).toISOString(),
      }
    })

    const { data: prospects, error: prospErr } = await supabase
      .from('prospects')
      .insert(prospectRows)
      .select('id, status, commercial_id, company_name, contact_name, contact_firstname, phone, profession, city, converted_at, source')

    if (prospErr) throw prospErr
    if (!prospects) throw new Error('Aucun prospect créé')

    // 3. Create calls for non-new prospects
    report('Création des appels...', 2, 7)
    const callRows: Array<Record<string, unknown>> = []

    const callResults = [
      'no_answer', 'voicemail', 'reached_interested', 'reached_not_interested',
      'reached_callback', 'reached_rdv', 'wrong_number', 'other',
    ]

    for (const p of prospects) {
      if (p.status === 'nouveau') continue
      const numCalls = Math.floor(Math.random() * 4) + 1
      let prevStatus = 'nouveau'
      for (let c = 0; c < numCalls; c++) {
        const result = pick(callResults)
        const newStatus = c === numCalls - 1 ? p.status : pick(['messagerie', 'interesse', 'a_rappeler'])
        callRows.push({
          prospect_id: p.id,
          commercial_id: p.commercial_id,
          called_at: randomDate(60, 1).toISOString(),
          duration_seconds: result === 'no_answer' ? 0 : Math.floor(Math.random() * 300) + 10,
          result,
          previous_status: prevStatus,
          new_status: newStatus,
          note: pick(CALL_NOTES),
        })
        prevStatus = newStatus
      }
    }

    // Insert calls in chunks of 50
    for (let i = 0; i < callRows.length; i += 50) {
      const chunk = callRows.slice(i, i + 50)
      const { error: callErr } = await supabase.from('calls').insert(chunk)
      if (callErr) throw callErr
    }

    // 4. Create reminders
    report('Création des rappels...', 3, 7)
    const reminderProspects = prospects.filter(
      (p) => p.status === 'a_rappeler' || p.status === 'interesse' || p.status === 'messagerie',
    )
    const reminderRows = reminderProspects.map((p, i) => {
      // Mix of today, overdue, and future reminders
      let remindAt: Date
      if (i % 4 === 0) {
        // Today
        remindAt = todayAt(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60))
      } else if (i % 4 === 1) {
        // Overdue (past)
        remindAt = randomDate(10, 1)
      } else {
        // Future
        remindAt = futureDate(14, 1)
      }

      return {
        prospect_id: p.id,
        commercial_id: p.commercial_id,
        remind_at: remindAt.toISOString(),
        note: pick([
          'Rappeler le matin',
          'A demandé un rappel',
          'Relancer pour le devis',
          'Vérifier s\'il a reçu l\'email',
          'Suite à la démo',
          null,
        ]),
        is_completed: i % 6 === 0,
        completed_at: i % 6 === 0 ? randomDate(5).toISOString() : null,
      }
    })

    if (reminderRows.length > 0) {
      const { error: remErr } = await supabase.from('reminders').insert(reminderRows)
      if (remErr) throw remErr
    }

    // 5. Create RDV
    report('Création des rendez-vous...', 4, 7)
    const rdvProspects = prospects.filter(
      (p) => p.status === 'rdv_pris' || p.status === 'converti_client',
    )
    const rdvTypes = ['telephone', 'visio', 'presentiel'] as const
    const rdvStatuses = ['prevu', 'fait', 'annule', 'no_show'] as const

    const rdvRows = rdvProspects.map((p, i) => {
      const rdvStatus =
        p.status === 'converti_client'
          ? 'fait'
          : rdvStatuses[i % rdvStatuses.length]

      const scheduledAt =
        rdvStatus === 'prevu'
          ? futureDate(14, 1)
          : randomDate(30, 1)

      return {
        prospect_id: p.id,
        commercial_id: p.commercial_id,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: pick([15, 30, 45, 60]),
        type: pick(rdvTypes),
        status: rdvStatus,
        result:
          rdvStatus === 'fait'
            ? pick(['Bon échange, le client est convaincu.', 'Devis envoyé.', 'À relancer après réflexion.'])
            : null,
        location: pick(['Bureaux du client', 'Nos locaux', 'Café du Centre', null]),
        notes: pick([
          'Client ponctuel, très intéressé.',
          'RDV reporté une fois.',
          'Avait des questions sur le prix.',
          null,
        ]),
        no_show_reason:
          rdvStatus === 'no_show'
            ? pick(['Pas joignable', 'A oublié', 'Problème personnel'])
            : null,
      }
    })

    // Also add some upcoming RDV for prospects with status rdv_pris
    const upcomingRdvRows = prospects
      .filter((p) => p.status === 'rdv_pris')
      .slice(0, 3)
      .map((p) => ({
        prospect_id: p.id,
        commercial_id: p.commercial_id,
        scheduled_at: futureDate(7, 0).toISOString(),
        duration_minutes: 30,
        type: pick(rdvTypes),
        status: 'prevu' as const,
        notes: 'RDV à venir',
      }))

    const allRdv = [...rdvRows, ...upcomingRdvRows]
    if (allRdv.length > 0) {
      const { error: rdvErr } = await supabase.from('rendez_vous').insert(allRdv)
      if (rdvErr) throw rdvErr
    }

    // 6. Create clients from converted prospects
    report('Création des clients...', 5, 7)
    const convertedProspects = prospects.filter((p) => p.status === 'converti_client')

    const clientRows = convertedProspects.map((p) => ({
      prospect_id: p.id,
      company_name: p.company_name,
      contact_name: p.contact_name,
      contact_firstname: p.contact_firstname,
      phone: p.phone,
      profession: p.profession,
      city: p.city,
      commercial_id: p.commercial_id,
      source: p.source,
      converted_at: p.converted_at ?? new Date().toISOString(),
      status: pick(['actif', 'actif', 'actif', 'inactif'] as const),
    }))

    let clients: Array<{ id: string; company_name: string; commercial_id: string }> = []
    if (clientRows.length > 0) {
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .insert(clientRows)
        .select('id, company_name, commercial_id')

      if (clientErr) throw clientErr
      clients = clientData ?? []

      // Link prospects to clients
      for (let i = 0; i < convertedProspects.length; i++) {
        if (clients[i]) {
          await supabase
            .from('prospects')
            .update({ client_id: clients[i].id })
            .eq('id', convertedProspects[i].id)
        }
      }
    }

    // 7. Create projects + devis for clients
    report('Création des projets et devis...', 6, 7)
    const projectStatuses = ['onboarding', 'en_cours', 'en_attente', 'termine'] as const
    const projectNames = [
      'Site vitrine', 'Site e-commerce', 'Refonte complète', 'Landing page',
      'Gestion réseaux sociaux', 'SEO local', 'Application mobile',
    ]

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i]
      const pStatus = projectStatuses[i % projectStatuses.length]
      const monthlyAmount = pick([299, 499, 799, 999, 1499])

      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          client_id: client.id,
          name: pick(projectNames),
          description: `Projet pour ${client.company_name}`,
          status: pStatus,
          start_date: randomDate(60, 10).toISOString().split('T')[0],
          end_date: pStatus === 'termine' ? randomDate(5).toISOString().split('T')[0] : null,
          monthly_amount: monthlyAmount,
          total_amount: monthlyAmount * 12,
        })
        .select('id')
        .single()

      if (projErr) throw projErr

      // Create 1-2 devis per client
      const numDevis = Math.random() > 0.5 ? 2 : 1
      const devisStatuses = ['brouillon', 'envoye', 'signe', 'refuse'] as const
      const founder = profiles.find((p) => p.role === 'fondateur') ?? commercials[0]

      for (let d = 0; d < numDevis; d++) {
        const dStatus = d === 0 && pStatus !== 'onboarding' ? 'signe' : devisStatuses[i % devisStatuses.length]
        const amountHt = monthlyAmount * (d === 0 ? 12 : 6)
        const ref = `DEV-${new Date().getFullYear()}-${String(i * 10 + d + 1).padStart(4, '0')}`

        await supabase.from('devis').insert({
          client_id: client.id,
          project_id: project?.id,
          reference: ref,
          amount_ht: amountHt,
          tax_rate: 20,
          status: dStatus,
          sent_at: dStatus !== 'brouillon' ? randomDate(30, 5).toISOString() : null,
          signed_at: dStatus === 'signe' ? randomDate(5).toISOString() : null,
          refused_at: dStatus === 'refuse' ? randomDate(5).toISOString() : null,
          valid_until: futureDate(30).toISOString().split('T')[0],
          created_by: founder.id,
        })
      }
    }

    report('Terminé !', 7, 7)

    return {
      success: true,
      message: `Données de test créées : ${prospects.length} prospects, ${callRows.length} appels, ${reminderRows.length} rappels, ${allRdv.length} RDV, ${clients.length} clients avec projets et devis.`,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Erreur : ${msg}` }
  }
}

/** Delete all test data (prospects, calls, reminders, rdv, clients, projects, devis) */
export async function clearTestData(): Promise<{ success: boolean; message: string }> {
  try {
    // Delete in reverse order of dependencies
    await supabase.from('devis').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('project_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('project_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('rendez_vous').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('reminders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('calls').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    // Clear client_id references before deleting prospects
    await supabase.from('prospects').update({ client_id: null }).neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('prospects').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    return { success: true, message: 'Toutes les données de test ont été supprimées.' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Erreur : ${msg}` }
  }
}
