#!/usr/bin/env python3
"""
Étape 10 — Reclassification STRICTE des 23 986 prospects bruts.

Approche : pour chaque prospect, on calcule un score par niche en cherchant
des mots-clés FORTS (poids 3), FAIBLES (poids 1) et NÉGATIFS (poids -3).
La niche assignée = celle au score max. Si score max < 3 (= pas même un
mot-clé fort), on REJETTE le prospect (pas classifiable).

Le signal est analysé dans : company_name + category_google + niche_source.

Input  : data/lsa-01-normalized.csv (23 986 prospects bruts)
Output : data/lsa-10-strict.csv (avec niche_strict + confidence_score)
"""
from __future__ import annotations
import csv
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-01-normalized.csv"
OUT_CSV = ROOT / "data" / "lsa-10-strict.csv"

# Mots-clés par niche : (STRONG, WEAK, NEGATIVE)
KEYWORDS = {
    "paysagiste": {
        "strong": [
            "paysagiste", "paysag", "jardinier", "jardinage", "espaces verts",
            "elagueur", "elagage", "arboriste", "tonte", "creation de jardin",
            "amenagement paysager", "amenagement exterieur", "entretien jardin",
            "amenagement de jardin", "elague",
        ],
        "weak": ["jardin", "vegetal", "vert", "horticole"],
        "negative": [
            "piscine", "spa", "jacuzzi",  # → pisciniste
            "chauffage", "chauffagiste", "plomberie", "plombier", "sanitaire",  # → chauffagiste
            "cloture", "clôture", "portail", "grillage",  # → cloture
            "bardage", "couvreur", "toiture", "façade", "facade", "ravalement",  # → bardage
        ],
    },
    "pisciniste": {
        "strong": [
            "pisciniste", "piscine", "construction de piscine", "construction piscine",
            "renovation piscine", "reparation piscine", "entretien piscine",
            "nettoyage piscine", "bassin", "jacuzzi", "spa de nage",
            "magasin piscine",
        ],
        "weak": ["spa", "hydro"],
        "negative": [
            "spa de soins", "institut de beaute", "esthetique", "massage",
            "bien-etre", "soins corporel", "salon", "hammam",  # spa beauté
            "paysagiste", "jardinier",  # → paysagiste
            "couvreur", "façade", "facade",  # → bardage
            "magasin de spa",  # vendeur, pas pisciniste
        ],
    },
    "chauffagiste": {
        "strong": [
            "chauffagiste", "chauffage", "plombier", "plomberie", "sanitaire",
            "thermique", "chaudiere", "climatisation", "ventilation",
            "pompe a chaleur", "pac", "energie renouvelable", "cvc",
            "depannage chauffage", "installation chauffage",
        ],
        "weak": [],
        "negative": [
            "magasin de materiel",  # revendeur
            "piscine", "spa de soins",
            "paysagiste", "jardinier",
            "cloture", "clôture", "portail",
            "bardage", "couvreur",
        ],
    },
    "cloture": {
        "strong": [
            "cloture", "clôture", "grillage", "portail", "barriere",
            "serrurier metallier", "metallerie", "pose de cloture",
            "pose cloture", "installateur cloture", "fabricant cloture",
        ],
        "weak": ["fermetures", "ferronnerie", "menuiserie alu", "automatisme"],
        "negative": [
            "magasin de stores", "magasin de rideaux", "magasin de fenetres",
            "electricien", "plombier", "chauffagiste",
            "paysagiste pur",  # éviter ; mais "paysagiste cloture" passe
            "piscine",
            "bardage",
        ],
    },
    "bardage": {
        "strong": [
            "bardage", "couvreur", "couverture", "toiture", "façade", "facade",
            "ravalement", "isolation exterieure", "ite", "renovation façade",
            "renovation facade", "etancheite", "zinguerie", "rejointoiement",
        ],
        "weak": ["construction", "renovation", "isolation"],
        "negative": [
            "piscine", "spa", "jacuzzi",
            "paysagiste", "jardinier", "elagueur",
            "chauffage", "plomberie",
            "cloture", "clôture", "portail", "grillage",
            "atelier de menuiserie",  # menuiserie pure pas bardage
        ],
    },
}

# Niche par défaut (du CSV source) si scoring ambigu mais en zone d'acceptation
NICHE_SOURCE_MAP = {
    "paysagiste": "paysagiste",
    "pisciniste": "pisciniste",
    "chauffagiste": "chauffagiste",
    "cloture": "cloture",
    "bardage": "bardage",
}

MIN_CONFIDENCE_SCORE = 3  # au moins 1 mot-clé STRONG


def deaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def score_niche(blob: str, niche: str) -> int:
    """Score d'appartenance à une niche."""
    kw = KEYWORDS[niche]
    s = 0
    for w in kw["strong"]:
        if deaccent(w) in blob:
            s += 3
    for w in kw["weak"]:
        if deaccent(w) in blob:
            s += 1
    for w in kw["negative"]:
        if deaccent(w) in blob:
            s -= 3
    return s


def classify(company_name: str, category_google: str, niche_source: str) -> tuple[str | None, int]:
    """Retourne (niche_assignée, score). None si non classifiable."""
    blob = deaccent((company_name + " " + category_google).lower())
    scores = {n: score_niche(blob, n) for n in KEYWORDS}
    best_niche = max(scores, key=scores.get)
    best_score = scores[best_niche]

    # Si score max < seuil → non classifiable
    if best_score < MIN_CONFIDENCE_SCORE:
        return None, best_score

    return best_niche, best_score


def main() -> None:
    rows = list(csv.DictReader(IN_CSV.open(encoding="utf-8")))
    print(f"Input : {len(rows)} prospects bruts")
    print()

    by_niche = Counter()
    rejected_reasons: Counter[str] = Counter()
    reclassified: Counter[str] = Counter()
    kept: list[dict] = []

    for r in rows:
        niche_strict, score = classify(r["company_name"], r["category_google"], r["niche_source"])
        r["niche_strict"] = niche_strict or ""
        r["confidence_score"] = score
        if niche_strict is None:
            rejected_reasons[f"score<{MIN_CONFIDENCE_SCORE}"] += 1
            continue
        if niche_strict != r["niche_source"]:
            reclassified[f"{r['niche_source']}→{niche_strict}"] += 1
        by_niche[niche_strict] += 1
        kept.append(r)

    # Write
    if kept:
        fieldnames = list(kept[0].keys())
        OUT_CSV.parent.mkdir(exist_ok=True)
        with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(kept)

    print(f"=== CLASSIFICATION STRICTE ===")
    print(f"Conservés : {len(kept)} / {len(rows)} ({100*len(kept)/len(rows):.0f}%)")
    print(f"Rejetés   : {sum(rejected_reasons.values())}")
    print()
    print("Distribution par niche stricte :")
    for n, c in by_niche.most_common():
        print(f"  {n:15s} : {c}")
    print()
    print("Top reclassifications (niche_source ≠ niche_strict) :")
    for change, c in reclassified.most_common(15):
        print(f"  {change:25s} : {c}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
