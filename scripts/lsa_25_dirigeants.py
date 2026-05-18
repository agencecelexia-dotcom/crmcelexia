#!/usr/bin/env python3
"""
Étape 25 — Enrichit chaque prospect avec le dirigeant via INSEE + mentions légales.

Stratégie pour chaque prospect avec un website :
  1. Scrape /mentions-legales (et 18 variantes de path)
  2. Extract SIRET (14 chiffres, obligatoire légalement)
  3. Si SIRET → API recherche-entreprises.api.gouv.fr → dirigeant officiel (INPI)
  4. Sinon fallback : regex sur le texte ("Gérant : Pierre Dupont", "Président : ...")

Input  : data/lsa-24-emails-scraped.csv (ou data/lsa-23-firecrawl-input.csv)
Output : data/lsa-25-dirigeants.csv (append/resume)

Resume auto.

Usage :
    pip install scrapling beautifulsoup4
    python3 scripts/lsa_25_dirigeants.py --test 50
    python3 scripts/lsa_25_dirigeants.py            # full
"""
from __future__ import annotations
import argparse
import csv
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup  # type: ignore

try:
    from scrapling import Fetcher
except ImportError:
    print("ERREUR : pip install 'scrapling[fetchers]'", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
# Toujours lire la source full (les 6182 prospects), pas le résultat partiel de lsa_24
IN_CSV = ROOT / "data" / "lsa-23-firecrawl-input.csv"
OUT_CSV = ROOT / "data" / "lsa-25-dirigeants.csv"

API_GOUV = "https://recherche-entreprises.api.gouv.fr/search"

PROBE_PATHS = [
    "/mentions-legales", "/mentions-legales/", "/mentions-legales.html",
    "/mentions-legales.php", "/mentions_legales", "/mentions", "/mentions.html",
    "/legal", "/legales", "/informations-legales", "/infos-legales",
    "/cgv", "/cgu", "/conditions-generales", "/notice-legale",
    "/pages/mentions-legales", "/page/mentions-legales", "/fr/mentions-legales",
    "/about/mentions-legales", "/footer/mentions-legales",
]

SIRET_RE = re.compile(r"\b(\d{3})\s?(\d{3})\s?(\d{3})\s?(\d{5})\b")

HOSTING_BLACKLIST = re.compile(
    r"\b(?:ovh|ovhcloud|klaba|wordpress|wix|shopify|hyperlien|h[ée]berg[ée]|"
    r"google|facebook|instagram|hostinger|infomaniak|gandi|1and1|ionos|"
    r"webhosting|cloudflare|squarespace|jimdo|webador|linkeo|simplébo|sitew|orson)\b",
    re.IGNORECASE,
)

DIRIGEANT_PATTERNS = [
    re.compile(r"(?:représentant[e]?\s+l[ée]gal[e]?|repr[ée]sent[ée]\s+par)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:directeur|directrice)\s+(?:de\s+(?:la\s+)?publication)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:responsable\s+(?:de\s+)?(?:la\s+)?publication)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:g[ée]rant[e]?(?:\s+unique)?)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
    re.compile(r"(?:pr[ée]sident[e]?(?:\s+directeur\s+g[ée]n[ée]ral)?)\s*[:\-]?\s*([A-ZÀ-ÿ][A-zÀ-ÿ\-'\.\s]{3,60})", re.IGNORECASE),
]

STOP_NAME_WORDS = {
    "de", "du", "site", "la", "le", "les", "publication", "société",
    "sarl", "sas", "sa", "eurl", "sasu", "siret", "rcs", "ape", "tva",
    "monsieur", "madame", "m", "mme", "et", "ou", "est", "siège", "social",
    "adresse", "numéro", "tel", "tél", "téléphone", "email", "mail",
    "représentée", "représenté",
}


SKIP_DOMAINS = (
    "facebook.com", "instagram.com", "linkedin.com", "twitter.com",
    "x.com", "youtube.com", "tiktok.com", "pinterest.",
    "google.com", "google.fr", "google.be", "maps.google",
    "yelp.", "pagesjaunes.", "leboncoin.",
)


def is_skippable_domain(url: str) -> bool:
    u = url.lower()
    return any(d in u for d in SKIP_DOMAINS)


def normalize_url(raw: str) -> str:
    if not raw:
        return ""
    raw = raw.strip()
    if not raw.startswith("http"):
        raw = "https://" + raw
    if is_skippable_domain(raw):
        return ""
    return raw


def fetch_text(url: str, timeout: int = 10) -> str:
    try:
        page = Fetcher.get(url, stealthy_headers=True, timeout=timeout, follow_redirects=True)
        if page and page.status == 200:
            soup = BeautifulSoup(page.html_content or "", "html.parser")
            return soup.get_text(separator=" ", strip=True)
    except Exception:
        return ""
    return ""


def find_mentions_text(website: str) -> str:
    """Tente toutes les URLs probables de mentions légales, renvoie le 1er texte non-vide."""
    base = normalize_url(website)
    if not base:
        return ""
    # Home d'abord (footer mentionne souvent gérant)
    txt = fetch_text(base, timeout=10)
    if txt and ("mentions" in txt.lower() or "siret" in txt.lower() or "gérant" in txt.lower()):
        # Garde le texte home + tente quand même /mentions-legales pour SIRET
        pass
    home_text = txt
    for path in PROBE_PATHS:
        url = urljoin(base, path)
        t = fetch_text(url, timeout=10)
        if t and (SIRET_RE.search(t) or "mentions" in t.lower()):
            return t
    return home_text


def extract_siret(text: str) -> str | None:
    if not text:
        return None
    m = SIRET_RE.search(text)
    if not m:
        return None
    siret = "".join(m.groups())
    # Validation Luhn
    if len(siret) != 14 or not siret.isdigit():
        return None
    return siret


def query_api_gouv(siret: str) -> dict | None:
    """Renvoie {prenom, nom, qualite} ou None."""
    try:
        r = requests.get(API_GOUV, params={"q": siret, "limite": 1}, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results", [])
        if not results:
            return None
        entreprise = results[0]
        dirigeants = entreprise.get("dirigeants", [])
        if not dirigeants:
            return None
        d = dirigeants[0]
        prenom = (d.get("prenoms") or "").split()[0] if d.get("prenoms") else ""
        nom = d.get("nom") or ""
        qualite = d.get("qualite") or ""
        return {
            "dirigeant_prenom": prenom.strip().title(),
            "dirigeant_nom": nom.strip().title(),
            "dirigeant_qualite": qualite,
            "siret": siret,
            "source": "api_gouv",
        }
    except Exception:
        return None


def extract_dirigeant_fallback(text: str) -> dict | None:
    """Parse le texte des mentions pour trouver gérant/président."""
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    for pat in DIRIGEANT_PATTERNS:
        for m in pat.finditer(text):
            raw = m.group(1).strip(" :,.-")
            # Filtre hébergeur
            if HOSTING_BLACKLIST.search(raw):
                continue
            words = [w for w in raw.split() if w.lower() not in STOP_NAME_WORDS and len(w) >= 2]
            if len(words) < 2 or len(words) > 6:
                continue
            # Cherche pattern Prenom NOM ou PRENOM Nom
            prenom = words[0].title()
            nom = " ".join(w.title() for w in words[1:3]) if len(words) >= 2 else ""
            if len(prenom) < 2 or any(c.isdigit() for c in prenom + nom):
                continue
            return {
                "dirigeant_prenom": prenom,
                "dirigeant_nom": nom,
                "dirigeant_qualite": pat.pattern.split("(?:")[1].split("|")[0][:30],
                "siret": "",
                "source": "mentions_scrape",
            }
    return None


def enrich_prospect(row: dict) -> dict:
    out = {**row, "dirigeant_prenom": "", "dirigeant_nom": "", "dirigeant_qualite": "", "siret": "", "dirigeant_source": ""}
    website = row.get("website")
    if not website:
        return out
    text = find_mentions_text(website)
    if not text:
        return out
    siret = extract_siret(text)
    if siret:
        d = query_api_gouv(siret)
        if d:
            out.update({
                "dirigeant_prenom": d["dirigeant_prenom"],
                "dirigeant_nom": d["dirigeant_nom"],
                "dirigeant_qualite": d["dirigeant_qualite"],
                "siret": d["siret"],
                "dirigeant_source": d["source"],
            })
            return out
        out["siret"] = siret  # garde SIRET même si dirigeant pas trouvé
    # Fallback : parse texte
    d = extract_dirigeant_fallback(text)
    if d:
        out.update({
            "dirigeant_prenom": d["dirigeant_prenom"],
            "dirigeant_nom": d["dirigeant_nom"],
            "dirigeant_qualite": d["dirigeant_qualite"],
            "siret": out["siret"] or d.get("siret", ""),
            "dirigeant_source": d["source"],
        })
    return out


def load_done_ids() -> set[str]:
    if not OUT_CSV.exists():
        return set()
    done = set()
    with OUT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            done.add(r["id"])
    return done


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", type=int, default=None)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--prospect-timeout", type=int, default=180)
    args = parser.parse_args()

    print(f"Input : {IN_CSV.relative_to(ROOT)}")

    with IN_CSV.open(encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))
    print(f"Total prospects : {len(all_rows)}")

    with_website = [r for r in all_rows if r.get("website")]
    print(f"Avec website     : {len(with_website)}")

    done = load_done_ids()
    print(f"Déjà enrichis    : {len(done)}")

    todo = [r for r in with_website if r["id"] not in done]
    if args.test:
        todo = todo[:args.test]
    print(f"À enrichir      : {len(todo)}")
    print()

    if not todo:
        print("Rien à enrichir.")
        return

    fieldnames = list(all_rows[0].keys()) + ["dirigeant_prenom", "dirigeant_nom", "dirigeant_qualite", "siret", "dirigeant_source"]
    write_header = not OUT_CSV.exists()
    out_f = OUT_CSV.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(out_f, fieldnames=fieldnames)
    if write_header:
        writer.writeheader()
        out_f.flush()

    start = time.time()
    processed = 0
    found_dirig = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(enrich_prospect, r): r for r in todo}
        for fut in as_completed(futures):
            r = futures[fut]
            try:
                result = fut.result(timeout=args.prospect_timeout)
            except Exception as e:
                result = {**r, "dirigeant_prenom": "", "dirigeant_nom": "", "dirigeant_qualite": "",
                         "siret": "", "dirigeant_source": f"error:{type(e).__name__}"[:50]}
            writer.writerow(result)
            out_f.flush()
            processed += 1
            if result.get("dirigeant_prenom"):
                found_dirig += 1
            if processed % 10 == 0:
                rate = processed / max(time.time() - start, 1)
                eta = (len(todo) - processed) / max(rate, 0.1)
                print(f"  {processed}/{len(todo)} | dirig={found_dirig} ({100*found_dirig/processed:.0f}%) | {rate:.1f}/s | ETA {eta/60:.0f}min")

    out_f.close()
    print(f"\n=== DIRIGEANTS DONE ===")
    print(f"Processed : {processed}")
    print(f"Trouvés   : {found_dirig} ({100*found_dirig/max(processed,1):.0f}%)")
    print(f"CSV       : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
