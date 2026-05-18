#!/usr/bin/env python3
"""
Étape 23 — Exporte les prospects CRM sans email pour scraping Firecrawl.

Output : data/lsa-23-firecrawl-input.csv
Format : id, company_name, website, phone, city, niche

Filtre :
  - deleted_at IS NULL
  - contact_email IS NULL ou vide
  - website non vide (sinon Firecrawl n'a rien à crawler)
  - niche dans (paysagiste, pisciniste, chauffagiste, bardage, cloture)
    OU custom_fields.lsa_strict_2026Q2 = true
"""
from __future__ import annotations
import csv
import os
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
OUT_CSV = ROOT / "data" / "lsa-23-firecrawl-input.csv"


def load_env() -> dict:
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k] = v.strip()
    return out


def main() -> None:
    env = load_env()
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    rows_out = []
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, company_name, website, phone, city, niche, profession, custom_fields"
        ).is_("deleted_at", "null").range(offset, offset + 999).execute()
        batch = res.data or []
        if not batch:
            break
        for r in batch:
            if r.get("contact_email"):
                continue
            cf = r.get("custom_fields") or {}
            # On garde uniquement les prospects strict (lsa_strict_2026Q2 ou niche standard)
            niche = cf.get("niche_strict") or r.get("niche") or r.get("profession")
            if not cf.get("lsa_strict_2026Q2") and niche not in ("paysagiste", "pisciniste", "chauffagiste", "bardage", "cloture"):
                continue
            website = r.get("website") or ""
            # On exporte même sans website pour que Firecrawl tente via google_maps_url ou search
            rows_out.append({
                "id": r["id"],
                "company_name": r.get("company_name") or "",
                "website": website,
                "phone": r.get("phone") or "",
                "city": r.get("city") or cf.get("city_matched") or "",
                "niche": niche or "",
                "google_maps_url": cf.get("google_maps_url") or "",
                "google_rating": cf.get("google_rating") or "",
                "google_review_count": cf.get("google_review_count") or "",
            })
        if len(batch) < 1000:
            break
        offset += 1000

    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = ["id", "company_name", "website", "phone", "city", "niche",
                  "google_maps_url", "google_rating", "google_review_count"]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows_out)

    print(f"Exported {len(rows_out)} prospects sans email vers {OUT_CSV.relative_to(ROOT)}")

    # Stats
    with_website = sum(1 for r in rows_out if r["website"])
    print(f"  Avec website  : {with_website}")
    print(f"  Sans website  : {len(rows_out) - with_website}")
    from collections import Counter
    by_niche = Counter(r["niche"] for r in rows_out)
    print("\nPar niche :")
    for n, c in by_niche.most_common():
        print(f"  {n:15s} : {c}")


if __name__ == "__main__":
    main()
