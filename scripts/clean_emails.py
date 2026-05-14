#!/usr/bin/env python3
"""
Post-traitement du CSV produit par scrape_emails.py.

- Décode les emails URL-encodés (%65 → e, etc.)
- Filtre les faux positifs (placeholders templates, agence.celexia,
  press@google.com, etc.)
- Dédoublonne les emails par prospect
- Recalcule best_email + best_email_quality

Usage :
    python3 scripts/clean_emails.py
"""
from __future__ import annotations
import csv
import re
import sys
import urllib.parse
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = ROOT / "data" / "prospects-emails-enrichis.csv"
OUT_CSV = ROOT / "data" / "prospects-emails-clean.csv"

BLOCKLIST_SUFFIXES = {
    "@example.com", "@test.com", "@domain.com", "@mysite.com", "@monsite.com",
    "@mail.fr", "@email.fr", "@email.com", "@contact.fr",
    "@infomaniak.com", "@infomaniak.ch",
}
BLOCKLIST_EMAILS = {
    "agence.celexia@gmail.com",  # email de l'agence Celexia
    "jean.dupont@gmail.com",
    "press@google.com",
    "service@linkeo.net",
    "info@konta.com",
    "webmaster@webidea.fr",
    "starter@mail.com",
    "support@email.com",
    "utilisateur@domaine.com",
}
BLOCKLIST_CONTAINS = (
    "votre@", "votre.email", "exemple@", "lorem", "test@", "demo@",
    "monadresse@",
)


def is_blocked(email: str) -> bool:
    e = email.lower().strip()
    if not e or "@" not in e:
        return True
    if e in BLOCKLIST_EMAILS:
        return True
    for s in BLOCKLIST_SUFFIXES:
        if e.endswith(s):
            return True
    for c in BLOCKLIST_CONTAINS:
        if c in e:
            return True
    return False


def url_decode(s: str) -> str:
    try:
        return urllib.parse.unquote(s)
    except Exception:
        return s


def main() -> None:
    if not IN_CSV.exists():
        print(f"ERREUR : {IN_CSV} introuvable", file=sys.stderr)
        sys.exit(1)

    with IN_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    cleaned: list[dict] = []
    filtered: Counter[str] = Counter()
    for r in rows:
        emails = (r.get("emails_found") or "").split(";")
        qualities = (r.get("email_quality") or "").split(";")
        kept: list[tuple[str, str]] = []
        seen: set[str] = set()
        for i, raw in enumerate(emails):
            if not raw.strip():
                continue
            decoded = re.sub(r"\s+", "", url_decode(raw).lower())
            if is_blocked(decoded):
                filtered[decoded] += 1
                continue
            if decoded in seen:
                continue
            seen.add(decoded)
            q = qualities[i] if i < len(qualities) else "low"
            kept.append((decoded, q))
        r["emails_found"] = ";".join(e for e, _ in kept)
        r["email_quality"] = ";".join(q for _, q in kept)
        r["best_email"] = kept[0][0] if kept else ""
        r["best_email_quality"] = kept[0][1] if kept else ""
        cleaned.append(r)

    fieldnames = list(cleaned[0].keys())
    OUT_CSV.parent.mkdir(exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cleaned)

    with_email = [r for r in cleaned if r["emails_found"]]
    quality = Counter(r["best_email_quality"] for r in cleaned if r.get("best_email"))
    unique_emails = {e for r in with_email for e in r["emails_found"].split(";") if e}

    print("=== CLEANUP DONE ===")
    print(f"Prospects avec email : {len(with_email)} ({100*len(with_email)/max(len(cleaned),1):.1f}%)")
    print(f"Emails uniques       : {len(unique_emails)}")
    print(f"  high   : {quality.get('high', 0)}")
    print(f"  medium : {quality.get('medium', 0)}")
    print(f"  low    : {quality.get('low', 0)}")
    print(f"\nCSV : {OUT_CSV.relative_to(ROOT)}")
    print("\n=== Faux positifs filtrés (top 15) ===")
    for email, count in filtered.most_common(15):
        print(f"  {count}× {email}")


if __name__ == "__main__":
    main()
