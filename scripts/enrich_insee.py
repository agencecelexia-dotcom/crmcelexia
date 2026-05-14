#!/usr/bin/env python3
"""
Enrichissement des prospects via l'API recherche-entreprises.api.gouv.fr.

Source : API publique gouvernementale (INSEE + INPI), gratuite et sans
clé. Données certifiées par l'état → fiables pour B2B.

Pour chaque prospect, on récupère :
- Dirigeant officiel (nom, prénom, qualité)
- Date de création
- Tranche d'effectif salarié
- NAF officiel
- Adresse normalisée
- Forme juridique exacte
- SIREN / SIRET du siège
- Statut (actif / cessé)
- Score de confiance du matching

Modes :
- Si le prospect a un SIRET → matching exact, confidence='exact'
- Sinon → recherche fuzzy nom+ville, confidence high/medium/low

Usage :
    pip3 install requests
    python3 scripts/enrich_insee.py            # test 20 prospects
    python3 scripts/enrich_insee.py --full     # tous les 4543
"""
from __future__ import annotations
import argparse
import csv
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "prospects-non-contactes.csv"
OUT_CSV = ROOT / "data" / "prospects-enrichis-insee.csv"

API_URL = "https://recherche-entreprises.api.gouv.fr/search"
TIMEOUT = 10
MAX_WORKERS = 7   # ~7 req/s — respect du rate limit de l'API publique
DELAY = 0.05      # petite pause entre 2 requêtes du même worker

# Codes effectif INSEE → libellés humains
EFFECTIF_LABELS = {
    "NN": "Non employeur",
    "00": "0 salarié",
    "01": "1 ou 2 salariés",
    "02": "3 à 5 salariés",
    "03": "6 à 9 salariés",
    "11": "10 à 19 salariés",
    "12": "20 à 49 salariés",
    "21": "50 à 99 salariés",
    "22": "100 à 199 salariés",
    "31": "200 à 249 salariés",
    "32": "250 à 499 salariés",
    "41": "500 à 999 salariés",
    "42": "1 000 à 1 999 salariés",
    "51": "2 000 à 4 999 salariés",
    "52": "5 000 à 9 999 salariés",
    "53": "10 000 salariés et plus",
}


def normalize(s: str) -> str:
    """Normalisation pour comparaison (lowercase, sans accents, sans ponctuation)."""
    if not s:
        return ""
    s = s.lower()
    accents = "àâäáãéèêëíìîïóòôöõúùûüç"
    plain = "aaaaaeeeeiiiiooooouuuuc"
    for a, p in zip(accents, plain):
        s = s.replace(a, p)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Vire les mots stop-words communs
    for w in (" sarl", " sas", " sa", " sasu", " eurl", " sci", " etablissements", " ets"):
        s = s.replace(w, "")
    return s.strip()


