#!/usr/bin/env python3
"""
Étape 1 du pipeline LSA : normalisation des 5 CSV niche vers un schéma unique.

Les fichiers sources ont 3 schémas différents (selon date de scrape) :

Schéma A (cloture, chauffagiste, paysagiste) :
  maps, nom, note, avis, metier, ' adresse', tel, site

Schéma B1 (bardage) :
  page maps, Nom entreprise, Metier, '' (=adresse), telephone, site web, etoile, nombre

Schéma B2 (pisiciniste) :
  page maps, Nom entreprise, etoile, nombre, Metier, '' (=adresse), telephone, site web

Output schéma uniforme :
  niche_source, company_name, google_maps_url, google_rating, google_review_count,
  category_google, address, city, phone, website

Sortie : data/lsa-01-normalized.csv
"""
from __future__ import annotations
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_DIR = ROOT / "csv"
OUT_CSV = ROOT / "data" / "lsa-01-normalized.csv"

# Mapping nom fichier → niche normalisée
NICHE_BY_FILE = {
    "bardage": "bardage",
    "chauffagiste": "chauffagiste",
    "cloture": "cloture",
    "paysagiste": "paysagiste",
    "pisiciniste": "pisciniste",  # corrige typo nom fichier
}

# Aliases pour détecter les colonnes peu importe l'ordre/casse
COL_ALIASES = {
    "maps_url": ("maps", "page maps", "fiche maps", "google_maps"),
    "company_name": ("nom", "nom entreprise", "company", "raison sociale"),
    "rating": ("note", "etoile", "rating"),
    "review_count": ("avis", "nombre", "nb avis", "review_count"),
    "category": ("metier", "category", "categorie"),
    "address": ("adresse", "address"),
    "phone": ("tel", "telephone", "phone"),
    "website": ("site", "site web", "website", "url"),
}

CITY_RE = re.compile(r"\b(\d{5})\s+([A-ZÀ-Ÿ][^,\n]+)")


def detect_columns(header: list[str]) -> dict[str, int]:
    """Retourne {champ_normalisé: index_colonne} en se basant sur les aliases."""
    norm = [h.strip().lower() for h in header]
    mapping: dict[str, int] = {}
    for field, aliases in COL_ALIASES.items():
        for i, name in enumerate(norm):
            if name in aliases:
                mapping[field] = i
                break
    # Cas spécial : la colonne adresse est parfois VIDE dans le header mais c'est l'adresse
    # On la trouve par position : la 4e colonne (idx 3) dans B1/B2 et 5e (idx 4) dans A
    if "address" not in mapping:
        # Schéma B1/B2 : header[3] = '' OU header[5] = ''
        for i, name in enumerate(norm):
            if name == "" and 2 < i < 6:
                # Vérifier que ce n'est pas déjà une autre colonne
                if i not in mapping.values():
                    mapping["address"] = i
                    break
    return mapping


def parse_rating(raw: str) -> float | None:
    """4,6 → 4.6, 4.6 → 4.6, vide → None."""
    if not raw or not raw.strip():
        return None
    raw = raw.strip().replace(",", ".")
    try:
        v = float(raw)
        if 0 <= v <= 5:
            return v
    except ValueError:
        pass
    return None


def parse_review_count(raw: str) -> int | None:
    """'-32' → 32, '32 avis' → 32, vide → None."""
    if not raw or not raw.strip():
        return None
    # Garde uniquement les chiffres
    digits = re.sub(r"[^\d]", "", raw)
    if not digits:
        return None
    return int(digits)


def normalize_phone(raw: str) -> str:
    """01 23 45 67 89 → 0123456789 ; +33 1 23... → 01... ; vide → ''."""
    if not raw:
        return ""
    digits = re.sub(r"[^\d]", "", raw)
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if len(digits) == 10 and digits.startswith("0"):
        return digits
    if len(digits) == 9:
        return "0" + digits  # cas où le 0 a sauté
    return digits if digits else ""


def extract_city(address: str) -> str:
    """'12 rue X, 75001 Paris' → 'Paris'."""
    if not address:
        return ""
    m = CITY_RE.search(address)
    if m:
        return m.group(2).strip().title()
    return ""


def normalize_row(row: list[str], cols: dict[str, int], niche_source: str) -> dict | None:
    """Convertit une ligne brute en dict normalisé. Retourne None si vide."""
    def get(field: str) -> str:
        idx = cols.get(field)
        if idx is None or idx >= len(row):
            return ""
        return (row[idx] or "").strip()

    company = get("company_name")
    if not company:
        return None  # ligne vide

    phone = normalize_phone(get("phone"))
    address = get("address")
    city = extract_city(address)

    return {
        "niche_source": niche_source,
        "company_name": company,
        "google_maps_url": get("maps_url"),
        "google_rating": parse_rating(get("rating")) or "",
        "google_review_count": parse_review_count(get("review_count")) or "",
        "category_google": get("category"),
        "address": address,
        "city": city,
        "phone": phone,
        "website": get("website"),
    }


def main() -> None:
    csv_files = sorted(CSV_DIR.glob("*.csv"))
    csv_files = [f for f in csv_files if "matrice" not in f.name.lower()]

    print(f"Fichiers détectés : {len(csv_files)}")
    for f in csv_files:
        print(f"  - {f.name}")
    print()

    all_rows: list[dict] = []
    per_file_stats: list[tuple] = []

    for f in csv_files:
        # Identifier niche à partir du nom
        name_lower = f.name.lower()
        niche = None
        for key, value in NICHE_BY_FILE.items():
            if key in name_lower:
                niche = value
                break
        if not niche:
            print(f"  ⚠ Niche non identifiée pour {f.name} → skip")
            continue

        with f.open(encoding="utf-8") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            cols = detect_columns(header)
            count_total = 0
            count_kept = 0
            for row in reader:
                count_total += 1
                normalized = normalize_row(row, cols, niche)
                if normalized:
                    all_rows.append(normalized)
                    count_kept += 1
            per_file_stats.append((f.name, niche, count_total, count_kept))
            print(f"  {niche:14s} | {count_kept:>5}/{count_total:<5} | cols={cols}")

    OUT_CSV.parent.mkdir(exist_ok=True)
    fieldnames = [
        "niche_source", "company_name", "google_maps_url",
        "google_rating", "google_review_count", "category_google",
        "address", "city", "phone", "website",
    ]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    print()
    print("=== NORMALISATION DONE ===")
    print(f"Total lignes normalisées : {len(all_rows)}")
    print(f"  Avec téléphone valide  : {sum(1 for r in all_rows if r['phone'])}")
    print(f"  Avec rating Google     : {sum(1 for r in all_rows if r['google_rating'])}")
    print(f"  Avec nb avis Google    : {sum(1 for r in all_rows if r['google_review_count'])}")
    print(f"  Avec ville extraite    : {sum(1 for r in all_rows if r['city'])}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
