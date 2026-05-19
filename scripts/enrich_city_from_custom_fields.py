#!/usr/bin/env python3
"""Enrichit prospects.city depuis custom_fields.city_matched + address.

Pour chaque prospect avec city = NULL :
  1. Si custom_fields.city_matched existe → copie dans prospects.city
  2. Sinon si address (sans "·") → extrait ville depuis "31000 Toulouse" pattern
  3. Sinon laisse NULL

Usage : python3 scripts/enrich_city_from_custom_fields.py [--dry-run]
"""
from __future__ import annotations
import re, sys
import requests

SUPA = "https://zsbrhftzjqqqbwbboyqe.supabase.co"
ENV_PATH = "/Users/famille/Desktop/celexia/crmcelexia/.env"
DRY = "--dry-run" in sys.argv

# Load service key
SERVICE = None
for line in open(ENV_PATH).read().splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE = line.split("=", 1)[1].strip()
H = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}

# Regex ville à la fin d'address (ex: "10 rue Foo, 31000 Toulouse")
ADDR_VILLE_RE = re.compile(r"\b\d{5}\s+([A-Za-zÀ-ÿ' -]+?)(?:,|$|\s*\d|\s*-\s*\d)")

def extract_ville_from_address(addr: str) -> str:
    if not addr or addr.strip() == "·":
        return ""
    m = ADDR_VILLE_RE.search(addr)
    if m:
        return m.group(1).strip().rstrip(",").strip()
    # Fallback : last token
    parts = [x.strip() for x in addr.replace(",", " ").split() if x.strip()]
    # Cherche le 1er token qui ressemble à une ville (cap, pas chiffre)
    for tok in reversed(parts):
        if tok and tok[0].isupper() and not tok.isdigit() and len(tok) > 2:
            return tok
    return ""

print(f"=== Enrich city {'(DRY RUN)' if DRY else '(LIVE)'} ===")
total_scan = 0
already_has = 0
recovered_cm = 0
recovered_addr = 0
no_recovery = 0

for offset in range(0, 10000, 1000):
    r = requests.get(
        f"{SUPA}/rest/v1/prospects?select=id,city,address,custom_fields"
        f"&deleted_at=is.null&limit=1000&offset={offset}",
        headers=H, timeout=30
    )
    if not r.ok or not r.json():
        break
    page = r.json()
    for p in page:
        total_scan += 1
        if (p.get("city") or "").strip():
            already_has += 1
            continue
        cf = p.get("custom_fields") or {}
        new_city = (cf.get("city_matched") or "").strip()
        source = "city_matched"
        if not new_city:
            new_city = extract_ville_from_address(p.get("address") or "")
            source = "address"
        if not new_city:
            no_recovery += 1
            continue
        # UPDATE
        if DRY:
            if source == "city_matched":
                recovered_cm += 1
            else:
                recovered_addr += 1
        else:
            ur = requests.patch(
                f"{SUPA}/rest/v1/prospects?id=eq.{p['id']}",
                headers=H,
                json={"city": new_city},
                timeout=15,
            )
            if ur.status_code in (204, 200):
                if source == "city_matched":
                    recovered_cm += 1
                else:
                    recovered_addr += 1
            else:
                no_recovery += 1
    if len(page) < 1000:
        break

print(f"\nTotal prospects scannés : {total_scan}")
print(f"  Déjà une city          : {already_has}")
print(f"  Récupérés via city_matched : {recovered_cm}")
print(f"  Récupérés via address       : {recovered_addr}")
print(f"  Pas récupérables           : {no_recovery}")
