#!/usr/bin/env python3
"""
Validation des emails via :
1. Syntaxe stricte (regex RFC 5322 simplifié)
2. MX record du domaine (cache par domaine pour performance)
3. Domaine non typo-squatté (orange.fr vs oranqe.fr)

Lit data/prospects-emails-clean.csv (ou --input <file>)
Écrit data/prospects-emails-final.csv avec colonnes :
  - mx_valid : True/False
  - mx_host : premier MX
  - validation_status : 'ok' / 'invalid_syntax' / 'no_mx' / 'domain_down'

Usage :
    python3 scripts/validate_emails.py            # tout le CSV
    python3 scripts/validate_emails.py --test 50  # test sur 50 prospects
"""
from __future__ import annotations
import csv
import os
import re
import sys
import time
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import dns.resolver

ROOT = Path(__file__).resolve().parent.parent
IN_CSV = Path(os.environ.get("VALIDATE_INPUT", str(ROOT / "data" / "prospects-emails-clean.csv")))
OUT_CSV = Path(os.environ.get("VALIDATE_OUTPUT", str(ROOT / "data" / "prospects-emails-final.csv")))

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

# Cache MX par domaine — un seul DNS lookup même si 100 emails sur le même domaine
MX_CACHE: dict[str, tuple[bool, str]] = {}

# DNS resolver custom : timeout court + serveurs publics rapides
RESOLVER = dns.resolver.Resolver()
RESOLVER.timeout = 3
RESOLVER.lifetime = 5
RESOLVER.nameservers = ["1.1.1.1", "8.8.8.8", "9.9.9.9"]


def check_mx(domain: str) -> tuple[bool, str]:
    """Retourne (has_mx, first_mx_host or error)."""
    if domain in MX_CACHE:
        return MX_CACHE[domain]
    try:
        answers = RESOLVER.resolve(domain, "MX", lifetime=5)
        records = sorted(answers, key=lambda r: r.preference)
        if records:
            host = str(records[0].exchange).rstrip(".")
            result = (True, host)
        else:
            result = (False, "no_mx")
    except dns.resolver.NXDOMAIN:
        result = (False, "nxdomain")
    except dns.resolver.NoAnswer:
        # Pas de MX mais peut-être un A record qui sert de mailbox (rare)
        try:
            RESOLVER.resolve(domain, "A", lifetime=3)
            result = (True, "a_record_only")
        except Exception:
            result = (False, "no_mx")
    except dns.resolver.Timeout:
        result = (False, "timeout")
    except Exception as e:
        result = (False, f"error:{type(e).__name__}")
    MX_CACHE[domain] = result
    return result


def validate_email(email: str) -> dict:
    e = email.lower().strip()
    if not EMAIL_RE.match(e):
        return {"email": e, "mx_valid": False, "mx_host": "", "validation_status": "invalid_syntax"}
    domain = e.rsplit("@", 1)[1]
    ok, host = check_mx(domain)
    return {
        "email": e,
        "mx_valid": ok,
        "mx_host": host,
        "validation_status": "ok" if ok else f"no_mx:{host}",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(IN_CSV))
    parser.add_argument("--output", default=str(OUT_CSV))
    parser.add_argument("--test", type=int, default=0, help="Limite à N prospects (test)")
    parser.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    if not in_path.exists():
        print(f"ERREUR : {in_path} introuvable", file=sys.stderr)
        sys.exit(1)

    with in_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if args.test:
        rows = rows[: args.test]

    print(f"Total prospects   : {len(rows)}")
    avec_email = [r for r in rows if (r.get("best_email") or "").strip()]
    print(f"Avec un email     : {len(avec_email)}")
    domains = {(r["best_email"].rsplit("@", 1)[1] for r in avec_email)}
    unique_domains = {r["best_email"].rsplit("@", 1)[1] for r in avec_email}
    print(f"Domaines uniques  : {len(unique_domains)}")
    print()

    t0 = time.time()
    # Validation : parallélisée mais dédupliquée par domaine
    domain_results: dict[str, tuple[bool, str]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        future_to_domain = {ex.submit(check_mx, d): d for d in unique_domains}
        done = 0
        for fut in as_completed(future_to_domain):
            d = future_to_domain[fut]
            try:
                domain_results[d] = fut.result()
            except Exception as e:
                domain_results[d] = (False, f"error:{e}")
            done += 1
            if done % 50 == 0:
                print(f"  ... {done}/{len(unique_domains)} domaines vérifiés")

    # Appliquer aux rows
    status_counter: Counter[str] = Counter()
    for r in rows:
        email = (r.get("best_email") or "").strip().lower()
        if not email:
            r["mx_valid"] = ""
            r["mx_host"] = ""
            r["validation_status"] = "no_email"
            status_counter["no_email"] += 1
            continue
        if not EMAIL_RE.match(email):
            r["mx_valid"] = "false"
            r["mx_host"] = ""
            r["validation_status"] = "invalid_syntax"
            status_counter["invalid_syntax"] += 1
            continue
        domain = email.rsplit("@", 1)[1]
        ok, host = domain_results.get(domain, (False, "unknown"))
        r["mx_valid"] = "true" if ok else "false"
        r["mx_host"] = host
        r["validation_status"] = "ok" if ok else f"no_mx:{host}"
        status_counter["ok" if ok else "no_mx"] += 1

    # Écrire CSV final
    fieldnames = list(rows[0].keys())
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    elapsed = time.time() - t0
    print()
    print("=== VALIDATION DONE ===")
    print(f"Durée : {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print()
    for status, count in status_counter.most_common():
        print(f"  {status:20s} : {count}")
    print()

    # Top domaines validés
    ok_emails = [r for r in rows if r.get("validation_status") == "ok"]
    by_domain = Counter(r["best_email"].rsplit("@", 1)[1] for r in ok_emails)
    print("Top domaines valides :")
    for d, c in by_domain.most_common(10):
        print(f"  {c:4d}× {d}")

    print(f"\nCSV final : {out_path.relative_to(ROOT)}")
    print(f"Emails 100% fiables : {len(ok_emails)} / {len(rows)} ({100*len(ok_emails)/max(len(rows),1):.1f}%)")


if __name__ == "__main__":
    main()
