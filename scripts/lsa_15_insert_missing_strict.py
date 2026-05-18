#!/usr/bin/env python3
"""
Étape 15 — Insère en CRM les prospects strict pas encore en DB.

Pour chaque prospect de lsa-11-strict-final.csv pas trouvé en DB par phone,
crée un nouveau row avec status='nouveau', niche correcte, custom_fields
complets. Pas d'email pour l'instant (à scraper en suivante).
"""
from __future__ import annotations
import csv
import re
from collections import Counter
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-11-strict-final.csv"

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


def main() -> None:
    env = load_env()
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    # Récupère un commercial_id existant (le plus fréquent dans la table)
    res = sb.table("prospects").select("commercial_id").not_.is_("commercial_id", "null").limit(1).execute()
    if not res.data:
        print("ERREUR : aucun commercial_id trouvé en DB", file=__import__('sys').stderr)
        return
    default_commercial_id = res.data[0]["commercial_id"]
    print(f"Commercial_id par défaut : {default_commercial_id}")

    rows = []
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                r["phone_norm"] = ph
                rows.append(r)
    print(f"→ {len(rows)} prospects strict")

    inserted = 0
    skipped = 0
    failed = 0
    by_niche = Counter()

    for i, r in enumerate(rows):
        if i % 50 == 0:
            print(f"  {i}/{len(rows)}... inserted={inserted}")
        ph = r["phone_norm"]
        variants = [ph]
        if ph.startswith("0"):
            variants.extend(["+33" + ph[1:], "33" + ph[1:]])

        try:
            res = sb.table("prospects").select("id").in_("phone", variants).is_("deleted_at", "null").limit(1).execute()
            if res.data:
                skipped += 1
                continue
        except Exception as e:
            print(f"  ⚠ lookup {ph}: {e}")
            failed += 1
            continue

        niche = r["niche_strict"]
        s_singular, s_plural = SOCIETE_LABELS[niche]

        cf = {
            "societe_label": s_singular,
            "societes_label": s_plural,
            "niche_strict": niche,
            "confidence_score": int(r.get("confidence_score") or 0),
            "google_rating": float(r["google_rating"]) if r.get("google_rating") else None,
            "google_review_count": int(r["google_review_count"]) if r.get("google_review_count") else None,
            "competitors_count_lsa": int(r["competitors_count_lsa"]) if r.get("competitors_count_lsa") else None,
            "category_google": r.get("category_google", ""),
            "city_matched": r.get("city_matched", ""),
            "google_maps_url": r.get("google_maps_url", ""),
            "lsa_lowcomp_strict_2026Q2": True,
            "needs_email_scraping": True,
        }

        row = {
            "company_name": r.get("company_name", "").strip()[:200],
            "phone": ph,
            "profession": niche,
            "niche": niche,
            "city": r.get("city_matched", "") or None,
            "address": r.get("address", "")[:500] or None,
            "website": r.get("website", "") or None,
            "status": "nouveau",
            "source": "csv_import",
            "commercial_id": default_commercial_id,
            "custom_fields": cf,
        }

        try:
            sb.table("prospects").insert(row).execute()
            inserted += 1
            by_niche[niche] += 1
        except Exception as e:
            failed += 1
            if failed < 5:
                print(f"  ⚠ insert {r.get('company_name','?')[:40]}: {e}")

    print(f"\n=== INSERT DONE ===")
    print(f"Inserted   : {inserted}")
    print(f"Skipped    : {skipped} (déjà en DB)")
    print(f"Failed     : {failed}")
    print()
    print("Distribution inserts par niche :")
    for n, c in by_niche.most_common():
        print(f"  {n:15s} : {c}")


if __name__ == "__main__":
    main()
