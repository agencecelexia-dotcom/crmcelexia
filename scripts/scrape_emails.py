#!/usr/bin/env python3
"""
Enrichissement emails — prospects Celexia non contactés.

Lit data/prospects-non-contactes.csv et pour chaque prospect avec un
website, visite les pages courantes (contact, mentions légales, à propos)
et extrait les emails par regex. Écrit le résultat dans
data/prospects-emails-enrichis.csv.

Usage :
    pip3 install requests beautifulsoup4
    python3 scripts/scrape_emails.py            # test sur 20 prospects
    python3 scripts/scrape_emails.py --full     # tous les 4543

Légal B2B : scraping d'emails pro déjà publics sur les sites des
prospects, pour démarchage commercial. Conforme RGPD si opt-out
mentionné au 1er contact (intérêt légitime, art. 6.1.f).
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
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
INPUT_CSV = ROOT / "data" / "prospects-non-contactes.csv"
OUTPUT_CSV = ROOT / "data" / "prospects-emails-enrichis.csv"

# Pages courantes où les emails se cachent
PROBE_PATHS = [
    "",  # home
    "/contact",
    "/contact.html",
    "/contact-us",
    "/nous-contacter",
    "/mentions-legales",
    "/legal",
    "/about",
    "/a-propos",
    "/qui-sommes-nous",
    "/equipe",
]

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
)

# Patterns à filtrer (emails techniques / faux positifs)
BLOCKLIST = {
    "sentry.io", "wixpress.com", "wix.com", "noreply", "no-reply",
    "donotreply", "do-not-reply", "example.com", "test.com", "domain.com",
    "yourdomain", "votredomaine", "@2x", "@3x", "u003e", "u003c",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CelexiaCRM-Enricher/1.0; "
        "+contact: agence.celexia@gmail.com)"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

TIMEOUT = 10
MAX_WORKERS = 8       # 8 prospects en parallèle (~5-10 req/s effectif)
DELAY_BETWEEN_PROBES = 0.3  # pause entre 2 pages du même site


def normalize_url(url: str) -> str | None:
    """Normalise et valide une URL. Retourne None si inutilisable."""
    if not url or not url.strip():
        return None
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return None
        # Strip path/query/fragment pour repartir de la racine
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return None


def is_email_garbage(email: str) -> bool:
    """Filtre les emails techniques / faux positifs."""
    email_lower = email.lower()
    if any(b in email_lower for b in BLOCKLIST):
        return True
    # Emails trop courts ou avec extension bizarre
    local, _, domain = email_lower.partition("@")
    if len(local) < 2 or len(domain) < 4:
        return True
    # Extensions suspectes (souvent des sprites image scannés)
    tld = domain.rsplit(".", 1)[-1]
    if tld in {"png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js"}:
        return True
    return False


def extract_emails_from_html(html: str) -> set[str]:
    """Extrait les emails uniques d'un HTML, en dédupliquant et filtrant."""
    # 1) Regex globale sur le texte brut
    candidates = set(EMAIL_RE.findall(html))
    # 2) Liens mailto: (souvent plus propres)
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a[href^='mailto:']"):
        href = a.get("href", "")
        addr = href[7:].split("?")[0].strip()
        if addr:
            candidates.add(addr)
    # 3) Filtre
    return {e for e in candidates if not is_email_garbage(e)}


def fetch(url: str) -> str | None:
    """Récupère le HTML d'une URL avec gestion d'erreur souple."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code == 200 and "text/html" in r.headers.get("Content-Type", ""):
            return r.text
    except requests.RequestException:
        pass
    return None


def scrape_prospect(row: dict) -> dict:
    """Scrape un prospect, retourne la row enrichie avec emails_found."""
    website = normalize_url(row.get("website"))
    emails_found: set[str] = set()
    pages_visited = 0
    if website:
        for path in PROBE_PATHS:
            url = urljoin(website, path) if path else website
            html = fetch(url)
            pages_visited += 1
            if html:
                emails_found |= extract_emails_from_html(html)
                if emails_found:
                    # Si on en a déjà, on s'arrête vite (souvent les bons sont en home/contact)
                    if pages_visited >= 3:
                        break
            time.sleep(DELAY_BETWEEN_PROBES)
    row["emails_found"] = ";".join(sorted(emails_found))
    row["pages_visited"] = str(pages_visited)
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Traite tous les prospects (sinon limit 20)")
    parser.add_argument("--limit", type=int, default=20, help="Nombre max (défaut 20)")
    args = parser.parse_args()

    if not INPUT_CSV.exists():
        print(f"ERREUR : {INPUT_CSV} introuvable", file=sys.stderr)
        sys.exit(1)

    with INPUT_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Filtre : skip ceux qui ont déjà un email + ceux sans website
    candidates = [r for r in rows if not r.get("email") and r.get("website")]
    print(f"Total prospects : {len(rows)}")
    print(f"Avec website, sans email : {len(candidates)}")

    if not args.full:
        candidates = candidates[: args.limit]
        print(f"Test sur {len(candidates)} prospects (--full pour tout)\n")

    start = time.monotonic()
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(scrape_prospect, r): r for r in candidates}
        for i, fut in enumerate(as_completed(futures), 1):
            row = fut.result()
            results.append(row)
            emails = row.get("emails_found", "")
            company = row.get("company_name", "")[:40]
            status = f"✓ {emails}" if emails else "✗"
            print(f"[{i:>4}/{len(candidates)}] {company:<40} {status}")

    elapsed = time.monotonic() - start
    found = sum(1 for r in results if r.get("emails_found"))
    print(f"\n--- Bilan ---")
    print(f"Durée   : {elapsed:.1f}s")
    print(f"Trouvés : {found}/{len(results)} ({100 * found / max(len(results), 1):.1f} %)")
    print(f"Total emails uniques : {sum(len(r['emails_found'].split(';')) for r in results if r.get('emails_found'))}")

    # Écrit le CSV
    if results:
        fieldnames = list(results[0].keys())
        OUTPUT_CSV.parent.mkdir(exist_ok=True)
        with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
        print(f"\nCSV : {OUTPUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
