#!/usr/bin/env python3
"""
Étape 12 — Réconcilier Smartlead avec la classification stricte.

Pour chaque lead actuel de la campagne Smartlead 3338241 :
  - Match par phone normalisé contre lsa-11-strict-final.csv
  - Si MATCH avec même niche → rien
  - Si MATCH avec niche différente → UPDATE custom_fields (societe_label, niche)
  - Si PAS de match → false positive → PAUSE dans Smartlead

En parallèle, met à jour la DB CRM Supabase pour refléter la niche stricte.
"""
from __future__ import annotations
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-11-strict-final.csv"
API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_ID = 3338241

SOCIETE_LABELS = {
    "paysagiste":   ("société de paysagisme", "sociétés de paysagisme"),
    "pisciniste":   ("société de piscine",    "sociétés de piscine"),
    "chauffagiste": ("société de CVC",        "sociétés de CVC"),
    "cloture":      ("société de clôture",    "sociétés de clôture"),
    "bardage":      ("société de bardage",    "sociétés de bardage"),
}


def load_env() -> dict:
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMARTLEAD_API_KEY"):
            out[k] = v.strip()
    return out


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


def fetch_all_smartlead_leads(api_key: str) -> list[dict]:
    """Tous les leads de la campagne 3338241."""
    leads = []
    offset = 0
    while True:
        r = requests.get(
            f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
            params={"api_key": api_key, "offset": offset, "limit": 100},
            timeout=20,
        )
        if r.status_code != 200:
            print(f"  ⚠ offset {offset}: {r.status_code}")
            break
        batch = (r.json() or {}).get("data", [])
        if not batch:
            break
        leads.extend(batch)
        if len(batch) < 100:
            break
        offset += 100
        time.sleep(0.2)
    return leads


def load_strict_index() -> dict[str, dict]:
    """Index {phone_norm: row} depuis lsa-11-strict-final.csv."""
    out = {}
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                out[ph] = r
    return out


def update_smartlead_lead(api_key: str, lead_id: int, custom_fields: dict) -> bool:
    """Update les custom_fields d'un lead via /leads/{lead_id}."""
    r = requests.post(
        f"{API_BASE}/leads/{lead_id}",
        params={"api_key": api_key},
        json={"custom_fields": custom_fields},
        timeout=15,
    )
    return r.status_code == 200


def pause_smartlead_lead(api_key: str, lead_id: int) -> bool:
    """Pause un lead."""
    r = requests.post(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads/{lead_id}/pause",
        params={"api_key": api_key},
        json={},
        timeout=15,
    )
    return r.status_code == 200


