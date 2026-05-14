#!/usr/bin/env python3
"""
Scrape les emails de contact des fournisseurs B2B clôture.

Lit  : data/fournisseurs-cloture.csv  (id, company_name, website, categorie)
Écrit: data/fournisseurs-cloture-emails.csv
       (mêmes colonnes + emails_found, best_email, best_email_quality, status_http)

Tente plusieurs paths typiques : /, /contact, /nous-contacter, /mentions-legales,
/a-propos, /equipe, /partenaires, /partenariat, /devenir-partenaire, /pros,
/professionnels, /reseau-installateurs.

Workflow : ThreadPool de 10 workers, timeout dur 25s par fournisseur.
"""
from __future__ import annotations
import csv
import re
import sys
import time
import urllib3
import requests
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup  # type: ignore

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "fournisseurs-cloture.csv"
OUT_CSV = ROOT / "data" / "fournisseurs-cloture-emails.csv"

PROBE_PATHS = [
    "",  # home
    "/contact",
    "/contact/",
    "/contact.html",
    "/contact.php",
    "/nous-contacter",
    "/nous-contacter/",
    "/mentions-legales",
    "/mentions-legales/",
    "/a-propos",
    "/a-propos/",
    "/qui-sommes-nous",
    "/equipe",
    "/partenaires",
    "/partenariat",
    "/devenir-partenaire",
    "/pros",
    "/professionnels",
    "/reseau-installateurs",
    "/installateurs",
    "/revendeurs",
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*"}
HTTP_TIMEOUT = 8
HARD_TIMEOUT = 25

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
BLOCKLIST_PATTERNS = (
    "@example.", "@domain.", "@test.", "@email.", "@yourdomain.", "@mysite.",
    "@monsite.", "votre@", "votre.", "exemple@", "lorem", "@2x.png", "@3x.png",
    "monadresse@", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    "wordpress.com", "wix.com", "shopify.com", "@sentry.", "@cloudflare.",
)

FAI_DOMAINS = {
    "gmail.com", "hotmail.fr", "hotmail.com", "yahoo.fr", "yahoo.com",
    "wanadoo.fr", "orange.fr", "free.fr", "laposte.net", "live.fr",
    "outlook.fr", "outlook.com", "sfr.fr", "neuf.fr", "bbox.fr", "numericable.fr",
    "aliceadsl.fr", "club-internet.fr",
}


def is_valid_email(e: str, domain: str) -> bool:
    e = e.lower().strip()
    if any(p in e for p in BLOCKLIST_PATTERNS):
        return False
    if "@" not in e:
        return False
    # Pas de mail trop long
    if len(e) > 80:
        return False
    return True


def quality_score(email: str, domain: str) -> str:
    e = email.lower()
    edomain = e.rsplit("@", 1)[1] if "@" in e else ""
    base = domain.lower().replace("www.", "").split("/")[0]
    if edomain.endswith(base) or base in edomain:
        return "high"
    if edomain in FAI_DOMAINS:
        return "medium"
    return "low"


def fetch_html(url: str, session: requests.Session) -> str | None:
    try:
        r = session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT, verify=False, allow_redirects=True)
        if r.status_code == 200 and len(r.text) > 200:
            return r.text
    except Exception:
        pass
    return None


def extract_emails_from_html(html: str, base_domain: str) -> list[str]:
    """Extrait emails du HTML + des mailto: links."""
    found: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    # mailto:
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().startswith("mailto:"):
            e = href.split(":", 1)[1].split("?")[0].strip()
            if e and is_valid_email(e, base_domain):
                found.append(e.lower())
    # Texte brut via regex
    text = soup.get_text(separator=" ")
    for m in EMAIL_RE.finditer(text):
        e = m.group(0)
        if is_valid_email(e, base_domain):
            found.append(e.lower())
    # Dédupliquer en gardant l'ordre
    seen = set()
    unique = []
    for e in found:
        if e not in seen:
            seen.add(e)
            unique.append(e)
    return unique


def scrape_one(row: dict) -> dict:
    out = dict(row)
    out["emails_found"] = ""
    out["best_email"] = ""
    out["best_email_quality"] = ""
    out["status"] = "no_email"

    website = (row.get("website") or "").strip().rstrip("/")
    if not website:
        out["status"] = "no_website"
        return out

    base_domain = urlparse(website).netloc
    if not base_domain:
        out["status"] = "invalid_url"
        return out

    session = requests.Session()
    all_emails: list[str] = []

    for path in PROBE_PATHS:
        url = website + path
        html = fetch_html(url, session)
        if not html:
            continue
        emails = extract_emails_from_html(html, base_domain)
        all_emails.extend(emails)

    # Dédupliquer
    seen = set()
    unique = []
    for e in all_emails:
        if e not in seen:
            seen.add(e)
            unique.append(e)

    if not unique:
        out["status"] = "no_email_found"
        return out

    # Trier par qualité : high → medium → low
    scored = [(e, quality_score(e, base_domain)) for e in unique]
    rank = {"high": 0, "medium": 1, "low": 2}
    scored.sort(key=lambda x: rank.get(x[1], 3))

    out["emails_found"] = ";".join(e for e, _ in scored)
    out["best_email"] = scored[0][0]
    out["best_email_quality"] = scored[0][1]
    out["status"] = "ok"
    return out


def main() -> None:
    if not IN_CSV.exists():
        print(f"ERREUR : {IN_CSV} introuvable", file=sys.stderr)
        sys.exit(1)

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Fournisseurs à scraper : {len(rows)}")
    print()

    out_fieldnames = list(rows[0].keys()) + [
        "emails_found", "best_email", "best_email_quality", "status",
    ]

    results: list[dict] = []
    t0 = time.time()
    status_counter: Counter[str] = Counter()

    with ThreadPoolExecutor(max_workers=10) as ex:
        futures = {ex.submit(scrape_one, r): r for r in rows}
        for i, fut in enumerate(as_completed(futures), 1):
            row_in = futures[fut]
            try:
                result = fut.result(timeout=HARD_TIMEOUT)
            except Exception as e:
                result = {**row_in,
                          "emails_found": "", "best_email": "", "best_email_quality": "",
                          "status": f"error:{type(e).__name__}"}
            results.append(result)
            status_counter[result["status"]] += 1
            tag = "✓" if result["status"] == "ok" else "✗"
            print(f"[{i:3d}/{len(rows)}] {row_in['company_name'][:35]:35s} {tag} {result.get('best_email','') or result['status']}")

    OUT_CSV.parent.mkdir(exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_fieldnames)
        w.writeheader()
        w.writerows(results)

    elapsed = time.time() - t0
    n_with_email = sum(1 for r in results if r["best_email"])
    print()
    print("=== SCRAPING DONE ===")
    print(f"Durée   : {elapsed:.1f}s")
    print(f"Avec email : {n_with_email}/{len(rows)} ({100*n_with_email/len(rows):.0f}%)")
    print()
    for status, count in status_counter.most_common():
        print(f"  {status:25s} : {count}")
    # Top emails high quality
    high = [r for r in results if r.get("best_email_quality") == "high"]
    print(f"\nEmails high-quality (domain match) : {len(high)}")
    print(f"CSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
