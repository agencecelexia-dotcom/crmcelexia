#!/usr/bin/env python3
"""
Setup automatique d'une campagne Smartlead :
1. Crée la campagne
2. Configure le schedule (heures ouvrées Paris, lun-ven)
3. Assigne les mailboxes warmées
4. Crée la séquence (4 emails avec relances "Re:")
5. Importe les 726 leads avec custom fields
6. Laisse en status PAUSED — l'utilisateur clique Start dans le dashboard

Variables d'env (lues depuis .env) :
    SMARTLEAD_API_KEY

Usage :
    python3 scripts/smartlead_setup.py                # setup complet
    python3 scripts/smartlead_setup.py --dry-run      # affiche le payload sans appeler l'API
    python3 scripts/smartlead_setup.py --limit 20     # n'importe que 20 leads (test)
"""
from __future__ import annotations
import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
LEADS_CSV = ROOT / "data" / "prospects-dirigeants-clean.csv"
ORIG_CSV = ROOT / "data" / "prospects-non-contactes.csv"

API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_NAME = "Celexia — Apport d'affaires BTP (V1)"
DAILY_PER_MAILBOX = 30  # cold start safe (warmup actif maintient à 50, on cape côté envoi cold)
MIN_TIME_BTW_EMAILS = 10  # minutes entre 2 envois depuis la même mailbox

