#!/usr/bin/env python3
"""
Étape 24 — Scrape emails des prospects via Scrapling.

Lit  : data/lsa-23-firecrawl-input.csv (6 182 prospects sans email)
Écrit: data/lsa-24-emails-scraped.csv (append/resume)

Stratégie pour chaque prospect avec un website :
  1. Fetch home page via Scrapling (StealthyFetcher)
  2. Si pas d'email home → fetch /contact, /nous-contacter, /mentions-legales
  3. Extract via :
     - <a href="mailto:..."> (sélecteur CSS)
     - regex EMAIL_RE sur le texte brut
  4. Filtre blocklist (noreply, wix, ovh, etc.)
  5. Garde le meilleur email (priorité : pro > prenom.nom@ > contact@ > info@)

Resume auto : reprend là où le CSV de sortie s'est arrêté.

Usage :
    pip install scrapling
    scrapling install  # télécharge browsers Playwright (~300 Mo)
    python3 scripts/lsa_24_scrapling_emails.py            # full 6 182
    python3 scripts/lsa_24_scrapling_emails.py --test 50  # test 50
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

try:
    from scrapling import Fetcher
except ImportError:
    print("ERREUR : pip install 'scrapling[fetchers]'", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "lsa-23-firecrawl-input.csv"
OUT_CSV = ROOT / "data" / "lsa-24-emails-scraped.csv"

PROBE_PATHS = [
    "",  # home
    "/contact",
    "/nous-contacter",
    "/mentions-legales",
    "/a-propos",
    "/qui-sommes-nous",
]

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# Emails à jeter (faux positifs, hébergeurs, templates)
BLOCKLIST = {
    "noreply", "no-reply", "donotreply", "do-not-reply", "sentry.io",
    "wixpress.com", "wix.com", "webador", "ovhcloud", "ovh.com",
    "jimdo", "squarespace", "weebly", "godaddy", "1and1.fr", "ionos",
    "shopify.com", "myshopify.com", "prestashop", "wordpress.com",
    "automattic.com", "google-analytics", "googleadservices",
    "facebook.com", "googletagmanager", "doubleclick", "hotjar.com",
    "intercom", "example.com", "test.com", "domain.com", "yourdomain",
    "email@", "nom@", "prenom@", "votre.email", "votre-email",
    "jacques@martin.com", "john@doe", "jane@doe", "lorem.ipsum",
    "mon@mail.fr", "mail@mail.fr", "cm2c.net", "stagheaddesigns",
    "@2x", "@3x", "u003e", "u003c",
    # GAFAM / tracking
    "@google.com", "@gmail.com.", "press@google", "@facebook.com",
    "@meta.com", "@instagram.com", "@youtube.com", "@apple.com",
    "@microsoft.com", "@adobe.com", "support@",
    # CDN / CMS
    "@sentry.io", "@cloudflare.com", "@vercel.com", "@netlify.com",
    "@stripe.com", "@paypal.com", "@mailchimp.com", "@sendinblue.com",
    "@hubspot.com", "@salesforce.com", "@zendesk.com",
}

GENERIC_PREFIXES = {"contact", "info", "infos", "hello", "bonjour", "accueil"}


def is_valid_email(email: str) -> bool:
    e = email.lower()
    if any(b in e for b in BLOCKLIST):
        return False
    if e.endswith(".png") or e.endswith(".jpg") or e.endswith(".gif"):
        return False
    if len(e) > 100 or len(e) < 6:
        return False
    return True


def email_quality(email: str, domain_hint: str = "") -> str:
    """high = prenom.nom@domaine | medium = contact@domaine_match | low = autre."""
    e = email.lower()
    local = e.split("@")[0]
    domain = e.split("@")[1] if "@" in e else ""
    # Same domain as website ?
    same_domain = domain_hint and domain_hint in domain
    if "." in local and local.split(".")[0] not in GENERIC_PREFIXES:
        return "high"  # prenom.nom@
    if same_domain and local not in GENERIC_PREFIXES:
        return "medium"
    if same_domain:
        return "medium"
    return "low"


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


def fetch_page(url: str, timeout: int = 10) -> str:
    """Fetch via Scrapling. Renvoie le HTML brut ou ''."""
    try:
        page = Fetcher.get(url, stealthy_headers=True, timeout=timeout, follow_redirects=True)
        if page and page.status == 200:
            return page.html_content or ""
    except Exception:
        return ""
    return ""


def extract_emails(html: str, domain_hint: str = "") -> list[tuple[str, str]]:
    """Renvoie list de (email, quality)."""
    if not html:
        return []
    raw = set(m.group(0) for m in EMAIL_RE.finditer(html))
    # Decode HTML entities &#64; → @
    raw |= set(m.group(0) for m in EMAIL_RE.finditer(html.replace("&#64;", "@").replace("[at]", "@")))
    out = []
    for e in raw:
        e = e.lower().strip(".,;:!?'\"")
        if not is_valid_email(e):
            continue
        out.append((e, email_quality(e, domain_hint)))
    # Dédup, priorité quality
    seen = {}
    rank = {"high": 3, "medium": 2, "low": 1}
    for e, q in out:
        if e not in seen or rank[q] > rank[seen[e]]:
            seen[e] = q
    return sorted(seen.items(), key=lambda x: -rank[x[1]])


def scrape_prospect(row: dict) -> dict:
    """Pour un prospect, tente toutes les pages probables jusqu'à trouver un email."""
    website = normalize_url(row.get("website", ""))
    result = {**row, "best_email": "", "best_email_quality": "", "scraped_url": "", "all_emails": ""}
    if not website:
        return result

    parsed = urlparse(website)
    domain_hint = parsed.netloc.replace("www.", "").split(".")[0] if parsed.netloc else ""

    all_found: list[tuple[str, str]] = []
    for path in PROBE_PATHS:
        url = urljoin(website, path) if path else website
        html = fetch_page(url, timeout=10)
        if not html:
            continue
        emails = extract_emails(html, domain_hint)
        if emails:
            all_found.extend(emails)
            # Si on a un email "high" sur la home, pas la peine de continuer
            if any(q == "high" for _, q in emails):
                result["scraped_url"] = url
                break

    if all_found:
        # Dédup garde meilleure qualité
        rank = {"high": 3, "medium": 2, "low": 1}
        best: dict[str, str] = {}
        for e, q in all_found:
            if e not in best or rank[q] > rank[best[e]]:
                best[e] = q
        sorted_emails = sorted(best.items(), key=lambda x: -rank[x[1]])
        result["best_email"] = sorted_emails[0][0]
        result["best_email_quality"] = sorted_emails[0][1]
        result["all_emails"] = ";".join(f"{e}({q})" for e, q in sorted_emails[:5])
        if not result["scraped_url"]:
            result["scraped_url"] = website
    return result


