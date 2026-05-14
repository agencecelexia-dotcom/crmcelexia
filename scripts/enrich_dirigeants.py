#!/usr/bin/env python3
"""
Enrichissement dirigeant (prénom/nom) pour les prospects avec email fiable.

Stratégie :
1. Scrape /mentions-legales du site web
2. Extrait SIRET (obligatoire légalement) + dirigeant (Gérant/Président/Représentant)
3. Si SIRET trouvé → API recherche-entreprises.api.gouv.fr → dirigeant officiel (INPI)
4. Sinon fallback sur dirigeant scrapé brut des mentions

Lit  : data/prospects-emails-final.csv (filtre validation_status='ok')
Écrit: data/prospects-dirigeants.csv
Reprise auto : reprend là où le fichier de sortie est resté.

Usage :
    python3 scripts/enrich_dirigeants.py --test 50
    python3 scripts/enrich_dirigeants.py            # full
"""
from __future__ import annotations
import csv
import re
import sys
import time
import urllib3
import argparse
import requests
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup  # type: ignore

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "prospects-emails-final.csv"
OUT_CSV = ROOT / "data" / "prospects-dirigeants.csv"

PROBE_PATHS = [
    "/mentions-legales",
    "/mentions-legales/",
    "/mentions-legales.html",
    "/mentions-legales.php",
    "/mentions_legales",
    "/mentions",
    "/mentions.html",
    "/legal",
    "/legales",
    "/informations-legales",
    "/infos-legales",
    "/cgv",
    "/cgu",
    "/conditions-generales",
    "/notice-legale",
    "/pages/mentions-legales",
    "/page/mentions-legales",
    "/fr/mentions-legales",
    "/about/mentions-legales",
    "/footer/mentions-legales",
]

# Blacklist des "dirigeants" qui sont en fait hébergeurs / éditeurs de site
HOSTING_BLACKLIST = re.compile(
    r"\b(?:ovh|ovhcloud|klaba|wordpress|wix|shopify|hyperlien|h[ée]berg[ée]|"
    r"google|facebook|instagram|hostinger|infomaniak|gandi|1and1|ionos|"
    r"webhosting|cloudflare|squarespace|jimdo|wordpressmu|webador|"
    r"linkeo|simplébo|sitew|orson)\b",
    re.IGNORECASE,
)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*"}
HTTP_TIMEOUT = 10
PROSPECT_HARD_TIMEOUT = 25

SIRET_RE = re.compile(r"\b(\d{3})\s?(\d{3})\s?(\d{3})\s?(\d{5})\b")

