#!/usr/bin/env python3
"""
Étape 4 du pipeline LSA : déduplication intra-CSV par phone normalisé.

Un même prospect peut apparaître dans plusieurs CSV niche (paysagiste +
clôture par ex). On garde 1 seule ligne avec la niche prioritaire.

Priorité : cloture > paysagiste > chauffagiste > bardage > pisciniste
À égalité niche : garde celui avec google_review_count le plus élevé.

Input  : data/lsa-03-lowcomp.csv
Output : data/lsa-04-dedup.csv
"""
from __future__ import annotations
import csv
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-03-lowcomp.csv"
OUT_CSV = ROOT / "data" / "lsa-04-dedup.csv"

NICHE_PRIORITY = {
    "cloture": 1,
    "paysagiste": 2,
    "chauffagiste": 3,
    "bardage": 4,
    "pisciniste": 5,
}


def key_for(row: dict) -> tuple[int, int]:
    """Plus petite valeur = meilleure (priorité)."""
    prio = NICHE_PRIORITY.get(row["niche_assigned"], 99)
    try:
        reviews = int(row.get("google_review_count") or 0)
    except ValueError:
        reviews = 0
    # On veut plus de reviews donc on inverse en négatif
    return (prio, -reviews)


def main() -> None:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects lowcomp")

    by_phone: dict[str, dict] = {}
    duplicates_count = 0

    for r in rows:
        phone = r.get("phone", "").strip()
        if not phone:
            continue  # sécurité
        if phone not in by_phone:
            by_phone[phone] = r
        else:
            duplicates_count += 1
            existing = by_phone[phone]
            if key_for(r) < key_for(existing):
                by_phone[phone] = r

    kept = list(by_phone.values())
    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = list(rows[0].keys()) if rows else []
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    print(f"Doublons éliminés : {duplicates_count}")
    print(f"Final unique       : {len(kept)}")
    print()
    niches = Counter(r["niche_assigned"] for r in kept)
    print("Distribution finale par niche :")
    for niche, count in niches.most_common():
        print(f"  {niche:15s} : {count}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
