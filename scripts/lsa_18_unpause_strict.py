#!/usr/bin/env python3
"""
Étape 18 — Unpause les strict prospects qui seraient encore PAUSED.

Pour chaque lead Smartlead, match par phone normalisé contre strict_phones.
Si match ET status=PAUSED → unpause.
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

API_BASE = "https://server.smartlead.ai/api/v1"
CAMPAIGN_ID = 3338241


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


def main() -> None:
    api_key = load_api_key()

    strict_phones = set()
    strict_emails = set()
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                strict_phones.add(ph)

    # Fetch all leads
    leads = []
    offset = 0
    while True:
        r = requests.get(f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads",
                        params={"api_key": api_key, "offset": offset, "limit": 100}, timeout=20)
        if r.status_code != 200: break
        batch = (r.json() or {}).get("data", [])
        if not batch: break
        leads.extend(batch)
        if len(batch) < 100: break
        offset += 100
        time.sleep(0.15)

    print(f"Fetched {len(leads)} Smartlead leads")
    print(f"Strict phones unique : {len(strict_phones)}")

    to_unpause = []
    matched_active = 0
    matched_paused = 0
    not_in_strict = 0

    for ld in leads:
        lead = ld.get("lead", {}) or {}
        status = (ld.get("status") or "").upper()
        ph = normalize_phone(lead.get("phone_number") or "")
        if ph not in strict_phones:
            not_in_strict += 1
            continue
        if status == "PAUSED":
            to_unpause.append((lead.get("id"), lead.get("email", "")))
            matched_paused += 1
        else:
            matched_active += 1

    print(f"\nStrict + active   : {matched_active}")
    print(f"Strict + PAUSED   : {matched_paused} → à unpause")
    print(f"Non-strict        : {not_in_strict}")

    # Unpause
    print(f"\n→ Unpause de {len(to_unpause)} strict prospects PAUSED...")
    unpaused = 0
    failed = 0
    for lid, email in to_unpause:
        # Endpoint Smartlead pour resume : POST /campaigns/{cid}/leads/{lid}/resume
        r = requests.post(
            f"{API_BASE}/campaigns/{CAMPAIGN_ID}/leads/{lid}/resume",
            params={"api_key": api_key},
            json={},
            timeout=15,
        )
        if r.status_code == 200:
            unpaused += 1
        else:
            failed += 1
            if failed < 3:
                print(f"  ⚠ {lid} {email}: {r.status_code} {r.text[:120]}")
        time.sleep(0.05)

    print(f"\n=== UNPAUSE DONE ===")
    print(f"Unpaused : {unpaused}/{len(to_unpause)}")
    print(f"Failed   : {failed}")


if __name__ == "__main__":
    main()
