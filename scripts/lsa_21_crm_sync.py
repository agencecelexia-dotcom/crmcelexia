#!/usr/bin/env python3
"""
Étape 21 — Sync CRM avec la liste strict qualifiée (sans concurrence).

Règles (validées par user) :
  - Nouveau prospect strict pas en DB → INSERT
  - Prospect strict en DB + call_count=0 + last_called_at IS NULL → UPDATE
  - Prospect strict en DB + déjà appelé → SKIP (préserve historique)
  - Prospect DB jamais appelé + NOT dans nouveau strict → HARD DELETE

Ne touche PAS Smartlead (le user veut clean CRM d'abord, puis utilisera
son propre outil de scraping email).
"""
from __future__ import annotations
import csv
import re
import sys
from collections import Counter
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-20-strict-qualified.csv"

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


def parse_city_from_address(address: str) -> str | None:
    """Extract city from address: '12 rue X, 75001 Paris' → 'Paris'."""
    if not address:
        return None
    m = re.search(r"\d{5}\s+([A-Za-zÀ-ÿ][^,]+)", address)
    if m:
        return m.group(1).strip()[:100]
    return None


def build_custom_fields(r: dict, existing: dict | None = None) -> dict:
    niche = r["niche_strict"]
    singular, plural = SOCIETE_LABELS[niche]
    base = dict(existing) if existing else {}
    # Supprime flags obsolètes
    for k in ("smartlead_false_positive", "smartlead_paused_at", "smartlead_pause_reason"):
        base.pop(k, None)
    base.update({
        "societe_label": singular,
        "societes_label": plural,
        "niche_strict": niche,
        "confidence_score": int(r.get("confidence_score") or 0),
        "google_rating": float(r["google_rating"]) if r.get("google_rating") else None,
        "google_review_count": int(r["google_review_count"]) if r.get("google_review_count") else None,
        "category_google": r.get("category_google", ""),
        "google_maps_url": r.get("google_maps_url", ""),
        "lsa_strict_2026Q2": True,
    })
    return base


