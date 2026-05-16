#!/usr/bin/env python3
"""
Étape 3 du pipeline LSA : croisement matrice concurrents LSA + filtre ≤ 3.

Input  : data/lsa-02-quality.csv (city_matched, niche_assigned)
Matrice: csv/matrice_villes_metiers - matrice_villes_metiers.csv (2).csv
Output : data/lsa-03-lowcomp.csv

Lookup `(city_matched, niche_assigned)` dans la matrice :
  Mapping niche → colonne matrice
    paysagiste  → 'Paysagiste'
    cloture     → 'cloture' (alias 'Clôture')
    chauffagiste→ 'Chauffagiste'
    bardage     → 'bardage'
    pisciniste  → 'Pisciniste'

Filtre : `competitors_count_lsa <= 3` (et trouvé, pas NaN).
Si city_matched vide OU ville absente de la matrice → rejeté.
"""
from __future__ import annotations
import csv
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-02b-geocoded.csv"
# Fallback si geocoding pas fait
if not IN_CSV.exists():
    IN_CSV = ROOT / "data" / "lsa-02-quality.csv"
MATRIX_CSV = ROOT / "csv" / "matrice_villes_metiers - matrice_villes_metiers.csv (2).csv"
OUT_CSV = ROOT / "data" / "lsa-03-lowcomp.csv"

# Mapping niche_assigned → colonne dans la matrice
NICHE_TO_COLUMN = {
    "paysagiste": "Paysagiste",
    "cloture": "cloture",
    "chauffagiste": "Chauffagiste",
    "bardage": "bardage",
    "pisciniste": "Pisciniste",
}

MAX_COMPETITORS = 3


def load_matrix() -> dict[tuple[str, str], int]:
    """Retourne {(ville, niche_column): nb_concurrents}."""
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
                    n = int(val.strip())
                    out[(ville, col)] = n
                except (ValueError, AttributeError):
                    continue
    return out


def main() -> None:
    matrix = load_matrix()
    print(f"Matrice : {len(matrix)} cellules (ville × niche)")
    print()

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects qualité")
    print()

    kept: list[dict] = []
    reject_reasons: Counter[str] = Counter()
    lowcomp_by_niche: Counter[str] = Counter()

    for r in rows:
        city = (r.get("city_matched") or "").strip()
        niche = (r.get("niche_assigned") or "").strip()
        if not city:
            reject_reasons["no_city"] += 1
            continue
        col = NICHE_TO_COLUMN.get(niche)
        if not col:
            reject_reasons["no_niche_mapping"] += 1
            continue
        n_competitors = matrix.get((city, col))
        if n_competitors is None:
            reject_reasons["city_not_in_matrix"] += 1
            continue
        if n_competitors > MAX_COMPETITORS:
            reject_reasons[f"competitors>{MAX_COMPETITORS}"] += 1
            continue
        r["competitors_count_lsa"] = n_competitors
        kept.append(r)
        lowcomp_by_niche[niche] += 1

    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = list(rows[0].keys()) + ["competitors_count_lsa"]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    print("=== COMPETITION FILTER DONE ===")
    print(f"Conservés : {len(kept)}/{len(rows)} ({100*len(kept)/max(len(rows),1):.0f}%)")
    print()
    print("Rejets :")
    for reason, count in reject_reasons.most_common():
        print(f"  {reason:30s} : {count}")
    print()
    print("Distribution lowcomp par niche :")
    for niche, count in lowcomp_by_niche.most_common():
        print(f"  {niche:15s} : {count}")
    print()
    # Top villes lowcomp
    cities_kept = Counter(r["city_matched"] for r in kept)
    print("Top 15 villes ciblées :")
    for city, count in cities_kept.most_common(15):
        print(f"  {city:25s} : {count}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