# Mots-clés et capture du nom qui suit (jusqu'au prochain séparateur fort)
DIRIGEANT_PATTERNS = [
    re.compile(r"(?:représentant[e]?\s+l[ée]gal[e]?|repr[ée]sent[ée]\s+par)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:directeur|directrice)\s+(?:de\s+(?:la\s+)?publication)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:responsable\s+(?:de\s+)?(?:la\s+)?publication)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:g[ée]rant[e]?(?:\s+unique)?)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:pr[ée]sident[e]?(?:\s+directeur\s+g[ée]n[ée]ral)?)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:[ée]diteur(?:\s+du\s+site)?)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
]

# Mots-parasites à exclure du nom capturé
STOP_NAME_WORDS = {
    "de", "du", "site", "la", "le", "les", "publication", "société", "société",
    "sarl", "sas", "sa", "eurl", "sasu", "siret", "rcs", "ape", "tva", "monsieur",
    "madame", "m", "mme", "et", "ou", "est", "siège", "social", "adresse",
    "numéro", "tel", "tél", "téléphone", "email", "mail", "siège", "représentée",
}


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def is_plausible_name(name: str) -> bool:
    """Filtre les capturés bidons (juste 'du site', 'siège social', etc.)."""
    parts = name.split()
    if not parts:
        return False
    # Reject si contient un hébergeur / éditeur de site
    if HOSTING_BLACKLIST.search(name):
        return False
    # Au moins 2 tokens (prénom + nom) ou un seul mot tout en majuscules (UNI MARTIN)
    if len(parts) < 2 and len(parts[0]) < 4:
        return False
    # Si tous les mots sont des stopwords → invalide
    if all(p.lower() in STOP_NAME_WORDS for p in parts):
        return False
    # Pas plus de 5 tokens (sinon = bruit)
    if len(parts) > 5:
        return False
    # Au moins une majuscule initiale
    if not any(p[0].isupper() for p in parts if p):
        return False
    # Reject si contient des mots métier
    business_words = {"sarl", "sas", "sa", "eurl", "sasu", "conception", "création",
                      "société", "hébergement", "agence", "paysage", "paysagiste",
                      "élagage", "clôture", "jardin", "btp", "entreprise"}
    if any(p.lower() in business_words for p in parts):
        return False
    return True


def clean_name(raw: str) -> str:
    """Coupe au premier indicateur de fin (siret, rcs, monsieur, etc.)."""
    # Vire les sauts de ligne, normalise espaces
    raw = normalize_text(raw)
    # Coupe à premier signe de ponctuation forte ou stopword
    cut_re = re.compile(r"\s+(?:siret|rcs|ape|tva|n°|num[ée]ro|t[ée]l|email|mail|fax|si[èe]ge|adresse|au\s+capital|capital)\b", re.IGNORECASE)
    m = cut_re.search(raw)
    if m:
        raw = raw[: m.start()]
    # Vire ponctuation finale
    raw = raw.strip(" .,-;:|/")
    # Vire token "Monsieur "/"Madame "/"M. "/"Mme "
    raw = re.sub(r"^(?:monsieur|madame|m\.|mme\.?|m\b|mme\b)\s+", "", raw, flags=re.IGNORECASE)
    return raw.strip()


def split_first_last(name: str) -> tuple[str, str]:
    """Tente prénom/nom. Heuristique : tokens MAJUSCULES = nom, autres = prénom."""
    name = clean_name(name)
    parts = [p for p in name.split() if p]
    if len(parts) < 2:
        return ("", name)
    upper = [p for p in parts if p.isupper() and len(p) > 1]
    mixed = [p for p in parts if not (p.isupper() and len(p) > 1)]
    if upper and mixed:
        return (" ".join(mixed), " ".join(upper))
    # Sinon : premier = prénom, reste = nom
    return (parts[0], " ".join(parts[1:]))


def fetch_legal_html(website: str, session: requests.Session) -> tuple[str | None, str]:
    """Tente plusieurs URLs pour trouver la page mentions légales.
    Retourne (HTML ou None, url_trouvée).
    Si aucune page mentions, fallback sur la home (souvent SIRET dans footer)."""
    base = website.rstrip("/")
    # 1. Tester les chemins probables
    for path in PROBE_PATHS:
        url = base + path
        try:
            r = session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT, verify=False, allow_redirects=True)
            if r.status_code == 200 and len(r.text) > 500:
                txt = r.text.lower()
                if "mention" in txt or "siret" in txt or "directeur" in txt or "gérant" in txt or "gerant" in txt:
                    return r.text, r.url
        except Exception:
            continue
    # 2. Fallback : parser la home et chercher un lien "mentions" dans le footer
    home_html = None
    try:
        r = session.get(base, headers=HEADERS, timeout=HTTP_TIMEOUT, verify=False, allow_redirects=True)
        if r.status_code == 200:
            home_html = r.text
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a", href=True):
                text = (a.get_text() or "").strip().lower()
                href_low = a["href"].lower()
                if "mention" in text or "légales" in text or "legales" in text or "mention" in href_low or "legal" in href_low:
                    href = urljoin(base, a["href"])
                    if urlparse(href).netloc == urlparse(base).netloc:
                        try:
                            r2 = session.get(href, headers=HEADERS, timeout=HTTP_TIMEOUT, verify=False, allow_redirects=True)
                            if r2.status_code == 200 and len(r2.text) > 500:
                                return r2.text, r2.url
                        except Exception:
                            pass
    except Exception:
        pass
    # 3. Dernier recours : retourner la home (souvent SIRET dans footer) avec flag
    if home_html and ("siret" in home_html.lower() or re.search(r"\b\d{14}\b", home_html)):
        return home_html, base + " (home)"
    return None, ""