def load_done_ids() -> set[str]:
    """Renvoie l'ensemble des ids déjà scrapés (resume)."""
    if not OUT_CSV.exists():
        return set()
    done = set()
    with OUT_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            done.add(r["id"])
    return done


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", type=int, default=None, help="Test N prospects only")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent workers")
    parser.add_argument("--prospect-timeout", type=int, default=90, help="Max seconds per prospect")
    args = parser.parse_args()

    with IN_CSV.open(encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))
    print(f"Total prospects : {len(all_rows)}")

    # Filter to those with a website
    with_website = [r for r in all_rows if r.get("website")]
    print(f"Avec website     : {len(with_website)}")

    done = load_done_ids()
    print(f"Déjà scrapés    : {len(done)}")

    todo = [r for r in with_website if r["id"] not in done]
    if args.test:
        todo = todo[:args.test]
    print(f"À scraper       : {len(todo)}")
    print()

    if not todo:
        print("Rien à scraper.")
        return

    # Output fields
    fieldnames = list(all_rows[0].keys()) + ["best_email", "best_email_quality", "scraped_url", "all_emails"]
    write_header = not OUT_CSV.exists()
    out_f = OUT_CSV.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(out_f, fieldnames=fieldnames)
    if write_header:
        writer.writeheader()
        out_f.flush()

    start = time.time()
    found_emails = 0
    processed = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(scrape_prospect, r): r for r in todo}
        for fut in as_completed(futures):
            r = futures[fut]
            try:
                # Hard timeout par prospect — évite de bloquer indéfiniment
                result = fut.result(timeout=args.prospect_timeout)
            except Exception as e:
                result = {**r, "best_email": "", "best_email_quality": "", "scraped_url": "", "all_emails": f"error:{type(e).__name__}"}
            writer.writerow(result)
            out_f.flush()
            processed += 1
            if result.get("best_email"):
                found_emails += 1
            if processed % 10 == 0:
                rate = processed / max(time.time() - start, 1)
                eta = (len(todo) - processed) / max(rate, 0.1)
                print(f"  {processed}/{len(todo)} | trouvés={found_emails} ({100*found_emails/processed:.0f}%) | {rate:.1f}/s | ETA {eta/60:.0f}min")

    out_f.close()
    print(f"\n=== SCRAPLING DONE ===")
    print(f"Processed : {processed}")
    print(f"Emails    : {found_emails} ({100*found_emails/max(processed,1):.0f}%)")
    print(f"CSV       : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
