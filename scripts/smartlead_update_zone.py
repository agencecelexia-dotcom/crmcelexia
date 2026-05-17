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

# Séquence v8.5 : labels "société de X" par niche (custom field societe_label / societes_label)
# Corrections : paysagiste → "société de paysagisme", reformulation "à qui transmettre",
# "finir mon tour" (évite collision avec niche clôture).
SEQUENCE = [
    {
        "seq_number": 1,
        "seq_delay_details": {"delay_in_days": 0},
        "subject": "{{ville}}, vous prenez encore des clients ?",
        "email_body": (
            "{{opening}},<br><br>"
            "Je cherche UNE {{societe_label}} fiable {{zone_label}} à qui transmettre "
            "des particuliers en direct. Un seul partenaire par secteur, pas plus.<br><br>"
            "Avant d'aller voir ailleurs, je préfère tester celles déjà installées. "
            "{{company_name}} est dans ma sélection pour {{ville}}.<br><br>"
            "Deux questions simples :<br><br>"
            "1. Vous avez encore de la place pour de nouveaux chantiers ce trimestre ?<br>"
            "2. Vous répondez vite quand un particulier vous sollicite ?<br><br>"
            "Si c'est non sur l'un des deux, aucun souci, je passe au suivant. "
            "Si c'est oui, dites-le moi en une ligne.<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 2,
        "seq_delay_details": {"delay_in_days": 3},
        "subject": "{{ville}}, votre place reste ouverte ?",
        "email_body": (
            "{{opening}},<br><br>"
            "Petit rappel : je cherche une {{societe_label}} sur {{ville}}. "
            "Le principe est simple, un particulier de votre zone qui cherche une "
            "{{societe_label}} pour un projet vous appelle directement.<br><br>"
            "Je finalise mon choix ces prochains jours. {{company_name}} en fait toujours partie.<br><br>"
            "On peut en parler quelques minutes ?<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 3,
        "seq_delay_details": {"delay_in_days": 4},
        "subject": "{{ville}}, votre silence vaut un non ?",
        "email_body": (
            "{{opening}},<br><br>"
            "Pas de réponse de votre côté. Je préfère vous demander franchement, "
            "vaut-il mieux que je raye {{company_name}} de ma sélection {{zone_label}} "
            "et que je regarde une autre {{societe_label}} ?<br><br>"
            "Dites-moi.<br><br>"
            "Thomas"
        ),
    },
    {
        "seq_number": 4,
        "seq_delay_details": {"delay_in_days": 7},
        "subject": "dernière question, {{company_name}}",
        "email_body": (
            "{{opening}},<br><br>"
            "Avant de finir mon tour des {{societes_label}} à {{ville}}, "
            "une question simple, est-ce vous qui décidez de prendre de nouveaux chantiers "
            "chez {{company_name}}, ou je devrais parler à quelqu'un d'autre ?<br><br>"
            "Dites-moi.<br><br>"
            "Thomas"
        ),
    },
]

# Mapping niche → (singulier, pluriel) pour le custom_field societe_label
SOCIETE_LABELS_BY_NICHE = {
    "paysagiste":   ("société de paysagisme", "sociétés de paysagisme"),
    "pisciniste":   ("société de piscine",    "sociétés de piscine"),
    "chauffagiste": ("société de chauffage",  "sociétés de chauffage"),
    "cloture":      ("société de clôture",    "sociétés de clôture"),
    "bardage":      ("société de bardage",    "sociétés de bardage"),
}


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
            # Plus de skip si pas de prénom : on accepte tous les leads avec email
            # mais on calcule le {{opening}} avec fallback.
            opening = f"Bonjour {first}" if first and len(first) >= 2 else "Bonjour"
            o = orig.get(r["id"], {})
            leads.append({
                "first_name": first or "",
                "last_name": clean_nom(r.get("dirigeant_nom", "")),
                "email": r["best_email"].strip().lower(),
                "company_name": r.get("company_name", "").strip(),
                "phone_number": o.get("phone", ""),
                "website": r.get("website", ""),
                "custom_fields": {
                    "opening": opening,  # "Bonjour Romain" OU "Bonjour" — utilisé comme "{{opening}}," dans la séquence
                    "profession": normalize_profession(o.get("profession", "")),
                    "zone_label": r.get("zone_label") or "dans votre zone",
                    "ville": r.get("ville_enrichie") or "votre secteur",
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