# Subject + body des 4 emails — variables Smartlead {{first_name}} etc.
SEQUENCE = [
    {
        "seq_number": 1,
        "seq_delay_details": {"delay_in_days": 0},
        "subject": "{{first_name}}, vous prenez encore des chantiers ?",
        "email_body": (
            "Bonjour {{first_name}},<br><br>"
            "J'ai 3 demandes {{profession}} à placer dans votre zone ce mois-ci, "
            "et je n'ai plus la bande passante pour traiter ça en direct.<br><br>"
            "Avant de chercher ailleurs, je tente {{company_name}} — j'ai regardé "
            "vos retours, ça colle.<br><br>"
            "Commission classique d'apporteur, paiement à la signature du devis. "
            "Zéro risque si pas de match.<br><br>"
            "Vous prenez encore ?<br><br>"
            "Thomas<br>Celexia"
        ),
    },
    {
        "seq_number": 2,
        "seq_delay_details": {"delay_in_days": 3},
        "subject": "Re: {{first_name}}, vous prenez encore des chantiers ?",
        "email_body": (
            "{{first_name}},<br><br>"
            "Le 1er dossier sort fin de semaine, après je le bascule sur quelqu'un d'autre.<br><br>"
            "Yes / no, je m'aligne ?<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 3,
        "seq_delay_details": {"delay_in_days": 4},
        "subject": "Re: {{first_name}}, vous prenez encore des chantiers ?",
        "email_body": (
            "{{first_name}},<br><br>"
            "Pas de souci si c'est pas le moment.<br><br>"
            "Si jamais vous voulez qu'on reste en contact pour plus tard, dites-le "
            "en 1 mot — je vous re-contacte quand un dossier {{profession}} repasse "
            "dans votre zone.<br><br>"
            "Sinon je n'insiste pas.<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 4,
        "seq_delay_details": {"delay_in_days": 7},
        "subject": "Re: {{first_name}}, vous prenez encore des chantiers ?",
        "email_body": (
            "{{first_name}},<br><br>"
            "Dernière relance promis.<br><br>"
            "Question simple : qui chez {{company_name}} prend les appels d'apporteurs "
            "en ce moment ?<br><br>"
            "Si c'est pas vous, indiquez-moi le bon contact — je n'embête plus la "
            "mauvaise personne.<br><br>"
            "Thomas"
        ),
    },
]


def load_env() -> str:
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("SMARTLEAD_API_KEY="):
                return line.split("=", 1)[1].strip()
    if "SMARTLEAD_API_KEY" in os.environ:
        return os.environ["SMARTLEAD_API_KEY"]
    print("ERREUR : SMARTLEAD_API_KEY introuvable dans .env ou env vars", file=sys.stderr)
    sys.exit(1)


def title_case(s: str) -> str:
    """ROMAIN → Romain. Gère espaces (JORDAN GLENN → Jordan Glenn) et tirets (JEAN-MARC → Jean-Marc)."""
    if not s:
        return ""
    # Split sur espace puis sur tiret
    words = []
    for word in s.split():
        words.append("-".join(part.capitalize() for part in word.split("-")))
    return " ".join(words).strip()


def clean_nom(s: str) -> str:
    """'BLONDEL (BLONDEL)' → 'Blondel'. 'LE TALOUR' → 'Le Talour'."""
    if not s:
        return ""
    # Vire les parenthèses + leur contenu
    s = s.split("(")[0].strip()
    return title_case(s)


def normalize_profession(prof: str) -> str:
    """Met au minimuscule + nettoie. 'Paysagiste' reste, 'Plombier' reste."""
    if not prof:
        return "BTP"  # fallback générique
    return prof.strip().lower().capitalize()


def load_leads(limit: int = 0) -> list[dict]:
    """Charge les 726 leads enrichis + joint avec CSV original pour profession."""
    # Index original pour profession
    orig_index = {}
    with ORIG_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            orig_index[r["id"]] = r

    leads: list[dict] = []
    skipped = {"no_email": 0, "no_dirigeant": 0, "bad_status": 0, "no_first": 0,
                "no_city": 0, "no_company": 0, "dup_first_last": 0}
    with LEADS_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            # Ne garder que ceux avec dirigeant + email
            if not r.get("best_email"):
                skipped["no_email"] += 1
                continue
            if not r.get("dirigeant_full"):
                skipped["no_dirigeant"] += 1
                continue
            if r.get("status") not in ("ok_insee", "ok_mentions"):
                skipped["bad_status"] += 1
                continue
            orig = orig_index.get(r["id"], {})

            first_name = title_case(r.get("dirigeant_prenom", ""))
            last_name = clean_nom(r.get("dirigeant_nom", ""))
            profession = normalize_profession(orig.get("profession", ""))
            company = (r.get("company_name") or "").strip()
            ville = (r.get("ville_insee") or orig.get("city") or "").strip()

            # GARDE-FOUS qualité — tout lead poussé DOIT avoir :
            #   ville (sinon subject "votre secteur..." spammy)
            #   company_name (template utilise {{company_name}})
            # Sinon on skip — pas de fallback bidon.
            if not first_name or len(first_name) < 2:
                skipped["no_first"] += 1
                continue
            if not ville:
                skipped["no_city"] += 1
                continue
            if not company:
                skipped["no_company"] += 1
                continue
            # Dedupe : si first == last, garde juste first (évite "Pierre Pierre")
            if first_name and last_name and first_name.lower() == last_name.lower():
                last_name = ""
                skipped["dup_first_last"] += 1

            opening = f"Bonjour {first_name}"

            leads.append({
                "first_name": first_name,
                "last_name": last_name,
                "email": r["best_email"].strip().lower(),
                "company_name": company,
                "phone_number": orig.get("phone", ""),
                "website": r.get("website", ""),
                "custom_fields": {
                    "profession": profession,
                    "dirigeant_source": r.get("dirigeant_source", ""),
                    "code_naf": r.get("code_naf", ""),
                    "ville": ville,
                    "zone_label": f"à {ville}",
                    "opening": opening,
                },
            })
            if limit and len(leads) >= limit:
                break
    print(f"Skipped (qualité insuffisante) : {skipped}")
    return leads


def api_call(method: str, path: str, api_key: str, json_data: dict | None = None, params: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    p = {"api_key": api_key}
    if params:
        p.update(params)
    r = requests.request(method, url, params=p, json=json_data, timeout=30)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    if r.status_code >= 400:
        print(f"\n⚠ API ERROR {method} {path} → {r.status_code}")
        print(f"  Body: {json.dumps(body, ensure_ascii=False)[:400]}")
        if r.status_code == 401:
            sys.exit(1)
    return body


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Affiche le payload sans appeler l'API")
    parser.add_argument("--limit", type=int, default=0, help="Limite le nb de leads importés (test)")
    args = parser.parse_args()

    api_key = load_env()

    # === 1. Charger les leads ===
    leads = load_leads(args.limit)
    print(f"=== Smartlead Setup ===")
    print(f"Leads chargés : {len(leads)}")
    print(f"Exemples :")
    for L in leads[:3]:
        print(f"  • {L['first_name']} {L['last_name']:15s} | {L['email']:35s} | {L['company_name'][:30]:30s} | {L['custom_fields']['profession']}")
    print()

    if args.dry_run:
        print("Mode dry-run : pas d'appel API. Premier lead complet :")
        print(json.dumps(leads[0], indent=2, ensure_ascii=False))
        return

    # === 2. Liste les mailboxes ===
    mailboxes = api_call("GET", "/email-accounts/", api_key, params={"offset": 0, "limit": 100})
    mailbox_ids = [m["id"] for m in mailboxes if m.get("warmup_details", {}).get("status") == "ACTIVE"]
    print(f"Mailboxes warmées trouvées : {len(mailbox_ids)} → {mailbox_ids}")
    if not mailbox_ids:
        print("ERREUR : aucune mailbox warmée disponible", file=sys.stderr)
        sys.exit(1)
    print()

    # === 3. Création campagne ===
    print("→ Création campagne...")
    resp = api_call("POST", "/campaigns/create", api_key, json_data={"name": CAMPAIGN_NAME, "client_id": None})
    campaign_id = resp.get("id") or resp.get("campaign_id") or resp.get("data", {}).get("id")
    if not campaign_id:
        print(f"ERREUR : pas d'id retourné. Body: {resp}")
        sys.exit(1)
    print(f"  ✓ Campagne créée : id={campaign_id}")
    print()

    # === 4. Schedule (heures ouvrées Paris) ===
    print("→ Configuration schedule...")
    schedule = {
        "timezone": "Europe/Paris",
        "days_of_the_week": [1, 2, 3, 4, 5],  # lun-ven
        "start_hour": "09:00",
        "end_hour": "17:30",
        "min_time_btw_emails": MIN_TIME_BTW_EMAILS,
        "max_new_leads_per_day": DAILY_PER_MAILBOX * len(mailbox_ids),
    }
    api_call("POST", f"/campaigns/{campaign_id}/schedule", api_key, json_data=schedule)
    print(f"  ✓ Schedule : lun-ven 9h-17h30 Paris, max {schedule['max_new_leads_per_day']}/jour")
    print()

    # === 5. Assigner mailboxes ===
    print("→ Assignation mailboxes...")
    api_call("POST", f"/campaigns/{campaign_id}/email-accounts", api_key, json_data={"email_account_ids": mailbox_ids})
    print(f"  ✓ {len(mailbox_ids)} mailboxes assignées")
    print()

    # === 6. Séquence email ===
    print("→ Création séquence (4 emails)...")
    api_call("POST", f"/campaigns/{campaign_id}/sequences", api_key, json_data={"sequences": SEQUENCE})
    print(f"  ✓ Séquence : E1 (J+0) → Re: (J+3) → Re: (J+7) → Re: (J+14)")
    print()

    # === 7. Import leads en batch ===
    print(f"→ Import {len(leads)} leads (batchs de 100)...")
    BATCH = 100
    total_imported = 0
    duplicates = 0
    invalid = 0
    for i in range(0, len(leads), BATCH):
        batch = leads[i:i+BATCH]
        resp = api_call("POST", f"/campaigns/{campaign_id}/leads", api_key, json_data={"lead_list": batch})
        upload_count = resp.get("upload_count", 0)
        dups = resp.get("duplicate_count", 0)
        inv = resp.get("invalid_email_count", 0)
        total_imported += upload_count
        duplicates += dups
        invalid += inv
        print(f"  batch {i//BATCH+1}/{(len(leads)+BATCH-1)//BATCH} : +{upload_count} (dups={dups}, invalid={inv})")
        time.sleep(0.5)
    print(f"  ✓ Total importés : {total_imported} (dups: {duplicates}, invalides: {invalid})")
    print()

    # === 8. Status final : PAUSED ===
    # La campagne est créée en PAUSED par défaut.
    print("=== SETUP TERMINÉ ===")
    print(f"Campagne ID    : {campaign_id}")
    print(f"Status         : PAUSED (tu cliques 'Start' dans le dashboard)")
    print(f"URL dashboard  : https://app.smartlead.ai/app/email-campaign/{campaign_id}/analytics")
    print()
    print("Vérifications recommandées avant de lancer :")
    print("  1. Prévisualise les emails dans Smartlead (variables bien remplacées)")
    print("  2. Vérifie les tags SPF/DKIM/DMARC sur tes 2 domaines")
    print("  3. Lance d'abord sur 20-30 leads en test avant d'unfreeze tout le monde")


if __name__ == "__main__":
    main()
