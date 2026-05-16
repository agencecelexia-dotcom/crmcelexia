#!/usr/bin/env python3
"""
Étape 5 du pipeline LSA : diff entre les prospects filtrés (CSV) et la
DB Supabase actuelle.

Input  : data/lsa-04-dedup.csv (prospects filtrés intra-CSV)
DB     : table `prospects` Supabase (phones existants + call_count)
Output :
  - data/lsa-05-to-scrape.csv  (nouveaux à scraper email puis insert)
  - data/lsa-05-to-enrich.csv  (existants à UPDATE custom_fields ou plus)
  - data/lsa-05-to-delete.csv  (DB jamais contactés ET absents du CSV)
"""
from __future__ import annotations
import csv
import os
import re
import sys
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-04-dedup.csv"
OUT_TO_SCRAPE = ROOT / "data" / "lsa-05-to-scrape.csv"
OUT_TO_ENRICH = ROOT / "data" / "lsa-05-to-enrich.csv"
OUT_TO_DELETE = ROOT / "data" / "lsa-05-to-delete.csv"


def load_env() -> tuple[str, str]:
    env_path = ROOT / ".env"
    url = key = ""
    for line in env_path.read_text().splitlines():
        if line.startswith("#"):
            continue
        if line.startswith("VITE_SUPABASE_URL="):
            url = line.split("=", 1)[1].strip()
        elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            key = line.split("=", 1)[1].strip()
    if not url or not key:
        print("ERREUR : VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY introuvable dans .env")
        sys.exit(1)
    return url, key


def normalize_phone(raw: str) -> str:
    """Identique à la fonction du step 1."""
    if not raw:
        return ""
    digits = re.sub(r"[^\d]", "", raw)
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("0"):
        return digits
    if len(digits) == 9:
        return "0" + digits
    return digits


def fetch_db_prospects(supabase) -> dict[str, dict]:
    """Retourne {phone_normalisé: {id, call_count, last_called_at, custom_fields}}."""
    print("Fetching DB prospects (paginated)...")
    all_rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        res = supabase.table("prospects").select(
            "id, phone, call_count, last_called_at, source, custom_fields, status"
        ).is_("deleted_at", "null").range(offset, offset + page_size - 1).execute()
        batch = res.data or []
        all_rows.extend(batch)
        print(f"  fetched {len(all_rows)} so far...")
        if len(batch) < page_size:
            break
        offset += page_size
    # Index par phone normalisé
    by_phone: dict[str, dict] = {}
    for row in all_rows:
        p = normalize_phone(row.get("phone", ""))
        if p:
            by_phone[p] = row
    print(f"Total DB prospects : {len(all_rows)} (uniques par phone : {len(by_phone)})")
    return by_phone


def main() -> None:
    url, key = load_env()
    supabase = create_client(url, key)

    db_by_phone = fetch_db_prospects(supabase)

    with IN_CSV.open(encoding="utf-8") as f:
        csv_rows = list(csv.DictReader(f))
    print(f"Input CSV : {len(csv_rows)} prospects filtrés")
    print()

    to_scrape: list[dict] = []      # nouveaux à scraper + insert
    to_enrich: list[dict] = []      # existants à update
    csv_phones: set[str] = set()

    for r in csv_rows:
        phone = normalize_phone(r["phone"])
        if not phone:
            continue
        csv_phones.add(phone)
        if phone not in db_by_phone:
            to_scrape.append(r)
        else:
            db_row = db_by_phone[phone]
            r["_db_id"] = db_row["id"]
            r["_db_call_count"] = db_row.get("call_count", 0) or 0
            r["_db_existing_custom_fields"] = (
                # Sérialisé pour CSV : pas idéal mais OK pour debug
                str(db_row.get("custom_fields") or {})
            )
            to_enrich.append(r)

    # DB rows ABSENTS du CSV ET jamais contactés
    to_delete: list[dict] = []
    for phone, db_row in db_by_phone.items():
        if phone in csv_phones:
            continue
        call_count = db_row.get("call_count", 0) or 0
        last_called = db_row.get("last_called_at")
        if call_count == 0 and not last_called:
            to_delete.append({
                "id": db_row["id"],
                "phone": phone,
                "source": db_row.get("source", ""),
                "status": db_row.get("status", ""),
            })

    # Write outputs
    OUT_TO_SCRAPE.parent.mkdir(exist_ok=True)
    csv_fieldnames = list(csv_rows[0].keys()) if csv_rows else []

    with OUT_TO_SCRAPE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fieldnames)
        writer.writeheader()
        writer.writerows(to_scrape)

    enrich_fields = csv_fieldnames + ["_db_id", "_db_call_count", "_db_existing_custom_fields"]
    with OUT_TO_ENRICH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=enrich_fields)
        writer.writeheader()
        writer.writerows(to_enrich)

    with OUT_TO_DELETE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "phone", "source", "status"])
        writer.writeheader()
        writer.writerows(to_delete)

    print("=== DB DIFF DONE ===")
    print(f"To scrape (nouveaux)         : {len(to_scrape)}")
    print(f"To enrich (existants)        : {len(to_enrich)}")
    print(f"  ↳ déjà contactés          : {sum(1 for r in to_enrich if int(r['_db_call_count']) > 0)}")
    print(f"  ↳ frais (call_count=0)    : {sum(1 for r in to_enrich if int(r['_db_call_count']) == 0)}")
    print(f"To delete (DB-only, jamais contactés) : {len(to_delete)}")
    print()
    print(f"Outputs :")
    print(f"  {OUT_TO_SCRAPE.relative_to(ROOT)}")
    print(f"  {OUT_TO_ENRICH.relative_to(ROOT)}")
    print(f"  {OUT_TO_DELETE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
