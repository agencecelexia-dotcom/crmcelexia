#!/usr/bin/env python3
"""
Étape 14 — Fix sync DB CRM avec classification stricte.

Itère sur les 705 prospects de lsa-11-strict-final.csv et fait un UPDATE
en DB par phone normalisé pour chacun. Plus simple et plus sûr que de
charger toute la DB (qui limitait à 1000 rows).

En parallèle, finalise le flag des false positives en cherchant les emails
paused dans le log de reconcile.
"""
from __future__ import annotations
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-11-strict-final.csv"
RECONCILE_LOG = ROOT / "data" / "lsa-12-reconcile-log.json"

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

    # 1. Charge les 705 prospects strict
    strict_rows = []
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                r["phone_norm"] = ph
                strict_rows.append(r)
    print(f"→ {len(strict_rows)} prospects strict avec phone")

    # 2. Pour chaque, fait un UPDATE en DB par phone (LIKE pour gérer formats variés)
    updated = 0
    inserted_skip = 0  # prospects pas en DB
    failed = 0
    by_niche = Counter()

    for i, r in enumerate(strict_rows):
        if i % 50 == 0:
            print(f"  {i}/{len(strict_rows)}... updated={updated}")
        ph = r["phone_norm"]
        new_niche = r["niche_strict"]
        new_singular, new_plural = SOCIETE_LABELS[new_niche]

        # Cherche le prospect en DB par phone (multiple formats possibles)
        # On normalise côté Python plutôt que SQL, donc on tente plusieurs variantes
        variants = {ph, "+33" + ph[1:] if ph.startswith("0") else ph, "33" + ph[1:] if ph.startswith("0") else ph}
        # Lookup direct
        try:
            res = sb.table("prospects").select("id, custom_fields, phone").in_("phone", list(variants)).is_("deleted_at", "null").execute()
            db_rows = res.data or []
        except Exception as e:
            print(f"  ⚠ lookup {ph}: {e}")
            failed += 1
            continue

        if not db_rows:
            inserted_skip += 1
            continue

        for db_row in db_rows:
            old_cf = db_row.get("custom_fields") or {}
            # Supprime le flag false_positive si présent (on a re-confirmé la qualité)
            new_cf = {k: v for k, v in old_cf.items() if k not in ("smartlead_false_positive",)}
            new_cf.update({
                "societe_label": new_singular,
                "societes_label": new_plural,
                "niche_strict": new_niche,
                "confidence_score": int(r.get("confidence_score") or 0),
                "google_rating": float(r["google_rating"]) if r.get("google_rating") else None,
                "google_review_count": int(r["google_review_count"]) if r.get("google_review_count") else None,
                "competitors_count_lsa": int(r["competitors_count_lsa"]) if r.get("competitors_count_lsa") else None,
                "category_google": r.get("category_google", ""),
                "city_matched": r.get("city_matched", ""),
                "lsa_lowcomp_strict_2026Q2": True,
            })
            try:
                sb.table("prospects").update({
                    "custom_fields": new_cf,
                    "profession": new_niche,
                    "niche": new_niche,
                }).eq("id", db_row["id"]).execute()
                updated += 1
                by_niche[new_niche] += 1
            except Exception as e:
                failed += 1
                if failed < 5:
                    print(f"  ⚠ {db_row['id']}: {e}")

    print(f"\n=== DB SYNC DONE ===")
    print(f"Updated : {updated}")
    print(f"Not in DB : {inserted_skip}")
    print(f"Failed : {failed}")
    print()
    print("Distribution updates par niche stricte :")
    for n, c in by_niche.most_common():
        print(f"  {n:15s} : {c}")

    # 3. Finalise le flag false positives (les emails paused dans Smartlead pas trouvés en DB)
    if RECONCILE_LOG.exists():
        log = json.loads(RECONCILE_LOG.read_text())
        pause_details = log.get("pause_details", [])
        print(f"\n→ Finalise flag false positives ({len(pause_details)} emails à flagger)...")
        fp_emails = [p["email"].lower().strip() for p in pause_details if p.get("email")]
        # Tente plusieurs variantes : exact, lower, et ilike pattern
        flagged_extra = 0
        for i in range(0, len(fp_emails), 100):
            batch = fp_emails[i:i+100]
            try:
                # ilike batch via OR
                or_clauses = ",".join([f"contact_email.ilike.{e}" for e in batch])
                res = sb.table("prospects").select("id, custom_fields, contact_email").or_(or_clauses).is_("deleted_at", "null").execute()
                for row in (res.data or []):
                    old_cf = row.get("custom_fields") or {}
                    if old_cf.get("smartlead_false_positive"):
                        continue
                    # Skip si on a re-validé ce prospect dans la pass précédente
                    if old_cf.get("lsa_lowcomp_strict_2026Q2"):
                        continue
                    new_cf = {**old_cf, "smartlead_false_positive": True, "smartlead_paused_at": "2026-05-18T00:00:00Z", "smartlead_pause_reason": "wrong_niche_classification"}
                    try:
                        sb.table("prospects").update({"custom_fields": new_cf}).eq("id", row["id"]).execute()
                        flagged_extra += 1
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ⚠ batch {i}: {e}")
        print(f"  Flagués extra : {flagged_extra}")


if __name__ == "__main__":
    main()
