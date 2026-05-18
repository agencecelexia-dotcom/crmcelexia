#!/usr/bin/env python3
"""
Étape 28 — Resync Smartlead complet après clean CRM.

3 phases :
  1. DELETE tous les leads actuels de la campagne 3338241
     (on repart à 0 — fini les 1 848 paused historiques)
  2. ADD les prospects CRM avec :
     - contact_email non null (après clean lsa_27)
     - status = 'nouveau'
     - niche stricte (paysagiste/pisciniste/chauffagiste/bardage/cloture)
  3. RESUME la campagne (status: START)

Build du lead Smartlead avec custom_fields :
  - opening, ville, zone_label, societe_label, societes_label
  - niche_strict, company_name (clean)
"""
from __future__ import annotations
import csv
import re
import sys
import time
from collections import Counter
from pathlib import Path

import requests

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
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
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip()
    return out


def title_case(s: str) -> str:
    if not s:
        return ""
    return " ".join("-".join(p.capitalize() for p in word.split("-")) for word in s.split()).strip()


def fetch_all_smartlead_leads(api_key: str) -> list[dict]:
    leads = []
    offset = 0
    while True:
        r = requests.get(
            f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
            params={"api_key": api_key, "offset": offset, "limit": 100},
            timeout=20,
        )
        if r.status_code != 200:
            break
        batch = (r.json() or {}).get("data", [])
        if not batch:
            break
        leads.extend(batch)
        if len(batch) < 100:
            break
        offset += 100
        time.sleep(0.15)
    return leads


def delete_smartlead_lead(api_key: str, lead_id: int) -> bool:
    """DELETE /campaigns/{cid}/leads/{lead_id}."""
    r = requests.delete(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads/{lead_id}",
        params={"api_key": api_key},
        timeout=10,
    )
    return r.status_code in (200, 204)


def pause_campaign(api_key: str) -> None:
    requests.post(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/status",
        params={"api_key": api_key},
        json={"status": "PAUSED"},
        timeout=10,
    )


def resume_campaign(api_key: str) -> dict:
    r = requests.post(
        f"{API_BASE}/campaigns/{CAMPAIGN_ID}/status",
        params={"api_key": api_key},
        json={"status": "START"},
        timeout=15,
    )
    return {"status": r.status_code, "body": r.text[:200]}