def name_similarity(a: str, b: str) -> float:
    """Score 0-1 de similarité entre 2 noms d'entreprise."""
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def api_search(query: str) -> list[dict]:
    """Appelle l'API et retourne les résultats."""
    try:
        r = requests.get(API_URL, params={"q": query, "per_page": 5}, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json().get("results", [])
    except Exception:
        pass
    return []


def extract_dirigeant(result: dict) -> dict:
    """Extrait le premier dirigeant (souvent le gérant principal)."""
    dirigeants = result.get("dirigeants") or []
    if not dirigeants:
        return {"dirigeant_nom": "", "dirigeant_prenom": "", "dirigeant_qualite": ""}
    d = dirigeants[0]
    return {
        "dirigeant_nom": d.get("nom") or "",
        "dirigeant_prenom": d.get("prenoms") or "",
        "dirigeant_qualite": d.get("qualite") or "",
    }


def extract_row(prospect: dict, result: dict, confidence: str) -> dict:
    """Construit la row enrichie à partir d'un résultat API."""
    siege = result.get("siege") or {}
    dirigeant = extract_dirigeant(result)
    effectif_code = result.get("tranche_effectif_salarie") or ""
    out = dict(prospect)  # copie tous les champs d'origine
    out["match_confidence"] = confidence
    out["insee_nom_complet"] = result.get("nom_complet") or ""
    out["insee_siren"] = result.get("siren") or ""
    out["insee_siret_siege"] = result.get("siret_siege") or siege.get("siret") or ""
    out["insee_activite_principale"] = result.get("activite_principale") or ""
    out["insee_categorie_juridique"] = result.get("nature_juridique") or result.get("categorie_juridique") or ""
    out["insee_date_creation"] = result.get("date_creation") or ""
    out["insee_effectif"] = EFFECTIF_LABELS.get(effectif_code, effectif_code)
    out["insee_etat_administratif"] = result.get("etat_administratif") or ""
    out["insee_adresse"] = siege.get("adresse") or ""
    out["insee_code_postal"] = siege.get("code_postal") or ""
    out["insee_ville"] = siege.get("libelle_commune") or ""
    out["insee_departement"] = siege.get("departement") or ""
    out.update(dirigeant)
    return out


def empty_row(prospect: dict, reason: str) -> dict:
    out = dict(prospect)
    out["match_confidence"] = reason
    for f in ("insee_nom_complet", "insee_siren", "insee_siret_siege",
              "insee_activite_principale", "insee_categorie_juridique",
              "insee_date_creation", "insee_effectif", "insee_etat_administratif",
              "insee_adresse", "insee_code_postal", "insee_ville", "insee_departement",
              "dirigeant_nom", "dirigeant_prenom", "dirigeant_qualite"):
        out[f] = ""
    return out


def enrich_prospect(prospect: dict) -> dict:
    """Enrichit un prospect, retourne la row finale."""
    siret = (prospect.get("siret") or "").replace(" ", "").strip()
    company = prospect.get("company_name", "").strip()
    city = prospect.get("city", "").strip()
    cp = prospect.get("code_postal", "").strip()

    # 1) Si on a un SIRET valide (14 chiffres), matching exact
    if siret and len(siret) == 14 and siret.isdigit():
        results = api_search(siret)
        if results:
            return extract_row(prospect, results[0], "exact")
        return empty_row(prospect, "siret_unknown")

    # 2) Sinon recherche fuzzy : nom + ville + CP
    if not company:
        return empty_row(prospect, "no_query")
    parts = [company]
    if cp:
        parts.append(cp)
    elif city:
        parts.append(city)
    query = " ".join(parts)
    results = api_search(query)
    if not results:
        return empty_row(prospect, "no_match")

    # Sélectionne le meilleur résultat : combinaison nom + ville
    target_name = company
    target_city_norm = normalize(city)
    best: tuple[float, dict] | None = None
    for r in results:
        score_name = name_similarity(target_name, r.get("nom_complet") or r.get("nom_raison_sociale") or "")
        result_city = normalize((r.get("siege") or {}).get("libelle_commune", ""))
        bonus_city = 0.15 if result_city and target_city_norm and result_city == target_city_norm else 0
        total = score_name + bonus_city
        if best is None or total > best[0]:
            best = (total, r)

    if best is None:
        return empty_row(prospect, "no_match")

    score, result = best
    # Threshold : on cumule nom_similarity + bonus_ville
    # 0.90+ = high (très probable), 0.70-0.90 = medium, sinon low
    if score >= 0.90:
        conf = "high"
    elif score >= 0.70:
        conf = "medium"
    else:
        conf = "low"
    return extract_row(prospect, result, conf)


def load_already_processed() -> set[str]:
    if not OUT_CSV.exists():
        return set()
    try:
        with OUT_CSV.open(encoding="utf-8") as f:
            return {row["id"] for row in csv.DictReader(f) if row.get("id")}
    except Exception:
        return set()


def append_row(row: dict, fieldnames: list[str], header_written: bool) -> bool:
    OUT_CSV.parent.mkdir(exist_ok=True)
    mode = "a" if header_written else "w"
    with OUT_CSV.open(mode, encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not header_written:
            writer.writeheader()
        writer.writerow(row)
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Traite tous les prospects")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    if not IN_CSV.exists():
        print(f"ERREUR : {IN_CSV} introuvable", file=sys.stderr)
        sys.exit(1)
    if args.reset and OUT_CSV.exists():
        OUT_CSV.unlink()

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Total prospects dans CSV : {len(rows)}")

    done = load_already_processed()
    if done:
        before = len(rows)
        rows = [r for r in rows if r["id"] not in done]
        print(f"Déjà enrichis (reprise auto) : {before - len(rows)}")
        print(f"Restant : {len(rows)}")

    if not args.full:
        rows = rows[: args.limit]
        print(f"Test sur {len(rows)} (--full pour tout)\n")
    else:
        print(f"Mode FULL : {len(rows)} prospects\n")

    if not rows:
        print("Rien à faire. --reset pour recommencer.")
        return

    # Fieldnames basés sur la 1re row enrichie (qu'on construit en avance)
    sample = enrich_prospect(rows[0])
    fieldnames = list(sample.keys())
    header_written = OUT_CSV.exists() and OUT_CSV.stat().st_size > 0
    if not header_written:
        # On écrit la première row maintenant, et on continue avec les autres
        append_row(sample, fieldnames, False)
        header_written = True
        processed = 1
        rows = rows[1:]
    else:
        processed = 0

    start = time.monotonic()
    counts = {"exact": 0, "high": 0, "medium": 0, "low": 0, "no_match": 0, "no_query": 0, "siret_unknown": 0}
    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = [ex.submit(enrich_prospect, r) for r in rows]
            for fut in as_completed(futures):
                try:
                    row = fut.result(timeout=15)
                except Exception:
                    continue
                processed += 1
                header_written = append_row(row, fieldnames, header_written)
                conf = row.get("match_confidence", "")
                counts[conf] = counts.get(conf, 0) + 1
                company = row.get("company_name", "")[:35]
                dirigeant = f"{row.get('dirigeant_prenom', '')} {row.get('dirigeant_nom', '')}".strip()
                emoji = {"exact": "★", "high": "✓", "medium": "≈", "low": "?"}.get(conf, "✗")
                print(f"[{processed:>4}/{processed + len(rows) - 1}] {company:<35} {emoji} {conf:<8} {dirigeant[:40]}")
                time.sleep(DELAY)
    except KeyboardInterrupt:
        print(f"\n⏸  Interrompu après {processed} prospects.")

    elapsed = time.monotonic() - start
    print(f"\n--- Bilan ---")
    print(f"Durée   : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Traités : {processed}")
    print(f"  ★ exact          : {counts.get('exact', 0)}")
    print(f"  ✓ high (≥90%)    : {counts.get('high', 0)}")
    print(f"  ≈ medium (70-90%): {counts.get('medium', 0)}")
    print(f"  ? low (<70%)     : {counts.get('low', 0)}")
    print(f"  ✗ no_match       : {counts.get('no_match', 0)}")
    print(f"  - no_query       : {counts.get('no_query', 0)}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
