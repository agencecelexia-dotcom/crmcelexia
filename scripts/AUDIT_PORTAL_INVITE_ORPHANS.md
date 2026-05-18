# Audit — comptes auth orphelins (portal-invite "user already registered")

## Le bug

L'erreur "A user with this email address has already been registered"
arrivait quand `supabase.auth.admin.createUser` détectait que l'email
existait déjà dans `auth.users`. Causes possibles :
- 1ère tentative qui a créé le auth user mais a planté avant `clients.user_id`
- Email réutilisé entre deux fiches clients différentes
- Compte créé manuellement dans Supabase Studio

L'edge function `portal-invite` a été patchée pour gérer ce cas :
- Détecte le message d'erreur
- Cherche le user existant par email
- Vérifie qu'il n'est pas déjà lié à un AUTRE client (sinon → erreur 409 explicite)
- Reset son password et le lie à la fiche client en cours

## Diagnostic en SQL (Supabase Studio)

```sql
-- 1. Cherche tous les auth.users orphelins (pas liés à un client)
SELECT
  u.id AS auth_user_id,
  u.email,
  u.created_at,
  u.raw_user_meta_data->>'role' AS role,
  u.raw_user_meta_data->>'full_name' AS full_name,
  u.raw_user_meta_data->>'client_id' AS metadata_client_id,
  p.id AS profile_id,
  p.role AS profile_role,
  c.id AS linked_client_id,
  c.company_name AS linked_client_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN clients c ON c.user_id = u.id
WHERE u.raw_user_meta_data->>'role' = 'artisan'
  OR u.raw_user_meta_data->>'client_id' IS NOT NULL
ORDER BY u.created_at DESC;

-- 2. Cherche Vincent Turlure (ou n'importe quel artisan) par nom
SELECT id, company_name, contact_firstname, contact_name, contact_email,
       user_id, portal_enabled, portal_activated_at
FROM clients
WHERE (contact_name ILIKE '%turlure%' OR contact_firstname ILIKE '%vincent%')
   OR (company_name ILIKE '%turlure%' OR company_name ILIKE '%vincent%');

-- 3. Si l'email est connu, vérifie sa présence dans auth.users
SELECT id, email, created_at, raw_user_meta_data
FROM auth.users
WHERE email = 'email-de-vincent@exemple.com';
```

## Fix manuel pour Vincent Turlure (avant déploiement)

Si le déploiement de la fonction tarde, fix manuel SQL :

```sql
-- A. Trouve le auth user existant
SELECT id FROM auth.users WHERE email = 'EMAIL_DE_VINCENT';

-- B. Lie-le à la fiche client (remplace les UUIDs)
UPDATE clients
SET user_id = 'AUTH_USER_UUID',
    portal_enabled = true,
    portal_activated_at = NOW(),
    contact_email = 'EMAIL_DE_VINCENT'
WHERE id = 'CLIENT_UUID_VINCENT';

-- C. Crée le profile si absent
INSERT INTO profiles (id, email, full_name, role)
VALUES ('AUTH_USER_UUID', 'EMAIL_DE_VINCENT', 'Vincent Turlure', 'artisan')
ON CONFLICT (id) DO UPDATE
  SET role = 'artisan', email = EXCLUDED.email;

-- D. Reset le password via Supabase Studio :
--    Auth > Users > [Vincent] > ... > Send password reset
--    OU générer un nouveau password en relançant l'invitation maintenant
--    que la fonction est patchée.
```

## Déploiement de la correction

```bash
supabase functions deploy portal-invite --project-ref zsbrhftzjqqqbwbboyqe
```

Après déploiement, **réouvre la fiche client de Vincent Turlure et clique
à nouveau sur "Inviter sur le portail"** avec le même email. La fonction
détectera l'orphelin, le récupérera, et te retournera un nouveau mot de
passe avec une bannière jaune "Compte existant récupéré".
