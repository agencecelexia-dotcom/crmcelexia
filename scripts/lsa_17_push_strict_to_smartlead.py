#!/usr/bin/env python3
"""
Étape 17 — Push les strict prospects qui ont déjà un email à Smartlead.

Pour chaque prospect de lsa-11-strict-final.csv qui a un email validé
dans lsa-09-final-livrable.csv, l'upload (upsert) à la campagne 3338241
avec les custom_fields corrects (societe_label = niche stricte).

Smartlead upsert : existing emails are updated, new ones added.
"""
from __future__ import annotations
import csv
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-11-strict-final.csv"
DELIVERED_CSV = ROOT / "data" / "lsa-09-final-livrable.csv"
ORIG_CSV = ROOT / "data" / "prospects-non-contactes.csv"

API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_ID = 3338241

SOCIETE_LABELS = {
    "paysagiste":   ("société de paysagisme", "sociétés de paysagisme"),
    "pisciniste":   ("société de piscine",    "sociétés de piscine"),
    "chauffagiste": ("société de CVC",        "sociétés de CVC"),
    "cloture":      ("société de clôture",    "sociétés de clôture"),
    "bardage":      ("société de bardage",    "sociétés de bardage"),
}


def load_api_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("SMARTLEAD_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit(1)


def normalize_phone(raw: str) -> str:
    if not raw:
        return ""
    d = re.sub(r"[^\d]", "", raw)
    if d.startswith("33") and len(d) == 11:
        return "0" + d[2:]
    if len(d) == 10 and d.startswith("0"):
        return d
    if len(d) == 9:
        return "0" + d
    return d


def title_case(s: str) -> str:
    if not s:
        return ""
    return " ".join("-".join(p.capitalize() for p in word.split("-")) for word in s.split()).strip()


def clean_nom(s: str) -> str:
    if not s:
        return ""
    return title_case(s.split("(")[0].strip())


def main() -> None:
    api_key = load_api_key()

    # 1. Charge strict (phone → row strict)
    strict_by_phone: dict[str, dict] = {}
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                strict_by_phone[ph] = r

    # 2. Charge delivered (phone → row avec email + dirigeant)
    delivered_by_phone: dict[str, dict] = {}
    with DELIVERED_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = normalize_phone(r.get("phone", ""))
            if ph and r.get("best_email"):
                delivered_by_phone[ph] = r

    # 3. Construit les leads à push
    leads = []
    for ph, s in strict_by_phone.items():
        d = delivered_by_phone.get(ph)
        if not d:
            continue
        niche = s["niche_strict"]
        singular, plural = SOCIETE_LABELS[niche]

        first = title_case((d.get("dirigeant_prenom", "") or "").split()[0]) if d.get("dirigeant_prenom") else ""
        opening = f"Bonjour {first}" if first and len(first) >= 2 else "Bonjour"

        # Clean company name (strip emojis + extra desc)
        company = s.get("company_name", "").strip()[:80]

        ville = s.get("city_matched") or d.get("ville") or "votre secteur"

        leads.append({
            "first_name": first or "",
            "last_name": clean_nom(d.get("dirigeant_nom", "")),
            "email": d["best_email"].strip().lower(),
            "company_name": company,
            "phone_number": d.get("phone", "") or s.get("phone", ""),
            "website": s.get("website", ""),
            "custom_fields": {
                "opening": opening,
                "ville": ville,
                "zone_label": "dans votre zone",
                "societe_label": singular,
                "societes_label": plural,
                "niche_strict": niche,
                "competitors_count_lsa": int(s.get("competitors_count_lsa") or 0),
                "google_rating": s.get("google_rating", ""),
                "confidence_score": s.get("confidence_score", ""),
                "reclassified_strict_at": "2026-05-18",
            },
        })

    print(f"→ {len(leads)} strict prospects avec email à push vers Smartlead")

    BATCH = 100
    total_added = 0
    total_already = 0
    total_fail = 0

    for i in range(0, len(leads), BATCH):
        batch = leads[i:i+BATCH]
        try:
            r = requests.post(
                f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
                params={"api_key": api_key},
                json={"lead_list": batch},
                timeout=30,
            )
            if r.status_code == 200:
                d = r.json() or {}
                added = d.get("upload_count", 0)
                already = d.get("already_added_to_campaign", 0)
                total_added += added
                total_already += already
                print(f"  batch {i//BATCH+1}/{(len(leads)+BATCH-1)//BATCH} : added={added}, already={already}")
            else:
                total_fail += len(batch)
                print(f"  batch {i//BATCH+1} : FAIL {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"  batch {i//BATCH+1} : exception {e}")
            total_fail += len(batch)
        time.sleep(0.4)

    print(f"\n=== PUSH DONE ===")
    print(f"Added (new)      : {total_added}")
    print(f"Already in camp. : {total_already}")
    print(f"Failed           : {total_fail}")
    print(f"\nDashboard: https://app.smartlead.ai/app/email-campaign/{CAMPAIGN_ID}/analytics")


if __name__ == "__main__":
    main()
