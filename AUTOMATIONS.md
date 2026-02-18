# Automatisations CRM Celexia

Ce document recense toutes les automatisations prevues pour le CRM Celexia.
Les automatisations internes (dans l'app) sont deja implementees.
Les automatisations externes (webhooks, crons, emails) sont a configurer separement.

---

## 1. Automatisations Internes (Frontend)

### 1.1 Alertes Intelligentes (Implementees)

| Alerte | Declencheur | Severite | Action |
|--------|------------|----------|--------|
| **Prospect chaud non relance** | Prospect interesse/rdv_pris sans contact depuis 48h et sans rappel planifie | Critique | Lien vers la fiche prospect |
| **Devis sans reponse** | Devis au statut "envoye" depuis plus de 3 jours | Avertissement | Lien vers le client |
| **Client proche renouvellement** | Projet en cours avec date de fin dans les 30 prochains jours | Info | Lien vers le client |
| **Rappel en retard** | Rappel non complete dont la date est passee | Avertissement | Lien vers le prospect |
| **Prospect sans action planifiee** | Prospect actif (non perdu/converti/negatif) sans next_reminder_at | Info | Lien vers le prospect |

### 1.2 Scoring Automatique des Leads (Implemente)

Le score est calcule automatiquement sur 100 points :

| Critere | Points max | Baremes |
|---------|-----------|---------|
| Budget estime | 20 | 50k+=20, 20k+=16, 10k+=12, 5k+=8, <5k=4 |
| Taille entreprise | 20 | Grande=20, Moyenne=16, Petite=10, Micro=5 |
| Potentiel mensuel | 20 | 5k+=20, 2k+=16, 1k+=12, 500+=8, <500=4 |
| Urgence | 20 | Urgent=20, Eleve=16, Moyen=10, Faible=4 |
| Decideur identifie | 20 | Oui=20, Non=5 |

Classification : Chaud (80+), Tiede (60-79), Moyen (40-59), Froid (<40)

### 1.3 Calculs Automatiques

- **Revenu projete** = Valeur estimee x Probabilite (%) pour chaque opportunite
- **Pipeline** = Somme des valeurs estimees des opportunites actives
- **Forecast** = Somme des revenus projetes (ponderes par probabilite)
- **Statut de paiement** = Derive automatiquement du statut du devis et des dates
- **Taux de closing** = Convertis / (Convertis + Perdus) par commercial
- **CAC** = Nombre d'appels / Nombre de conversions
- **Taux appel -> RDV** = Appels resultat "rdv_pris" / Total appels
- **Taux RDV -> Closing** = Conversions / Total RDV

---

## 2. Automatisations Externes (A Configurer)

### 2.1 Relances Automatiques par Email

**Outil suggere** : n8n, Make (Integromat), ou Supabase Edge Functions + Cron

| Automatisation | Declencheur | Action | Delai |
|---------------|------------|--------|-------|
| **Relance prospect interesse** | Prospect passe a "interesse" | Envoyer email de suivi | 24h apres |
| **Relance apres RDV** | RDV marque comme "fait" | Envoyer email de remerciement + recap | 1h apres |
| **Relance devis envoye** | Devis passe a "envoye" | Envoyer rappel si pas de reponse | 3 jours apres |
| **Relance devis urgente** | Devis toujours "envoye" | Envoyer rappel urgent | 7 jours apres |
| **Relance prospect froid** | Prospect "a_rappeler" sans appel | Envoyer email de relance | 7 jours apres dernier contact |

### 2.2 Creation Automatique de Taches

| Automatisation | Declencheur | Tache creee |
|---------------|------------|-------------|
| **Tache si pas rappele sous 48h** | Prospect "interesse" ou "a_rappeler" sans appel depuis 48h | Creer un rappel automatique pour le commercial |
| **Tache apres no-show** | RDV marque "no_show" | Creer rappel pour replanifier sous 24h |
| **Tache renouvellement** | Projet avec end_date dans 30 jours | Creer tache de renouvellement pour le commercial |
| **Tache onboarding** | Prospect converti en client | Creer taches d'onboarding automatiques |

### 2.3 Alertes par Notification (Push/Email/SMS)

| Alerte | Destinataire | Canal |
|--------|-------------|-------|
| **Prospect chaud non traite** | Commercial assigne | Email + Notification in-app |
| **Objectif non atteint** | Commercial + Manager | Email hebdomadaire |
| **Nouveau prospect assigne** | Commercial | Notification in-app |
| **Devis signe** | Fondateur | Email + Notification |
| **Paiement en retard** | Fondateur | Email |
| **Client resilie** | Commercial + Fondateur | Email + Notification |

### 2.4 Synchronisations Externes

| Integration | Evenement | Action |
|------------|----------|--------|
| **Cal.com -> CRM** | Nouveau booking | Creer RDV automatiquement (deja implemente via webhook) |
| **Cal.com -> CRM** | Booking annule | Mettre a jour RDV (deja implemente) |
| **CRM -> Google Calendar** | Nouveau RDV cree | Sync vers Google Calendar |
| **CRM -> Slack** | Conversion client | Notification canal #ventes |
| **CRM -> Slack** | Objectif atteint | Notification canal #ventes |
| **Stripe -> CRM** | Paiement recu | Mettre a jour statut paiement |
| **Stripe -> CRM** | Paiement echoue | Creer alerte impaye |

### 2.5 Workflows de Suivi Long Terme

| Workflow | Declencheur | Actions |
|----------|------------|---------|
| **Relance 6 mois** | Client converti il y a 6 mois | Email de nouvelles + proposition upsell |
| **Relance 1 an** | Client converti il y a 1 an | Email anniversaire + offre speciale |
| **Relance 2 ans** | Client converti il y a 2 ans | Email de reactivation |
| **Relance prospect perdu** | Prospect perdu il y a 3 mois | Email de relance avec nouvelle offre |
| **Relance prospect negatif** | Prospect negatif il y a 6 mois | Email informatif (newsletter) |

---

## 3. Automatisations de Changement de Statut

### 3.1 Transitions Automatiques de Prospects

| Condition | Ancien statut | Nouveau statut |
|-----------|--------------|----------------|
| Appel resultat "rdv_pris" | Tout | rdv_pris |
| Appel resultat "interested" | Tout | interesse |
| Appel sans reponse | Tout | appele_sans_reponse |
| Appel messagerie | Tout | messagerie |
| RDV fait + devis signe | rdv_pris | converti_client |

### 3.2 Transitions Automatiques de Paiements

| Condition | Ancien statut | Nouveau statut |
|-----------|--------------|----------------|
| Devis signe | en_attente | paye |
| Devis expire + 0 jours | en_attente | en_retard |
| Devis expire + 30 jours | en_retard | impaye |

---

## 4. Raisons de Perte Structurees

Quand un prospect passe au statut "perdu", une raison est obligatoire :

| Code | Label | Categorie |
|------|-------|-----------|
| prix_trop_eleve | Prix trop eleve | Financier |
| pas_de_budget | Pas de budget | Financier |
| concurrent_choisi | Concurrent choisi | Competition |
| pas_de_besoin | Pas de besoin | Qualification |
| timing_mauvais | Timing mauvais | Timing |
| pas_de_reponse | Pas de reponse | Communication |
| mauvaise_experience | Mauvaise experience | Qualite |
| projet_reporte | Projet reporte | Timing |
| decision_interne | Decision interne | Organisation |
| autre | Autre | Autre |

### Analyse des Pertes

Le dashboard "Performance Commerciale" affiche :
- Repartition des raisons de perte en camembert
- Pourcentage par raison
- Evolution dans le temps (a implementer)
- Comparaison par commercial (fondateur uniquement)

---

## 5. Configuration Technique Recommandee

### Pour n8n / Make :

```
Webhook URL: https://[votre-supabase].supabase.co/functions/v1/automations
Headers:
  Authorization: Bearer [SUPABASE_ANON_KEY]
  Content-Type: application/json
```

### Pour les Crons (Supabase Edge Functions) :

| Cron | Frequence | Action |
|------|-----------|--------|
| check-overdue-reminders | Toutes les heures | Verifier les rappels en retard, envoyer notifications |
| check-hot-prospects | Toutes les 4 heures | Identifier les prospects chauds non relances |
| check-devis-expiry | Tous les jours a 8h | Verifier les devis expires, mettre a jour statuts |
| weekly-performance | Lundi a 8h | Envoyer recap hebdomadaire aux commerciaux |
| monthly-objectives | 1er du mois a 8h | Reset objectifs, envoyer bilan du mois precedent |
| long-term-followup | Tous les jours a 9h | Identifier clients a relancer (6m/1an/2ans) |

### Variables d'environnement necessaires :

```env
# Email (SMTP ou service)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@celexia.fr

# Slack (optionnel)
SLACK_WEBHOOK_URL=

# Stripe (optionnel)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Google Calendar (optionnel)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
```

---

## 6. Priorite d'Implementation

### Phase 1 - Critique (Semaine 1)
1. Relance automatique prospect interesse (email 24h)
2. Tache auto si pas rappele sous 48h
3. Alerte devis sans reponse (notification)

### Phase 2 - Important (Semaine 2)
4. Relance devis envoye (email 3j + 7j)
5. Tache post no-show
6. Notification conversion client

### Phase 3 - Nice-to-have (Semaine 3-4)
7. Sync Google Calendar
8. Notifications Slack
9. Relances long terme (6m/1an/2ans)

### Phase 4 - Avance (Mois 2)
10. Integration Stripe
11. Rapports automatiques hebdomadaires
12. Scoring predictif (ML)
