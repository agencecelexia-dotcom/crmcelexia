#!/usr/bin/env python3
"""
Étape 26 — Injecte emails + dirigeants scrapés dans le CRM CRM Supabase.

Lit :
  - data/lsa-24-emails-scraped.csv (contact_email, best_email_quality)
  - data/lsa-25-dirigeants.csv (dirigeant_prenom, dirigeant_nom, siret)

UPDATE prospects WHERE id = ? :
  - SET contact_email = best_email (si trouvé + quality high/medium)
  - SET first_name = dirigeant_prenom (si trouvé)
  - SET last_name = dirigeant_nom (si trouvé)
  - SET custom_fields = ... | {email_quality, siret, dirigeant_source}

NE TOUCHE PAS :
  - status, call_count, last_called_at, custom_fields existants non-mentionnés
"""
from __future__ import annotations
import csv
import sys
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
EMAILS_CSV = ROOT / "data" / "lsa-24-emails-scraped.csv"
DIRIGEANTS_CSV = ROOT / "data" / "lsa-25-dirigeants.csv"


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

    # 1. Charge les emails scrapés
    emails_by_id: dict[str, dict] = {}
    if EMAILS_CSV.exists():
        with EMAILS_CSV.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("best_email"):
                    emails_by_id[r["id"]] = r
        print(f"Emails scrapés : {len(emails_by_id)}")
    else:
        print(f"⚠ {EMAILS_CSV} introuvable")

    # 2. Charge les dirigeants enrichis
    dirig_by_id: dict[str, dict] = {}
    if DIRIGEANTS_CSV.exists():
        with DIRIGEANTS_CSV.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("dirigeant_prenom") or r.get("siret"):
                    dirig_by_id[r["id"]] = r
        print(f"Dirigeants enrichis : {len(dirig_by_id)}")
    else:
        print(f"⚠ {DIRIGEANTS_CSV} introuvable")

    # 3. Union des ids à updater
    ids_to_update = set(emails_by_id) | set(dirig_by_id)
    print(f"\nProspects à updater : {len(ids_to_update)}")

    # 4. Update batch
    updated = 0
    failed = 0
    skipped = 0
    for i, pid in enumerate(ids_to_update):
        if i % 100 == 0:
            print(f"  {i}/{len(ids_to_update)}... updated={updated}")

        # Récupère custom_fields actuel
        try:
            res = sb.table("prospects").select("id, contact_email, custom_fields").eq("id", pid).is_("deleted_at", "null").limit(1).execute()
            if not res.data:
                skipped += 1
                continue
            current = res.data[0]
        except Exception as e:
            failed += 1
            print(f"  ⚠ fetch {pid}: {e}")
            continue

        update_data: dict = {}
        new_cf = dict(current.get("custom_fields") or {})

        # Email — uniquement si pas déjà rempli
        em = emails_by_id.get(pid)
        if em and not current.get("contact_email"):
            email = em["best_email"].strip().lower()
            quality = em.get("best_email_quality", "")
            if email and quality in ("high", "medium", "low"):
                update_data["contact_email"] = email
                new_cf["email_quality"] = quality
                new_cf["email_scraped_at"] = "2026-05-18"
                new_cf["email_source"] = "scrapling"

        # Dirigeant (colonnes : contact_firstname / contact_name)
        di = dirig_by_id.get(pid)
        if di and di.get("dirigeant_prenom"):
            update_data["contact_firstname"] = di["dirigeant_prenom"].strip().title()
            if di.get("dirigeant_nom"):
                update_data["contact_name"] = di["dirigeant_nom"].strip().title()
            new_cf["dirigeant_qualite"] = di.get("dirigeant_qualite", "")
            new_cf["dirigeant_source"] = di.get("dirigeant_source", "")
            # SIRET en colonne directe (pas uniquement custom_fields)
            if di.get("siret"):
                update_data["siret"] = di["siret"]
                new_cf["siret"] = di["siret"]

        if not update_data:
            skipped += 1
            continue

        update_data["custom_fields"] = new_cf

        try:
            sb.table("prospects").update(update_data).eq("id", pid).execute()
            updated += 1
        except Exception as e:
            failed += 1
            if failed < 5:
                print(f"  ⚠ update {pid}: {e}")

    print(f"\n=== CRM INJECT DONE ===")
    print(f"Updated : {updated}")
    print(f"Skipped : {skipped}")
    print(f"Failed  : {failed}")


if __name__ == "__main__":
    main()
