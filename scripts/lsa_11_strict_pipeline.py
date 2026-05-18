#!/usr/bin/env python3
"""
Étape 11 — Pipeline complet sur les prospects strictement reclassifiés.

Prend `data/lsa-10-strict.csv` (15 823 prospects avec niche_strict) et applique
en un seul passage :
  1. Filtre qualité Google (rating ≥ 4.5 OU (≥4.3 ET ≥100 avis), ≥3 avis, phone)
  2. Résolution ville (match dans la matrice)
  3. Filtre concurrence LSA ≤ 3
  4. Dédup intra par phone (priorité par confidence_score puis review_count)

Output : data/lsa-11-strict-final.csv
"""
from __future__ import annotations
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-10-strict.csv"
MATRIX_CSV = ROOT / "csv" / "matrice_villes_metiers - matrice_villes_metiers.csv (2).csv"
OUT_CSV = ROOT / "data" / "lsa-11-strict-final.csv"

NICHE_TO_COLUMN = {
    "paysagiste": "Paysagiste",
    "cloture": "cloture",
    "chauffagiste": "Chauffagiste",
    "bardage": "bardage",
    "pisciniste": "Pisciniste",
}

MAX_COMPETITORS = 3
NICHE_PRIORITY = {"cloture": 5, "paysagiste": 4, "chauffagiste": 3, "bardage": 2, "pisciniste": 1}


def deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def load_cities() -> list[str]:
    with MATRIX_CSV.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        return [row[0].strip() for row in reader if row and row[0].strip()]


def build_city_lookup(cities: list[str]) -> list[tuple[str, re.Pattern]]:
    out = []
    for city in sorted(cities, key=len, reverse=True):
        norm = deaccent(city.lower())
        pat = re.compile(r"\b" + re.escape(norm).replace(r"\-", r"[-\s]?") + r"\b", re.IGNORECASE)
        out.append((city, pat))
    return out


def match_city(text: str, lookup) -> str:
    norm = deaccent(text.lower())
    for city, pat in lookup:
        if pat.search(norm):
            return city
    return ""


def load_matrix() -> dict[tuple[str, str], int]:
    with MATRIX_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        out: dict[tuple[str, str], int] = {}
        for row in reader:
            ville = (row.get("Ville") or "").strip()
            if not ville:
                continue
            for col, val in row.items():
                if col == "Ville" or val is None:
                    continue
                try:
                    out[(ville, col)] = int(val.strip())
                except (ValueError, AttributeError):
                    continue
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
    cities = load_cities()
    city_lookup = build_city_lookup(cities)
    matrix = load_matrix()
    print(f"Matrice : {len(cities)} villes, {len(matrix)} cellules")

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects strictement classifiés")
    print()

    reject_reasons: Counter[str] = Counter()
    after_quality: list[dict] = []

    # 1. Quality + city
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

        city = match_city(r["company_name"] + " " + r["category_google"] + " " + r["address"], city_lookup)
        r["city_matched"] = city
        r["phone_norm"] = phone_norm
        after_quality.append(r)

    print(f"Après qualité : {len(after_quality)}/{len(rows)} ({100*len(after_quality)/len(rows):.0f}%)")

    # 2. Competition
    after_compete: list[dict] = []
    for r in after_quality:
        city = r["city_matched"]
        niche = r["niche_strict"]
        if not city:
            reject_reasons["no_city"] += 1
            continue
        col = NICHE_TO_COLUMN.get(niche)
        if not col:
            reject_reasons["no_niche_mapping"] += 1
            continue
        n = matrix.get((city, col))
        if n is None:
            reject_reasons["city_not_in_matrix"] += 1
            continue
        if n > MAX_COMPETITORS:
            reject_reasons[f"competitors>{MAX_COMPETITORS}"] += 1
            continue
        r["competitors_count_lsa"] = n
        after_compete.append(r)

    print(f"Après concurrence ≤3 : {len(after_compete)}/{len(after_quality)} ({100*len(after_compete)/max(len(after_quality),1):.0f}%)")

    # 3. Dedup intra par phone (priorité niche puis confidence_score puis reviews)
    by_phone: dict[str, dict] = {}
    for r in after_compete:
        ph = r["phone_norm"]
        if not ph:
            continue
        if ph not in by_phone:
            by_phone[ph] = r
            continue
        existing = by_phone[ph]
        # Garde le meilleur : priorité niche, puis confidence, puis reviews
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
    print(f"Après dédup phone : {len(kept)}/{len(after_compete)} ({100*len(kept)/max(len(after_compete),1):.0f}%)")
    print()

    # Write
    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = list(kept[0].keys())
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    print("=== STRICT PIPELINE DONE ===")
    print(f"Final : {len(kept)} prospects livrables")
    print()
    print("Rejets :")
    for reason, count in reject_reasons.most_common():
        print(f"  {reason:30s} : {count}")
    print()
    print("Distribution finale par niche stricte :")
    for niche, count in Counter(r["niche_strict"] for r in kept).most_common():
        print(f"  {niche:15s} : {count}")
    print()
    print(f"CSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
