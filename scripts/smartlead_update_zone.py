#!/usr/bin/env python3
"""
Met à jour la campagne Smartlead existante (id 3338241) :
1. Réécrit les 4 séquences pour utiliser {{zone_label}}
2. Ré-importe les leads avec le custom field zone_label

Input : data/prospects-dirigeants-villes.csv (avec colonne zone_label)
"""
from __future__ import annotations
import csv
import json
import os
import sys
import time
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEADS_CSV = ROOT / "data" / "prospects-dirigeants-villes.csv"
ORIG_CSV = ROOT / "data" / "prospects-non-contactes.csv"

API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_ID = 3338241

# Nouvelle séquence avec {{zone_label}}
SEQUENCE = [
    {
        "seq_number": 1,
        "seq_delay_details": {"delay_in_days": 0},
        "subject": "une demande {{profession}} {{ville}}",
        "email_body": (
            "Bonjour {{first_name}},<br><br>"
            "J'ai une dame qui cherche un {{profession}} {{zone_label}} pour faire "
            "signer un devis chez elle.<br><br>"
            "Vous prenez encore des nouveaux clients ce mois-ci, ou vous êtes complet ?<br><br>"
            "Si vous êtes complet, dites-le moi, je ne reviendrai pas vous déranger. "
            "Sinon je vous explique en 2 lignes.<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 2,
        "seq_delay_details": {"delay_in_days": 3},
        "subject": "vous êtes complet en ce moment ?",
        "email_body": (
            "Bonjour {{first_name}},<br><br>"
            "Je ne sais pas si mon mail est passé.<br><br>"
            "2-3 chantiers {{profession}} de plus {{zone_label}} ce mois-ci — "
            "ça vous parle, ou c'est mort pour vous en ce moment ?<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 3,
        "seq_delay_details": {"delay_in_days": 4},
        "subject": "je vous recontacte plus tard ?",
        "email_body": (
            "Bonjour {{first_name}},<br><br>"
            "Pas de retour, j'arrête pour ce mois-ci.<br><br>"
            "Je peux vous remettre un mot quand j'aurai un dossier {{profession}} "
            "concret pour {{ville}} ?<br><br>"
            "Un \"ok\" suffit.<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 4,
        "seq_delay_details": {"delay_in_days": 7},
        "subject": "bonne personne chez {{company_name}} ?",
        "email_body": (
            "Bonjour {{first_name}},<br><br>"
            "Dernier mail de ma part.<br><br>"
            "Si ce n'est pas vous qui regardez les nouveaux chantiers chez {{company_name}}, "
            "vous sauriez à qui je peux écrire ?<br><br>"
            "Thomas"
        ),
    },
]


def load_api_key() -> str:
    env_path = ROOT / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("SMARTLEAD_API_KEY="):
            return line.split("=", 1)[1].strip()
    print("ERREUR : SMARTLEAD_API_KEY introuvable", file=sys.stderr)
    sys.exit(1)


def title_case(s: str) -> str:
    if not s:
        return ""
    words = []
    for word in s.split():
        words.append("-".join(p.capitalize() for p in word.split("-")))
    return " ".join(words).strip()


def clean_nom(s: str) -> str:
    if not s:
        return ""
    s = s.split("(")[0].strip()
    return title_case(s)


def normalize_profession(prof: str) -> str:
    if not prof:
        return "BTP"
    return prof.strip().lower().capitalize()


def load_leads() -> list[dict]:
    with ORIG_CSV.open(encoding="utf-8") as f:
        orig = {r["id"]: r for r in csv.DictReader(f)}
    leads = []
    with LEADS_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not r.get("dirigeant_full") or not r.get("best_email"):
                continue
            if r.get("status") not in ("ok_insee", "ok_mentions"):
                continue
            first = title_case(r.get("dirigeant_prenom", ""))
            if not first or len(first) < 2:
                continue
            o = orig.get(r["id"], {})
            leads.append({
                "first_name": first,
                "last_name": clean_nom(r.get("dirigeant_nom", "")),
                "email": r["best_email"].strip().lower(),
                "company_name": r.get("company_name", "").strip(),
                "phone_number": o.get("phone", ""),
                "website": r.get("website", ""),
                "custom_fields": {
                    "profession": normalize_profession(o.get("profession", "")),
                    "zone_label": r.get("zone_label") or "dans votre zone",
                    "ville": r.get("ville_enrichie", ""),
                    "departement": r.get("departement", ""),
                    "dirigeant_source": r.get("dirigeant_source", ""),
                    "code_naf": r.get("code_naf", ""),
                },
            })
    return leads


def main() -> None:
    api_key = load_api_key()

    # 1. Met à jour les séquences (POST remplace)
    print("→ Mise à jour séquences avec {{zone_label}}...")
    r = requests.post(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/sequences",
        params={"api_key": api_key},
        json={"sequences": SEQUENCE},
        timeout=30,
    )
    print(f"  Status {r.status_code} | {r.text[:200]}")
    if r.status_code >= 400:
        sys.exit(1)

    # 2. Ré-import des leads (upsert par email)
    leads = load_leads()
    print(f"\n→ Ré-import {len(leads)} leads avec zone_label (mode upsert)...")
    BATCH = 100
    total = 0
    for i in range(0, len(leads), BATCH):
        batch = leads[i:i+BATCH]
        r = requests.post(
            f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
            params={"api_key": api_key},
            json={"lead_list": batch},
            timeout=30,
        )
        data = r.json() if r.status_code == 200 else {}
        upload = data.get("upload_count", 0)
        already = data.get("already_added_to_campaign", 0)
        total += upload + already
        print(f"  batch {i//BATCH+1}/{(len(leads)+BATCH-1)//BATCH} : added={upload}, already_exists={already}")
        time.sleep(0.4)

    # 3. Vérifie qu'un lead a bien zone_label
    print("\n→ Vérification : sample 1er lead après update...")
    r = requests.get(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
        params={"api_key": api_key, "offset": 0, "limit": 3},
        timeout=15,
    )
    if r.status_code == 200:
        data = r.json()
        for ld in data.get("data", [])[:2]:
            lead = ld.get("lead", {})
            cf = lead.get("custom_fields", {})
            print(f"  • {lead.get('first_name')} {lead.get('last_name')} ({lead.get('email')})")
            print(f"      zone_label    = {cf.get('zone_label','?')!r}")
            print(f"      ville         = {cf.get('ville','?')!r}")
            print(f"      profession    = {cf.get('profession','?')!r}")

    # 4. Vérifie les sequences mises à jour
    print("\n→ Vérification : nouvelles séquences...")
    r = requests.get(f"{API_BASE}/campaigns/{CAMPAIGN_ID}/sequences", params={"api_key": api_key}, timeout=15)
    for s in r.json():
        print(f"  seq #{s.get('seq_number')} (J+{s.get('seq_delay_details',{}).get('delayInDays')}) : {s.get('subject','?')[:60]}")

    print("\n=== UPDATE DONE ===")
    print(f"Dashboard : https://app.smartlead.ai/app/email-campaign/{CAMPAIGN_ID}/analytics")


if __name__ == "__main__":
    main()
