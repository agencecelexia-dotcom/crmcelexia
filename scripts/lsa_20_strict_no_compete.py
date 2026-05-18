#!/usr/bin/env python3
"""
Étape 20 — Pipeline strict SANS filtre concurrence LSA.

Le user demande : on garde le scoring strict (niches cohérentes) + qualité
Google, mais on n'applique PAS le filtre matrice concurrence ville×niche
parce que le scraping a été fait sur des villes adjacentes (pas exactement
celles de la matrice), donc le filtre rejette injustement des prospects.

Input  : data/lsa-10-strict.csv (15 823 prospects strictement classifiés)
Output : data/lsa-20-strict-qualified.csv (~8-9k prospects attendus)

Filtres appliqués :
  1. Scoring strict (déjà fait dans lsa_10) — au moins 1 mot-clé fort
  2. Qualité Google : rating ≥ 4.5 OU (≥ 4.3 ET ≥ 100 avis), ≥ 3 avis, phone
  3. Dédup intra par phone normalisé (priorité niche puis confidence puis avis)

PAS de filtre concurrence LSA, PAS d'obligation match ville.
"""
from __future__ import annotations
import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-10-strict.csv"
OUT_CSV = ROOT / "data" / "lsa-20-strict-qualified.csv"

NICHE_PRIORITY = {"cloture": 5, "paysagiste": 4, "chauffagiste": 3, "bardage": 2, "pisciniste": 1}


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


def passes_quality(rating, reviews, phone) -> tuple[bool, str]:
    if not phone:
        return False, "no_phone"
    if rating is None or reviews is None:
        return False, "no_rating_or_reviews"
    if reviews < 3:
        return False, "too_few_reviews"
    if rating >= 4.5:
        return True, ""
    if rating >= 4.3 and reviews >= 100:
        return True, ""
    return False, "rating_too_low"


def main() -> None:
    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects strictement classifiés")
    print()

    reject_reasons: Counter[str] = Counter()
    after_quality: list[dict] = []

    for r in rows:
        try:
            rating = float(r["google_rating"]) if r["google_rating"] else None
        except ValueError:
            rating = None
        try:
            reviews = int(r["google_review_count"]) if r["google_review_count"] else None
        except ValueError:
            reviews = None
        phone_norm = normalize_phone(r["phone"])

        ok, reason = passes_quality(rating, reviews, phone_norm)
        if not ok:
            reject_reasons[reason] += 1
            continue

        r["phone_norm"] = phone_norm
        after_quality.append(r)

    print(f"Après qualité Google : {len(after_quality)}/{len(rows)} ({100*len(after_quality)/len(rows):.0f}%)")
    print()

    # Dédup intra par phone
    by_phone: dict[str, dict] = {}
    for r in after_quality:
        ph = r["phone_norm"]
        if not ph:
            continue
        if ph not in by_phone:
            by_phone[ph] = r
            continue
        existing = by_phone[ph]
        new_score = (
            NICHE_PRIORITY.get(r["niche_strict"], 0),
            int(r.get("confidence_score") or 0),
            int(r.get("google_review_count") or 0),
        )
        old_score = (
            NICHE_PRIORITY.get(existing["niche_strict"], 0),
            int(existing.get("confidence_score") or 0),
            int(existing.get("google_review_count") or 0),
        )
        if new_score > old_score:
            by_phone[ph] = r

    kept = list(by_phone.values())
    print(f"Après dédup phone : {len(kept)}/{len(after_quality)} ({100*len(kept)/max(len(after_quality),1):.0f}%)")
    print()

    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = list(kept[0].keys())
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    print("=== STRICT QUALIFIED (sans concurrence) DONE ===")
    print(f"Final : {len(kept)} prospects qualifiés")
    print()
    print("Rejets qualité :")
    for reason, count in reject_reasons.most_common():
        print(f"  {reason:30s} : {count}")
    print()
    print("Distribution par niche stricte :")
    for niche, count in Counter(r["niche_strict"] for r in kept).most_common():
        print(f"  {niche:15s} : {count}")
    print()
    print(f"CSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
