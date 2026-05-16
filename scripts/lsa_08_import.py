#!/usr/bin/env python3
"""
Étape 8 du pipeline LSA : import final dans la DB Supabase.

Workflow :
1. DELETE les prospects de lsa-05-to-delete.csv (hard delete)
2. UPDATE les prospects de lsa-05-to-enrich.csv (merge custom_fields)
3. INSERT les prospects de lsa-07-emails-validated.csv (les "to-scrape" enrichis emails)

Pré-requis : .env contient VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations
import argparse
import ast
import csv
import json
import re
import sys
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
TO_DELETE = ROOT / "data" / "lsa-05-to-delete.csv"
TO_ENRICH = ROOT / "data" / "lsa-05-to-enrich.csv"
TO_INSERT = ROOT / "data" / "lsa-07-emails-validated.csv"  # output du pipeline emails

BATCH_SIZE = 50


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
        print("ERREUR : URL/KEY Supabase introuvable dans .env")
        sys.exit(1)
    return url, key


def normalize_phone(raw: str) -> str:
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


def build_custom_fields(row: dict) -> dict:
    """Champs Google + concurrence à stocker en JSONB."""
    try:
        rating = float(row["google_rating"]) if row.get("google_rating") else None
    except (ValueError, TypeError):
        rating = None
    try:
        reviews = int(row["google_review_count"]) if row.get("google_review_count") else None
    except (ValueError, TypeError):
        reviews = None
    try:
        comp = int(row["competitors_count_lsa"]) if row.get("competitors_count_lsa") else None
    except (ValueError, TypeError):
        comp = None
    return {
        "google_rating": rating,
        "google_review_count": reviews,
        "competitors_count_lsa": comp,
        "category_google": row.get("category_google") or None,
        "pitch_intent": row.get("niche_assigned") or None,
        "lsa_lowcomp_2026Q2": True,
    }


def do_delete(supabase, dry_run: bool) -> None:
    if not TO_DELETE.exists():
        print(f"⚠ {TO_DELETE.name} absent, skip DELETE")
        return
    with TO_DELETE.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("DELETE : aucune ligne")
        return
    ids = [r["id"] for r in rows]
    print(f"\n=== DELETE : {len(ids)} prospects (jamais contactés, absents du CSV) ===")
    if dry_run:
        print("  [dry-run] aucune action")
        return
    for i in range(0, len(ids), BATCH_SIZE):
        batch = ids[i:i+BATCH_SIZE]
        try:
            supabase.table("prospects").delete().in_("id", batch).execute()
            print(f"  batch {i//BATCH_SIZE+1} : DELETE {len(batch)} ids")
        except Exception as e:
            print(f"  ⚠ batch {i//BATCH_SIZE+1} : erreur {e}")


def do_enrich(supabase, dry_run: bool) -> None:
    if not TO_ENRICH.exists():
        print(f"⚠ {TO_ENRICH.name} absent, skip UPDATE")
        return
    with TO_ENRICH.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("UPDATE : aucune ligne")
        return
    print(f"\n=== UPDATE : {len(rows)} prospects existants ===")
    n_full = n_meta = n_err = 0
    for r in rows:
        db_id = r.get("_db_id")
        call_count = int(r.get("_db_call_count", 0) or 0)
        try:
            existing = ast.literal_eval(r.get("_db_existing_custom_fields") or "{}")
            if not isinstance(existing, dict):
                existing = {}
        except (ValueError, SyntaxError):
            existing = {}
        new_cf = {**existing, **build_custom_fields(r)}
        payload: dict = {"custom_fields": new_cf}
        if call_count == 0:
            payload.update({
                "company_name": r["company_name"],
                "phone": normalize_phone(r["phone"]),
                "website": r.get("website") or None,
                "google_maps_url": r.get("google_maps_url") or None,
                "profession": r.get("niche_assigned") or None,
                "niche": r.get("niche_assigned") or None,
                "city": r.get("city_matched") or None,
                "address": r.get("address") or None,
            })
            n_full += 1
        else:
            n_meta += 1
        if dry_run:
            continue
        try:
            supabase.table("prospects").update(payload).eq("id", db_id).execute()
        except Exception as e:
            n_err += 1
            print(f"  ⚠ id={db_id} : {e}")
    print(f"  full UPDATE (call_count=0)   : {n_full}")
    print(f"  meta-only (déjà contactés)  : {n_meta}")
    if n_err:
        print(f"  erreurs                     : {n_err}")


def do_insert(supabase, dry_run: bool) -> None:
    if not TO_INSERT.exists():
        print(f"⚠ {TO_INSERT.name} absent, skip INSERT")
        return
    with TO_INSERT.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        print("INSERT : aucune ligne")
        return
    print(f"\n=== INSERT : {len(rows)} prospects ===")
    payloads = []
    for r in rows:
        phone = normalize_phone(r["phone"])
        if not phone:
            continue
        best_email = r.get("best_email") if r.get("validation_status") == "ok" else None
        payloads.append({
            "company_name": r["company_name"],
            "phone": phone,
            "website": r.get("website") or None,
            "google_maps_url": r.get("google_maps_url") or None,
            "profession": r.get("niche_assigned") or None,
            "niche": r.get("niche_assigned") or None,
            "city": r.get("city_matched") or None,
            "address": r.get("address") or None,
            "contact_email": best_email,
            "status": "nouveau",
            "source": "csv_import",
            "custom_fields": {
                **build_custom_fields(r),
                "email_quality": r.get("best_email_quality") or None,
            },
        })
    if dry_run:
        print(f"  [dry-run] {len(payloads)} payloads prêts")
        return
    n_ok = n_err = 0
    for i in range(0, len(payloads), BATCH_SIZE):
        batch = payloads[i:i+BATCH_SIZE]
        try:
            supabase.table("prospects").insert(batch).execute()
            n_ok += len(batch)
            print(f"  batch {i//BATCH_SIZE+1} : INSERT {len(batch)} ✓")
        except Exception as e:
            n_err += len(batch)
            print(f"  ⚠ batch {i//BATCH_SIZE+1} : {e}")
    print(f"  Total inséré : {n_ok}/{len(payloads)} (erreurs: {n_err})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Pas d'écriture DB, juste log")
    parser.add_argument("--skip-delete", action="store_true")
    parser.add_argument("--skip-enrich", action="store_true")
    parser.add_argument("--skip-insert", action="store_true")
    args = parser.parse_args()

    url, key = load_env()
    supabase = create_client(url, key)
    print(f"Connecté à {url}")
    print(f"Mode : {'DRY-RUN' if args.dry_run else 'LIVE (écritures DB)'}")

    if not args.skip_delete:
        do_delete(supabase, args.dry_run)
    if not args.skip_enrich:
        do_enrich(supabase, args.dry_run)
    if not args.skip_insert:
        do_insert(supabase, args.dry_run)

    print("\n=== IMPORT DONE ===")


if __name__ == "__main__":
    main()