def main() -> None:
    env = load_env()
    api_key = env["SMARTLEAD_API_KEY"]
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    print("=" * 60)
    print("PHASE 1 — Pause + analyse leads actuels Smartlead")
    print("=" * 60)
    pause_campaign(api_key)
    print("→ Campagne mise en PAUSED")
    time.sleep(1)

    leads = fetch_all_smartlead_leads(api_key)
    print(f"→ {len(leads)} leads actuels dans la campagne")

    # Charge CRM emails valides pour décider quel lead garder
    print("→ Chargement emails valides du CRM...")
    crm_emails = set()
    offset = 0
    while True:
        res = sb.table("prospects").select("contact_email").is_("deleted_at", "null").not_.is_("contact_email", "null").eq("status", "nouveau").range(offset, offset + 999).execute()
        batch = res.data or []
        for r in batch:
            em = (r.get("contact_email") or "").lower().strip()
            if em:
                crm_emails.add(em)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"  {len(crm_emails)} emails CRM valides à pousser")

    print("\n→ Analyse pour DELETE ciblé :")
    print("   - Garde : emails matchant CRM valid, OU avec replies/opens (intérêt détecté)")
    print("   - Delete : faux positifs (status_changed) sans aucune activité")

    deleted = 0
    delete_failed = 0
    kept_in_crm = 0
    kept_with_activity = 0

    for i, ld in enumerate(leads):
        inner = ld.get("lead") or {}
        lead_id = inner.get("id")
        email = (inner.get("email") or "").lower().strip()
        data = ld.get("lead_campaign_data") or {}
        has_activity = (
            (data.get("open_count") or 0) > 0
            or (data.get("reply_count") or 0) > 0
            or data.get("is_replied")
            or data.get("is_opened")
        )

        # Garde si dans CRM valide OU si activité
        if email in crm_emails:
            kept_in_crm += 1
            continue
        if has_activity:
            kept_with_activity += 1
            continue

        # Sinon : obsolète, à delete
        if not lead_id:
            continue
        if delete_smartlead_lead(api_key, lead_id):
            deleted += 1
        else:
            delete_failed += 1
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(leads)}... deleted={deleted}")
        time.sleep(0.05)

    print(f"\n→ Deleted: {deleted}")
    print(f"  Préservés (matchent CRM)   : {kept_in_crm}")
    print(f"  Préservés (avec activité)  : {kept_with_activity}")
    print(f"  Échecs delete              : {delete_failed}")
    print()

    print("=" * 60)
    print("PHASE 2 — Charger prospects CRM strict + email + nouveau")
    print("=" * 60)

    all_prospects = []
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, company_name, contact_email, contact_firstname, phone, website, "
            "status, niche, profession, city, custom_fields"
        ).is_("deleted_at", "null").not_.is_("contact_email", "null").eq("status", "nouveau").range(offset, offset + 999).execute()
        batch = res.data or []
        all_prospects.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"→ Prospects CRM avec email + status=nouveau : {len(all_prospects)}")

    # Filter niches strictes
    strict_prospects = [
        p for p in all_prospects
        if (p.get("niche") or p.get("profession")) in SOCIETE_LABELS
    ]
    print(f"→ Avec niche stricte                 : {len(strict_prospects)}")
    print()

    # Build payload
    leads_payload = []
    for p in strict_prospects:
        niche = p.get("niche") or p.get("profession")
        if niche not in SOCIETE_LABELS:
            continue
        singular, plural = SOCIETE_LABELS[niche]

        cf = p.get("custom_fields") or {}
        first = title_case((p.get("contact_firstname") or "").split()[0]) if p.get("contact_firstname") else ""
        opening = f"Bonjour {first}" if first and len(first) >= 2 else "Bonjour"

        ville = p.get("city") or cf.get("city_matched") or "votre secteur"
        company = (p.get("company_name") or "").strip()[:80]

        leads_payload.append({
            "first_name": first or "",
            "last_name": title_case(p.get("contact_firstname") or ""),
            "email": p["contact_email"].strip().lower(),
            "company_name": company,
            "phone_number": p.get("phone") or "",
            "website": p.get("website") or "",
            "custom_fields": {
                "opening": opening,
                "ville": ville,
                "zone_label": "dans votre zone",
                "societe_label": singular,
                "societes_label": plural,
                "niche_strict": niche,
            },
        })

    by_niche = Counter(p["custom_fields"]["niche_strict"] for p in leads_payload)
    print("Distribution par niche :")
    for n, c in by_niche.most_common():
        print(f"  {n:15s} : {c}")
    print()

    print("=" * 60)
    print("PHASE 3 — ADD leads à Smartlead (batch 100)")
    print("=" * 60)

    total_added = 0
    total_already = 0
    total_failed = 0
    BATCH = 100
    for i in range(0, len(leads_payload), BATCH):
        batch = leads_payload[i:i+BATCH]
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
                print(f"  batch {i//BATCH+1}/{(len(leads_payload)+BATCH-1)//BATCH} : added={added}, already={already}")
            else:
                total_failed += len(batch)
                print(f"  batch FAIL {r.status_code} : {r.text[:200]}")
        except Exception as e:
            total_failed += len(batch)
            print(f"  batch exception: {e}")
        time.sleep(0.4)

    print(f"\nAdded total    : {total_added}")
    print(f"Already        : {total_already}")
    print(f"Failed         : {total_failed}")
    print()

    print("=" * 60)
    print("PHASE 4 — RESUME campagne")
    print("=" * 60)
    res = resume_campaign(api_key)
    print(f"→ {res}")
    print()
    print("Dashboard : https://app.smartlead.ai/app/email-campaign/{}/analytics".format(CAMPAIGN_ID))
    print("\n=== SMARTLEAD RESYNC DONE ===")


if __name__ == "__main__":
    main()
