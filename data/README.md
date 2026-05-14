# data/ — Données privées Celexia

⚠️ **Ce dossier contient des données nominatives (prospects, clients).**
Le repo est privé : ne JAMAIS le passer en public sans avoir nettoyé ce dossier.

## Fichiers

### `prospects-non-contactes.csv`

Export des **4 543 prospects** en statut `nouveau` qui n'ont **jamais été appelés**
(aucune ligne dans la table `calls`).

Snapshot pris le 14/05/2026 depuis Supabase prod.

Colonnes : id, company_name, firstname, lastname, email, phone, phone_secondary,
website, google_maps_url, profession, niche, code_naf, forme_juridique, siret,
siren, address, code_postal, city, departement, zone, source, status,
date_creation_entreprise, prospect_created_at, notes.

Usage prévu : enrichissement (scraping emails via Scrapling, etc.) → re-import
des emails enrichis dans la DB.