def main() -> None:
    env = load_env()
    api_key = env["SMARTLEAD_API_KEY"]
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    print("→ Chargement classification stricte...")
    strict_by_phone = load_strict_index()
    print(f"  {len(strict_by_phone)} prospects strictement validés (phones uniques)")

    print(f"\n→ Chargement leads actuels Smartlead campagne {CAMPAIGN_ID}...")
    sl_leads = fetch_all_smartlead_leads(api_key)
    print(f"  {len(sl_leads)} leads actuellement dans la campagne")

    to_update: list[tuple[int, dict, str]] = []  # (lead_id, new_cf, reason)
    to_pause: list[tuple[int, str, str]] = []    # (lead_id, email, reason)
    matched_ok = 0
    no_phone_count = 0

    for ld in sl_leads:
        lead = ld.get("lead", {}) or {}
        lead_id = lead.get("id")
        email = lead.get("email", "")
        ph = normalize_phone(lead.get("phone_number") or "")
        if not ph:
            no_phone_count += 1
            continue

        strict = strict_by_phone.get(ph)
        if not strict:
            # False positive : pas dans la classification stricte
            to_pause.append((lead_id, email, "not_in_strict_classification"))
            continue

        # Match : vérifier si niche correcte
        new_niche = strict["niche_strict"]
        old_cf = lead.get("custom_fields") or {}
        old_societe = old_cf.get("societe_label", "")
        new_singular, new_plural = SOCIETE_LABELS[new_niche]

        if old_societe == new_singular:
            matched_ok += 1
            continue

        # Reclassification : update custom_fields
        new_cf = {
            **old_cf,
            "societe_label": new_singular,
            "societes_label": new_plural,
            "niche_strict": new_niche,
            "reclassified_at": "2026-05-18",
        }
        to_update.append((lead_id, new_cf, f"niche_change_to_{new_niche}"))

    print(f"\n=== AUDIT SMARTLEAD ===")
    print(f"Match OK (niche correcte)       : {matched_ok}")
    print(f"À reclassifier (niche change)   : {len(to_update)}")
    print(f"À pauser (false positives)      : {len(to_pause)}")
    print(f"Sans phone (skip)               : {no_phone_count}")

    # Détail des reclassifications
    from collections import Counter
    reasons = Counter(r[2] for r in to_update)
    print("\nReclassifications par niche cible :")
    for reason, count in reasons.most_common():
        print(f"  {reason:35s} : {count}")

    # 1. PAUSE les false positives
    print(f"\n→ PAUSE de {len(to_pause)} faux positifs dans Smartlead...")
    paused = 0
    pause_failed = 0
    pause_log = []
    for lead_id, email, reason in to_pause:
        if pause_smartlead_lead(api_key, lead_id):
            paused += 1
            pause_log.append({"lead_id": lead_id, "email": email, "reason": reason})
        else:
            pause_failed += 1
        time.sleep(0.05)
    print(f"  Paused: {paused}/{len(to_pause)} (échecs: {pause_failed})")

    # 2. UPDATE custom_fields des reclassifiés
    print(f"\n→ UPDATE custom_fields de {len(to_update)} leads reclassifiés...")
    updated = 0
    update_failed = 0
    for lead_id, cf, reason in to_update:
        if update_smartlead_lead(api_key, lead_id, cf):
            updated += 1
        else:
            update_failed += 1
        time.sleep(0.05)
    print(f"  Updated: {updated}/{len(to_update)} (échecs: {update_failed})")

    # 3. UPDATE DB CRM avec les niches strictes
    print(f"\n→ UPDATE DB CRM avec niche_strict (custom_fields)...")
    db_updated = 0
    db_failed = 0
    # On match par phone
    phones_strict = list(strict_by_phone.keys())
    BATCH = 500
    for i in range(0, len(phones_strict), BATCH):
        batch_phones = phones_strict[i:i+BATCH]
        try:
            # Récupère tous les prospects DB avec un phone qui pourrait matcher
            res = sb.table("prospects").select("id, phone, custom_fields, profession").is_("deleted_at", "null").execute()
            db_rows = res.data or []
            for db_row in db_rows:
                db_ph = normalize_phone(db_row.get("phone") or "")
                strict = strict_by_phone.get(db_ph)
                if not strict:
                    continue
                new_niche = strict["niche_strict"]
                old_cf = db_row.get("custom_fields") or {}
                new_singular, new_plural = SOCIETE_LABELS[new_niche]
                new_cf = {
                    **old_cf,
                    "societe_label": new_singular,
                    "societes_label": new_plural,
                    "niche_strict": new_niche,
                    "confidence_score": strict.get("confidence_score"),
                    "google_rating": strict.get("google_rating"),
                    "google_review_count": strict.get("google_review_count"),
                    "competitors_count_lsa": strict.get("competitors_count_lsa"),
                    "category_google": strict.get("category_google"),
                    "lsa_lowcomp_strict_2026Q2": True,
                }
                try:
                    sb.table("prospects").update({
                        "custom_fields": new_cf,
                        "profession": new_niche,
                        "niche": new_niche,
                    }).eq("id", db_row["id"]).execute()
                    db_updated += 1
                except Exception as e:
                    db_failed += 1
                    if db_failed < 5:
                        print(f"  ⚠ {db_row['id']}: {e}")
            break  # On a déjà chargé tous les prospects DB, pas besoin de boucler
        except Exception as e:
            print(f"  ⚠ batch error: {e}")
            db_failed += len(batch_phones)
    print(f"  DB updated: {db_updated} (échecs: {db_failed})")

    # 4. FLAG en DB les false positives (custom_fields.smartlead_false_positive)
    print(f"\n→ FLAG en DB les {len(to_pause)} faux positifs...")
    fp_flagged = 0
    fp_emails = [p[1].lower().strip() for p in to_pause if p[1]]
    if fp_emails:
        # Batch par tranches de 100
        for i in range(0, len(fp_emails), 100):
            batch = fp_emails[i:i+100]
            try:
                res = sb.table("prospects").select("id, custom_fields, contact_email").in_("contact_email", batch).is_("deleted_at", "null").execute()
                for row in (res.data or []):
                    old_cf = row.get("custom_fields") or {}
                    new_cf = {
                        **old_cf,
                        "smartlead_false_positive": True,
                        "smartlead_paused_at": "2026-05-18T00:00:00Z",
                        "smartlead_pause_reason": "wrong_niche_classification",
                    }
                    try:
                        sb.table("prospects").update({"custom_fields": new_cf}).eq("id", row["id"]).execute()
                        fp_flagged += 1
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ⚠ batch {i}: {e}")
    print(f"  False positives flagués en DB : {fp_flagged}")

    # Save log
    log_path = ROOT / "data" / "lsa-12-reconcile-log.json"
    with log_path.open("w", encoding="utf-8") as f:
        json.dump({
            "timestamp": "2026-05-18",
            "smartlead_leads_total": len(sl_leads),
            "matched_ok": matched_ok,
            "reclassified": updated,
            "paused": paused,
            "db_updated": db_updated,
            "false_positives_flagged": fp_flagged,
            "pause_details": pause_log,
        }, f, indent=2, ensure_ascii=False)
    print(f"\nLog : {log_path.relative_to(ROOT)}")
    print("\n=== RECONCILE DONE ===")


if __name__ == "__main__":
    main()
