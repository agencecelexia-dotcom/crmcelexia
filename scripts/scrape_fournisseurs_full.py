#!/usr/bin/env python3
"""
Scrape emails ET téléphones des fournisseurs B2B clôture.

Input  : data/fournisseurs-cloture-vibe.csv (id, company_name, website, ...)
Output : data/fournisseurs-cloture-final.csv
         (input + emails_found, best_email, phones_found, best_phone, status)
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
IN_CSV = ROOT / "data" / "fournisseurs-cloture-vibe.csv"
OUT_CSV = ROOT / "data" / "fournisseurs-cloture-final.csv"

PROBE_PATHS = [
    "", "/contact", "/contact/", "/contact.html", "/contact.php",
    "/nous-contacter", "/nous-contacter/", "/mentions-legales", "/mentions-legales/",
    "/a-propos", "/a-propos/", "/qui-sommes-nous", "/equipe",
    "/partenaires", "/partenariat", "/devenir-partenaire",
    "/pros", "/professionnels", "/reseau-installateurs", "/installateurs",
    "/revendeurs", "/agences", "/agence", "/distributeurs",
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HEADERS = {"User-Agent": UA, "Accept": "text/html,*/*"}
HTTP_TIMEOUT = 8
HARD_TIMEOUT = 30

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Téléphone FR : tolérant aux formats divers (01 23 45 67 89, 01.23.45.67.89, +33 1 23..., etc.)
PHONE_RE = re.compile(r"(?:\+33[\s.-]?|0)[1-9](?:[\s.\-]?\d{2}){4}")

BLOCKLIST_EMAIL = (
    "@example.", "@domain.", "@test.", "@yourdomain.", "@mysite.",
    "@monsite.", "votre@", "votre.", "exemple@", "lorem", "@2x.png",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    "wordpress.com", "wix.com", "shopify.com", "@sentry.", "@cloudflare.",
    "support@agence-felix", "support@agence-",
)

FAI_DOMAINS = {
    "gmail.com", "hotmail.fr", "hotmail.com", "yahoo.fr", "yahoo.com",
    "wanadoo.fr", "orange.fr", "free.fr", "laposte.net", "live.fr",
    "outlook.fr", "outlook.com", "sfr.fr", "neuf.fr",
}


def is_valid_email(e: str) -> bool:
    e = e.lower().strip()
    if any(p in e for p in BLOCKLIST_EMAIL):
        return False
    if "@" not in e or len(e) > 80:
        return False
    return True


def normalize_phone(p: str) -> str:
    """Normalise au format 0X XX XX XX XX."""
    digits = re.sub(r"[^\d]", "", p)
    if digits.startswith("33") and len(digits) == 11:
        digits = "0" + digits[2:]
    if not digits.startswith("0") or len(digits) != 10:
        return ""
    return " ".join([digits[i:i+2] for i in range(0, 10, 2)])


def quality_email(email: str, domain: str) -> str:
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


def extract_contacts_from_html(html: str, base_domain: str) -> tuple[list[str], list[str]]:
    """Retourne (emails, phones) extraits du HTML."""
    emails: list[str] = []
    phones: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    # mailto: et tel:
    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        if href.startswith("mailto:"):
            e = href.split(":", 1)[1].split("?")[0].strip()
            if e and is_valid_email(e):
                emails.append(e.lower())
        elif href.startswith("tel:"):
            p = href.split(":", 1)[1].strip()
            normalized = normalize_phone(p)
            if normalized:
                phones.append(normalized)
    # Texte brut
    text = soup.get_text(separator=" ")
    for m in EMAIL_RE.finditer(text):
        e = m.group(0).lower()
        if is_valid_email(e):
            emails.append(e)
    for m in PHONE_RE.finditer(text):
        normalized = normalize_phone(m.group(0))
        if normalized:
            phones.append(normalized)
    return emails, phones


def dedupe_keep_order(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for i in items:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def scrape_one(row: dict) -> dict:
    out = dict(row)
    out["emails_found"] = ""
    out["best_email"] = ""
    out["best_email_quality"] = ""
    out["phones_found"] = ""
    out["best_phone"] = ""
    out["status"] = "no_contact"

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
    all_phones: list[str] = []

    for path in PROBE_PATHS:
        url = website + path
        html = fetch_html(url, session)
        if not html:
            continue
        emails, phones = extract_contacts_from_html(html, base_domain)
        all_emails.extend(emails)
        all_phones.extend(phones)

    unique_emails = dedupe_keep_order(all_emails)
    unique_phones = dedupe_keep_order(all_phones)

    if unique_emails:
        scored = [(e, quality_email(e, base_domain)) for e in unique_emails]
        rank = {"high": 0, "medium": 1, "low": 2}
        scored.sort(key=lambda x: rank.get(x[1], 3))
        out["emails_found"] = ";".join(e for e, _ in scored[:5])
        out["best_email"] = scored[0][0]
        out["best_email_quality"] = scored[0][1]

    if unique_phones:
        out["phones_found"] = ";".join(unique_phones[:5])
        out["best_phone"] = unique_phones[0]

    if unique_emails and unique_phones:
        out["status"] = "ok_both"
    elif unique_emails:
        out["status"] = "ok_email"
    elif unique_phones:
        out["status"] = "ok_phone"
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
        "emails_found", "best_email", "best_email_quality",
        "phones_found", "best_phone", "status",
    ]

    results: list[dict] = []
    t0 = time.time()
    status_counter: Counter[str] = Counter()

    with ThreadPoolExecutor(max_workers=15) as ex:
        futures = {ex.submit(scrape_one, r): r for r in rows}
        for i, fut in enumerate(as_completed(futures), 1):
            row_in = futures[fut]
            try:
                result = fut.result(timeout=HARD_TIMEOUT)
            except Exception as e:
                result = {**row_in,
                          "emails_found": "", "best_email": "", "best_email_quality": "",
                          "phones_found": "", "best_phone": "",
                          "status": f"error:{type(e).__name__}"}
            results.append(result)
            status_counter[result["status"]] += 1
            tag_e = "📧" if result.get("best_email") else "  "
            tag_p = "📞" if result.get("best_phone") else "  "
            print(f"[{i:3d}/{len(rows)}] {tag_e}{tag_p} {row_in['company_name'][:42]:42s}")

    OUT_CSV.parent.mkdir(exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out_fieldnames)
        w.writeheader()
        w.writerows(results)

    elapsed = time.time() - t0
    n_email = sum(1 for r in results if r["best_email"])
    n_phone = sum(1 for r in results if r["best_phone"])
    n_both = sum(1 for r in results if r["best_email"] and r["best_phone"])
    print()
    print("=== SCRAPING DONE ===")
    print(f"Durée   : {elapsed:.1f}s")
    print(f"Avec email  : {n_email}/{len(rows)} ({100*n_email/len(rows):.0f}%)")
    print(f"Avec phone  : {n_phone}/{len(rows)} ({100*n_phone/len(rows):.0f}%)")
    print(f"Avec les 2  : {n_both}/{len(rows)} ({100*n_both/len(rows):.0f}%)")
    print()
    for status, count in status_counter.most_common():
        print(f"  {status:25s} : {count}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
