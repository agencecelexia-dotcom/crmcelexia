# CRM Celexia - Instructions Claude

## Stack
- React 18 + TypeScript strict (noUnusedLocals, noUnusedParameters)
- Vite + TailwindCSS + shadcn/ui
- Supabase (PostgreSQL + Auth + Realtime)
- React Query (TanStack Query v5) pour le cache
- React Router v6

## Regles de base

### TypeScript
- `npx tsc --noEmit` doit passer a zero erreur avant tout commit
- Pas d'import inutilise (erreur de build Vercel)
- Pas de `any` sauf cas force avec commentaire

### Commits
- `npx tsc --noEmit` avant chaque commit
- Un commit par groupe logique (schema, types, services, UI)
- Format : `feat/fix/refactor: description courte`

## Coherence base de donnees - REGLES OBLIGATOIRES

Avant toute modification touchant la DB ou les statuts :

### 1. Flux commercial cardinal
```
Prospect (prospection) --> Opportunity (vente) --> Client (livraison)
```
- `prospect.status` = statut de PROSPECTION uniquement (appels, relances)
- `opportunity.status` = pipeline de VENTE (site a envoyer, rdv, close...)
- Ne jamais utiliser les statuts prospect pour qualifier une etape de vente

### 2. Mapping statuts bidirectionnel (trigger 00028)
```
prospect.status       <-->  opportunity.status
site_en_attente       <-->  site_a_envoyer
site_envoye           <-->  site_envoye
rdv_pris              <-->  rdv
converti_client       <-->  close
perdu                 <-->  perdu
mort (opp)             -->  perdu (prospect)
```
Toute modification d'un enum DOIT mettre a jour ce mapping ET les triggers DB.

### 3. Triggers bidirectionnels
- TOUJOURS inclure le guard `pg_trigger_depth() > 1` pour eviter les boucles infinies
- Les deux triggers doivent rester coherents entre eux

### 4. Enums centralises
- Tous les enums/labels/couleurs doivent etre dans `src/types/enums.ts`
- Pas de const locaux dans les composants pour des valeurs de domaine metier
- Exemple : `DEATH_REASONS` doit etre dans enums.ts, pas dans kanban-board.tsx

### 5. React Query - Invalidations
Apres chaque mutation, invalider TOUTES les query keys impactees :
- Modifier une opportunity -> invalider `['opportunities']`, `['pipeline']`, `['prospects']`, `['prospect']`
- Modifier un prospect -> invalider `['prospects']`, `['prospect']`
- Creer une opportunity -> invalider `['opportunities']`, `['pipeline']`, `['prospects']`

### 6. Schema DB
- Pas de duplication de donnees entre tables sans raison forte
- Les FK doivent avoir des index correspondants
- `deleted_at IS NULL` sur toutes les requetes sur tables avec soft delete
- Pas de JSONB pour des donnees structurees et frequemment requetees/filtrees

## Structure du projet

```
src/
  features/
    [feature]/
      pages/       - composants page (route entry points)
      components/  - composants specifiques a la feature
      hooks/       - hooks React Query (useXxx)
      services/    - appels Supabase directs
  types/
    enums.ts       - TOUS les enums, labels, couleurs, mappings
    index.ts       - TOUS les types TypeScript
  components/
    ui/            - composants shadcn/ui (ne pas modifier)
    shared/        - composants partages entre features
  lib/             - utilitaires, constantes, client supabase
supabase/
  migrations/      - migrations numerotees sequentiellement (00001, 00002...)
```

## Audit CRM

Pour un audit complet de coherence DB / features / flux commerciaux,
utiliser le skill `/crm-audit` qui :
1. Mappe toutes les features et interdependances
2. Analyse la coherence DB et les flux commerciaux
3. Propose des ameliorations (carte avant/apres)
4. Si valide, implemente tout (migrations + code)

## Problemes connus (non encore corriges)

- `DEATH_REASONS` defini localement dans kanban-board.tsx (devrait etre dans enums.ts)
- Dialog Perdu/Mort duplique entre KanbanBoard et ProspectDetailPage
- Duplication champs contact entre tables prospects et clients (delib : sync trigger 00080+)
- Conversion prospect -> client non automatisee par trigger (manuelle)
- recall_date stockee dans opportunities mais ne cree pas de reminder automatique
- `event_log` existe (active, 3500+ lignes audit) mais aucun front ne l'expose

## Tables / coexistences à comprendre

- `devis` (legacy agence — factures Celexia → artisan, analytics CA admin) vs
  `quotes` + `quote_items` (moderne portail — devis artisan → client final).
  Sémantiques distinctes, garder les deux. Voir audit DB 13/05/2026.
- `portal_lead_events` (timeline UI portail artisan) vs `event_log`
  (audit global cross-feature). Sémantiques distinctes.
- `email_schedule` (queue d'envoi avec status pending/sent/failed) vs
  `email_logs` (trace post-envoi pour debug). Pattern queue+log standard.
- Système commission UNIFIÉ depuis migration 00100 : la table legacy
  `commissions` a été supprimée. Source unique = `portal_leads.commission_*`
  alimentée par le workflow portail artisan → admin (migration 00096).
