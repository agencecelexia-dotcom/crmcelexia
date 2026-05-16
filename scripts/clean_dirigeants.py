#!/usr/bin/env python3
"""
Post-cleanup du CSV prospects-dirigeants.csv :
- Coupe les noms tronqués ("RIVALIN Aurélien Réalisation du site" → "RIVALIN Aurélien")
- Vire les faux positifs résiduels ("Propriétaire du site", "Le site internet https", etc.)
- Recalcule dirigeant_prenom / dirigeant_nom proprement

Lit : data/prospects-dirigeants.csv
Écrit : data/prospects-dirigeants-clean.csv
"""
from __future__ import annotations
import csv
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = Path(os.environ.get("CLEAN_DIR_INPUT", str(ROOT / "data" / "prospects-dirigeants.csv")))
OUT_CSV = Path(os.environ.get("CLEAN_DIR_OUTPUT", str(ROOT / "data" / "prospects-dirigeants-clean.csv")))

# Tokens-marqueurs : on coupe le nom dès qu'on en croise un (après les noms initiaux)
TRUNCATE_WORDS = re.compile(
    r"\s+(?:r[ée]alisation|webmaster|h[ée]berg(?:eur|ement)|propri[ée]taire|"
    r"responsable|le\s+site|du\s+site|raison\s+sociale|edition|[ée]dition|"
    r"r[ée]daction|d[ûu]ment|nom\s+ou|contact|copyright|©|\.|,|;|-\s|—|·|·)",
    re.IGNORECASE,
)

# Mots qui invalident complètement le nom (= bruit pur)
INVALID_NAME_WORDS = re.compile(
    r"\b(?:site|raison\s+sociale|propri[ée]taire|webmaster|h[ée]berg|"
    r"responsable\s+(?:de\s+)?(?:la\s+)?publication|"
    r"le\s+site\s+internet|du\s+site|nom\s+ou)\b",
    re.IGNORECASE,
)

# Pseudonymes / prénoms aléatoires détectés comme faux positifs
PSEUDO_NAMES = {"roosevelt", "lorem", "ipsum", "john doe", "jane doe"}


def clean_dirigeant(full: str) -> str:
    """Strip le bruit après le vrai nom."""
    if not full:
        return ""
    # 1. Coupe au premier mot-marqueur
    m = TRUNCATE_WORDS.search(full)
    if m:
        full = full[: m.start()]
    full = full.strip(" .,-;:|/\t\n")
    # 2. Pseudo-noms isolés → invalide
    if full.lower() in PSEUDO_NAMES:
        return ""
    # 3. Vérifie qu'il reste un nom plausible
    parts = full.split()
    if not parts or len(parts) > 5:
        return ""
    # Au moins 2 tokens ou 1 token long (>=4 chars)
    if len(parts) < 2 and len(parts[0]) < 4:
        return ""
    return full


def split_prenom_nom(full: str) -> tuple[str, str]:
    parts = [p for p in full.split() if p]
    if len(parts) < 2:
        return ("", full)
    upper = [p for p in parts if p.isupper() and len(p) > 1]
    mixed = [p for p in parts if not (p.isupper() and len(p) > 1)]
    if upper and mixed:
        return (" ".join(mixed), " ".join(upper))
    return (parts[0], " ".join(parts[1:]))


def main() -> None:
    if not IN_CSV.exists():
        print(f"ERREUR : {IN_CSV} introuvable")
        return

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    cleaned_count = 0
    invalidated_count = 0
    untouched = 0

    for r in rows:
        if r["status"] != "ok_mentions":
            untouched += 1
            continue

        original = r["dirigeant_full"]
        # Invalider si le nom commence par un mot-marqueur (bruit pur)
        if INVALID_NAME_WORDS.search(original):
            # Tente quand même de couper et voir s'il reste qqch
            new_full = clean_dirigeant(original)
            if not new_full or INVALID_NAME_WORDS.search(new_full):
                r["dirigeant_full"] = ""
                r["dirigeant_prenom"] = ""
                r["dirigeant_nom"] = ""
                r["status"] = "no_dirigeant_found"
                invalidated_count += 1
                continue

        new_full = clean_dirigeant(original)
        if new_full != original:
            r["dirigeant_full"] = new_full
            if new_full:
                prenom, nom = split_prenom_nom(new_full)
                r["dirigeant_prenom"] = prenom
                r["dirigeant_nom"] = nom
                cleaned_count += 1
            else:
                r["dirigeant_prenom"] = ""
                r["dirigeant_nom"] = ""
                r["status"] = "no_dirigeant_found"
                invalidated_count += 1

    # Écrire
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    # Stats finales
    with_dirigeant = sum(1 for r in rows if r["dirigeant_full"])
    insee = sum(1 for r in rows if r["status"] == "ok_insee")
    mentions = sum(1 for r in rows if r["status"] == "ok_mentions")
    print("=== CLEANUP DONE ===")
    print(f"Lignes traitées       : {len(rows)}")
    print(f"  intactes            : {untouched}")
    print(f"  nettoyées (tronquées): {cleaned_count}")
    print(f"  invalidées (bruit)  : {invalidated_count}")
    print()
    print(f"Avec dirigeant final  : {with_dirigeant} ({100*with_dirigeant/len(rows):.0f}%)")
    print(f"  ★ ok_insee          : {insee}")
    print(f"  ≈ ok_mentions       : {mentions}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
