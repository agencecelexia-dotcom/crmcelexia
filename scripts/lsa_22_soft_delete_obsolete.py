#!/usr/bin/env python3
"""
Étape 22 — Soft-delete les prospects DB obsolètes (jamais appelés + pas
dans strict) qui n'ont pas pu être hard-deleted à cause des FK
(rendez_vous, opportunities, reminders).

Met deleted_at = NOW() : les prospects sortent des listings actifs mais
les FK restent valides.
"""
from __future__ import annotations
import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STRICT_CSV = ROOT / "data" / "lsa-20-strict-qualified.csv"


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

    strict_phones = set()
    with STRICT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ph = r.get("phone_norm") or normalize_phone(r.get("phone", ""))
            if ph:
                strict_phones.add(ph)
    print(f"→ {len(strict_phones)} phones strict")

    # DB jamais appelés
    db_rows = []
    offset = 0
    while True:
        res = sb.table("prospects").select(
            "id, phone, call_count, last_called_at"
        ).is_("deleted_at", "null").range(offset, offset + 999).execute()
        batch = res.data or []
        db_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"→ {len(db_rows)} prospects actifs en DB")

    to_soft_delete = []
    for d in db_rows:
        ph = normalize_phone(d.get("phone") or "")
        if not ph or ph in strict_phones:
            continue
        call_count = d.get("call_count") or 0
        last_called = d.get("last_called_at")
        if call_count == 0 and not last_called:
            to_soft_delete.append(d["id"])

    print(f"→ {len(to_soft_delete)} prospects à soft-delete (jamais appelés + pas dans strict)")

    now = datetime.now(timezone.utc).isoformat()
    soft_deleted = 0
    failed = 0
    for i in range(0, len(to_soft_delete), 200):
        batch = to_soft_delete[i:i+200]
        try:
            sb.table("prospects").update({"deleted_at": now}).in_("id", batch).execute()
            soft_deleted += len(batch)
        except Exception as e:
            failed += len(batch)
            print(f"  ⚠ batch {i}: {e}")
        if i % 1000 == 0:
            print(f"  {i}/{len(to_soft_delete)}... soft_deleted={soft_deleted}")

    print(f"\n=== SOFT DELETE DONE ===")
    print(f"Soft-deleted : {soft_deleted}")
    print(f"Failed       : {failed}")


if __name__ == "__main__":
    main()