def main() -> None:
    env = load_env()
    sb = create_client(env["VITE_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    # 1. Charge strict (phone → row)
    strict_by_phone: dict[str, dict] = {}
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                r["phone_norm"] = ph
                strict_by_phone[ph] = r
    print(f"→ {len(strict_by_phone)} prospects strict (phones uniques)")

    # 2. Charge TOUTE la DB CRM (paginé)
    print("→ Chargement DB CRM (paginé)...")
    db_rows: list[dict] = []
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, phone, call_count, last_called_at, custom_fields, status, profession, niche"
        ).is_("deleted_at", "null").range(offset, offset + 999).execute()
        batch = res.data or []
        db_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"  DB total : {len(db_rows)} prospects actifs")

    db_by_phone: dict[str, dict] = {}
    for d in db_rows:
        ph = normalize_phone(d.get("phone") or "")
        if ph:
            # Si plusieurs prospects ont le même phone, garde celui avec call_count le plus haut
            existing = db_by_phone.get(ph)
            if not existing or (d.get("call_count") or 0) > (existing.get("call_count") or 0):
                db_by_phone[ph] = d

    # Récupère un commercial_id par défaut
    res = sb.table("prospects").select("commercial_id").not_.is_("commercial_id", "null").limit(1).execute()
    if not res.data:
        print("ERREUR : aucun commercial_id trouvé", file=sys.stderr)
        return
    default_commercial_id = res.data[0]["commercial_id"]
    print(f"  Commercial_id par défaut : {default_commercial_id}")
    print()

    # 3. Plan d'action
    to_insert: list[dict] = []
    to_update: list[tuple[str, dict, dict]] = []  # (id, update_data, strict_row)
    to_skip_already_called: list[str] = []
    to_delete: list[str] = []  # ids DB pas dans strict + jamais appelés

    for ph, s in strict_by_phone.items():
        db_match = db_by_phone.get(ph)
        if not db_match:
            to_insert.append(s)
            continue
        call_count = db_match.get("call_count") or 0
        last_called = db_match.get("last_called_at")
        if call_count > 0 or last_called:
            to_skip_already_called.append(db_match["id"])
            continue
        # Jamais appelé → UPDATE
        niche = s["niche_strict"]
        update_data = {
            "company_name": s.get("company_name", "").strip()[:200] or None,
            "profession": niche,
            "niche": niche,
            "address": s.get("address", "")[:500] or None,
            "city": parse_city_from_address(s.get("address", "")) or db_match.get("city"),
            "website": s.get("website", "") or None,
            "custom_fields": build_custom_fields(s, db_match.get("custom_fields")),
        }
        to_update.append((db_match["id"], update_data, s))

    # Prospects DB jamais appelés + pas dans strict
    for ph, d in db_by_phone.items():
        if ph in strict_by_phone:
            continue
        call_count = d.get("call_count") or 0
        last_called = d.get("last_called_at")
        if call_count == 0 and not last_called:
            to_delete.append(d["id"])

    print("=== PLAN D'ACTION ===")
    print(f"INSERT (nouveaux strict)         : {len(to_insert)}")
    print(f"UPDATE (strict + jamais appelés) : {len(to_update)}")
    print(f"SKIP (strict + déjà appelés)     : {len(to_skip_already_called)}")
    print(f"DELETE (DB jamais appelé + pas dans strict) : {len(to_delete)}")
    print()

    # 4. Exécution
    # 4a. INSERT
    print(f"→ INSERT {len(to_insert)} nouveaux prospects...")
    inserted = 0
    insert_failed = 0
    for i, s in enumerate(to_insert):
        if i % 200 == 0:
            print(f"  {i}/{len(to_insert)}... inserted={inserted}")
        niche = s["niche_strict"]
        cf = build_custom_fields(s)
        row = {
            "company_name": s.get("company_name", "").strip()[:200] or "Sans nom",
            "phone": s["phone_norm"],
            "profession": niche,
            "niche": niche,
            "city": parse_city_from_address(s.get("address", "")),
            "address": s.get("address", "")[:500] or None,
            "website": s.get("website", "") or None,
            "status": "nouveau",
            "source": "csv_import",
            "commercial_id": default_commercial_id,
            "custom_fields": cf,
        }
        try:
            sb.table("prospects").insert(row).execute()
            inserted += 1
        except Exception as e:
            insert_failed += 1
            if insert_failed < 3:
                print(f"  ⚠ insert {s.get('company_name','?')[:40]}: {e}")
    print(f"  Inserted: {inserted}, Failed: {insert_failed}")
    print()

    # 4b. UPDATE
    print(f"→ UPDATE {len(to_update)} prospects strict jamais appelés...")
    updated = 0
    update_failed = 0
    for i, (pid, data, s) in enumerate(to_update):
        if i % 200 == 0:
            print(f"  {i}/{len(to_update)}... updated={updated}")
        try:
            sb.table("prospects").update(data).eq("id", pid).execute()
            updated += 1
        except Exception as e:
            update_failed += 1
            if update_failed < 3:
                print(f"  ⚠ update {pid}: {e}")
    print(f"  Updated: {updated}, Failed: {update_failed}")
    print()

    # 4c. DELETE (hard delete des prospects DB jamais appelés et plus dans strict)
    print(f"→ DELETE {len(to_delete)} prospects DB obsolètes (jamais appelés)...")
    deleted = 0
    delete_failed = 0
    for i in range(0, len(to_delete), 100):
        batch = to_delete[i:i+100]
        try:
            sb.table("prospects").delete().in_("id", batch).execute()
            deleted += len(batch)
        except Exception as e:
            delete_failed += len(batch)
            print(f"  ⚠ delete batch {i}: {e}")
        if i % 1000 == 0:
            print(f"  {i}/{len(to_delete)}... deleted={deleted}")
    print(f"  Deleted: {deleted}, Failed: {delete_failed}")
    print()

    print("=== CRM SYNC DONE ===")
    print(f"  Inserted : {inserted}")
    print(f"  Updated  : {updated}")
    print(f"  Skipped  : {len(to_skip_already_called)} (déjà appelés, préservés)")
    print(f"  Deleted  : {deleted}")
    print()
    # Distribution finale par niche dans le CSV
    n_dist = Counter(r["niche_strict"] for r in strict_by_phone.values())
    print("Distribution finale par niche stricte :")
    for niche, count in n_dist.most_common():
        print(f"  {niche:15s} : {count}")


if __name__ == "__main__":
    main()
