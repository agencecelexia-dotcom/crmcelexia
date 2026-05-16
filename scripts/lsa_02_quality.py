#!/usr/bin/env python3
"""
Étape 2 du pipeline LSA : filtre qualité Google + classification niche +
résolution ville (match par nom dans le company_name).

Input  : data/lsa-01-normalized.csv
Output : data/lsa-02-quality.csv

Filtres appliqués :
  - google_review_count >= 3
  - google_rating >= 4.5 OU (rating >= 4.3 ET review_count >= 100)
  - phone non vide
  - category_google cohérente avec niche_source (sauf exception cloture)

Classification finale `niche_assigned` :
  Si "cloture" / "clôture" / "grillage" dans company_name OU category_google
  → niche_assigned = "cloture"
  Sinon → niche_assigned = niche_source

Résolution ville :
  Match du nom de ville (issu de la matrice) dans company_name + category_google
  + address. Insensible casse, mots entiers. Priorité à la ville la plus longue.
"""
from __future__ import annotations
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-01-normalized.csv"
MATRIX_CSV = ROOT / "csv" / "matrice_villes_metiers - matrice_villes_metiers.csv (2).csv"
OUT_CSV = ROOT / "data" / "lsa-02-quality.csv"

# Mots-clés pour valider la cohérence catégorie ↔ niche source
NICHE_KEYWORDS = {
    "paysagiste": ("paysagiste", "jardinier", "jardin", "espaces verts", "elagage", "élagage"),
    "cloture": ("clôture", "cloture", "grillage", "portail", "barrière", "barriere"),
    "chauffagiste": ("chauffag", "plombier", "plomberie", "sanitaire", "thermique", "chaudière"),
    "bardage": ("bardage", "isolation", "façade", "facade", "menuiserie", "couvreur", "couverture", "rénovation", "renovation", "construction"),
    "pisciniste": ("piscine", "piscinist", "spa", "jacuzzi"),
}

# Mots-clés clôture pour reclassement (override)
CLOTURE_KEYWORDS = ("clôture", "cloture", "grillage", "portail")


def deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def load_cities() -> list[str]:
    """Charge la liste des villes depuis la matrice."""
    with MATRIX_CSV.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # header
        return [row[0].strip() for row in reader if row and row[0].strip()]


def build_city_lookup(cities: list[str]) -> list[tuple[str, str, re.Pattern]]:
    """Pour chaque ville : (nom_canonique, nom_normalisé, regex word-boundary)."""
    out = []
    # Trier par longueur décroissante pour matcher "Saint-Étienne" avant "Étienne"
    for city in sorted(cities, key=len, reverse=True):
        norm = deaccent(city.lower())
        # Regex word-boundary, insensible casse, gère les tirets
        pattern_str = r"\b" + re.escape(norm).replace(r"\-", r"[-\s]?") + r"\b"
        out.append((city, norm, re.compile(pattern_str, re.IGNORECASE)))
    return out


def match_city(text_blob: str, lookup: list) -> str:
    """Retourne le nom canonique de la ville matchée ou ''."""
    norm = deaccent(text_blob.lower())
    for city, _, pat in lookup:
        if pat.search(norm):
            return city
    return ""


def passes_quality(rating: float | None, review_count: int | None, phone: str) -> tuple[bool, str]:
    """Retourne (ok, raison_si_rejet)."""
    if not phone:
        return False, "no_phone"
    if rating is None or review_count is None:
        return False, "no_rating_or_reviews"
    if review_count < 3:
        return False, "too_few_reviews"
    if rating >= 4.5:
        return True, ""
    if rating >= 4.3 and review_count >= 100:
        return True, ""
    return False, "rating_too_low"


def category_matches_niche(category: str, niche_source: str) -> bool:
    """Retourne True si la catégorie Google contient un mot-clé de la niche."""
    if not category:
        return False
    cat_norm = deaccent(category.lower())
    keywords = NICHE_KEYWORDS.get(niche_source, ())
    for kw in keywords:
        if deaccent(kw.lower()) in cat_norm:
            return True
    return False


def classify_niche(company: str, category: str, niche_source: str) -> str:
    """Si 'cloture'/'clôture'/'grillage' dans nom ou catégorie → cloture, sinon niche_source."""
    blob = (company + " " + category).lower()
    blob_norm = deaccent(blob)
    for kw in CLOTURE_KEYWORDS:
        if deaccent(kw.lower()) in blob_norm:
            return "cloture"
    return niche_source


def main() -> None:
    cities = load_cities()
    city_lookup = build_city_lookup(cities)
    print(f"Matrice : {len(cities)} villes chargées")

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Input : {len(rows)} prospects normalisés")
    print()

    kept: list[dict] = []
    reject_reasons: Counter[str] = Counter()
    niche_changes: Counter[str] = Counter()
    city_matched_count = 0

    for r in rows:
        # Parse numeric fields
        try:
            rating = float(r["google_rating"]) if r["google_rating"] else None
        except ValueError:
            rating = None
        try:
            reviews = int(r["google_review_count"]) if r["google_review_count"] else None
        except ValueError:
            reviews = None

        # Filter quality
        ok, reason = passes_quality(rating, reviews, r["phone"])
        if not ok:
            reject_reasons[reason] += 1
            continue

        # Filter category coherence
        cat = r["category_google"]
        niche_source = r["niche_source"]
        if not category_matches_niche(cat, niche_source):
            # Exception cloture : un paysagiste avec "clôture" en nom passe
            blob_lower = deaccent((r["company_name"] + " " + cat).lower())
            has_cloture_kw = any(deaccent(kw.lower()) in blob_lower for kw in CLOTURE_KEYWORDS)
            if not has_cloture_kw:
                reject_reasons["category_mismatch"] += 1
                continue

        # Classification niche
        niche_assigned = classify_niche(r["company_name"], cat, niche_source)
        if niche_assigned != niche_source:
            niche_changes[f"{niche_source}→{niche_assigned}"] += 1

        # Resolve city
        city_blob = r["company_name"] + " " + cat + " " + r["address"]
        city = match_city(city_blob, city_lookup)
        if city:
            city_matched_count += 1

        kept.append({
            **r,
            "niche_assigned": niche_assigned,
            "city_matched": city,
        })

    # Write output
    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = list(rows[0].keys()) + ["niche_assigned", "city_matched"]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    print("=== QUALITY FILTER DONE ===")
    print(f"Conservés : {len(kept)}/{len(rows)} ({100*len(kept)/max(len(rows),1):.0f}%)")
    print()
    print("Rejets :")
    for reason, count in reject_reasons.most_common():
        print(f"  {reason:30s} : {count}")
    print()
    print(f"Reclassifications niche : {sum(niche_changes.values())}")
    for change, count in niche_changes.most_common(10):
        print(f"  {change:25s} : {count}")
    print()
    print(f"Ville matchée : {city_matched_count}/{len(kept)} ({100*city_matched_count/max(len(kept),1):.0f}%)")
    # Distribution finale par niche_assigned
    niches_final = Counter(r["niche_assigned"] for r in kept)
    print("\nDistribution niche_assigned :")
    for niche, count in niches_final.most_common():
        print(f"  {niche:15s} : {count}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
