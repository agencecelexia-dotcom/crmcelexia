#!/usr/bin/env python3
"""
Étape 9 du pipeline LSA : join final des CSV intermédiaires pour produire
le CSV LIVRABLE avec toutes les infos consolidées.

Input :
  - data/lsa-07-emails-validated.csv (1600 lignes : email + niche + ville + tel + competitors)
  - data/lsa-08-dirigeants-clean.csv (774 lignes : prénom + nom + SIRET + ville INSEE)

Join par `id`.

Output : data/lsa-09-final-livrable.csv
"""
from __future__ import annotations
import csv
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EMAILS = ROOT / "data" / "lsa-07-emails-validated.csv"
DIRIGEANTS = ROOT / "data" / "lsa-08-dirigeants-clean.csv"
OUT = ROOT / "data" / "lsa-09-final-livrable.csv"


def title_case(s: str) -> str:
    """ROMAIN → Romain, JEAN-MARC → Jean-Marc."""
    if not s:
        return ""
    words = []
    for word in s.split():
        words.append("-".join(p.capitalize() for p in word.split("-")))
    return " ".join(words).strip()


def clean_nom(s: str) -> str:
    """'BLONDEL (BLONDEL)' → 'Blondel'."""
    if not s:
        return ""
    s = s.split("(")[0].strip()
    return title_case(s)


def main() -> None:
    emails = list(csv.DictReader(open(EMAILS)))
    dirigeants = list(csv.DictReader(open(DIRIGEANTS)))
    dir_by_id = {r["id"]: r for r in dirigeants}

    print(f"Emails validés : {len(emails)}")
    print(f"Dirigeants : {len(dirigeants)} (cleaned)")

    final = []
    for r in emails:
        if r.get("validation_status") != "ok":
            continue
        d = dir_by_id.get(r["id"], {})

        # Choisir la meilleure source de ville : ville_insee (officielle) > city_matched (LSA)
        ville_final = title_case(d.get("ville_insee") or "") or r.get("city_matched", "")

        final.append({
            "id": r["id"],
            "company_name": r["company_name"],
            "phone": r["phone"],
            "best_email": r["best_email"],
            "best_email_quality": r["best_email_quality"],
            "dirigeant_prenom": title_case(d.get("dirigeant_prenom", "")),
            "dirigeant_nom": clean_nom(d.get("dirigeant_nom", "")),
            "dirigeant_full": d.get("dirigeant_full", ""),
            "dirigeant_source": d.get("dirigeant_source", ""),  # 'siret_insee' ou 'mentions_legales'
            "ville": ville_final,
            "niche": r["niche_assigned"],
            "niche_source_csv": r["niche_source"],
            "competitors_count_lsa": r["competitors_count_lsa"],
            "google_rating": r["google_rating"],
            "google_review_count": r["google_review_count"],
            "category_google": r["category_google"],
            "website": r["website"],
            "google_maps_url": r["google_maps_url"],
            "code_naf": d.get("code_naf", ""),
            "siret": d.get("siret_trouve", ""),
            "date_creation": d.get("date_creation", ""),
            "tranche_effectif": d.get("tranche_effectif", ""),
        })

    # Stats
    with_dirigeant = sum(1 for r in final if r["dirigeant_prenom"])
    with_ville = sum(1 for r in final if r["ville"])
    with_siret = sum(1 for r in final if r["siret"])
    high_quality = sum(1 for r in final if r["dirigeant_source"] == "siret_insee")

    OUT.parent.mkdir(exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(final[0].keys()))
        w.writeheader()
        w.writerows(final)

    print()
    print("=== JOIN FINAL DONE ===")
    print(f"Prospects livrables   : {len(final)}")
    print(f"  Avec email          : {len(final)} (tous validés MX)")
    print(f"  Avec dirigeant      : {with_dirigeant} ({100*with_dirigeant/len(final):.0f}%)")
    print(f"    ★ SIRET officiel : {high_quality}")
    print(f"    ≈ mentions légales: {with_dirigeant - high_quality}")
    print(f"  Avec ville          : {with_ville} ({100*with_ville/len(final):.0f}%)")
    print(f"  Avec SIRET          : {with_siret}")
    print()
    by_niche = Counter(r["niche"] for r in final)
    print("Distribution par niche :")
    for n, c in by_niche.most_common():
        n_d = sum(1 for r in final if r["niche"] == n and r["dirigeant_prenom"])
        print(f"  {n:15s} : {c} ({n_d} avec dirigeant)")
    print()
    by_ville = Counter(r["ville"] for r in final if r["ville"])
    print("Top 15 villes :")
    for v, c in by_ville.most_common(15):
        print(f"  {v:25s} : {c}")
    print(f"\nCSV : {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
