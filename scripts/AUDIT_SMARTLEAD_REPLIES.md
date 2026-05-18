# Audit — leads Smartlead qui ont répondu mais ne sont pas pausés

## Le bug

Quand un prospect répondait à un email Smartlead, le webhook marquait
`custom_fields.smartlead_status = 'replied'` en DB **mais ne pausait pas
le lead côté Smartlead**. Conséquence : il continuait à recevoir les
relances suivantes de la séquence tant que personne n'avait basculé
manuellement son `prospect.status` vers un statut post-conversation.

Le webhook est désormais corrigé pour auto-pauser sur `EMAIL_REPLY` et
`EMAIL_UNSUBSCRIBE`. Reste à nettoyer les cas historiques.

## Vérif rapide en SQL (Supabase Studio)

```sql
-- Liste des prospects "à risque" : ont répondu mais ne sont pas pausés
SELECT
  p.id,
  p.company_name,
  p.contact_firstname || ' ' || p.contact_name AS nom,
  p.contact_email,
  p.phone,
  p.status AS prospect_status,
  p.custom_fields->>'smartlead_status' AS smartlead_status,
  (p.custom_fields->>'smartlead_reply_count')::int AS reply_count,
  p.custom_fields->>'smartlead_last_reply_at' AS last_reply_at,
  p.custom_fields->>'smartlead_paused_at' AS paused_at
FROM prospects p
WHERE p.deleted_at IS NULL
  AND (
    p.custom_fields->>'smartlead_status' IN ('replied', 'unsubscribed')
    OR (p.custom_fields->>'smartlead_reply_count')::int > 0
  )
  AND p.custom_fields->>'smartlead_paused_at' IS NULL
ORDER BY p.custom_fields->>'smartlead_last_reply_at' DESC NULLS LAST;
```

## Cleanup automatisé (recommandé)

```bash
# Dry-run d'abord (n'écrit rien, montre ce qui serait pausé)
python3 scripts/safety_pause_replied_leads.py --dry-run

# Si OK, lancer pour de vrai
python3 scripts/safety_pause_replied_leads.py
```

Le script :
1. Scanne **toutes** les campagnes Smartlead (pas seulement 3338241)
2. Trouve tous les prospects DB avec `replied`/`unsubscribed` non pausés
3. Pause chaque lead dans la bonne campagne via l'API Smartlead
4. Met à jour `custom_fields.smartlead_paused_at` en DB
5. Log complet dans `data/safety-pause-log.json`

## Déploiement de la correction webhook

Le code du webhook `supabase/functions/smartlead-webhook/index.ts` a été
mis à jour pour auto-pauser sur reply. Pour activer en production :

```bash
# Via Supabase CLI
supabase functions deploy smartlead-webhook --project-ref zsbrhftzjqqqbwbboyqe

# Ou via Supabase Studio :
# Edge Functions > smartlead-webhook > Deploy
```

À vérifier : la secret `SMARTLEAD_API_KEY` doit être set dans les
secrets de l'edge function (déjà le cas pour pause-smartlead-lead).