def extract_siret(text: str) -> str | None:
    """Extrait SIRET (14 chiffres, avec ou sans espaces)."""
    m = SIRET_RE.search(text)
    if m:
        siret = "".join(m.groups())
        # Validation : 14 chiffres exacts
        if len(siret) == 14 and siret.isdigit():
            return siret
    return None


def extract_dirigeant_from_text(text: str) -> str | None:
    """Tente chaque pattern et retourne le 1er nom plausible."""
    for pat in DIRIGEANT_PATTERNS:
        for m in pat.finditer(text):
            name = clean_name(m.group(1))
            if name and is_plausible_name(name):
                return name
    return None


def html_to_text(html: str) -> str:
    """Strip HTML tags via BS4 + normalise espaces."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return normalize_text(soup.get_text(separator=" "))


def fetch_insee_by_siret(siret: str, session: requests.Session) -> dict | None:
    """API recherche-entreprises par SIRET. Retourne dict dirigeant ou None."""
    try:
        r = session.get(
            "https://recherche-entreprises.api.gouv.fr/search",
            params={"q": siret, "page": 1, "per_page": 1},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        results = r.json().get("results", [])
        if not results:
            return None
        e = results[0]
        dirigeants = e.get("dirigeants", []) or []
        dir0 = dirigeants[0] if dirigeants else {}
        return {
            "nom_entreprise": e.get("nom_complet") or e.get("nom_raison_sociale", ""),
            "siret_insee": e.get("siege", {}).get("siret", siret),
            "siren": e.get("siren", siret[:9]),
            "code_naf": e.get("activite_principale", ""),
            "date_creation": e.get("date_creation", ""),
            "tranche_effectif": e.get("tranche_effectif_salarie", ""),
            "dirigeant_prenom": (dir0.get("prenoms") or dir0.get("prenom") or "").strip(),
            "dirigeant_nom": (dir0.get("nom") or "").strip(),
            "dirigeant_qualite": dir0.get("qualite", "") or "",
            "dirigeant_annee_naissance": dir0.get("annee_de_naissance", "") or "",
            "ville": e.get("siege", {}).get("libelle_commune", "") or "",
            "code_postal": e.get("siege", {}).get("code_postal", "") or "",
        }
    except Exception:
        return None


def enrich_prospect(row: dict, session: requests.Session) -> dict:
    """Workflow complet pour 1 prospect : retourne dict des champs enrichis."""
    out = {
        "id": row["id"],
        "company_name": row["company_name"],
        "best_email": row.get("best_email", ""),
        "website": row.get("website", ""),
        "dirigeant_prenom": "",
        "dirigeant_nom": "",
        "dirigeant_full": "",
        "dirigeant_source": "",  # siret_insee / mentions_legales / none
        "siret_trouve": "",
        "siren": "",
        "code_naf": "",
        "date_creation": "",
        "tranche_effectif": "",
        "code_postal_insee": "",
        "ville_insee": "",
        "mentions_legales_url": "",
        "status": "no_match",
    }

    website = (row.get("website") or "").strip()
    if not website:
        out["status"] = "no_website"
        return out

    # 1. Fetch mentions légales (avec fallback home)
    html, mentions_url = fetch_legal_html(website, session)
    if not html:
        out["status"] = "no_mentions_page"
        return out
    out["mentions_legales_url"] = mentions_url

    text = html_to_text(html)

    # 2. Extract SIRET
    siret = extract_siret(text)
    if siret:
        out["siret_trouve"] = siret

    # 3. Try INSEE by SIRET
    if siret:
        insee = fetch_insee_by_siret(siret, session)
        if insee and (insee.get("dirigeant_nom") or insee.get("dirigeant_prenom")):
            out["dirigeant_prenom"] = insee["dirigeant_prenom"]
            out["dirigeant_nom"] = insee["dirigeant_nom"]
            out["dirigeant_full"] = f"{insee['dirigeant_prenom']} {insee['dirigeant_nom']}".strip()
            out["dirigeant_source"] = "siret_insee"
            out["siren"] = insee["siren"]
            out["code_naf"] = insee["code_naf"]
            out["date_creation"] = insee["date_creation"]
            out["tranche_effectif"] = insee["tranche_effectif"]
            out["code_postal_insee"] = insee["code_postal"]
            out["ville_insee"] = insee["ville"]
            out["status"] = "ok_insee"
            return out

    # 4. Fallback : dirigeant from mentions legales text
    dirigeant_raw = extract_dirigeant_from_text(text)
    if dirigeant_raw:
        prenom, nom = split_first_last(dirigeant_raw)
        out["dirigeant_prenom"] = prenom
        out["dirigeant_nom"] = nom
        out["dirigeant_full"] = dirigeant_raw
        out["dirigeant_source"] = "mentions_legales"
        out["status"] = "ok_mentions"
        return out

    out["status"] = "no_dirigeant_found"
    return out


def enrich_one(row: dict) -> dict:
    session = requests.Session()
    return enrich_prospect(row, session)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(IN_CSV))
    parser.add_argument("--output", default=str(OUT_CSV))
    parser.add_argument("--test", type=int, default=0)
    parser.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)

    if not in_path.exists():
        print(f"ERREUR : {in_path} introuvable", file=sys.stderr)
        sys.exit(1)

    with in_path.open(encoding="utf-8") as f:
        all_rows = [r for r in csv.DictReader(f) if r.get("validation_status") == "ok"]

    print(f"Total prospects avec email fiable : {len(all_rows)}")

    # Reprise auto : skip ceux déjà dans out_path
    done_ids: set[str] = set()
    existing: list[dict] = []
    if out_path.exists():
        with out_path.open(encoding="utf-8") as f:
            existing = list(csv.DictReader(f))
            done_ids = {r["id"] for r in existing}
        print(f"Déjà enrichis (reprise auto) : {len(done_ids)}")

    todo = [r for r in all_rows if r["id"] not in done_ids]
    if args.test:
        todo = todo[: args.test]
        print(f"Test sur {len(todo)} (--full pour tout)")
    else:
        print(f"À enrichir : {len(todo)}")

    out_fieldnames = [
        "id", "company_name", "best_email", "website",
        "dirigeant_prenom", "dirigeant_nom", "dirigeant_full", "dirigeant_source",
        "siret_trouve", "siren", "code_naf", "date_creation", "tranche_effectif",
        "code_postal_insee", "ville_insee", "mentions_legales_url", "status",
    ]

    # Header si fichier neuf
    write_header = not out_path.exists()
    out_path.parent.mkdir(exist_ok=True)
    f_out = out_path.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(f_out, fieldnames=out_fieldnames)
    if write_header:
        writer.writeheader()
        f_out.flush()

    t0 = time.time()
    status_counter: Counter[str] = Counter()
    with_dirigeant = 0

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(enrich_one, r): r for r in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            row_in = futures[fut]
            try:
                result = fut.result(timeout=PROSPECT_HARD_TIMEOUT)
            except Exception as e:
                result = {k: "" for k in out_fieldnames}
                result.update({"id": row_in["id"], "company_name": row_in["company_name"], "status": f"error:{type(e).__name__}"})
            writer.writerow(result)
            f_out.flush()
            status_counter[result["status"]] += 1
            if result.get("dirigeant_full"):
                with_dirigeant += 1
                tag = "★" if result["status"] == "ok_insee" else "≈"
            else:
                tag = "✗"
            display_name = result.get("dirigeant_full") or result["status"]
            print(f"[{i:4d}/{len(todo)}] {row_in['company_name'][:35]:35s} {tag} {display_name[:50]}")

    f_out.close()
    elapsed = time.time() - t0
    print()
    print("=== ENRICHISSEMENT DONE ===")
    print(f"Durée   : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Traités : {len(todo)}")
    print(f"Avec dirigeant : {with_dirigeant} ({100*with_dirigeant/max(len(todo),1):.0f}%)")
    print()
    for status, count in status_counter.most_common():
        print(f"  {status:25s} : {count}")
    print()
    print(f"CSV : {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
